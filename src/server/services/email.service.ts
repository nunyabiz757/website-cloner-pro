import nodemailer, { Transporter } from 'nodemailer';
import { securityConfig } from '../config/security.config.js';

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface VerificationEmailData {
  email: string;
  token: string;
  firstName?: string;
}

export interface PasswordResetEmailData {
  email: string;
  token: string;
  firstName?: string;
}

/**
 * Email service for sending transactional emails
 */
export class EmailService {
  private transporter: Transporter;

  constructor() {
    this.transporter = nodemailer.createTransporter({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      },
    });
  }

  /**
   * Send email
   * @param options Email options
   */
  async sendEmail(options: EmailOptions): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: securityConfig.email.from,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
      });
    } catch (error) {
      console.error('Failed to send email:', error);
      throw new Error('Failed to send email');
    }
  }

  /**
   * Send email verification
   * @param data Verification email data
   */
  async sendVerificationEmail(data: VerificationEmailData): Promise<void> {
    const verificationUrl = `${process.env.APP_URL}/verify-email?token=${data.token}`;
    const firstName = data.firstName || 'User';

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Verify Your Email</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
          }
          .container {
            background: #ffffff;
            border-radius: 8px;
            padding: 40px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          }
          .logo {
            text-align: center;
            margin-bottom: 30px;
          }
          .logo h1 {
            color: #4F46E5;
            margin: 0;
            font-size: 28px;
          }
          .content {
            margin-bottom: 30px;
          }
          .button {
            display: inline-block;
            background: #4F46E5;
            color: #ffffff;
            text-decoration: none;
            padding: 14px 28px;
            border-radius: 6px;
            font-weight: 600;
            text-align: center;
          }
          .button:hover {
            background: #4338CA;
          }
          .footer {
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #e5e7eb;
            font-size: 14px;
            color: #6b7280;
            text-align: center;
          }
          .warning {
            background: #FEF3C7;
            border-left: 4px solid #F59E0B;
            padding: 12px;
            margin: 20px 0;
            border-radius: 4px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="logo">
            <h1>Website Cloner Pro</h1>
          </div>

          <div class="content">
            <h2>Welcome to Website Cloner Pro!</h2>
            <p>Hi ${firstName},</p>
            <p>Thank you for signing up! Please verify your email address to activate your account and start cloning websites.</p>
            <p style="text-align: center; margin: 30px 0;">
              <a href="${verificationUrl}" class="button">Verify Email Address</a>
            </p>
            <p>Or copy and paste this link into your browser:</p>
            <p style="word-break: break-all; color: #4F46E5;">${verificationUrl}</p>

            <div class="warning">
              <strong>⚠️ Security Notice:</strong> This link will expire in 24 hours. If you didn't create an account, please ignore this email.
            </div>
          </div>

          <div class="footer">
            <p>This is an automated email from Website Cloner Pro. Please do not reply to this email.</p>
            <p>&copy; ${new Date().getFullYear()} Website Cloner Pro. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
      Welcome to Website Cloner Pro!

      Hi ${firstName},

      Thank you for signing up! Please verify your email address by clicking the link below:

      ${verificationUrl}

      This link will expire in 24 hours.

      If you didn't create an account, please ignore this email.

      © ${new Date().getFullYear()} Website Cloner Pro. All rights reserved.
    `;

    await this.sendEmail({
      to: data.email,
      subject: 'Verify Your Email - Website Cloner Pro',
      html,
      text,
    });
  }

  /**
   * Send password reset email
   * @param data Password reset email data
   */
  async sendPasswordResetEmail(data: PasswordResetEmailData): Promise<void> {
    const resetUrl = `${process.env.APP_URL}/reset-password?token=${data.token}`;
    const firstName = data.firstName || 'User';

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Reset Your Password</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
          }
          .container {
            background: #ffffff;
            border-radius: 8px;
            padding: 40px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          }
          .logo {
            text-align: center;
            margin-bottom: 30px;
          }
          .logo h1 {
            color: #4F46E5;
            margin: 0;
            font-size: 28px;
          }
          .content {
            margin-bottom: 30px;
          }
          .button {
            display: inline-block;
            background: #4F46E5;
            color: #ffffff;
            text-decoration: none;
            padding: 14px 28px;
            border-radius: 6px;
            font-weight: 600;
            text-align: center;
          }
          .button:hover {
            background: #4338CA;
          }
          .footer {
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #e5e7eb;
            font-size: 14px;
            color: #6b7280;
            text-align: center;
          }
          .warning {
            background: #FEE2E2;
            border-left: 4px solid #DC2626;
            padding: 12px;
            margin: 20px 0;
            border-radius: 4px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="logo">
            <h1>Website Cloner Pro</h1>
          </div>

          <div class="content">
            <h2>Password Reset Request</h2>
            <p>Hi ${firstName},</p>
            <p>We received a request to reset your password. Click the button below to create a new password:</p>
            <p style="text-align: center; margin: 30px 0;">
              <a href="${resetUrl}" class="button">Reset Password</a>
            </p>
            <p>Or copy and paste this link into your browser:</p>
            <p style="word-break: break-all; color: #4F46E5;">${resetUrl}</p>

            <div class="warning">
              <strong>⚠️ Security Notice:</strong> This link will expire in 1 hour. If you didn't request a password reset, please ignore this email and your password will remain unchanged.
            </div>
          </div>

          <div class="footer">
            <p>This is an automated email from Website Cloner Pro. Please do not reply to this email.</p>
            <p>&copy; ${new Date().getFullYear()} Website Cloner Pro. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
      Password Reset Request

      Hi ${firstName},

      We received a request to reset your password. Click the link below to create a new password:

      ${resetUrl}

      This link will expire in 1 hour.

      If you didn't request a password reset, please ignore this email.

      © ${new Date().getFullYear()} Website Cloner Pro. All rights reserved.
    `;

    await this.sendEmail({
      to: data.email,
      subject: 'Reset Your Password - Website Cloner Pro',
      html,
      text,
    });
  }

  /**
   * Send password changed notification
   * @param email User email
   * @param firstName User first name
   */
  async sendPasswordChangedEmail(email: string, firstName?: string): Promise<void> {
    const name = firstName || 'User';

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Password Changed</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
          }
          .container {
            background: #ffffff;
            border-radius: 8px;
            padding: 40px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          }
          .logo {
            text-align: center;
            margin-bottom: 30px;
          }
          .logo h1 {
            color: #4F46E5;
            margin: 0;
            font-size: 28px;
          }
          .content {
            margin-bottom: 30px;
          }
          .footer {
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #e5e7eb;
            font-size: 14px;
            color: #6b7280;
            text-align: center;
          }
          .success {
            background: #D1FAE5;
            border-left: 4px solid #10B981;
            padding: 12px;
            margin: 20px 0;
            border-radius: 4px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="logo">
            <h1>Website Cloner Pro</h1>
          </div>

          <div class="content">
            <h2>Password Successfully Changed</h2>
            <p>Hi ${name},</p>
            <p>This is a confirmation that your password has been successfully changed.</p>

            <div class="success">
              <strong>✓ Your password has been updated</strong><br>
              Time: ${new Date().toLocaleString()}
            </div>

            <p>If you did not make this change, please contact our support team immediately at support@websitecloner.pro</p>
          </div>

          <div class="footer">
            <p>This is an automated email from Website Cloner Pro. Please do not reply to this email.</p>
            <p>&copy; ${new Date().getFullYear()} Website Cloner Pro. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
      Password Successfully Changed

      Hi ${name},

      This is a confirmation that your password has been successfully changed.

      Time: ${new Date().toLocaleString()}

      If you did not make this change, please contact our support team immediately at support@websitecloner.pro

      © ${new Date().getFullYear()} Website Cloner Pro. All rights reserved.
    `;

    await this.sendEmail({
      to: email,
      subject: 'Password Changed - Website Cloner Pro',
      html,
      text,
    });
  }
}

export default new EmailService();
