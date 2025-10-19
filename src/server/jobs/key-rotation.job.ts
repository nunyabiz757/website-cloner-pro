import { Pool } from 'pg';
import cron from 'node-cron';
import { AppLogger } from '../utils/logger.util.js';
import { EncryptionService, KeyRotation } from '../utils/encryption.util.js';

/**
 * Key Rotation Job Service
 *
 * Handles automated key rotation with cron scheduling:
 * - Scheduled rotations (every 90 days by default)
 * - Manual rotations
 * - Emergency rotations
 * - Re-encryption of existing data
 * - Rotation progress tracking
 * - Email notifications
 */

export interface KeyRotationConfig {
  rotationIntervalDays: number;
  autoRotate: boolean;
  notifyBeforeDays: number;
  maxRetries: number;
  batchSize: number;
  checkSchedule: string; // Cron expression
}

export interface RotationJob {
  rotationId: string;
  rotationType: 'scheduled' | 'manual' | 'emergency';
  fromKeyVersion: number;
  toKeyVersion: number;
  status: 'started' | 'in_progress' | 'completed' | 'failed' | 'rolled_back';
  recordsReEncrypted: number;
  recordsFailed: number;
  startedAt: Date;
  completedAt?: Date;
  errorMessage?: string;
}

export interface RotationProgress {
  rotationId: string;
  totalRecords: number;
  recordsCompleted: number;
  recordsPending: number;
  recordsFailed: number;
  progressPercentage: number;
  durationSeconds: number;
}

export interface RotationSchedule {
  scheduleId: string;
  scheduleName: string;
  rotationIntervalDays: number;
  enabled: boolean;
  lastRotationAt?: Date;
  nextRotationAt?: Date;
  autoRotate: boolean;
  notifyBeforeDays: number;
  notificationEmails: string[];
}

export class KeyRotationJobService {
  private pool: Pool;
  private logger: AppLogger;
  private encryptionService: EncryptionService;
  private keyRotation: KeyRotation;
  private cronJob: cron.ScheduledTask | null = null;
  private config: KeyRotationConfig;
  private currentRotation: string | null = null;

  constructor(pool: Pool, config?: Partial<KeyRotationConfig>) {
    this.pool = pool;
    this.logger = AppLogger.getInstance();
    this.encryptionService = EncryptionService.getInstance();
    this.keyRotation = new KeyRotation();

    // Default configuration
    this.config = {
      rotationIntervalDays: 90,
      autoRotate: false, // Manual approval required by default
      notifyBeforeDays: 7,
      maxRetries: 3,
      batchSize: 100,
      checkSchedule: '0 2 * * *', // Check daily at 2 AM
      ...config,
    };
  }

  /**
   * Initialize the key rotation job service
   */
  async initialize(): Promise<void> {
    try {
      await this.logger.info('Initializing Key Rotation Job Service', {
        component: 'KeyRotationJob',
        config: this.config,
      });

      // Start cron job for checking due rotations
      this.startCronJob();

      // Check for any incomplete rotations
      await this.resumeIncompleteRotations();

      await this.logger.info('Key Rotation Job Service initialized successfully', {
        component: 'KeyRotationJob',
      });
    } catch (error) {
      await this.logger.error('Failed to initialize Key Rotation Job Service', {
        component: 'KeyRotationJob',
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Start the cron job for checking rotation schedules
   */
  private startCronJob(): void {
    if (this.cronJob) {
      this.cronJob.stop();
    }

    this.cronJob = cron.schedule(this.config.checkSchedule, async () => {
      try {
        await this.logger.info('Running scheduled key rotation check', {
          component: 'KeyRotationJob',
        });

        // Check for due rotations
        await this.checkDueRotations();

        // Check for upcoming rotations (for notifications)
        await this.checkUpcomingRotations();
      } catch (error) {
        await this.logger.error('Error in key rotation cron job', {
          component: 'KeyRotationJob',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    this.logger.info('Key rotation cron job started', {
      component: 'KeyRotationJob',
      schedule: this.config.checkSchedule,
    });
  }

  /**
   * Stop the cron job
   */
  stopCronJob(): void {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
      this.logger.info('Key rotation cron job stopped', {
        component: 'KeyRotationJob',
      });
    }
  }

  /**
   * Check for rotations that are due
   */
  private async checkDueRotations(): Promise<void> {
    const result = await this.pool.query<{
      schedule_id: string;
      schedule_name: string;
      rotation_interval_days: number;
      last_rotation_at: Date | null;
      next_rotation_at: Date;
      days_overdue: number;
    }>('SELECT * FROM get_due_rotations()');

    const dueRotations = result.rows;

    if (dueRotations.length === 0) {
      await this.logger.info('No due rotations found', {
        component: 'KeyRotationJob',
      });
      return;
    }

    await this.logger.info('Found due rotations', {
      component: 'KeyRotationJob',
      count: dueRotations.length,
      rotations: dueRotations.map((r) => ({
        name: r.schedule_name,
        daysOverdue: r.days_overdue,
      })),
    });

    // Process each due rotation
    for (const rotation of dueRotations) {
      try {
        // Check if auto-rotate is enabled
        const schedule = await this.getSchedule(rotation.schedule_id);
        if (schedule && schedule.autoRotate) {
          await this.logger.info('Starting automated key rotation', {
            component: 'KeyRotationJob',
            schedule: rotation.schedule_name,
          });

          await this.initiateRotation('scheduled', undefined, rotation.schedule_id);
        } else {
          await this.logger.info('Key rotation due but auto-rotate disabled', {
            component: 'KeyRotationJob',
            schedule: rotation.schedule_name,
            nextRotation: rotation.next_rotation_at,
          });

          // Send notification about manual approval needed
          await this.sendRotationNotification(rotation.schedule_id, 'approval_needed');
        }
      } catch (error) {
        await this.logger.error('Error processing due rotation', {
          component: 'KeyRotationJob',
          schedule: rotation.schedule_name,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  /**
   * Check for upcoming rotations (for notifications)
   */
  private async checkUpcomingRotations(): Promise<void> {
    const result = await this.pool.query<{
      schedule_id: string;
      schedule_name: string;
      next_rotation_at: Date;
      days_until_rotation: number;
      should_notify: boolean;
    }>(
      'SELECT * FROM get_upcoming_rotations($1)',
      [this.config.notifyBeforeDays]
    );

    const upcomingRotations = result.rows.filter((r) => r.should_notify);

    if (upcomingRotations.length > 0) {
      await this.logger.info('Found upcoming rotations requiring notification', {
        component: 'KeyRotationJob',
        count: upcomingRotations.length,
      });

      for (const rotation of upcomingRotations) {
        await this.sendRotationNotification(rotation.schedule_id, 'upcoming');
      }
    }
  }

  /**
   * Initiate a key rotation
   */
  async initiateRotation(
    rotationType: 'scheduled' | 'manual' | 'emergency',
    initiatedBy?: string,
    scheduleId?: string
  ): Promise<string> {
    try {
      // Check if rotation already in progress
      if (this.currentRotation) {
        throw new Error('A key rotation is already in progress');
      }

      await this.logger.info('Initiating key rotation', {
        component: 'KeyRotationJob',
        rotationType,
        initiatedBy,
      });

      // Generate new encryption key
      const newKey = this.keyRotation.generateNewKey();
      const keyHash = this.keyRotation.hashKey(newKey);

      // Register new key in database
      const keyVersionResult = await this.pool.query<{ register_new_key: number }>(
        'SELECT register_new_key($1, $2, $3, $4) as register_new_key',
        [
          keyHash,
          'aes-256-gcm',
          initiatedBy || null,
          JSON.stringify({ rotationType }),
        ]
      );

      const newKeyVersion = keyVersionResult.rows[0].register_new_key;

      // Start rotation process
      const rotationResult = await this.pool.query<{ start_key_rotation: string }>(
        'SELECT start_key_rotation($1, $2, $3, $4) as start_key_rotation',
        [
          rotationType,
          newKeyVersion,
          initiatedBy || null,
          JSON.stringify({ scheduleId }),
        ]
      );

      const rotationId = rotationResult.rows[0].start_key_rotation;
      this.currentRotation = rotationId;

      await this.logger.info('Key rotation started', {
        component: 'KeyRotationJob',
        rotationId,
        newKeyVersion,
      });

      // Start re-encryption process in background
      this.startReEncryption(rotationId, newKeyVersion).catch(async (error) => {
        await this.logger.error('Re-encryption process failed', {
          component: 'KeyRotationJob',
          rotationId,
          error: error instanceof Error ? error.message : String(error),
        });

        await this.failRotation(rotationId, error instanceof Error ? error.message : String(error));
      });

      return rotationId;
    } catch (error) {
      await this.logger.error('Failed to initiate key rotation', {
        component: 'KeyRotationJob',
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Start the re-encryption process
   */
  private async startReEncryption(rotationId: string, newKeyVersion: number): Promise<void> {
    try {
      await this.logger.info('Starting re-encryption process', {
        component: 'KeyRotationJob',
        rotationId,
        newKeyVersion,
      });

      // Update rotation status to in_progress
      await this.pool.query(
        'UPDATE key_rotation_history SET rotation_status = $1 WHERE id = $2',
        ['in_progress', rotationId]
      );

      // Find all encrypted data that needs re-encryption
      // This is a simplified example - adjust based on your schema
      const encryptedTables = [
        { table: 'security_logs', column: 'metadata', idColumn: 'id' },
        { table: 'api_keys', column: 'encrypted_key', idColumn: 'id' },
        // Add more tables with encrypted columns
      ];

      let totalRecords = 0;
      let recordsReEncrypted = 0;
      let recordsFailed = 0;

      // Process each table
      for (const tableInfo of encryptedTables) {
        await this.logger.info('Processing table for re-encryption', {
          component: 'KeyRotationJob',
          table: tableInfo.table,
          column: tableInfo.column,
        });

        // Add records to re-encryption queue
        const recordsResult = await this.pool.query(
          `SELECT ${tableInfo.idColumn} FROM ${tableInfo.table} WHERE ${tableInfo.column} IS NOT NULL`
        );

        totalRecords += recordsResult.rows.length;

        // Queue records for re-encryption
        for (const record of recordsResult.rows) {
          await this.pool.query(
            `INSERT INTO re_encryption_queue (
              rotation_id, table_name, record_id, column_name,
              to_key_version, encryption_status
            ) VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              rotationId,
              tableInfo.table,
              record[tableInfo.idColumn],
              tableInfo.column,
              newKeyVersion,
              'pending',
            ]
          );
        }
      }

      // Process re-encryption queue in batches
      let hasMoreRecords = true;
      while (hasMoreRecords) {
        const queueResult = await this.pool.query(
          `SELECT id, table_name, record_id, column_name, from_key_version, to_key_version
           FROM re_encryption_queue
           WHERE rotation_id = $1 AND encryption_status = 'pending'
           LIMIT $2`,
          [rotationId, this.config.batchSize]
        );

        if (queueResult.rows.length === 0) {
          hasMoreRecords = false;
          break;
        }

        // Process batch
        for (const queueItem of queueResult.rows) {
          try {
            // Mark as processing
            await this.pool.query(
              'UPDATE re_encryption_queue SET encryption_status = $1 WHERE id = $2',
              ['processing', queueItem.id]
            );

            // Get the encrypted data
            const dataResult = await this.pool.query(
              `SELECT ${queueItem.column_name} FROM ${queueItem.table_name} WHERE id = $1`,
              [queueItem.record_id]
            );

            if (dataResult.rows.length === 0) {
              throw new Error('Record not found');
            }

            const encryptedData = dataResult.rows[0][queueItem.column_name];

            // Decrypt with old key and re-encrypt with new key
            // Note: This is a simplified example - actual implementation depends on your encryption scheme
            const decrypted = this.encryptionService.decrypt(encryptedData);
            const reEncrypted = this.encryptionService.encrypt(decrypted);

            // Update the record with re-encrypted data
            await this.pool.query(
              `UPDATE ${queueItem.table_name} SET ${queueItem.column_name} = $1 WHERE id = $2`,
              [reEncrypted, queueItem.record_id]
            );

            // Mark as completed
            await this.pool.query(
              'UPDATE re_encryption_queue SET encryption_status = $1, processed_at = CURRENT_TIMESTAMP WHERE id = $2',
              ['completed', queueItem.id]
            );

            recordsReEncrypted++;
          } catch (error) {
            // Mark as failed
            await this.pool.query(
              'UPDATE re_encryption_queue SET encryption_status = $1, last_error = $2, retry_count = retry_count + 1 WHERE id = $3',
              ['failed', error instanceof Error ? error.message : String(error), queueItem.id]
            );

            recordsFailed++;

            await this.logger.error('Failed to re-encrypt record', {
              component: 'KeyRotationJob',
              table: queueItem.table_name,
              recordId: queueItem.record_id,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }

        // Log progress
        await this.logger.info('Re-encryption batch completed', {
          component: 'KeyRotationJob',
          rotationId,
          recordsReEncrypted,
          recordsFailed,
          totalRecords,
        });
      }

      // Complete the rotation
      await this.completeRotation(rotationId, recordsReEncrypted, recordsFailed);
    } catch (error) {
      await this.logger.error('Re-encryption process error', {
        component: 'KeyRotationJob',
        rotationId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Complete a key rotation
   */
  private async completeRotation(
    rotationId: string,
    recordsReEncrypted: number,
    recordsFailed: number
  ): Promise<void> {
    try {
      await this.pool.query('SELECT complete_key_rotation($1, $2, $3)', [
        rotationId,
        recordsReEncrypted,
        recordsFailed,
      ]);

      this.currentRotation = null;

      await this.logger.info('Key rotation completed successfully', {
        component: 'KeyRotationJob',
        rotationId,
        recordsReEncrypted,
        recordsFailed,
      });

      // Send success notification
      await this.sendRotationNotification(rotationId, 'completed');
    } catch (error) {
      await this.logger.error('Failed to complete key rotation', {
        component: 'KeyRotationJob',
        rotationId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Mark a key rotation as failed
   */
  private async failRotation(rotationId: string, errorMessage: string): Promise<void> {
    try {
      await this.pool.query('SELECT fail_key_rotation($1, $2)', [rotationId, errorMessage]);

      this.currentRotation = null;

      await this.logger.error('Key rotation marked as failed', {
        component: 'KeyRotationJob',
        rotationId,
        errorMessage,
      });

      // Send failure notification
      await this.sendRotationNotification(rotationId, 'failed');
    } catch (error) {
      await this.logger.error('Failed to mark rotation as failed', {
        component: 'KeyRotationJob',
        rotationId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Resume incomplete rotations on startup
   */
  private async resumeIncompleteRotations(): Promise<void> {
    try {
      const result = await this.pool.query<{ id: string; to_key_version: number }>(
        `SELECT id, to_key_version FROM key_rotation_history
         WHERE rotation_status IN ('started', 'in_progress')
         ORDER BY started_at ASC
         LIMIT 1`
      );

      if (result.rows.length > 0) {
        const rotation = result.rows[0];
        await this.logger.info('Found incomplete rotation, resuming...', {
          component: 'KeyRotationJob',
          rotationId: rotation.id,
        });

        this.currentRotation = rotation.id;
        await this.startReEncryption(rotation.id, rotation.to_key_version);
      }
    } catch (error) {
      await this.logger.error('Failed to resume incomplete rotations', {
        component: 'KeyRotationJob',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get rotation progress
   */
  async getRotationProgress(rotationId: string): Promise<RotationProgress | null> {
    try {
      const result = await this.pool.query<{
        rotation_id: string;
        total_records: number;
        records_completed: number;
        records_pending: number;
        records_failed: number;
        progress_percentage: number;
        duration_seconds: number;
      }>('SELECT * FROM get_rotation_statistics($1)', [rotationId]);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        rotationId: row.rotation_id,
        totalRecords: row.total_records,
        recordsCompleted: row.records_completed,
        recordsPending: row.records_pending,
        recordsFailed: row.records_failed,
        progressPercentage: row.progress_percentage,
        durationSeconds: row.duration_seconds,
      };
    } catch (error) {
      await this.logger.error('Failed to get rotation progress', {
        component: 'KeyRotationJob',
        rotationId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Get rotation history
   */
  async getRotationHistory(limit: number = 50): Promise<RotationJob[]> {
    try {
      const result = await this.pool.query<{
        id: string;
        rotation_type: 'scheduled' | 'manual' | 'emergency';
        from_key_version: number;
        to_key_version: number;
        rotation_status: string;
        records_re_encrypted: number;
        records_failed: number;
        started_at: Date;
        completed_at: Date | null;
        error_message: string | null;
      }>(
        `SELECT * FROM key_rotation_history
         ORDER BY started_at DESC
         LIMIT $1`,
        [limit]
      );

      return result.rows.map((row) => ({
        rotationId: row.id,
        rotationType: row.rotation_type,
        fromKeyVersion: row.from_key_version,
        toKeyVersion: row.to_key_version,
        status: row.rotation_status as any,
        recordsReEncrypted: row.records_re_encrypted,
        recordsFailed: row.records_failed,
        startedAt: row.started_at,
        completedAt: row.completed_at || undefined,
        errorMessage: row.error_message || undefined,
      }));
    } catch (error) {
      await this.logger.error('Failed to get rotation history', {
        component: 'KeyRotationJob',
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Get a specific rotation schedule
   */
  private async getSchedule(scheduleId: string): Promise<RotationSchedule | null> {
    try {
      const result = await this.pool.query<{
        id: string;
        schedule_name: string;
        rotation_interval_days: number;
        enabled: boolean;
        last_rotation_at: Date | null;
        next_rotation_at: Date | null;
        auto_rotate: boolean;
        notify_before_days: number;
        notification_emails: string[];
      }>(
        'SELECT * FROM key_rotation_schedule WHERE id = $1',
        [scheduleId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        scheduleId: row.id,
        scheduleName: row.schedule_name,
        rotationIntervalDays: row.rotation_interval_days,
        enabled: row.enabled,
        lastRotationAt: row.last_rotation_at || undefined,
        nextRotationAt: row.next_rotation_at || undefined,
        autoRotate: row.auto_rotate,
        notifyBeforeDays: row.notify_before_days,
        notificationEmails: row.notification_emails || [],
      };
    } catch (error) {
      await this.logger.error('Failed to get rotation schedule', {
        component: 'KeyRotationJob',
        scheduleId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Send rotation notification
   */
  private async sendRotationNotification(
    scheduleIdOrRotationId: string,
    notificationType: 'upcoming' | 'approval_needed' | 'completed' | 'failed'
  ): Promise<void> {
    try {
      await this.logger.info('Sending rotation notification', {
        component: 'KeyRotationJob',
        notificationType,
        id: scheduleIdOrRotationId,
      });

      // TODO: Implement email notification using alerting service
      // This would integrate with the alerting service from Section 12
    } catch (error) {
      await this.logger.error('Failed to send rotation notification', {
        component: 'KeyRotationJob',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get current rotation status
   */
  getCurrentRotation(): string | null {
    return this.currentRotation;
  }

  /**
   * Check if a rotation is in progress
   */
  isRotationInProgress(): boolean {
    return this.currentRotation !== null;
  }
}

// Singleton instance
let keyRotationJobServiceInstance: KeyRotationJobService | null = null;

export function initializeKeyRotationJobService(
  pool: Pool,
  config?: Partial<KeyRotationConfig>
): KeyRotationJobService {
  if (!keyRotationJobServiceInstance) {
    keyRotationJobServiceInstance = new KeyRotationJobService(pool, config);
  }
  return keyRotationJobServiceInstance;
}

export function getKeyRotationJobService(): KeyRotationJobService {
  if (!keyRotationJobServiceInstance) {
    throw new Error('KeyRotationJobService not initialized. Call initializeKeyRotationJobService first.');
  }
  return keyRotationJobServiceInstance;
}
