import { Pool } from 'pg';
import { AppLogger } from './logger.service.js';
import nodemailer, { Transporter } from 'nodemailer';
import axios from 'axios';
import Handlebars from 'handlebars';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Security Alerting Service
 * Handles security event alerts via Slack and Email
 */

export interface AlertConfiguration {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  eventTypes: string[];
  severityLevels: string[];
  thresholdCount: number;
  thresholdWindowMinutes: number;
  emailEnabled: boolean;
  emailRecipients?: string[];
  slackEnabled: boolean;
  slackWebhookUrl?: string;
  slackChannel?: string;
  cooldownMinutes: number;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  includeDetails: boolean;
  aggregateSimilar: boolean;
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
  lastTriggeredAt?: Date;
  triggerCount: number;
}

export interface AlertHistory {
  id: string;
  alertConfigurationId: string;
  title: string;
  message: string;
  severity: string;
  priority: string;
  eventCount: number;
  securityEventIds: string[];
  emailSent: boolean;
  emailSentAt?: Date;
  emailError?: string;
  slackSent: boolean;
  slackSentAt?: Date;
  slackError?: string;
  triggeredAt: Date;
}

export interface SecurityEventForAlert {
  id: string;
  eventType: string;
  severity: string;
  message: string;
  details?: Record<string, any>;
  ipAddress?: string;
  userId?: string;
  timestamp: Date;
}

export interface SlackMessage {
  text?: string;
  attachments?: SlackAttachment[];
  blocks?: any[];
}

export interface SlackAttachment {
  color: string;
  title: string;
  text: string;
  fields?: Array<{
    title: string;
    value: string;
    short: boolean;
  }>;
  footer?: string;
  ts?: number;
}

export interface EmailAlertData {
  title: string;
  message: string;
  severity: string;
  priority: string;
  events: SecurityEventForAlert[];
  timestamp: Date;
  alertName: string;
}

export class AlertingService {
  private pool: Pool;
  private emailTransporter: Transporter | null = null;
  private emailTemplates: Map<string, HandlebarsTemplateDelegate> = new Map();

  constructor(pool: Pool) {
    this.pool = pool;
    this.initializeEmailTransporter();
    this.loadEmailTemplates();
  }

  /**
   * Initialize email transporter
   */
  private initializeEmailTransporter(): void {
    const emailConfig = {
      host: process.env.SMTP_HOST || 'localhost',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER
        ? {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASSWORD || '',
          }
        : undefined,
    };

    try {
      this.emailTransporter = nodemailer.createTransport(emailConfig);
      AppLogger.info('Email transporter initialized', { host: emailConfig.host });
    } catch (error) {
      AppLogger.error('Failed to initialize email transporter', error as Error);
    }
  }

  /**
   * Load email templates
   */
  private loadEmailTemplates(): void {
    try {
      const templatesDir = join(__dirname, '../templates/alerts');

      // Register Handlebars helpers
      Handlebars.registerHelper('eq', (a, b) => a === b);
      Handlebars.registerHelper('formatDate', (date) => {
        return new Date(date).toLocaleString();
      });

      // Load templates
      const templates = [
        'critical-alert',
        'high-alert',
        'medium-alert',
        'low-alert',
      ];

      for (const templateName of templates) {
        try {
          const templatePath = join(templatesDir, `${templateName}.html`);
          const templateContent = readFileSync(templatePath, 'utf-8');
          this.emailTemplates.set(templateName, Handlebars.compile(templateContent));
        } catch (error) {
          AppLogger.warn(`Email template not found: ${templateName}`, { error });
        }
      }
    } catch (error) {
      AppLogger.error('Failed to load email templates', error as Error);
    }
  }

  /**
   * Process security event and check for alerts
   */
  async processSecurityEvent(event: SecurityEventForAlert): Promise<void> {
    try {
      // Get active alerts for this event
      const activeAlerts = await this.getActiveAlertsForEvent(
        event.eventType,
        event.severity
      );

      if (activeAlerts.length === 0) {
        return;
      }

      for (const alert of activeAlerts) {
        // Check if alert should be triggered
        const shouldTrigger = await this.shouldTriggerAlert(alert, event);

        if (shouldTrigger) {
          await this.triggerAlert(alert, [event]);
        }
      }
    } catch (error) {
      AppLogger.error('Error processing security event for alerts', error as Error, {
        eventId: event.id,
        eventType: event.eventType,
      });
    }
  }

  /**
   * Get active alerts for an event
   */
  private async getActiveAlertsForEvent(
    eventType: string,
    severity: string
  ): Promise<AlertConfiguration[]> {
    const result = await this.pool.query(
      `SELECT * FROM get_active_alerts_for_event($1, $2)`,
      [eventType, severity]
    );

    return result.rows.map((row) => ({
      id: row.alert_id,
      name: row.alert_name,
      description: '',
      enabled: true,
      eventTypes: [],
      severityLevels: [],
      thresholdCount: row.threshold_count,
      thresholdWindowMinutes: row.threshold_window_minutes,
      emailEnabled: row.email_enabled,
      emailRecipients: row.email_recipients,
      slackEnabled: row.slack_enabled,
      slackWebhookUrl: row.slack_webhook_url,
      slackChannel: row.slack_channel,
      cooldownMinutes: row.cooldown_minutes,
      priority: row.priority,
      includeDetails: row.include_details,
      aggregateSimilar: row.aggregate_similar,
      createdAt: new Date(),
      updatedAt: new Date(),
      triggerCount: 0,
    }));
  }

  /**
   * Check if alert should be triggered
   */
  private async shouldTriggerAlert(
    alert: AlertConfiguration,
    event: SecurityEventForAlert
  ): Promise<boolean> {
    const result = await this.pool.query(
      `SELECT should_trigger_alert($1, $2, $3) as should_trigger`,
      [alert.id, event.eventType, event.severity]
    );

    return result.rows[0]?.should_trigger || false;
  }

  /**
   * Trigger an alert
   */
  async triggerAlert(
    alert: AlertConfiguration,
    events: SecurityEventForAlert[]
  ): Promise<string> {
    try {
      // Build alert message
      const { title, message } = this.buildAlertMessage(alert, events);

      const severity = this.getHighestSeverity(events);
      const eventIds = events.map((e) => e.id);

      // Send alerts
      const emailResult = alert.emailEnabled
        ? await this.sendEmailAlert(alert, title, message, severity, events)
        : { sent: false };

      const slackResult = alert.slackEnabled
        ? await this.sendSlackAlert(alert, title, message, severity, events)
        : { sent: false };

      // Record alert in database
      const historyId = await this.recordAlertTrigger(
        alert.id,
        title,
        message,
        severity,
        alert.priority,
        eventIds,
        emailResult.sent,
        slackResult.sent
      );

      // Update email/slack errors if any
      if (emailResult.error) {
        await this.updateAlertHistoryError(historyId, 'email', emailResult.error);
      }
      if (slackResult.error) {
        await this.updateAlertHistoryError(historyId, 'slack', slackResult.error);
      }

      // Create suppression (cooldown)
      await this.createSuppression(
        alert.id,
        alert.cooldownMinutes,
        'Alert triggered'
      );

      AppLogger.info('Alert triggered successfully', {
        alertId: alert.id,
        alertName: alert.name,
        eventCount: events.length,
        emailSent: emailResult.sent,
        slackSent: slackResult.sent,
      });

      return historyId;
    } catch (error) {
      AppLogger.error('Error triggering alert', error as Error, {
        alertId: alert.id,
      });
      throw error;
    }
  }

  /**
   * Build alert message
   */
  private buildAlertMessage(
    alert: AlertConfiguration,
    events: SecurityEventForAlert[]
  ): { title: string; message: string } {
    const eventCount = events.length;
    const firstEvent = events[0];

    let title = `[${alert.priority.toUpperCase()}] ${alert.name}`;

    if (eventCount === 1) {
      title += ` - ${firstEvent.eventType}`;
    } else {
      title += ` - ${eventCount} events`;
    }

    let message = `Alert "${alert.name}" was triggered.\n\n`;

    if (eventCount === 1) {
      message += `Event: ${firstEvent.eventType}\n`;
      message += `Severity: ${firstEvent.severity}\n`;
      message += `Message: ${firstEvent.message}\n`;
      if (firstEvent.ipAddress) {
        message += `IP Address: ${firstEvent.ipAddress}\n`;
      }
    } else {
      message += `${eventCount} security events detected:\n\n`;
      const eventTypeCounts = this.countEventTypes(events);
      for (const [type, count] of Object.entries(eventTypeCounts)) {
        message += `- ${type}: ${count} event(s)\n`;
      }
    }

    message += `\nTime: ${new Date().toISOString()}`;

    return { title, message };
  }

  /**
   * Send email alert
   */
  private async sendEmailAlert(
    alert: AlertConfiguration,
    title: string,
    message: string,
    severity: string,
    events: SecurityEventForAlert[]
  ): Promise<{ sent: boolean; error?: string }> {
    if (!this.emailTransporter || !alert.emailRecipients?.length) {
      return { sent: false, error: 'Email not configured' };
    }

    try {
      const templateName = `${severity}-alert`;
      const template = this.emailTemplates.get(templateName) ||
                      this.emailTemplates.get('medium-alert');

      const emailData: EmailAlertData = {
        title,
        message,
        severity,
        priority: alert.priority,
        events: alert.includeDetails ? events : [],
        timestamp: new Date(),
        alertName: alert.name,
      };

      const html = template
        ? template(emailData)
        : `<html><body><h1>${title}</h1><pre>${message}</pre></body></html>`;

      await this.emailTransporter.sendMail({
        from: process.env.SMTP_FROM || 'security@websitecloner.com',
        to: alert.emailRecipients.join(', '),
        subject: title,
        text: message,
        html,
      });

      return { sent: true };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      AppLogger.error('Failed to send email alert', error as Error, {
        alertId: alert.id,
      });
      return { sent: false, error: errorMsg };
    }
  }

  /**
   * Send Slack alert
   */
  private async sendSlackAlert(
    alert: AlertConfiguration,
    title: string,
    message: string,
    severity: string,
    events: SecurityEventForAlert[]
  ): Promise<{ sent: boolean; error?: string }> {
    if (!alert.slackWebhookUrl) {
      return { sent: false, error: 'Slack webhook not configured' };
    }

    try {
      const color = this.getSeverityColor(severity);
      const slackMessage: SlackMessage = {
        attachments: [
          {
            color,
            title,
            text: message,
            fields: this.buildSlackFields(alert, events),
            footer: 'Website Cloner Pro Security',
            ts: Math.floor(Date.now() / 1000),
          },
        ],
      };

      if (alert.slackChannel) {
        (slackMessage as any).channel = alert.slackChannel;
      }

      await axios.post(alert.slackWebhookUrl, slackMessage, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000,
      });

      return { sent: true };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      AppLogger.error('Failed to send Slack alert', error as Error, {
        alertId: alert.id,
      });
      return { sent: false, error: errorMsg };
    }
  }

  /**
   * Build Slack message fields
   */
  private buildSlackFields(
    alert: AlertConfiguration,
    events: SecurityEventForAlert[]
  ): Array<{ title: string; value: string; short: boolean }> {
    const fields: Array<{ title: string; value: string; short: boolean }> = [
      {
        title: 'Alert Name',
        value: alert.name,
        short: true,
      },
      {
        title: 'Priority',
        value: alert.priority.toUpperCase(),
        short: true,
      },
      {
        title: 'Event Count',
        value: events.length.toString(),
        short: true,
      },
      {
        title: 'Severity',
        value: this.getHighestSeverity(events),
        short: true,
      },
    ];

    if (alert.includeDetails && events.length > 0) {
      const uniqueIPs = new Set(
        events.map((e) => e.ipAddress).filter((ip) => ip)
      );
      if (uniqueIPs.size > 0) {
        fields.push({
          title: 'Affected IPs',
          value: Array.from(uniqueIPs).join(', '),
          short: false,
        });
      }
    }

    return fields;
  }

  /**
   * Record alert trigger in database
   */
  private async recordAlertTrigger(
    alertConfigId: string,
    title: string,
    message: string,
    severity: string,
    priority: string,
    eventIds: string[],
    emailSent: boolean,
    slackSent: boolean
  ): Promise<string> {
    const result = await this.pool.query(
      `SELECT record_alert_trigger($1, $2, $3, $4, $5, $6, $7, $8) as history_id`,
      [
        alertConfigId,
        title,
        message,
        severity,
        priority,
        eventIds,
        emailSent,
        slackSent,
      ]
    );

    return result.rows[0].history_id;
  }

  /**
   * Update alert history with error
   */
  private async updateAlertHistoryError(
    historyId: string,
    channel: 'email' | 'slack',
    error: string
  ): Promise<void> {
    const field = channel === 'email' ? 'email_error' : 'slack_error';
    await this.pool.query(
      `UPDATE alert_history SET ${field} = $1 WHERE id = $2`,
      [error, historyId]
    );
  }

  /**
   * Create alert suppression
   */
  private async createSuppression(
    alertConfigId: string,
    cooldownMinutes: number,
    reason: string
  ): Promise<string> {
    const result = await this.pool.query(
      `SELECT create_alert_suppression($1, $2, $3) as suppression_id`,
      [alertConfigId, cooldownMinutes, reason]
    );

    return result.rows[0].suppression_id;
  }

  /**
   * Get alert configuration by ID
   */
  async getAlertConfiguration(id: string): Promise<AlertConfiguration | null> {
    const result = await this.pool.query(
      `SELECT * FROM alert_configurations WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToAlertConfiguration(result.rows[0]);
  }

  /**
   * Get all alert configurations
   */
  async getAllAlertConfigurations(): Promise<AlertConfiguration[]> {
    const result = await this.pool.query(
      `SELECT * FROM alert_configurations ORDER BY created_at DESC`
    );

    return result.rows.map((row) => this.mapRowToAlertConfiguration(row));
  }

  /**
   * Create alert configuration
   */
  async createAlertConfiguration(
    data: Omit<AlertConfiguration, 'id' | 'createdAt' | 'updatedAt' | 'triggerCount'>
  ): Promise<AlertConfiguration> {
    const result = await this.pool.query(
      `INSERT INTO alert_configurations (
        name, description, enabled, event_types, severity_levels,
        threshold_count, threshold_window_minutes,
        email_enabled, email_recipients,
        slack_enabled, slack_webhook_url, slack_channel,
        cooldown_minutes, priority, include_details, aggregate_similar,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING *`,
      [
        data.name,
        data.description,
        data.enabled,
        data.eventTypes,
        data.severityLevels,
        data.thresholdCount,
        data.thresholdWindowMinutes,
        data.emailEnabled,
        data.emailRecipients || [],
        data.slackEnabled,
        data.slackWebhookUrl,
        data.slackChannel,
        data.cooldownMinutes,
        data.priority,
        data.includeDetails,
        data.aggregateSimilar,
        data.createdBy,
      ]
    );

    return this.mapRowToAlertConfiguration(result.rows[0]);
  }

  /**
   * Update alert configuration
   */
  async updateAlertConfiguration(
    id: string,
    data: Partial<AlertConfiguration>
  ): Promise<AlertConfiguration | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (data.name !== undefined) {
      fields.push(`name = $${paramCount++}`);
      values.push(data.name);
    }
    if (data.description !== undefined) {
      fields.push(`description = $${paramCount++}`);
      values.push(data.description);
    }
    if (data.enabled !== undefined) {
      fields.push(`enabled = $${paramCount++}`);
      values.push(data.enabled);
    }
    if (data.eventTypes !== undefined) {
      fields.push(`event_types = $${paramCount++}`);
      values.push(data.eventTypes);
    }
    if (data.severityLevels !== undefined) {
      fields.push(`severity_levels = $${paramCount++}`);
      values.push(data.severityLevels);
    }
    if (data.thresholdCount !== undefined) {
      fields.push(`threshold_count = $${paramCount++}`);
      values.push(data.thresholdCount);
    }
    if (data.thresholdWindowMinutes !== undefined) {
      fields.push(`threshold_window_minutes = $${paramCount++}`);
      values.push(data.thresholdWindowMinutes);
    }
    if (data.emailEnabled !== undefined) {
      fields.push(`email_enabled = $${paramCount++}`);
      values.push(data.emailEnabled);
    }
    if (data.emailRecipients !== undefined) {
      fields.push(`email_recipients = $${paramCount++}`);
      values.push(data.emailRecipients);
    }
    if (data.slackEnabled !== undefined) {
      fields.push(`slack_enabled = $${paramCount++}`);
      values.push(data.slackEnabled);
    }
    if (data.slackWebhookUrl !== undefined) {
      fields.push(`slack_webhook_url = $${paramCount++}`);
      values.push(data.slackWebhookUrl);
    }
    if (data.slackChannel !== undefined) {
      fields.push(`slack_channel = $${paramCount++}`);
      values.push(data.slackChannel);
    }
    if (data.cooldownMinutes !== undefined) {
      fields.push(`cooldown_minutes = $${paramCount++}`);
      values.push(data.cooldownMinutes);
    }
    if (data.priority !== undefined) {
      fields.push(`priority = $${paramCount++}`);
      values.push(data.priority);
    }
    if (data.includeDetails !== undefined) {
      fields.push(`include_details = $${paramCount++}`);
      values.push(data.includeDetails);
    }
    if (data.aggregateSimilar !== undefined) {
      fields.push(`aggregate_similar = $${paramCount++}`);
      values.push(data.aggregateSimilar);
    }

    if (fields.length === 0) {
      return this.getAlertConfiguration(id);
    }

    values.push(id);
    const result = await this.pool.query(
      `UPDATE alert_configurations SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToAlertConfiguration(result.rows[0]);
  }

  /**
   * Delete alert configuration
   */
  async deleteAlertConfiguration(id: string): Promise<boolean> {
    const result = await this.pool.query(
      `DELETE FROM alert_configurations WHERE id = $1`,
      [id]
    );

    return result.rowCount !== null && result.rowCount > 0;
  }

  /**
   * Get alert history
   */
  async getAlertHistory(
    limit: number = 50,
    offset: number = 0,
    filters?: {
      alertConfigId?: string;
      severity?: string;
      startDate?: Date;
      endDate?: Date;
    }
  ): Promise<{ history: AlertHistory[]; total: number }> {
    let query = `SELECT * FROM alert_history WHERE 1=1`;
    const params: any[] = [];
    let paramCount = 1;

    if (filters?.alertConfigId) {
      query += ` AND alert_configuration_id = $${paramCount++}`;
      params.push(filters.alertConfigId);
    }

    if (filters?.severity) {
      query += ` AND severity = $${paramCount++}`;
      params.push(filters.severity);
    }

    if (filters?.startDate) {
      query += ` AND triggered_at >= $${paramCount++}`;
      params.push(filters.startDate);
    }

    if (filters?.endDate) {
      query += ` AND triggered_at <= $${paramCount++}`;
      params.push(filters.endDate);
    }

    // Get total count
    const countResult = await this.pool.query(
      `SELECT COUNT(*) as total FROM (${query}) as subquery`,
      params
    );
    const total = parseInt(countResult.rows[0].total);

    // Get paginated results
    query += ` ORDER BY triggered_at DESC LIMIT $${paramCount++} OFFSET $${paramCount}`;
    params.push(limit, offset);

    const result = await this.pool.query(query, params);

    return {
      history: result.rows.map((row) => this.mapRowToAlertHistory(row)),
      total,
    };
  }

  /**
   * Get alert statistics
   */
  async getAlertStatistics(days: number = 30): Promise<any> {
    const result = await this.pool.query(
      `SELECT * FROM get_alert_statistics($1)`,
      [days]
    );

    return result.rows[0];
  }

  /**
   * Cleanup expired suppressions
   */
  async cleanupExpiredSuppressions(): Promise<number> {
    const result = await this.pool.query(`SELECT cleanup_expired_suppressions()`);
    return result.rows[0].cleanup_expired_suppressions;
  }

  /**
   * Helper: Map database row to AlertConfiguration
   */
  private mapRowToAlertConfiguration(row: any): AlertConfiguration {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      enabled: row.enabled,
      eventTypes: row.event_types,
      severityLevels: row.severity_levels,
      thresholdCount: row.threshold_count,
      thresholdWindowMinutes: row.threshold_window_minutes,
      emailEnabled: row.email_enabled,
      emailRecipients: row.email_recipients,
      slackEnabled: row.slack_enabled,
      slackWebhookUrl: row.slack_webhook_url,
      slackChannel: row.slack_channel,
      cooldownMinutes: row.cooldown_minutes,
      priority: row.priority,
      includeDetails: row.include_details,
      aggregateSimilar: row.aggregate_similar,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastTriggeredAt: row.last_triggered_at,
      triggerCount: row.trigger_count,
    };
  }

  /**
   * Helper: Map database row to AlertHistory
   */
  private mapRowToAlertHistory(row: any): AlertHistory {
    return {
      id: row.id,
      alertConfigurationId: row.alert_configuration_id,
      title: row.title,
      message: row.message,
      severity: row.severity,
      priority: row.priority,
      eventCount: row.event_count,
      securityEventIds: row.security_event_ids,
      emailSent: row.email_sent,
      emailSentAt: row.email_sent_at,
      emailError: row.email_error,
      slackSent: row.slack_sent,
      slackSentAt: row.slack_sent_at,
      slackError: row.slack_error,
      triggeredAt: row.triggered_at,
    };
  }

  /**
   * Helper: Get highest severity from events
   */
  private getHighestSeverity(events: SecurityEventForAlert[]): string {
    const severityOrder = ['critical', 'high', 'medium', 'low'];
    for (const severity of severityOrder) {
      if (events.some((e) => e.severity === severity)) {
        return severity;
      }
    }
    return 'low';
  }

  /**
   * Helper: Get color for severity
   */
  private getSeverityColor(severity: string): string {
    const colors: Record<string, string> = {
      critical: '#FF0000',
      high: '#FF6600',
      medium: '#FFCC00',
      low: '#00CC00',
    };
    return colors[severity] || '#CCCCCC';
  }

  /**
   * Helper: Count event types
   */
  private countEventTypes(events: SecurityEventForAlert[]): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const event of events) {
      counts[event.eventType] = (counts[event.eventType] || 0) + 1;
    }
    return counts;
  }
}

// Singleton instance
let alertingService: AlertingService | null = null;

export function initializeAlertingService(pool: Pool): AlertingService {
  if (!alertingService) {
    alertingService = new AlertingService(pool);
  }
  return alertingService;
}

export function getAlertingService(): AlertingService {
  if (!alertingService) {
    throw new Error('AlertingService not initialized');
  }
  return alertingService;
}
