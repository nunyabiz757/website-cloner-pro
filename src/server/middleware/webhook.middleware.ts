import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { SecurityLogger } from '../services/logger.service.js';

/**
 * Webhook Security Middleware
 * Implements HMAC signature verification and replay attack prevention
 */

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'your-webhook-secret';
const TIMESTAMP_TOLERANCE = 300000; // 5 minutes in milliseconds

/**
 * Verify webhook signature
 * Checks HMAC-SHA256 signature in header
 */
export const verifyWebhookSignature = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  try {
    const signature = req.headers['x-webhook-signature'] as string;
    const timestamp = req.headers['x-webhook-timestamp'] as string;

    if (!signature || !timestamp) {
      SecurityLogger.logSecurityEvent('webhook.missing_signature', 'medium', {
        path: req.path,
        ip: req.ip,
      });

      res.status(401).json({
        success: false,
        error: 'Missing webhook signature or timestamp',
        code: 'MISSING_SIGNATURE',
      });
      return;
    }

    // Check timestamp to prevent replay attacks
    const requestTime = parseInt(timestamp, 10);
    const currentTime = Date.now();

    if (isNaN(requestTime)) {
      res.status(400).json({
        success: false,
        error: 'Invalid timestamp',
        code: 'INVALID_TIMESTAMP',
      });
      return;
    }

    const timeDifference = Math.abs(currentTime - requestTime);

    if (timeDifference > TIMESTAMP_TOLERANCE) {
      SecurityLogger.logSecurityEvent('webhook.replay_attempt', 'high', {
        path: req.path,
        ip: req.ip,
        timestamp: requestTime,
        timeDifference,
      });

      res.status(401).json({
        success: false,
        error: 'Request timestamp too old',
        code: 'TIMESTAMP_EXPIRED',
      });
      return;
    }

    // Verify signature
    const payload = JSON.stringify(req.body);
    const signedPayload = `${timestamp}.${payload}`;
    const expectedSignature = crypto
      .createHmac('sha256', WEBHOOK_SECRET)
      .update(signedPayload)
      .digest('hex');

    // Use timing-safe comparison
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
      SecurityLogger.logSecurityEvent('webhook.invalid_signature', 'high', {
        path: req.path,
        ip: req.ip,
      });

      res.status(401).json({
        success: false,
        error: 'Invalid webhook signature',
        code: 'INVALID_SIGNATURE',
      });
      return;
    }

    next();
  } catch (error) {
    console.error('Webhook verification error:', error);
    res.status(500).json({
      success: false,
      error: 'Webhook verification failed',
      code: 'VERIFICATION_ERROR',
    });
  }
};

/**
 * Generate webhook signature for outgoing webhooks
 * @param payload Webhook payload
 * @param secret Webhook secret
 * @returns Signature and timestamp
 */
export const generateWebhookSignature = (
  payload: any,
  secret: string = WEBHOOK_SECRET
): { signature: string; timestamp: number } => {
  const timestamp = Date.now();
  const payloadString = JSON.stringify(payload);
  const signedPayload = `${timestamp}.${payloadString}`;

  const signature = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');

  return {
    signature,
    timestamp,
  };
};

/**
 * Verify GitHub webhook signature
 * GitHub uses X-Hub-Signature-256 header
 */
export const verifyGitHubWebhook = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  try {
    const signature = req.headers['x-hub-signature-256'] as string;

    if (!signature) {
      res.status(401).json({
        success: false,
        error: 'Missing GitHub signature',
        code: 'MISSING_SIGNATURE',
      });
      return;
    }

    const payload = JSON.stringify(req.body);
    const expectedSignature =
      'sha256=' +
      crypto.createHmac('sha256', WEBHOOK_SECRET).update(payload).digest('hex');

    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
      res.status(401).json({
        success: false,
        error: 'Invalid GitHub signature',
        code: 'INVALID_SIGNATURE',
      });
      return;
    }

    next();
  } catch (error) {
    console.error('GitHub webhook verification error:', error);
    res.status(500).json({
      success: false,
      error: 'Webhook verification failed',
      code: 'VERIFICATION_ERROR',
    });
  }
};

/**
 * Verify Stripe webhook signature
 * Stripe uses Stripe-Signature header
 */
export const verifyStripeWebhook = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  try {
    const signature = req.headers['stripe-signature'] as string;

    if (!signature) {
      res.status(401).json({
        success: false,
        error: 'Missing Stripe signature',
        code: 'MISSING_SIGNATURE',
      });
      return;
    }

    // Stripe signature format: t=timestamp,v1=signature
    const elements = signature.split(',');
    const timestamp = elements.find((e) => e.startsWith('t='))?.split('=')[1];
    const sig = elements.find((e) => e.startsWith('v1='))?.split('=')[1];

    if (!timestamp || !sig) {
      res.status(400).json({
        success: false,
        error: 'Invalid Stripe signature format',
        code: 'INVALID_FORMAT',
      });
      return;
    }

    // Check timestamp (Stripe recommends 5 minute tolerance)
    const requestTime = parseInt(timestamp, 10) * 1000; // Convert to milliseconds
    const currentTime = Date.now();
    const timeDifference = Math.abs(currentTime - requestTime);

    if (timeDifference > TIMESTAMP_TOLERANCE) {
      res.status(401).json({
        success: false,
        error: 'Request timestamp too old',
        code: 'TIMESTAMP_EXPIRED',
      });
      return;
    }

    // Verify signature
    const payload = JSON.stringify(req.body);
    const signedPayload = `${timestamp}.${payload}`;
    const expectedSignature = crypto
      .createHmac('sha256', WEBHOOK_SECRET)
      .update(signedPayload)
      .digest('hex');

    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSignature))) {
      res.status(401).json({
        success: false,
        error: 'Invalid Stripe signature',
        code: 'INVALID_SIGNATURE',
      });
      return;
    }

    next();
  } catch (error) {
    console.error('Stripe webhook verification error:', error);
    res.status(500).json({
      success: false,
      error: 'Webhook verification failed',
      code: 'VERIFICATION_ERROR',
    });
  }
};
