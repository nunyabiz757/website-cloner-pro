import express from 'express';
import { DeploymentService } from '../services/DeploymentService.js';
import type { ApiResponse, Deployment, ClonedWebsite } from '../../shared/types/index.js';

const router = express.Router();
const deploymentService = new DeploymentService();

// In-memory storage for websites (should be replaced with database)
const websites = new Map<string, ClonedWebsite>();

/**
 * POST /api/deployment/deploy
 * Deploy website to Vercel/Netlify
 */
router.post('/deploy', async (req, res) => {
  try {
    const { websiteId, platform, projectName } = req.body as {
      websiteId: string;
      platform: 'vercel' | 'netlify';
      projectName: string;
    };

    // Get website from storage (in production, fetch from database)
    const website = websites.get(websiteId);
    if (!website) {
      return res.status(404).json({
        success: false,
        error: 'Website not found',
      } as ApiResponse<never>);
    }

    // Deploy the website
    const deployment = await deploymentService.deploy(website, {
      platform,
      projectName,
      websiteId,
    });

    res.json({
      success: true,
      data: deployment,
      message: `Successfully deployed to ${platform}`,
    } as ApiResponse<Deployment>);
  } catch (error) {
    console.error('Deployment error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Deployment failed',
    } as ApiResponse<never>);
  }
});

/**
 * GET /api/deployment/:deploymentId
 * Get deployment status
 */
router.get('/:deploymentId', async (req, res) => {
  try {
    const { deploymentId } = req.params;

    const deployment = await deploymentService.checkDeploymentStatus(deploymentId);

    res.json({
      success: true,
      data: deployment,
    } as ApiResponse<Deployment>);
  } catch (error) {
    res.status(404).json({
      success: false,
      error: error instanceof Error ? error.message : 'Deployment not found',
    } as ApiResponse<never>);
  }
});

/**
 * GET /api/deployment/website/:websiteId
 * Get all deployments for a website
 */
router.get('/website/:websiteId', async (req, res) => {
  try {
    const { websiteId } = req.params;

    const deployments = deploymentService.getDeploymentsByWebsiteId(websiteId);

    res.json({
      success: true,
      data: deployments,
    } as ApiResponse<Deployment[]>);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get deployments',
    } as ApiResponse<never>);
  }
});

/**
 * DELETE /api/deployment/:deploymentId
 * Delete a deployment
 */
router.delete('/:deploymentId', async (req, res) => {
  try {
    const { deploymentId } = req.params;
    const userId = (req as any).user?.id; // Get user ID from auth middleware if available

    await deploymentService.deleteDeployment(deploymentId, userId);

    res.json({
      success: true,
      message: 'Deployment deleted successfully',
    } as ApiResponse<null>);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete deployment',
    } as ApiResponse<never>);
  }
});

/**
 * POST /api/deployment/deploy-both
 * Deploy both original and optimized versions for comparison
 */
router.post('/deploy-both', async (req, res) => {
  try {
    const { websiteId, platform, projectName } = req.body as {
      websiteId: string;
      platform: 'vercel' | 'netlify';
      projectName: string;
    };

    // Get original website from storage
    const originalWebsite = websites.get(websiteId);
    if (!originalWebsite) {
      return res.status(404).json({
        success: false,
        error: 'Website not found',
      } as ApiResponse<never>);
    }

    // Create a copy for optimized version (in production, get from optimization results)
    const optimizedWebsite: ClonedWebsite = {
      ...originalWebsite,
      id: `${originalWebsite.id}-optimized`,
      name: `${originalWebsite.name} (Optimized)`,
    };

    // Deploy both versions
    const deployments = await deploymentService.deployBothVersions(
      originalWebsite,
      optimizedWebsite,
      {
        platform,
        projectName,
        websiteId,
      }
    );

    res.json({
      success: true,
      data: deployments,
      message: `Successfully deployed both versions to ${platform}`,
    } as ApiResponse<{original: Deployment; optimized: Deployment}>);
  } catch (error) {
    console.error('Deployment error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Deployment failed',
    } as ApiResponse<never>);
  }
});

/**
 * POST /api/deployment/:deploymentId/share
 * Generate shareable link for a deployment
 */
router.post('/:deploymentId/share', async (req, res) => {
  try {
    const { deploymentId } = req.params;
    const { password, expiresInDays } = req.body;

    const shareLink = deploymentService.generateShareableLink(deploymentId, {
      password,
      expiresInDays,
    });

    res.json({
      success: true,
      data: shareLink,
      message: 'Share link generated successfully',
    } as ApiResponse<{shareUrl: string; shareId: string}>);
  } catch (error) {
    res.status(404).json({
      success: false,
      error: error instanceof Error ? error.message : 'Deployment not found',
    } as ApiResponse<never>);
  }
});

/**
 * POST /api/deployment/cleanup
 * Clean up expired deployments
 */
router.post('/cleanup', async (req, res) => {
  try {
    const result = await deploymentService.cleanupExpiredDeployments();

    res.json({
      success: true,
      data: result,
      message: `Cleaned up ${result.deleted} expired deployments`,
    } as ApiResponse<{deleted: number; errors: string[]}>);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to cleanup deployments',
    } as ApiResponse<never>);
  }
});

export default router;
