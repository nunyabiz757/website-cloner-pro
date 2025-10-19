import express, { Request, Response } from 'express';
import { authenticateJWT } from '../middleware/auth.middleware.js';
import {
  getUserActiveSessions,
  getSessionStatistics,
  destroyAllSessions,
  sessionService,
} from '../middleware/session.middleware.js';
import { AppLogger } from '../services/logger.service.js';
import { validateRequest } from '../middleware/validation.middleware.js';
import { z } from 'zod';

const router = express.Router();

/**
 * Session Routes
 * Endpoints for managing user sessions
 */

/**
 * @route GET /api/sessions
 * @desc Get all active sessions for the authenticated user
 * @access Private
 */
router.get('/', authenticateJWT, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user || !('userId' in req.user)) {
      res.status(401).json({
        success: false,
        error: 'User not authenticated',
        code: 'UNAUTHORIZED',
      });
      return;
    }

    const userId = req.user.userId;
    const sessions = await getUserActiveSessions(userId);

    // Add current session indicator
    const currentSessionId = req.session?.id;
    const sessionsWithCurrent = sessions.map((session) => ({
      ...session,
      isCurrent: session.session_id === currentSessionId,
      device_info: typeof session.device_info === 'string'
        ? JSON.parse(session.device_info)
        : session.device_info,
    }));

    res.json({
      success: true,
      data: {
        sessions: sessionsWithCurrent,
        total: sessionsWithCurrent.length,
        currentSessionId,
      },
    });

    AppLogger.info('User retrieved active sessions', {
      userId,
      sessionCount: sessions.length,
    });
  } catch (error) {
    AppLogger.error('Failed to retrieve user sessions', error as Error, {
      userId: req.user?.userId,
    });

    res.status(500).json({
      success: false,
      error: 'Failed to retrieve sessions',
      code: 'SESSION_RETRIEVAL_ERROR',
    });
  }
});

/**
 * @route GET /api/sessions/statistics
 * @desc Get session statistics for the authenticated user
 * @access Private
 */
router.get('/statistics', authenticateJWT, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user || !('userId' in req.user)) {
      res.status(401).json({
        success: false,
        error: 'User not authenticated',
        code: 'UNAUTHORIZED',
      });
      return;
    }

    const userId = req.user.userId;
    const statistics = await getSessionStatistics(userId);

    res.json({
      success: true,
      data: statistics,
    });

    AppLogger.info('User retrieved session statistics', {
      userId,
      activeSessions: statistics.active,
    });
  } catch (error) {
    AppLogger.error('Failed to retrieve session statistics', error as Error, {
      userId: req.user?.userId,
    });

    res.status(500).json({
      success: false,
      error: 'Failed to retrieve session statistics',
      code: 'SESSION_STATS_ERROR',
    });
  }
});

/**
 * @route GET /api/sessions/devices
 * @desc Get all devices/sessions with detailed device information
 * @access Private
 */
router.get('/devices', authenticateJWT, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user || !('userId' in req.user)) {
      res.status(401).json({
        success: false,
        error: 'User not authenticated',
        code: 'UNAUTHORIZED',
      });
      return;
    }

    const userId = req.user.userId;
    const sessions = await getUserActiveSessions(userId);
    const currentSessionId = req.session?.id;

    // Format device information
    const devices = sessions.map((session) => {
      const deviceInfo = typeof session.device_info === 'string'
        ? JSON.parse(session.device_info)
        : session.device_info;

      return {
        sessionId: session.session_id,
        isCurrent: session.session_id === currentSessionId,
        device: {
          browser: deviceInfo.browser,
          browserVersion: deviceInfo.browserVersion,
          os: deviceInfo.os,
          osVersion: deviceInfo.osVersion,
          device: deviceInfo.device,
          deviceType: deviceInfo.deviceType,
        },
        location: {
          ip: session.ip_address,
        },
        activity: {
          lastActivity: session.last_activity,
          createdAt: session.created_at,
          expiresAt: session.expires_at,
        },
      };
    });

    res.json({
      success: true,
      data: {
        devices,
        total: devices.length,
      },
    });
  } catch (error) {
    AppLogger.error('Failed to retrieve user devices', error as Error, {
      userId: req.user?.userId,
    });

    res.status(500).json({
      success: false,
      error: 'Failed to retrieve devices',
      code: 'DEVICE_RETRIEVAL_ERROR',
    });
  }
});

/**
 * @route DELETE /api/sessions/:sessionId
 * @desc Destroy a specific session
 * @access Private
 */
const sessionIdSchema = z.object({
  sessionId: z.string().min(1, 'Session ID is required'),
});

router.delete(
  '/:sessionId',
  authenticateJWT,
  validateRequest({ params: sessionIdSchema }),
  async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.user || !('userId' in req.user)) {
        res.status(401).json({
          success: false,
          error: 'User not authenticated',
          code: 'UNAUTHORIZED',
        });
        return;
      }

      const userId = req.user.userId;
      const { sessionId } = req.params;

      // Verify session belongs to user
      const session = await sessionService.getSession(sessionId);

      if (!session) {
        res.status(404).json({
          success: false,
          error: 'Session not found',
          code: 'SESSION_NOT_FOUND',
        });
        return;
      }

      if (session.user_id !== userId) {
        AppLogger.logSecurityEvent('session.unauthorized_deletion_attempt', 'high', {
          userId,
          targetSessionId: sessionId,
          sessionOwnerId: session.user_id,
        });

        res.status(403).json({
          success: false,
          error: 'You can only delete your own sessions',
          code: 'SESSION_ACCESS_DENIED',
        });
        return;
      }

      // Prevent deleting current session (use logout endpoint instead)
      if (sessionId === req.session?.id) {
        res.status(400).json({
          success: false,
          error: 'Cannot delete current session. Use logout endpoint instead.',
          code: 'CANNOT_DELETE_CURRENT_SESSION',
        });
        return;
      }

      // Destroy the session
      await sessionService.destroySession(sessionId);

      res.json({
        success: true,
        message: 'Session destroyed successfully',
        data: {
          sessionId,
        },
      });

      AppLogger.info('User destroyed session', {
        userId,
        sessionId,
      });
    } catch (error) {
      AppLogger.error('Failed to destroy session', error as Error, {
        userId: req.user?.userId,
        sessionId: req.params.sessionId,
      });

      res.status(500).json({
        success: false,
        error: 'Failed to destroy session',
        code: 'SESSION_DESTROY_ERROR',
      });
    }
  }
);

/**
 * @route POST /api/sessions/logout-all
 * @desc Logout from all devices (destroy all sessions)
 * @access Private
 */
const logoutAllSchema = z.object({
  keepCurrentSession: z.boolean().optional().default(false),
});

router.post(
  '/logout-all',
  authenticateJWT,
  validateRequest({ body: logoutAllSchema }),
  async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.user || !('userId' in req.user)) {
        res.status(401).json({
          success: false,
          error: 'User not authenticated',
          code: 'UNAUTHORIZED',
        });
        return;
      }

      const userId = req.user.userId;
      const { keepCurrentSession } = req.body;

      // Destroy all sessions
      const destroyedCount = await destroyAllSessions(req, res, userId, keepCurrentSession);

      res.json({
        success: true,
        message: `Successfully logged out from ${destroyedCount} ${
          destroyedCount === 1 ? 'device' : 'devices'
        }`,
        data: {
          destroyedSessions: destroyedCount,
          currentSessionActive: keepCurrentSession,
        },
      });

      AppLogger.info('User logged out from all devices', {
        userId,
        destroyedCount,
        keepCurrentSession,
      });
    } catch (error) {
      AppLogger.error('Failed to logout from all devices', error as Error, {
        userId: req.user?.userId,
      });

      res.status(500).json({
        success: false,
        error: 'Failed to logout from all devices',
        code: 'LOGOUT_ALL_ERROR',
      });
    }
  }
);

/**
 * @route POST /api/sessions/terminate-inactive
 * @desc Terminate all inactive sessions (admin utility)
 * @access Private
 */
router.post(
  '/terminate-inactive',
  authenticateJWT,
  async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.user || !('userId' in req.user)) {
        res.status(401).json({
          success: false,
          error: 'User not authenticated',
          code: 'UNAUTHORIZED',
        });
        return;
      }

      const userId = req.user.userId;

      // Get all sessions and terminate inactive ones
      const sessions = await getUserActiveSessions(userId);
      const sessionTimeout = parseInt(process.env.SESSION_MAX_AGE || '1800000');
      const now = Date.now();

      let terminatedCount = 0;

      for (const session of sessions) {
        const inactiveTime = now - new Date(session.last_activity).getTime();

        if (inactiveTime > sessionTimeout && session.session_id !== req.session?.id) {
          await sessionService.destroySession(session.session_id);
          terminatedCount++;
        }
      }

      res.json({
        success: true,
        message: `Terminated ${terminatedCount} inactive ${
          terminatedCount === 1 ? 'session' : 'sessions'
        }`,
        data: {
          terminatedCount,
        },
      });

      AppLogger.info('User terminated inactive sessions', {
        userId,
        terminatedCount,
      });
    } catch (error) {
      AppLogger.error('Failed to terminate inactive sessions', error as Error, {
        userId: req.user?.userId,
      });

      res.status(500).json({
        success: false,
        error: 'Failed to terminate inactive sessions',
        code: 'TERMINATE_INACTIVE_ERROR',
      });
    }
  }
);

/**
 * @route GET /api/sessions/current
 * @desc Get current session details
 * @access Private
 */
router.get('/current', authenticateJWT, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user || !('userId' in req.user) || !req.session?.id) {
      res.status(401).json({
        success: false,
        error: 'User not authenticated',
        code: 'UNAUTHORIZED',
      });
      return;
    }

    const sessionId = req.session.id;
    const session = await sessionService.getSession(sessionId);

    if (!session) {
      res.status(404).json({
        success: false,
        error: 'Current session not found',
        code: 'SESSION_NOT_FOUND',
      });
      return;
    }

    const deviceInfo = typeof session.device_info === 'string'
      ? JSON.parse(session.device_info)
      : session.device_info;

    res.json({
      success: true,
      data: {
        sessionId: session.session_id,
        device: deviceInfo,
        location: {
          ip: session.ip_address,
        },
        activity: {
          lastActivity: session.last_activity,
          createdAt: session.created_at,
          expiresAt: session.expires_at,
        },
        fingerprint: session.fingerprint,
        isActive: session.is_active,
      },
    });
  } catch (error) {
    AppLogger.error('Failed to retrieve current session', error as Error, {
      userId: req.user?.userId,
    });

    res.status(500).json({
      success: false,
      error: 'Failed to retrieve current session',
      code: 'CURRENT_SESSION_ERROR',
    });
  }
});

export default router;
