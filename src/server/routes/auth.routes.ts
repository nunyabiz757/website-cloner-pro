import express, { Request, Response } from 'express';
import { Pool } from 'pg';
import { UserService } from '../services/user.service.js';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  setRememberMe,
  clearRememberMe,
  trackSessionCreation,
} from '../middleware/session.middleware.js';

const router = express.Router();

// Initialize database pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const userService = new UserService(pool);

/**
 * Register new user
 * POST /api/auth/register
 */
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, password, firstName, lastName } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required',
        code: 'VALIDATION_ERROR',
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email format',
        code: 'INVALID_EMAIL',
      });
    }

    const user = await userService.register({
      email,
      password,
      firstName,
      lastName,
    });

    res.status(201).json({
      success: true,
      message: 'Registration successful. Please check your email to verify your account.',
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        emailVerified: user.email_verified,
      },
    });
  } catch (error) {
    console.error('Registration error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Registration failed';

    if (errorMessage.includes('already exists')) {
      return res.status(409).json({
        success: false,
        error: errorMessage,
        code: 'USER_EXISTS',
      });
    }

    if (errorMessage.includes('Password validation')) {
      return res.status(400).json({
        success: false,
        error: errorMessage,
        code: 'WEAK_PASSWORD',
      });
    }

    res.status(500).json({
      success: false,
      error: 'Registration failed',
      code: 'REGISTRATION_ERROR',
    });
  }
});

/**
 * Login user
 * POST /api/auth/login
 */
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password, rememberMe } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required',
        code: 'VALIDATION_ERROR',
      });
    }

    const result = await userService.login({
      email,
      password,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    // Track session creation
    await trackSessionCreation(req, result.user.id);

    // Set remember me cookie if requested
    if (rememberMe === true) {
      await setRememberMe(req, res, result.user.id);
    }

    res.json({
      success: true,
      message: 'Login successful',
      tokens: result.tokens,
      rememberMe: rememberMe === true,
      user: {
        id: result.user.id,
        email: result.user.email,
        firstName: result.user.first_name,
        lastName: result.user.last_name,
        emailVerified: result.user.email_verified,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Login failed';

    if (errorMessage.includes('Invalid email or password')) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password',
        code: 'INVALID_CREDENTIALS',
      });
    }

    if (errorMessage.includes('Account is locked')) {
      return res.status(423).json({
        success: false,
        error: errorMessage,
        code: 'ACCOUNT_LOCKED',
      });
    }

    if (errorMessage.includes('verify your email')) {
      return res.status(403).json({
        success: false,
        error: errorMessage,
        code: 'EMAIL_NOT_VERIFIED',
      });
    }

    res.status(500).json({
      success: false,
      error: 'Login failed',
      code: 'LOGIN_ERROR',
    });
  }
});

/**
 * Verify email
 * POST /api/auth/verify-email
 */
router.post('/verify-email', async (req: Request, res: Response) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        error: 'Verification token is required',
        code: 'VALIDATION_ERROR',
      });
    }

    await userService.verifyEmail(token);

    res.json({
      success: true,
      message: 'Email verified successfully. You can now log in.',
    });
  } catch (error) {
    console.error('Email verification error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Verification failed';

    if (errorMessage.includes('Invalid or expired')) {
      return res.status(400).json({
        success: false,
        error: errorMessage,
        code: 'INVALID_TOKEN',
      });
    }

    res.status(500).json({
      success: false,
      error: 'Email verification failed',
      code: 'VERIFICATION_ERROR',
    });
  }
});

/**
 * Request password reset
 * POST /api/auth/forgot-password
 */
router.post('/forgot-password', async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required',
        code: 'VALIDATION_ERROR',
      });
    }

    await userService.requestPasswordReset(email);

    // Always return success to prevent email enumeration
    res.json({
      success: true,
      message: 'If an account exists with that email, a password reset link has been sent.',
    });
  } catch (error) {
    console.error('Password reset request error:', error);

    // Always return success to prevent email enumeration
    res.json({
      success: true,
      message: 'If an account exists with that email, a password reset link has been sent.',
    });
  }
});

/**
 * Reset password
 * POST /api/auth/reset-password
 */
router.post('/reset-password', async (req: Request, res: Response) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({
        success: false,
        error: 'Token and new password are required',
        code: 'VALIDATION_ERROR',
      });
    }

    await userService.resetPassword(token, password);

    res.json({
      success: true,
      message: 'Password reset successfully. You can now log in with your new password.',
    });
  } catch (error) {
    console.error('Password reset error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Password reset failed';

    if (errorMessage.includes('Invalid or expired')) {
      return res.status(400).json({
        success: false,
        error: errorMessage,
        code: 'INVALID_TOKEN',
      });
    }

    if (errorMessage.includes('Password validation')) {
      return res.status(400).json({
        success: false,
        error: errorMessage,
        code: 'WEAK_PASSWORD',
      });
    }

    res.status(500).json({
      success: false,
      error: 'Password reset failed',
      code: 'RESET_ERROR',
    });
  }
});

/**
 * Change password (authenticated)
 * POST /api/auth/change-password
 */
router.post('/change-password', authenticate, async (req: Request, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        error: 'Current password and new password are required',
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

    await userService.changePassword(req.user.userId, currentPassword, newPassword);

    res.json({
      success: true,
      message: 'Password changed successfully.',
    });
  } catch (error) {
    console.error('Password change error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Password change failed';

    if (errorMessage.includes('Current password is incorrect')) {
      return res.status(400).json({
        success: false,
        error: errorMessage,
        code: 'INCORRECT_PASSWORD',
      });
    }

    if (errorMessage.includes('Password validation')) {
      return res.status(400).json({
        success: false,
        error: errorMessage,
        code: 'WEAK_PASSWORD',
      });
    }

    res.status(500).json({
      success: false,
      error: 'Password change failed',
      code: 'CHANGE_ERROR',
    });
  }
});

/**
 * Refresh access token
 * POST /api/auth/refresh
 */
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        error: 'Refresh token is required',
        code: 'VALIDATION_ERROR',
      });
    }

    const tokens = await userService.refreshAccessToken(refreshToken);

    res.json({
      success: true,
      message: 'Token refreshed successfully',
      tokens,
    });
  } catch (error) {
    console.error('Token refresh error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Token refresh failed';

    if (errorMessage.includes('Invalid') || errorMessage.includes('expired')) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired refresh token',
        code: 'INVALID_TOKEN',
      });
    }

    res.status(500).json({
      success: false,
      error: 'Token refresh failed',
      code: 'REFRESH_ERROR',
    });
  }
});

/**
 * Logout user
 * POST /api/auth/logout
 */
router.post('/logout', authenticate, async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;

    if (refreshToken) {
      await userService.logout(refreshToken);
    }

    // Clear remember me cookies
    if (req.user && 'userId' in req.user) {
      await clearRememberMe(req, res, req.user.userId);
    }

    res.json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      error: 'Logout failed',
      code: 'LOGOUT_ERROR',
    });
  }
});

/**
 * Get current user profile
 * GET /api/auth/me
 */
router.get('/me', authenticate, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'AUTH_REQUIRED',
      });
    }

    const user = await userService.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
        code: 'USER_NOT_FOUND',
      });
    }

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        emailVerified: user.email_verified,
        createdAt: user.created_at,
        lastLogin: user.last_login,
      },
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get user profile',
      code: 'PROFILE_ERROR',
    });
  }
});

/**
 * Enable remember me for current session
 * POST /api/auth/remember-me/enable
 */
router.post('/remember-me/enable', authenticate, async (req: Request, res: Response) => {
  try {
    if (!req.user || !('userId' in req.user)) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'AUTH_REQUIRED',
      });
    }

    const userId = req.user.userId;
    await setRememberMe(req, res, userId);

    res.json({
      success: true,
      message: 'Remember me enabled successfully',
    });
  } catch (error) {
    console.error('Enable remember me error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to enable remember me',
      code: 'REMEMBER_ME_ERROR',
    });
  }
});

/**
 * Disable remember me for current user
 * POST /api/auth/remember-me/disable
 */
router.post('/remember-me/disable', authenticate, async (req: Request, res: Response) => {
  try {
    if (!req.user || !('userId' in req.user)) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'AUTH_REQUIRED',
      });
    }

    const userId = req.user.userId;
    await clearRememberMe(req, res, userId);

    res.json({
      success: true,
      message: 'Remember me disabled successfully',
    });
  } catch (error) {
    console.error('Disable remember me error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to disable remember me',
      code: 'REMEMBER_ME_ERROR',
    });
  }
});

export default router;
