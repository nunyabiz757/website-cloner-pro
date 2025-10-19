import express, { Request, Response } from 'express';
import { Pool } from 'pg';
import { MFAService } from '../services/mfa.service.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = express.Router();

// Initialize database pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const mfaService = new MFAService(pool);

/**
 * Setup MFA (generate secret and QR code)
 * POST /api/mfa/setup
 */
router.post('/setup', authenticate, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'AUTH_REQUIRED',
      });
    }

    const setupData = await mfaService.setupMFA(req.user.userId, req.user.email);

    res.json({
      success: true,
      message: 'MFA setup initiated. Scan QR code with your authenticator app.',
      data: setupData,
    });
  } catch (error) {
    console.error('MFA setup error:', error);
    const errorMessage = error instanceof Error ? error.message : 'MFA setup failed';

    if (errorMessage.includes('already enabled')) {
      return res.status(400).json({
        success: false,
        error: errorMessage,
        code: 'MFA_ALREADY_ENABLED',
      });
    }

    res.status(500).json({
      success: false,
      error: 'MFA setup failed',
      code: 'MFA_SETUP_ERROR',
    });
  }
});

/**
 * Enable MFA (verify TOTP code)
 * POST /api/mfa/enable
 */
router.post('/enable', authenticate, async (req: Request, res: Response) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        error: 'Verification code is required',
        code: 'VALIDATION_ERROR',
      });
    }

    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'AUTH_REQUIRED',
      });
    }

    await mfaService.enableMFA(req.user.userId, token);

    res.json({
      success: true,
      message: 'Two-factor authentication enabled successfully',
    });
  } catch (error) {
    console.error('MFA enable error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to enable MFA';

    if (errorMessage.includes('Invalid verification code')) {
      return res.status(400).json({
        success: false,
        error: errorMessage,
        code: 'INVALID_TOKEN',
      });
    }

    if (errorMessage.includes('already enabled')) {
      return res.status(400).json({
        success: false,
        error: errorMessage,
        code: 'MFA_ALREADY_ENABLED',
      });
    }

    if (errorMessage.includes('not initiated')) {
      return res.status(400).json({
        success: false,
        error: errorMessage,
        code: 'MFA_NOT_SETUP',
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to enable MFA',
      code: 'MFA_ENABLE_ERROR',
    });
  }
});

/**
 * Disable MFA
 * POST /api/mfa/disable
 */
router.post('/disable', authenticate, async (req: Request, res: Response) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        error: 'Verification code is required',
        code: 'VALIDATION_ERROR',
      });
    }

    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'AUTH_REQUIRED',
      });
    }

    await mfaService.disableMFA(req.user.userId, token);

    res.json({
      success: true,
      message: 'Two-factor authentication disabled successfully',
    });
  } catch (error) {
    console.error('MFA disable error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to disable MFA';

    if (errorMessage.includes('Invalid verification code')) {
      return res.status(400).json({
        success: false,
        error: errorMessage,
        code: 'INVALID_TOKEN',
      });
    }

    if (errorMessage.includes('not enabled')) {
      return res.status(400).json({
        success: false,
        error: errorMessage,
        code: 'MFA_NOT_ENABLED',
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to disable MFA',
      code: 'MFA_DISABLE_ERROR',
    });
  }
});

/**
 * Verify MFA code
 * POST /api/mfa/verify
 */
router.post('/verify', authenticate, async (req: Request, res: Response) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        error: 'Verification code is required',
        code: 'VALIDATION_ERROR',
      });
    }

    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'AUTH_REQUIRED',
      });
    }

    const verified = await mfaService.verifyMFAToken(req.user.userId, token);

    if (!verified) {
      return res.status(400).json({
        success: false,
        error: 'Invalid verification code',
        code: 'INVALID_TOKEN',
      });
    }

    res.json({
      success: true,
      message: 'Code verified successfully',
    });
  } catch (error) {
    console.error('MFA verify error:', error);
    res.status(500).json({
      success: false,
      error: 'Verification failed',
      code: 'MFA_VERIFY_ERROR',
    });
  }
});

/**
 * Get MFA status
 * GET /api/mfa/status
 */
router.get('/status', authenticate, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'AUTH_REQUIRED',
      });
    }

    const enabled = await mfaService.isMFAEnabled(req.user.userId);
    const backupCodesCount = enabled
      ? await mfaService.getBackupCodesCount(req.user.userId)
      : null;

    res.json({
      success: true,
      data: {
        enabled,
        backupCodes: backupCodesCount,
      },
    });
  } catch (error) {
    console.error('MFA status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get MFA status',
      code: 'MFA_STATUS_ERROR',
    });
  }
});

/**
 * Regenerate backup codes
 * POST /api/mfa/backup-codes/regenerate
 */
router.post('/backup-codes/regenerate', authenticate, async (req: Request, res: Response) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        error: 'Verification code is required',
        code: 'VALIDATION_ERROR',
      });
    }

    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'AUTH_REQUIRED',
      });
    }

    const backupCodes = await mfaService.regenerateBackupCodes(req.user.userId, token);

    res.json({
      success: true,
      message: 'Backup codes regenerated successfully',
      data: {
        backupCodes,
      },
    });
  } catch (error) {
    console.error('Backup codes regeneration error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to regenerate backup codes';

    if (errorMessage.includes('Invalid verification code')) {
      return res.status(400).json({
        success: false,
        error: errorMessage,
        code: 'INVALID_TOKEN',
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to regenerate backup codes',
      code: 'BACKUP_CODES_ERROR',
    });
  }
});

/**
 * Get backup codes count
 * GET /api/mfa/backup-codes/count
 */
router.get('/backup-codes/count', authenticate, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'AUTH_REQUIRED',
      });
    }

    const count = await mfaService.getBackupCodesCount(req.user.userId);

    res.json({
      success: true,
      data: count,
    });
  } catch (error) {
    console.error('Backup codes count error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get backup codes count',
      code: 'BACKUP_CODES_COUNT_ERROR',
    });
  }
});

export default router;
