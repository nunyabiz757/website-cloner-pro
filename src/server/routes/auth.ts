import express from 'express';
import authService from '../services/AuthService.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

/**
 * POST /api/auth/register
 * Register a new user
 */
router.post('/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        error: 'Email and password are required',
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        error: 'Invalid email format',
      });
    }

    // Validate password length
    if (password.length < 6) {
      return res.status(400).json({
        error: 'Password must be at least 6 characters long',
      });
    }

    const result = await authService.register({ email, password, name });

    res.status(201).json(result);
  } catch (error) {
    console.error('Registration error:', error);
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Registration failed',
    });
  }
});

/**
 * POST /api/auth/login
 * Login user
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        error: 'Email and password are required',
      });
    }

    const result = await authService.login({ email, password });

    res.json(result);
  } catch (error) {
    console.error('Login error:', error);
    res.status(401).json({
      error: error instanceof Error ? error.message : 'Login failed',
    });
  }
});

/**
 * GET /api/auth/profile
 * Get current user profile (requires authentication)
 */
router.get('/profile', authenticate, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const user = await authService.getUserById(req.user.userId);

    res.json(user);
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Failed to get profile',
    });
  }
});

/**
 * PUT /api/auth/profile
 * Update user profile (requires authentication)
 */
router.put('/profile', authenticate, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { name, email } = req.body;

    const user = await authService.updateUser(req.user.userId, { name, email });

    res.json(user);
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Failed to update profile',
    });
  }
});

/**
 * POST /api/auth/change-password
 * Change user password (requires authentication)
 */
router.post('/change-password', authenticate, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { oldPassword, newPassword } = req.body;

    // Validate input
    if (!oldPassword || !newPassword) {
      return res.status(400).json({
        error: 'Old password and new password are required',
      });
    }

    // Validate new password length
    if (newPassword.length < 6) {
      return res.status(400).json({
        error: 'New password must be at least 6 characters long',
      });
    }

    const result = await authService.changePassword(
      req.user.userId,
      oldPassword,
      newPassword
    );

    res.json(result);
  } catch (error) {
    console.error('Change password error:', error);
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Failed to change password',
    });
  }
});

/**
 * DELETE /api/auth/account
 * Delete user account (requires authentication)
 */
router.delete('/account', authenticate, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const result = await authService.deleteUser(req.user.userId);

    res.json(result);
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Failed to delete account',
    });
  }
});

/**
 * GET /api/auth/verify
 * Verify token validity (requires authentication)
 */
router.get('/verify', authenticate, async (req, res) => {
  try {
    // If authenticate middleware passes, token is valid
    res.json({
      valid: true,
      user: req.user,
    });
  } catch (error) {
    res.status(401).json({
      valid: false,
      error: 'Invalid token',
    });
  }
});

export default router;
