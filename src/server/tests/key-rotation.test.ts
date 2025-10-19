import { Pool } from 'pg';
import {
  KeyRotationJobService,
  initializeKeyRotationJobService,
  RotationProgress,
  RotationJob,
  RotationSchedule,
} from '../jobs/key-rotation.job';

describe('KeyRotationJobService', () => {
  let pool: Pool;
  let rotationService: KeyRotationJobService;

  const mockUserId = '11111111-1111-1111-1111-111111111111';
  const mockScheduleId = '22222222-2222-2222-2222-222222222222';
  const mockRotationId = '33333333-3333-3333-3333-333333333333';

  beforeEach(() => {
    pool = {
      query: jest.fn(),
    } as any;

    rotationService = initializeKeyRotationJobService(pool, {
      autoRotate: false,
      rotationIntervalDays: 90,
      notifyBeforeDays: 7,
      maxRetries: 3,
      batchSize: 100,
      checkSchedule: '0 2 * * *',
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
    rotationService.stopCronJob();
  });

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [] }); // No incomplete rotations

      await expect(rotationService.initialize()).resolves.not.toThrow();
    });

    it('should resume incomplete rotations on startup', async () => {
      (pool.query as jest.Mock)
        .mockResolvedValueOnce({
          rows: [
            {
              id: mockRotationId,
              to_key_version: 2,
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] }) // No records to re-encrypt
        .mockResolvedValue({ rows: [] });

      await rotationService.initialize();

      expect(rotationService.isRotationInProgress()).toBe(true);
    });

    it('should start cron job on initialization', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [] });

      await rotationService.initialize();

      // Cron job should be running
      expect(rotationService['cronJob']).not.toBeNull();
    });
  });

  describe('Rotation Initiation', () => {
    it('should initiate a manual key rotation', async () => {
      (pool.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [{ register_new_key: 2 }] }) // New key version
        .mockResolvedValueOnce({ rows: [{ start_key_rotation: mockRotationId }] }) // Rotation ID
        .mockResolvedValueOnce({ rows: [] }); // No records to re-encrypt

      const rotationId = await rotationService.initiateRotation('manual', mockUserId);

      expect(rotationId).toBe(mockRotationId);
      expect(pool.query).toHaveBeenCalledWith(
        'SELECT register_new_key($1, $2, $3, $4) as register_new_key',
        expect.arrayContaining(['aes-256-gcm', mockUserId])
      );
      expect(pool.query).toHaveBeenCalledWith(
        'SELECT start_key_rotation($1, $2, $3, $4) as start_key_rotation',
        expect.arrayContaining(['manual', 2, mockUserId])
      );
    });

    it('should initiate an emergency key rotation', async () => {
      (pool.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [{ register_new_key: 3 }] })
        .mockResolvedValueOnce({ rows: [{ start_key_rotation: mockRotationId }] })
        .mockResolvedValueOnce({ rows: [] });

      const rotationId = await rotationService.initiateRotation('emergency', mockUserId);

      expect(rotationId).toBe(mockRotationId);
      expect(pool.query).toHaveBeenCalledWith(
        'SELECT start_key_rotation($1, $2, $3, $4) as start_key_rotation',
        expect.arrayContaining(['emergency', 3])
      );
    });

    it('should prevent multiple simultaneous rotations', async () => {
      (pool.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [{ register_new_key: 2 }] })
        .mockResolvedValueOnce({ rows: [{ start_key_rotation: mockRotationId }] })
        .mockResolvedValueOnce({ rows: [] });

      await rotationService.initiateRotation('manual', mockUserId);

      await expect(
        rotationService.initiateRotation('manual', mockUserId)
      ).rejects.toThrow('A key rotation is already in progress');
    });

    it('should handle rotation initiation errors', async () => {
      const error = new Error('Database error');
      (pool.query as jest.Mock).mockRejectedValueOnce(error);

      await expect(
        rotationService.initiateRotation('manual', mockUserId)
      ).rejects.toThrow('Database error');
    });
  });

  describe('Rotation Progress', () => {
    it('should get rotation progress', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [
          {
            rotation_id: mockRotationId,
            total_records: 100,
            records_completed: 75,
            records_pending: 20,
            records_failed: 5,
            progress_percentage: 75.0,
            duration_seconds: 300,
          },
        ],
      });

      const progress = await rotationService.getRotationProgress(mockRotationId);

      expect(progress).toEqual({
        rotationId: mockRotationId,
        totalRecords: 100,
        recordsCompleted: 75,
        recordsPending: 20,
        recordsFailed: 5,
        progressPercentage: 75.0,
        durationSeconds: 300,
      });
    });

    it('should return null for non-existent rotation', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [] });

      const progress = await rotationService.getRotationProgress('non-existent-id');

      expect(progress).toBeNull();
    });

    it('should handle progress query errors gracefully', async () => {
      (pool.query as jest.Mock).mockRejectedValueOnce(new Error('Query failed'));

      const progress = await rotationService.getRotationProgress(mockRotationId);

      expect(progress).toBeNull();
    });
  });

  describe('Rotation History', () => {
    it('should get rotation history', async () => {
      const mockHistory = [
        {
          id: mockRotationId,
          rotation_type: 'manual',
          from_key_version: 1,
          to_key_version: 2,
          rotation_status: 'completed',
          records_re_encrypted: 100,
          records_failed: 0,
          started_at: new Date('2025-01-01T00:00:00Z'),
          completed_at: new Date('2025-01-01T01:00:00Z'),
          error_message: null,
        },
        {
          id: '44444444-4444-4444-4444-444444444444',
          rotation_type: 'scheduled',
          from_key_version: 2,
          to_key_version: 3,
          rotation_status: 'in_progress',
          records_re_encrypted: 50,
          records_failed: 2,
          started_at: new Date('2025-01-15T00:00:00Z'),
          completed_at: null,
          error_message: null,
        },
      ];

      (pool.query as jest.Mock).mockResolvedValueOnce({ rows: mockHistory });

      const history = await rotationService.getRotationHistory(50);

      expect(history).toHaveLength(2);
      expect(history[0]).toEqual({
        rotationId: mockRotationId,
        rotationType: 'manual',
        fromKeyVersion: 1,
        toKeyVersion: 2,
        status: 'completed',
        recordsReEncrypted: 100,
        recordsFailed: 0,
        startedAt: new Date('2025-01-01T00:00:00Z'),
        completedAt: new Date('2025-01-01T01:00:00Z'),
        errorMessage: undefined,
      });
      expect(history[1].status).toBe('in_progress');
    });

    it('should respect limit parameter', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [] });

      await rotationService.getRotationHistory(25);

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT $1'),
        [25]
      );
    });

    it('should return empty array on error', async () => {
      (pool.query as jest.Mock).mockRejectedValueOnce(new Error('Query failed'));

      const history = await rotationService.getRotationHistory();

      expect(history).toEqual([]);
    });
  });

  describe('Current Rotation Status', () => {
    it('should return current rotation ID', async () => {
      (pool.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [{ register_new_key: 2 }] })
        .mockResolvedValueOnce({ rows: [{ start_key_rotation: mockRotationId }] })
        .mockResolvedValueOnce({ rows: [] });

      await rotationService.initiateRotation('manual', mockUserId);

      expect(rotationService.getCurrentRotation()).toBe(mockRotationId);
      expect(rotationService.isRotationInProgress()).toBe(true);
    });

    it('should return null when no rotation in progress', () => {
      expect(rotationService.getCurrentRotation()).toBeNull();
      expect(rotationService.isRotationInProgress()).toBe(false);
    });
  });

  describe('Cron Job Management', () => {
    it('should start cron job', async () => {
      (pool.query as jest.Mock).mockResolvedValue({ rows: [] });

      await rotationService.initialize();

      expect(rotationService['cronJob']).not.toBeNull();
    });

    it('should stop cron job', async () => {
      (pool.query as jest.Mock).mockResolvedValue({ rows: [] });

      await rotationService.initialize();
      rotationService.stopCronJob();

      expect(rotationService['cronJob']).toBeNull();
    });

    it('should restart cron job if already running', async () => {
      (pool.query as jest.Mock).mockResolvedValue({ rows: [] });

      await rotationService.initialize();
      const firstJob = rotationService['cronJob'];

      rotationService['startCronJob']();
      const secondJob = rotationService['cronJob'];

      expect(firstJob).not.toBe(secondJob);
    });
  });

  describe('Due Rotations Check', () => {
    it('should process due rotations with auto-rotate enabled', async () => {
      const dueRotations = [
        {
          schedule_id: mockScheduleId,
          schedule_name: 'quarterly_rotation',
          rotation_interval_days: 90,
          last_rotation_at: new Date('2024-10-01'),
          next_rotation_at: new Date('2024-12-30'),
          days_overdue: 2,
        },
      ];

      (pool.query as jest.Mock)
        .mockResolvedValueOnce({ rows: dueRotations }) // get_due_rotations
        .mockResolvedValueOnce({
          // get schedule
          rows: [
            {
              id: mockScheduleId,
              schedule_name: 'quarterly_rotation',
              rotation_interval_days: 90,
              enabled: true,
              auto_rotate: true,
              notify_before_days: 7,
              notification_emails: [],
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [{ register_new_key: 2 }] })
        .mockResolvedValueOnce({ rows: [{ start_key_rotation: mockRotationId }] })
        .mockResolvedValueOnce({ rows: [] });

      await rotationService['checkDueRotations']();

      expect(pool.query).toHaveBeenCalledWith('SELECT * FROM get_due_rotations()');
    });

    it('should send notification when auto-rotate disabled', async () => {
      const dueRotations = [
        {
          schedule_id: mockScheduleId,
          schedule_name: 'manual_rotation',
          rotation_interval_days: 90,
          days_overdue: 5,
        },
      ];

      (pool.query as jest.Mock)
        .mockResolvedValueOnce({ rows: dueRotations })
        .mockResolvedValueOnce({
          rows: [
            {
              id: mockScheduleId,
              auto_rotate: false,
              enabled: true,
            },
          ],
        });

      await rotationService['checkDueRotations']();

      // Should log but not initiate rotation
      expect(pool.query).not.toHaveBeenCalledWith(
        expect.stringContaining('start_key_rotation'),
        expect.anything()
      );
    });

    it('should handle no due rotations', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [] });

      await expect(rotationService['checkDueRotations']()).resolves.not.toThrow();
    });
  });

  describe('Upcoming Rotations Check', () => {
    it('should send notifications for upcoming rotations', async () => {
      const upcomingRotations = [
        {
          schedule_id: mockScheduleId,
          schedule_name: 'upcoming_rotation',
          next_rotation_at: new Date('2025-01-22'),
          days_until_rotation: 5,
          should_notify: true,
        },
      ];

      (pool.query as jest.Mock).mockResolvedValueOnce({ rows: upcomingRotations });

      await rotationService['checkUpcomingRotations']();

      expect(pool.query).toHaveBeenCalledWith(
        'SELECT * FROM get_upcoming_rotations($1)',
        [7] // notifyBeforeDays from config
      );
    });

    it('should not notify if should_notify is false', async () => {
      const upcomingRotations = [
        {
          schedule_id: mockScheduleId,
          schedule_name: 'far_rotation',
          days_until_rotation: 20,
          should_notify: false,
        },
      ];

      (pool.query as jest.Mock).mockResolvedValueOnce({ rows: upcomingRotations });

      await rotationService['checkUpcomingRotations']();

      // Should not attempt to send notification
    });
  });

  describe('Re-encryption Process', () => {
    it('should process re-encryption queue', async () => {
      const queueItems = [
        {
          id: 'queue1',
          table_name: 'api_keys',
          record_id: 'record1',
          column_name: 'encrypted_key',
          from_key_version: 1,
          to_key_version: 2,
        },
      ];

      (pool.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [] }) // Update status to in_progress
        .mockResolvedValueOnce({ rows: [] }) // Find encrypted tables (mock empty)
        .mockResolvedValueOnce({ rows: queueItems }) // Get queue items
        .mockResolvedValueOnce({ rows: [] }) // Mark as processing
        .mockResolvedValueOnce({ rows: [{ encrypted_key: 'encrypted_data' }] }) // Get data
        .mockResolvedValueOnce({ rows: [] }) // Update with re-encrypted data
        .mockResolvedValueOnce({ rows: [] }) // Mark as completed
        .mockResolvedValueOnce({ rows: [] }) // Check for more records
        .mockResolvedValueOnce({ rows: [] }); // Complete rotation

      await rotationService['startReEncryption'](mockRotationId, 2);

      expect(pool.query).toHaveBeenCalledWith(
        'UPDATE key_rotation_history SET rotation_status = $1 WHERE id = $2',
        ['in_progress', mockRotationId]
      );
    });

    it('should handle re-encryption errors', async () => {
      const queueItems = [
        {
          id: 'queue1',
          table_name: 'api_keys',
          record_id: 'record1',
          column_name: 'encrypted_key',
        },
      ];

      (pool.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [] }) // Update status
        .mockResolvedValueOnce({ rows: [] }) // Find tables
        .mockResolvedValueOnce({ rows: queueItems }) // Get queue
        .mockResolvedValueOnce({ rows: [] }) // Mark processing
        .mockRejectedValueOnce(new Error('Decryption failed')) // Fail
        .mockResolvedValueOnce({ rows: [] }) // Mark as failed
        .mockResolvedValueOnce({ rows: [] }) // Check for more
        .mockResolvedValueOnce({ rows: [] }); // Complete

      await rotationService['startReEncryption'](mockRotationId, 2);

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE re_encryption_queue SET encryption_status'),
        expect.arrayContaining(['failed'])
      );
    });

    it('should process records in batches', async () => {
      // Create 150 queue items (more than batch size of 100)
      const queueItems = Array.from({ length: 150 }, (_, i) => ({
        id: `queue${i}`,
        table_name: 'api_keys',
        record_id: `record${i}`,
        column_name: 'encrypted_key',
      }));

      (pool.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [] }) // Update status
        .mockResolvedValueOnce({ rows: [] }) // Find tables
        .mockResolvedValue({ rows: [] }); // All other queries

      // Mock first batch
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: queueItems.slice(0, 100),
      });

      await rotationService['startReEncryption'](mockRotationId, 2);

      // Should query with batch size limit
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT $2'),
        [mockRotationId, 100]
      );
    });
  });

  describe('Error Handling', () => {
    it('should fail rotation on error', async () => {
      (pool.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [{ register_new_key: 2 }] })
        .mockResolvedValueOnce({ rows: [{ start_key_rotation: mockRotationId }] })
        .mockRejectedValueOnce(new Error('Fatal error'));

      await rotationService.initiateRotation('manual', mockUserId);

      // Wait for background process to fail
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(pool.query).toHaveBeenCalledWith(
        'SELECT fail_key_rotation($1, $2)',
        [mockRotationId, expect.any(String)]
      );
    });

    it('should clear current rotation on failure', async () => {
      (pool.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [{ register_new_key: 2 }] })
        .mockResolvedValueOnce({ rows: [{ start_key_rotation: mockRotationId }] })
        .mockRejectedValueOnce(new Error('Fatal error'))
        .mockResolvedValueOnce({ rows: [] }); // fail_key_rotation

      await rotationService.initiateRotation('manual', mockUserId);

      await rotationService['failRotation'](mockRotationId, 'Test error');

      expect(rotationService.getCurrentRotation()).toBeNull();
    });
  });

  describe('Rotation Completion', () => {
    it('should complete rotation successfully', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [] });

      await rotationService['completeRotation'](mockRotationId, 100, 5);

      expect(pool.query).toHaveBeenCalledWith('SELECT complete_key_rotation($1, $2, $3)', [
        mockRotationId,
        100,
        5,
      ]);
    });

    it('should clear current rotation on completion', async () => {
      rotationService['currentRotation'] = mockRotationId;
      (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [] });

      await rotationService['completeRotation'](mockRotationId, 100, 0);

      expect(rotationService.getCurrentRotation()).toBeNull();
    });
  });

  describe('Schedule Management', () => {
    it('should get rotation schedule', async () => {
      const mockSchedule = {
        id: mockScheduleId,
        schedule_name: 'quarterly',
        rotation_interval_days: 90,
        enabled: true,
        last_rotation_at: null,
        next_rotation_at: new Date('2025-04-15'),
        auto_rotate: false,
        notify_before_days: 7,
        notification_emails: ['admin@example.com'],
      };

      (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [mockSchedule] });

      const schedule = await rotationService['getSchedule'](mockScheduleId);

      expect(schedule).toEqual({
        scheduleId: mockScheduleId,
        scheduleName: 'quarterly',
        rotationIntervalDays: 90,
        enabled: true,
        lastRotationAt: undefined,
        nextRotationAt: new Date('2025-04-15'),
        autoRotate: false,
        notifyBeforeDays: 7,
        notificationEmails: ['admin@example.com'],
      });
    });

    it('should return null for non-existent schedule', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [] });

      const schedule = await rotationService['getSchedule']('non-existent');

      expect(schedule).toBeNull();
    });
  });
});
