import { Pool } from 'pg';
import { Request } from 'express';

/**
 * Security Audit Service
 * Implements immutable audit trail for all security events
 */

export interface AuditLogEntry {
  id?: string;
  event_type: string;
  event_category: 'authentication' | 'authorization' | 'data_access' | 'security' | 'system';
  severity: 'low' | 'medium' | 'high' | 'critical';
  actor_id?: string;
  actor_email?: string;
  actor_ip?: string;
  actor_user_agent?: string;
  resource_type?: string;
  resource_id?: string;
  action: string;
  status: 'success' | 'failure' | 'blocked';
  details?: Record<string, any>;
  metadata?: Record<string, any>;
  created_at?: Date;
}

export interface SecurityEvent {
  id?: string;
  event_type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  actor_id?: string;
  actor_ip?: string;
  details?: Record<string, any>;
  resolved?: boolean;
  resolved_at?: Date;
  resolved_by?: string;
  resolution_notes?: string;
  created_at?: Date;
}

export class AuditService {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Create audit log entry
   * @param entry Audit log entry
   * @returns Created entry
   */
  async log(entry: AuditLogEntry): Promise<AuditLogEntry> {
    const result = await this.pool.query(
      `INSERT INTO audit_logs (
        event_type, event_category, severity, actor_id, actor_email,
        actor_ip, actor_user_agent, resource_type, resource_id,
        action, status, details, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *`,
      [
        entry.event_type,
        entry.event_category,
        entry.severity,
        entry.actor_id,
        entry.actor_email,
        entry.actor_ip,
        entry.actor_user_agent,
        entry.resource_type,
        entry.resource_id,
        entry.action,
        entry.status,
        entry.details ? JSON.stringify(entry.details) : null,
        entry.metadata ? JSON.stringify(entry.metadata) : null,
      ]
    );

    return result.rows[0];
  }

  /**
   * Log from Express request
   * @param req Express request
   * @param entry Audit entry (actor info will be auto-populated)
   * @returns Created entry
   */
  async logFromRequest(req: Request, entry: Omit<AuditLogEntry, 'actor_ip' | 'actor_user_agent'>): Promise<AuditLogEntry> {
    return this.log({
      ...entry,
      actor_ip: req.ip,
      actor_user_agent: req.headers['user-agent'],
      metadata: {
        ...entry.metadata,
        method: req.method,
        path: req.path,
        query: req.query,
      },
    });
  }

  /**
   * Log authentication event
   */
  async logAuthentication(
    userId: string | undefined,
    email: string,
    action: 'login' | 'logout' | 'register' | 'verify_email' | 'password_reset',
    status: 'success' | 'failure' | 'blocked',
    req: Request,
    details?: Record<string, any>
  ): Promise<AuditLogEntry> {
    return this.logFromRequest(req, {
      event_type: `user.${action}`,
      event_category: 'authentication',
      severity: status === 'success' ? 'low' : 'medium',
      actor_id: userId,
      actor_email: email,
      action,
      status,
      details,
    });
  }

  /**
   * Log authorization event
   */
  async logAuthorization(
    userId: string,
    resource: string,
    action: string,
    status: 'success' | 'failure' | 'blocked',
    req: Request,
    details?: Record<string, any>
  ): Promise<AuditLogEntry> {
    return this.logFromRequest(req, {
      event_type: 'authorization.check',
      event_category: 'authorization',
      severity: status === 'blocked' ? 'high' : 'low',
      actor_id: userId,
      resource_type: resource,
      action,
      status,
      details,
    });
  }

  /**
   * Log data access event
   */
  async logDataAccess(
    userId: string,
    resourceType: string,
    resourceId: string,
    action: 'create' | 'read' | 'update' | 'delete',
    req: Request,
    details?: Record<string, any>
  ): Promise<AuditLogEntry> {
    return this.logFromRequest(req, {
      event_type: `${resourceType}.${action}`,
      event_category: 'data_access',
      severity: action === 'delete' ? 'medium' : 'low',
      actor_id: userId,
      resource_type: resourceType,
      resource_id: resourceId,
      action,
      status: 'success',
      details,
    });
  }

  /**
   * Log security event
   */
  async logSecurityEvent(
    eventType: string,
    severity: 'low' | 'medium' | 'high' | 'critical',
    req: Request,
    details?: Record<string, any>
  ): Promise<SecurityEvent> {
    const result = await this.pool.query(
      `INSERT INTO security_events (event_type, severity, actor_id, actor_ip, details)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        eventType,
        severity,
        req.user ? (req.user as any).userId : null,
        req.ip,
        details ? JSON.stringify(details) : null,
      ]
    );

    // Also log to audit_logs
    await this.logFromRequest(req, {
      event_type: eventType,
      event_category: 'security',
      severity,
      actor_id: req.user ? (req.user as any).userId : undefined,
      action: 'security_event',
      status: 'success',
      details,
    });

    return result.rows[0];
  }

  /**
   * Get audit logs with filters
   */
  async getAuditLogs(filters: {
    actor_id?: string;
    event_category?: string;
    resource_type?: string;
    resource_id?: string;
    status?: string;
    start_date?: Date;
    end_date?: Date;
    limit?: number;
    offset?: number;
  }): Promise<{ logs: AuditLogEntry[]; total: number }> {
    const conditions: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (filters.actor_id) {
      conditions.push(`actor_id = $${paramCount}`);
      values.push(filters.actor_id);
      paramCount++;
    }

    if (filters.event_category) {
      conditions.push(`event_category = $${paramCount}`);
      values.push(filters.event_category);
      paramCount++;
    }

    if (filters.resource_type) {
      conditions.push(`resource_type = $${paramCount}`);
      values.push(filters.resource_type);
      paramCount++;
    }

    if (filters.resource_id) {
      conditions.push(`resource_id = $${paramCount}`);
      values.push(filters.resource_id);
      paramCount++;
    }

    if (filters.status) {
      conditions.push(`status = $${paramCount}`);
      values.push(filters.status);
      paramCount++;
    }

    if (filters.start_date) {
      conditions.push(`created_at >= $${paramCount}`);
      values.push(filters.start_date);
      paramCount++;
    }

    if (filters.end_date) {
      conditions.push(`created_at <= $${paramCount}`);
      values.push(filters.end_date);
      paramCount++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count
    const countResult = await this.pool.query(
      `SELECT COUNT(*) as total FROM audit_logs ${whereClause}`,
      values
    );
    const total = parseInt(countResult.rows[0].total);

    // Get logs
    const limit = filters.limit || 50;
    const offset = filters.offset || 0;
    values.push(limit, offset);

    const logsResult = await this.pool.query(
      `SELECT * FROM audit_logs ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramCount} OFFSET $${paramCount + 1}`,
      values
    );

    return {
      logs: logsResult.rows,
      total,
    };
  }

  /**
   * Get security events with filters
   */
  async getSecurityEvents(filters: {
    resolved?: boolean;
    severity?: string;
    start_date?: Date;
    end_date?: Date;
    limit?: number;
    offset?: number;
  }): Promise<{ events: SecurityEvent[]; total: number }> {
    const conditions: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (filters.resolved !== undefined) {
      conditions.push(`resolved = $${paramCount}`);
      values.push(filters.resolved);
      paramCount++;
    }

    if (filters.severity) {
      conditions.push(`severity = $${paramCount}`);
      values.push(filters.severity);
      paramCount++;
    }

    if (filters.start_date) {
      conditions.push(`created_at >= $${paramCount}`);
      values.push(filters.start_date);
      paramCount++;
    }

    if (filters.end_date) {
      conditions.push(`created_at <= $${paramCount}`);
      values.push(filters.end_date);
      paramCount++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count
    const countResult = await this.pool.query(
      `SELECT COUNT(*) as total FROM security_events ${whereClause}`,
      values
    );
    const total = parseInt(countResult.rows[0].total);

    // Get events
    const limit = filters.limit || 50;
    const offset = filters.offset || 0;
    values.push(limit, offset);

    const eventsResult = await this.pool.query(
      `SELECT * FROM security_events ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramCount} OFFSET $${paramCount + 1}`,
      values
    );

    return {
      events: eventsResult.rows,
      total,
    };
  }

  /**
   * Resolve security event
   */
  async resolveSecurityEvent(
    eventId: string,
    resolvedBy: string,
    resolutionNotes: string
  ): Promise<SecurityEvent> {
    const result = await this.pool.query(
      `UPDATE security_events
       SET resolved = TRUE, resolved_at = NOW(), resolved_by = $1, resolution_notes = $2
       WHERE id = $3
       RETURNING *`,
      [resolvedBy, resolutionNotes, eventId]
    );

    if (result.rows.length === 0) {
      throw new Error('Security event not found');
    }

    return result.rows[0];
  }

  /**
   * Export audit logs to JSON
   */
  async exportAuditLogs(filters: Parameters<typeof this.getAuditLogs>[0]): Promise<string> {
    const { logs } = await this.getAuditLogs({ ...filters, limit: 10000 });
    return JSON.stringify(logs, null, 2);
  }

  /**
   * Get audit statistics
   */
  async getAuditStatistics(startDate: Date, endDate: Date): Promise<Record<string, any>> {
    const result = await this.pool.query(
      `SELECT
        COUNT(*) as total_events,
        COUNT(DISTINCT actor_id) as unique_actors,
        COUNT(CASE WHEN status = 'failure' THEN 1 END) as failures,
        COUNT(CASE WHEN status = 'blocked' THEN 1 END) as blocked,
        COUNT(CASE WHEN severity = 'high' OR severity = 'critical' THEN 1 END) as high_severity,
        json_object_agg(event_category, category_count) as by_category
       FROM (
         SELECT
           event_category,
           COUNT(*) as category_count,
           actor_id,
           status,
           severity
         FROM audit_logs
         WHERE created_at BETWEEN $1 AND $2
         GROUP BY event_category, actor_id, status, severity
       ) subquery`,
      [startDate, endDate]
    );

    return result.rows[0];
  }
}

export default AuditService;
