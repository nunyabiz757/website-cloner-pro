import fs from 'fs/promises';
import path from 'path';
import Handlebars from 'handlebars';
import { AppLogger } from './logger.service.js';

/**
 * API Key Email Service
 * Sends email notifications for API key lifecycle events
 */

export interface EmailConfig {
  from: string;
  supportUrl: string;
  dashboardUrl: string;
}

export interface ExpiryWarningEmailData {
  apiKeyId: string;
  apiKeyName: string;
  keyPrefix: string;
  expiryDate: string;
  createdDate: string;
  daysUntilExpiry: number;
  isUrgent: boolean;
  userEmail: string;
}

export interface ExpiredEmailData {
  apiKeyId: string;
  apiKeyName: string;
  keyPrefix: string;
  expiredDate: string;
  wasRevoked: boolean;
  lastUsed: boolean;
  lastUsedDate?: string;
  userEmail: string;
}

export interface RevokedEmailData {
  apiKeyId: string;
  apiKeyName: string;
  keyPrefix: string;
  revokedDate: string;
  revokedBy: string;
  reason?: string;
  wasAutoRevoked: boolean;
  suspiciousActivity: boolean;
  userEmail: string;
}

export class APIKeyEmailService {
  private config: EmailConfig;
  private templates: Map<string, HandlebarsTemplateDelegate> = new Map();
  private templateDir: string;

  constructor(config: EmailConfig) {
    this.config = config;
    this.templateDir = path.join(
      process.cwd(),
      'src',
      'server',
      'templates',
      'email'
    );

    // Register Handlebars helpers
    this.registerHelpers();
  }

  /**
   * Initialize templates
   */
  async initialize(): Promise<void> {
    try {
      // Load templates
      await this.loadTemplate('expiry-warning', 'api-key-expiry-warning.html');
      await this.loadTemplate('expired', 'api-key-expired.html');
      await this.loadTemplate('revoked', 'api-key-revoked.html');

      AppLogger.info('API key email templates loaded');
    } catch (error) {
      AppLogger.error('Failed to load email templates', error as Error);
      throw error;
    }
  }

  /**
   * Load email template
   */
  private async loadTemplate(
    name: string,
    filename: string
  ): Promise<void> {
    try {
      const templatePath = path.join(this.templateDir, filename);
      const templateContent = await fs.readFile(templatePath, 'utf-8');
      const compiledTemplate = Handlebars.compile(templateContent);
      this.templates.set(name, compiledTemplate);

      AppLogger.debug(`Loaded email template: ${name}`);
    } catch (error) {
      AppLogger.error(`Failed to load template: ${name}`, error as Error);
      throw error;
    }
  }

  /**
   * Register Handlebars helpers
   */
  private registerHelpers(): void {
    Handlebars.registerHelper('eq', function (a, b) {
      return a === b;
    });

    Handlebars.registerHelper('gt', function (a, b) {
      return a > b;
    });

    Handlebars.registerHelper('lt', function (a, b) {
      return a < b;
    });

    Handlebars.registerHelper('formatDate', function (date: Date) {
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    });
  }

  /**
   * Send expiry warning email
   */
  async sendExpiryWarning(data: ExpiryWarningEmailData): Promise<boolean> {
    try {
      const template = this.templates.get('expiry-warning');

      if (!template) {
        throw new Error('Expiry warning template not loaded');
      }

      const isUrgent = data.daysUntilExpiry <= 3;

      const html = template({
        ...data,
        isUrgent,
        dashboardUrl: this.config.dashboardUrl,
        supportUrl: this.config.supportUrl,
        year: new Date().getFullYear(),
      });

      const subject = isUrgent
        ? `⚠️ URGENT: API Key Expires in ${data.daysUntilExpiry} ${data.daysUntilExpiry === 1 ? 'Day' : 'Days'}`
        : `API Key Expiring in ${data.daysUntilExpiry} Days`;

      await this.sendEmail(data.userEmail, subject, html);

      AppLogger.info('Expiry warning email sent', {
        apiKeyId: data.apiKeyId,
        userEmail: data.userEmail,
        daysUntilExpiry: data.daysUntilExpiry,
      });

      return true;
    } catch (error) {
      AppLogger.error('Failed to send expiry warning email', error as Error, {
        apiKeyId: data.apiKeyId,
      });
      return false;
    }
  }

  /**
   * Send expired notification email
   */
  async sendExpiredNotification(data: ExpiredEmailData): Promise<boolean> {
    try {
      const template = this.templates.get('expired');

      if (!template) {
        throw new Error('Expired template not loaded');
      }

      const html = template({
        ...data,
        dashboardUrl: this.config.dashboardUrl,
        supportUrl: this.config.supportUrl,
        year: new Date().getFullYear(),
      });

      const subject = `🔴 API Key Expired: ${data.apiKeyName}`;

      await this.sendEmail(data.userEmail, subject, html);

      AppLogger.info('Expired notification email sent', {
        apiKeyId: data.apiKeyId,
        userEmail: data.userEmail,
        wasRevoked: data.wasRevoked,
      });

      return true;
    } catch (error) {
      AppLogger.error('Failed to send expired notification email', error as Error, {
        apiKeyId: data.apiKeyId,
      });
      return false;
    }
  }

  /**
   * Send revoked notification email
   */
  async sendRevokedNotification(data: RevokedEmailData): Promise<boolean> {
    try {
      const template = this.templates.get('revoked');

      if (!template) {
        throw new Error('Revoked template not loaded');
      }

      const html = template({
        ...data,
        dashboardUrl: this.config.dashboardUrl,
        supportUrl: this.config.supportUrl,
        year: new Date().getFullYear(),
      });

      const subject = data.wasAutoRevoked
        ? `🛑 API Key Auto-Revoked: ${data.apiKeyName}`
        : `API Key Revoked: ${data.apiKeyName}`;

      await this.sendEmail(data.userEmail, subject, html);

      AppLogger.info('Revoked notification email sent', {
        apiKeyId: data.apiKeyId,
        userEmail: data.userEmail,
        wasAutoRevoked: data.wasAutoRevoked,
      });

      return true;
    } catch (error) {
      AppLogger.error('Failed to send revoked notification email', error as Error, {
        apiKeyId: data.apiKeyId,
      });
      return false;
    }
  }

  /**
   * Send email (mock implementation - integrate with actual email service)
   */
  private async sendEmail(
    to: string,
    subject: string,
    html: string
  ): Promise<void> {
    // TODO: Integrate with actual email service (SendGrid, AWS SES, etc.)

    AppLogger.info('Email sent (mock)', {
      to,
      subject,
      from: this.config.from,
      htmlLength: html.length,
    });

    // In production, use actual email service:
    /*
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      },
    });

    await transporter.sendMail({
      from: this.config.from,
      to,
      subject,
      html,
    });
    */
  }

  /**
   * Test email template rendering
   */
  async testTemplate(
    templateName: string,
    data: any
  ): Promise<string> {
    try {
      const template = this.templates.get(templateName);

      if (!template) {
        throw new Error(`Template not found: ${templateName}`);
      }

      const html = template({
        ...data,
        dashboardUrl: this.config.dashboardUrl,
        supportUrl: this.config.supportUrl,
        year: new Date().getFullYear(),
      });

      return html;
    } catch (error) {
      AppLogger.error('Failed to test template', error as Error, {
        templateName,
      });
      throw error;
    }
  }

  /**
   * Get available templates
   */
  getAvailableTemplates(): string[] {
    return Array.from(this.templates.keys());
  }

  /**
   * Send batch expiry warnings
   */
  async sendBatchExpiryWarnings(
    warnings: ExpiryWarningEmailData[]
  ): Promise<{ sent: number; failed: number }> {
    let sent = 0;
    let failed = 0;

    for (const warning of warnings) {
      const success = await this.sendExpiryWarning(warning);
      if (success) {
        sent++;
      } else {
        failed++;
      }

      // Rate limiting: wait 100ms between emails
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    AppLogger.info('Batch expiry warnings sent', {
      total: warnings.length,
      sent,
      failed,
    });

    return { sent, failed };
  }

  /**
   * Send batch expired notifications
   */
  async sendBatchExpiredNotifications(
    notifications: ExpiredEmailData[]
  ): Promise<{ sent: number; failed: number }> {
    let sent = 0;
    let failed = 0;

    for (const notification of notifications) {
      const success = await this.sendExpiredNotification(notification);
      if (success) {
        sent++;
      } else {
        failed++;
      }

      // Rate limiting: wait 100ms between emails
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    AppLogger.info('Batch expired notifications sent', {
      total: notifications.length,
      sent,
      failed,
    });

    return { sent, failed };
  }
}

/**
 * Singleton instance
 */
let apiKeyEmailService: APIKeyEmailService | null = null;

export async function initializeAPIKeyEmailService(
  config: EmailConfig
): Promise<APIKeyEmailService> {
  apiKeyEmailService = new APIKeyEmailService(config);
  await apiKeyEmailService.initialize();
  return apiKeyEmailService;
}

export function getAPIKeyEmailService(): APIKeyEmailService {
  if (!apiKeyEmailService) {
    throw new Error(
      'APIKeyEmailService not initialized. Call initializeAPIKeyEmailService first.'
    );
  }
  return apiKeyEmailService;
}
