/**
 * Notification Service
 *
 * Handles sending notifications via multiple channels:
 * - Email (SMTP)
 * - Slack webhooks
 * - Discord webhooks
 *
 * Includes rate limiting to prevent notification spam.
 */

import { AppLogger } from './logger.service.js';

export interface EmailNotification {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
}

export interface SlackNotification {
  text: string;
  blocks?: any[];
  attachments?: any[];
}

export interface NotificationOptions {
  priority?: 'low' | 'medium' | 'high' | 'critical';
  deduplicationKey?: string; // Prevent duplicate notifications
  rateLimitKey?: string; // Custom rate limit key
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export class NotificationService {
  private emailTransporter: any | null = null;
  private slackWebhookUrl: string | null = null;
  private discordWebhookUrl: string | null = null;
  private emailEnabled: boolean = false;
  private slackEnabled: boolean = false;
  private discordEnabled: boolean = false;

  // Rate limiting
  private rateLimitMap: Map<string, RateLimitEntry> = new Map();
  private readonly rateLimitWindow = 60 * 60 * 1000; // 1 hour
  private readonly rateLimitMax = {
    low: 100,
    medium: 50,
    high: 20,
    critical: 10,
  };

  // Deduplication
  private deduplicationSet: Set<string> = new Set();
  private readonly deduplicationWindow = 60 * 60 * 1000; // 1 hour

  constructor() {
    // Initialize asynchronously
    this.initialize().catch(error => {
      console.error('[NOTIFICATION] Initialization failed:', error);
    });
  }

  /**
   * Initialize notification channels
   */
  private async initialize(): Promise<void> {
    // Email configuration
    if (process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_USER) {
      try {
        // Try to load nodemailer
        const nodemailer = await import('nodemailer').catch(() => null);
        if (!nodemailer) {
          console.log('[NOTIFICATION] nodemailer not installed, email disabled');
          return;
        }

        this.emailTransporter = nodemailer.default.createTransporter({
          host: process.env.SMTP_HOST,
          port: parseInt(process.env.SMTP_PORT),
          secure: process.env.SMTP_SECURE === 'true', // true for 465, false for 587
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASSWORD,
          },
        });

        this.emailEnabled = true;
        console.log('[NOTIFICATION] Email notifications enabled');
      } catch (error) {
        console.error('[NOTIFICATION] Failed to initialize email:', error);
      }
    }

    // Slack configuration
    if (process.env.SLACK_WEBHOOK_URL) {
      this.slackWebhookUrl = process.env.SLACK_WEBHOOK_URL;
      this.slackEnabled = true;
      console.log('[NOTIFICATION] Slack notifications enabled');
    }

    // Discord configuration
    if (process.env.DISCORD_WEBHOOK_URL) {
      this.discordWebhookUrl = process.env.DISCORD_WEBHOOK_URL;
      this.discordEnabled = true;
      console.log('[NOTIFICATION] Discord notifications enabled');
    }

    if (!this.emailEnabled && !this.slackEnabled && !this.discordEnabled) {
      console.log('[NOTIFICATION] No notification channels configured');
    }
  }

  /**
   * Check if notification should be sent (rate limiting + deduplication)
   */
  private shouldSendNotification(
    rateLimitKey: string,
    priority: 'low' | 'medium' | 'high' | 'critical',
    deduplicationKey?: string
  ): boolean {
    // Deduplication check
    if (deduplicationKey) {
      if (this.deduplicationSet.has(deduplicationKey)) {
        AppLogger.debug('Notification deduplicated', { deduplicationKey });
        return false;
      }

      // Add to deduplication set with TTL
      this.deduplicationSet.add(deduplicationKey);
      setTimeout(() => {
        this.deduplicationSet.delete(deduplicationKey);
      }, this.deduplicationWindow);
    }

    // Rate limiting check
    const now = Date.now();
    const entry = this.rateLimitMap.get(rateLimitKey);

    if (entry) {
      if (now < entry.resetAt) {
        // Within rate limit window
        const maxAllowed = this.rateLimitMax[priority];
        if (entry.count >= maxAllowed) {
          AppLogger.warn('Notification rate limit exceeded', {
            rateLimitKey,
            priority,
            count: entry.count,
            max: maxAllowed,
          });
          return false;
        }

        entry.count++;
      } else {
        // Reset window
        this.rateLimitMap.set(rateLimitKey, {
          count: 1,
          resetAt: now + this.rateLimitWindow,
        });
      }
    } else {
      // First notification
      this.rateLimitMap.set(rateLimitKey, {
        count: 1,
        resetAt: now + this.rateLimitWindow,
      });
    }

    return true;
  }

  /**
   * Send email notification
   */
  async sendEmail(
    notification: EmailNotification,
    options: NotificationOptions = {}
  ): Promise<boolean> {
    if (!this.emailEnabled || !this.emailTransporter) {
      AppLogger.debug('Email notifications not configured');
      return false;
    }

    const priority = options.priority || 'medium';
    const rateLimitKey = options.rateLimitKey || `email:${notification.subject}`;

    // Check rate limits
    if (!this.shouldSendNotification(rateLimitKey, priority, options.deduplicationKey)) {
      return false;
    }

    try {
      const recipients = Array.isArray(notification.to)
        ? notification.to.join(', ')
        : notification.to;

      const info = await this.emailTransporter.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: recipients,
        subject: notification.subject,
        text: notification.text,
        html: notification.html || notification.text,
        priority: priority === 'critical' || priority === 'high' ? 'high' : 'normal',
      });

      AppLogger.info('Email notification sent', {
        messageId: info.messageId,
        recipients,
        subject: notification.subject,
        priority,
      });

      return true;
    } catch (error) {
      AppLogger.error('Failed to send email notification', error as Error, {
        subject: notification.subject,
      });
      return false;
    }
  }

  /**
   * Send Slack notification
   */
  async sendSlack(
    notification: SlackNotification,
    options: NotificationOptions = {}
  ): Promise<boolean> {
    if (!this.slackEnabled || !this.slackWebhookUrl) {
      AppLogger.debug('Slack notifications not configured');
      return false;
    }

    const priority = options.priority || 'medium';
    const rateLimitKey = options.rateLimitKey || `slack:${notification.text.substring(0, 50)}`;

    // Check rate limits
    if (!this.shouldSendNotification(rateLimitKey, priority, options.deduplicationKey)) {
      return false;
    }

    try {
      const payload = {
        text: notification.text,
        blocks: notification.blocks,
        attachments: notification.attachments,
      };

      const response = await fetch(this.slackWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Slack API error: ${response.status} ${response.statusText}`);
      }

      AppLogger.info('Slack notification sent', {
        text: notification.text.substring(0, 100),
        priority,
      });

      return true;
    } catch (error) {
      AppLogger.error('Failed to send Slack notification', error as Error);
      return false;
    }
  }

  /**
   * Send Discord notification
   */
  async sendDiscord(
    notification: { content: string; embeds?: any[] },
    options: NotificationOptions = {}
  ): Promise<boolean> {
    if (!this.discordEnabled || !this.discordWebhookUrl) {
      AppLogger.debug('Discord notifications not configured');
      return false;
    }

    const priority = options.priority || 'medium';
    const rateLimitKey = options.rateLimitKey || `discord:${notification.content.substring(0, 50)}`;

    // Check rate limits
    if (!this.shouldSendNotification(rateLimitKey, priority, options.deduplicationKey)) {
      return false;
    }

    try {
      const response = await fetch(this.discordWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(notification),
      });

      if (!response.ok) {
        throw new Error(`Discord API error: ${response.status} ${response.statusText}`);
      }

      AppLogger.info('Discord notification sent', {
        content: notification.content.substring(0, 100),
        priority,
      });

      return true;
    } catch (error) {
      AppLogger.error('Failed to send Discord notification', error as Error);
      return false;
    }
  }

  /**
   * Send notification to all configured channels
   */
  async sendAll(
    notification: {
      subject: string;
      message: string;
      details?: Record<string, any>;
    },
    options: NotificationOptions = {}
  ): Promise<{
    email: boolean;
    slack: boolean;
    discord: boolean;
  }> {
    const results = {
      email: false,
      slack: false,
      discord: false,
    };

    // Email
    if (this.emailEnabled && process.env.NOTIFICATION_EMAIL) {
      const html = this.formatEmailHtml(notification.subject, notification.message, notification.details);

      results.email = await this.sendEmail(
        {
          to: process.env.NOTIFICATION_EMAIL,
          subject: notification.subject,
          text: notification.message,
          html,
        },
        options
      );
    }

    // Slack
    if (this.slackEnabled) {
      const slackPayload = this.formatSlackMessage(notification.subject, notification.message, notification.details, options.priority);
      results.slack = await this.sendSlack(slackPayload, options);
    }

    // Discord
    if (this.discordEnabled) {
      const discordPayload = this.formatDiscordMessage(notification.subject, notification.message, notification.details, options.priority);
      results.discord = await this.sendDiscord(discordPayload, options);
    }

    return results;
  }

  /**
   * Format email HTML
   */
  private formatEmailHtml(subject: string, message: string, details?: Record<string, any>): string {
    let html = `
      <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 10px;">
              ${this.escapeHtml(subject)}
            </h2>
            <p style="font-size: 16px; margin: 20px 0;">
              ${this.escapeHtml(message)}
            </p>
    `;

    if (details && Object.keys(details).length > 0) {
      html += `
            <h3 style="color: #34495e; margin-top: 30px;">Details:</h3>
            <table style="width: 100%; border-collapse: collapse;">
      `;

      for (const [key, value] of Object.entries(details)) {
        html += `
              <tr>
                <td style="padding: 8px; border-bottom: 1px solid #ecf0f1; font-weight: bold;">
                  ${this.escapeHtml(key)}:
                </td>
                <td style="padding: 8px; border-bottom: 1px solid #ecf0f1;">
                  ${this.escapeHtml(String(value))}
                </td>
              </tr>
        `;
      }

      html += `
            </table>
      `;
    }

    html += `
            <p style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ecf0f1; color: #7f8c8d; font-size: 12px;">
              This is an automated notification from Website Cloner Pro
            </p>
          </div>
        </body>
      </html>
    `;

    return html;
  }

  /**
   * Format Slack message with blocks
   */
  private formatSlackMessage(
    subject: string,
    message: string,
    details?: Record<string, any>,
    priority?: string
  ): SlackNotification {
    const color = this.getPriorityColor(priority);

    const blocks: any[] = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: subject,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: message,
        },
      },
    ];

    if (details && Object.keys(details).length > 0) {
      const fields: any[] = [];

      for (const [key, value] of Object.entries(details)) {
        fields.push({
          type: 'mrkdwn',
          text: `*${key}:*\n${String(value)}`,
        });
      }

      blocks.push({
        type: 'section',
        fields: fields.slice(0, 10), // Slack limits to 10 fields
      });
    }

    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `Priority: *${priority || 'medium'}* | ${new Date().toLocaleString()}`,
        },
      ],
    });

    return {
      text: subject,
      blocks,
      attachments: [
        {
          color,
          footer: 'Website Cloner Pro',
          ts: Math.floor(Date.now() / 1000),
        },
      ],
    };
  }

  /**
   * Format Discord message with embeds
   */
  private formatDiscordMessage(
    subject: string,
    message: string,
    details?: Record<string, any>,
    priority?: string
  ): { content: string; embeds: any[] } {
    const color = this.getPriorityColorHex(priority);

    const fields: any[] = [];

    if (details && Object.keys(details).length > 0) {
      for (const [key, value] of Object.entries(details)) {
        fields.push({
          name: key,
          value: String(value),
          inline: true,
        });
      }
    }

    return {
      content: `**${subject}**`,
      embeds: [
        {
          title: subject,
          description: message,
          color: parseInt(color.substring(1), 16),
          fields: fields.slice(0, 25), // Discord limits to 25 fields
          footer: {
            text: `Priority: ${priority || 'medium'} | Website Cloner Pro`,
          },
          timestamp: new Date().toISOString(),
        },
      ],
    };
  }

  /**
   * Get priority color for Slack
   */
  private getPriorityColor(priority?: string): string {
    switch (priority) {
      case 'critical':
        return 'danger'; // Red
      case 'high':
        return 'warning'; // Yellow
      case 'medium':
        return '#3498db'; // Blue
      case 'low':
        return 'good'; // Green
      default:
        return '#95a5a6'; // Gray
    }
  }

  /**
   * Get priority color (hex) for Discord
   */
  private getPriorityColorHex(priority?: string): string {
    switch (priority) {
      case 'critical':
        return '#e74c3c'; // Red
      case 'high':
        return '#f39c12'; // Orange
      case 'medium':
        return '#3498db'; // Blue
      case 'low':
        return '#2ecc71'; // Green
      default:
        return '#95a5a6'; // Gray
    }
  }

  /**
   * Escape HTML special characters
   */
  private escapeHtml(text: string): string {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return text.replace(/[&<>"']/g, m => map[m]);
  }

  /**
   * Test notification channels
   */
  async testNotifications(): Promise<{
    email: boolean;
    slack: boolean;
    discord: boolean;
  }> {
    const results = await this.sendAll(
      {
        subject: 'Test Notification',
        message: 'This is a test notification from Website Cloner Pro.',
        details: {
          'Test Time': new Date().toISOString(),
          'Environment': process.env.NODE_ENV || 'development',
        },
      },
      {
        priority: 'low',
        rateLimitKey: 'test-notification',
      }
    );

    AppLogger.info('Test notifications sent', results);
    return results;
  }

  /**
   * Get notification status
   */
  getStatus(): {
    email: boolean;
    slack: boolean;
    discord: boolean;
  } {
    return {
      email: this.emailEnabled,
      slack: this.slackEnabled,
      discord: this.discordEnabled,
    };
  }
}

/**
 * Singleton instance
 */
let notificationService: NotificationService | null = null;

export function getNotificationService(): NotificationService {
  if (!notificationService) {
    notificationService = new NotificationService();
  }
  return notificationService;
}
