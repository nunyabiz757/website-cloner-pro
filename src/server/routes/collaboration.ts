import express from 'express';
import { VersionControlService } from '../services/VersionControlService.js';
import { VersionComparisonService } from '../services/VersionComparisonService.js';
import { TeamCollaborationService } from '../services/TeamCollaborationService.js';
import { AnnotationService } from '../services/AnnotationService.js';
import type { ApiResponse } from '../../shared/types/index.js';

const router = express.Router();

// Initialize services
const versionControlService = new VersionControlService();
const versionComparisonService = new VersionComparisonService();
const teamCollaborationService = new TeamCollaborationService();
const annotationService = new AnnotationService();

// Initialize services on startup
Promise.all([
  versionControlService.initialize(),
  teamCollaborationService.initialize(),
  annotationService.initialize(),
]).catch(console.error);

// ==================== VERSION CONTROL ROUTES ====================

/**
 * POST /api/collaboration/versions/create
 * Create a new version snapshot
 */
router.post('/versions/create', async (req, res) => {
  try {
    const { projectId, name, description, createdBy, snapshot, tags } = req.body;

    if (!projectId || !name || !createdBy || !snapshot) {
      return res.status(400).json({
        success: false,
        error: 'Project ID, name, creator, and snapshot are required',
      } as ApiResponse<never>);
    }

    const version = await versionControlService.createVersion({
      projectId,
      name,
      description,
      createdBy,
      snapshot,
      tags,
    });

    res.json({
      success: true,
      data: version,
      message: `Version ${version.versionNumber} created successfully`,
    } as ApiResponse<any>);
  } catch (error) {
    console.error('Version creation error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Version creation failed',
    } as ApiResponse<never>);
  }
});

/**
 * GET /api/collaboration/versions/history/:projectId
 * Get version history for a project
 */
router.get('/versions/history/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;

    const history = await versionControlService.getVersionHistory(projectId);

    res.json({
      success: true,
      data: history,
      message: `Found ${history.totalVersions} versions`,
    } as ApiResponse<any>);
  } catch (error) {
    console.error('Get version history error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get version history',
    } as ApiResponse<never>);
  }
});

/**
 * GET /api/collaboration/versions/:projectId/:versionId
 * Get a specific version
 */
router.get('/versions/:projectId/:versionId', async (req, res) => {
  try {
    const { projectId, versionId } = req.params;

    const version = await versionControlService.getVersion(versionId, projectId);

    if (!version) {
      return res.status(404).json({
        success: false,
        error: 'Version not found',
      } as ApiResponse<never>);
    }

    res.json({
      success: true,
      data: version,
    } as ApiResponse<any>);
  } catch (error) {
    console.error('Get version error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get version',
    } as ApiResponse<never>);
  }
});

/**
 * POST /api/collaboration/versions/restore
 * Restore a specific version
 */
router.post('/versions/restore', async (req, res) => {
  try {
    const { versionId, projectId, createBackup } = req.body;

    if (!versionId || !projectId) {
      return res.status(400).json({
        success: false,
        error: 'Version ID and project ID are required',
      } as ApiResponse<never>);
    }

    const snapshot = await versionControlService.restoreVersion({
      versionId,
      projectId,
      createBackup,
    });

    res.json({
      success: true,
      data: snapshot,
      message: 'Version restored successfully',
    } as ApiResponse<any>);
  } catch (error) {
    console.error('Version restore error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Version restore failed',
    } as ApiResponse<never>);
  }
});

/**
 * POST /api/collaboration/versions/compare
 * Compare two versions
 */
router.post('/versions/compare', async (req, res) => {
  try {
    const { projectId, versionIdA, versionIdB } = req.body;

    if (!projectId || !versionIdA || !versionIdB) {
      return res.status(400).json({
        success: false,
        error: 'Project ID and two version IDs are required',
      } as ApiResponse<never>);
    }

    const diff = await versionControlService.compareVersions(
      projectId,
      versionIdA,
      versionIdB
    );

    res.json({
      success: true,
      data: diff,
      message: 'Versions compared successfully',
    } as ApiResponse<any>);
  } catch (error) {
    console.error('Version comparison error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Version comparison failed',
    } as ApiResponse<never>);
  }
});

/**
 * DELETE /api/collaboration/versions/:projectId/:versionId
 * Delete a version
 */
router.delete('/versions/:projectId/:versionId', async (req, res) => {
  try {
    const { projectId, versionId } = req.params;

    await versionControlService.deleteVersion(versionId, projectId);

    res.json({
      success: true,
      message: 'Version deleted successfully',
    } as ApiResponse<never>);
  } catch (error) {
    console.error('Version deletion error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Version deletion failed',
    } as ApiResponse<never>);
  }
});

/**
 * GET /api/collaboration/versions/stats/:projectId
 * Get version statistics
 */
router.get('/versions/stats/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;

    const stats = await versionControlService.getVersionStats(projectId);

    res.json({
      success: true,
      data: stats,
    } as ApiResponse<any>);
  } catch (error) {
    console.error('Get version stats error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get version stats',
    } as ApiResponse<never>);
  }
});

// ==================== TEAM COLLABORATION ROUTES ====================

/**
 * POST /api/collaboration/members/add
 * Add a member to a project
 */
router.post('/members/add', async (req, res) => {
  try {
    const { projectId, userId, email, name, role, addedBy } = req.body;

    if (!projectId || !userId || !email || !name || !role || !addedBy) {
      return res.status(400).json({
        success: false,
        error: 'All member fields are required',
      } as ApiResponse<never>);
    }

    const member = await teamCollaborationService.addMember(projectId, {
      userId,
      email,
      name,
      role,
      addedBy,
    });

    res.json({
      success: true,
      data: member,
      message: `${name} added as ${role}`,
    } as ApiResponse<any>);
  } catch (error) {
    console.error('Add member error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to add member',
    } as ApiResponse<never>);
  }
});

/**
 * DELETE /api/collaboration/members/:projectId/:userId
 * Remove a member from a project
 */
router.delete('/members/:projectId/:userId', async (req, res) => {
  try {
    const { projectId, userId } = req.params;
    const { removedBy } = req.body;

    await teamCollaborationService.removeMember(projectId, userId, removedBy);

    res.json({
      success: true,
      message: 'Member removed successfully',
    } as ApiResponse<never>);
  } catch (error) {
    console.error('Remove member error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to remove member',
    } as ApiResponse<never>);
  }
});

/**
 * PUT /api/collaboration/members/role
 * Update member role
 */
router.put('/members/role', async (req, res) => {
  try {
    const { projectId, userId, newRole, updatedBy } = req.body;

    if (!projectId || !userId || !newRole || !updatedBy) {
      return res.status(400).json({
        success: false,
        error: 'Project ID, user ID, new role, and updater are required',
      } as ApiResponse<never>);
    }

    const member = await teamCollaborationService.updateMemberRole(
      projectId,
      userId,
      newRole,
      updatedBy
    );

    res.json({
      success: true,
      data: member,
      message: `Role updated to ${newRole}`,
    } as ApiResponse<any>);
  } catch (error) {
    console.error('Update role error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update role',
    } as ApiResponse<never>);
  }
});

/**
 * POST /api/collaboration/share/create
 * Create a share link
 */
router.post('/share/create', async (req, res) => {
  try {
    const { projectId, createdBy, accessType, expiresIn, password, maxUses, settings } =
      req.body;

    if (!projectId || !createdBy || !accessType) {
      return res.status(400).json({
        success: false,
        error: 'Project ID, creator, and access type are required',
      } as ApiResponse<never>);
    }

    const shareLink = await teamCollaborationService.createShareLink(projectId, createdBy, {
      accessType,
      expiresIn,
      password,
      maxUses,
      ...settings,
    });

    res.json({
      success: true,
      data: shareLink,
      message: 'Share link created successfully',
    } as ApiResponse<any>);
  } catch (error) {
    console.error('Create share link error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create share link',
    } as ApiResponse<never>);
  }
});

/**
 * POST /api/collaboration/share/validate
 * Validate a share link
 */
router.post('/share/validate', async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        error: 'Token is required',
      } as ApiResponse<never>);
    }

    const result = await teamCollaborationService.validateShareLink(token, password);

    if (!result.valid) {
      return res.status(403).json({
        success: false,
        error: result.error,
      } as ApiResponse<never>);
    }

    res.json({
      success: true,
      data: result.shareLink,
      message: 'Share link is valid',
    } as ApiResponse<any>);
  } catch (error) {
    console.error('Validate share link error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Validation failed',
    } as ApiResponse<never>);
  }
});

/**
 * DELETE /api/collaboration/share/:projectId/:linkId
 * Revoke a share link
 */
router.delete('/share/:projectId/:linkId', async (req, res) => {
  try {
    const { projectId, linkId } = req.params;
    const { revokedBy } = req.body;

    await teamCollaborationService.revokeShareLink(projectId, linkId, revokedBy);

    res.json({
      success: true,
      message: 'Share link revoked successfully',
    } as ApiResponse<never>);
  } catch (error) {
    console.error('Revoke share link error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to revoke share link',
    } as ApiResponse<never>);
  }
});

/**
 * GET /api/collaboration/activities/:projectId
 * Get project activities
 */
router.get('/activities/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;
    const { limit, offset } = req.query;

    const activities = await teamCollaborationService.getActivities(projectId, {
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
    });

    res.json({
      success: true,
      data: activities,
    } as ApiResponse<any>);
  } catch (error) {
    console.error('Get activities error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get activities',
    } as ApiResponse<never>);
  }
});

/**
 * GET /api/collaboration/stats/:projectId
 * Get collaboration statistics
 */
router.get('/stats/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;

    const stats = await teamCollaborationService.getCollaborationStats(projectId);

    res.json({
      success: true,
      data: stats,
    } as ApiResponse<any>);
  } catch (error) {
    console.error('Get collaboration stats error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get stats',
    } as ApiResponse<never>);
  }
});

// ==================== ANNOTATION ROUTES ====================

/**
 * POST /api/collaboration/annotations/create
 * Create a new annotation
 */
router.post('/annotations/create', async (req, res) => {
  try {
    const { projectId, versionId, type, content, position, author, priority, tags, mentions } =
      req.body;

    if (!projectId || !type || !content || !position || !author) {
      return res.status(400).json({
        success: false,
        error: 'Project ID, type, content, position, and author are required',
      } as ApiResponse<never>);
    }

    const annotation = await annotationService.createAnnotation({
      projectId,
      versionId,
      type,
      content,
      position,
      author,
      priority,
      tags,
      mentions,
    });

    res.json({
      success: true,
      data: annotation,
      message: 'Annotation created successfully',
    } as ApiResponse<any>);
  } catch (error) {
    console.error('Create annotation error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create annotation',
    } as ApiResponse<never>);
  }
});

/**
 * GET /api/collaboration/annotations/:projectId
 * Get annotations for a project
 */
router.get('/annotations/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;
    const { versionId, type, status, priority, authorId } = req.query;

    const annotations = await annotationService.getAnnotations({
      projectId,
      versionId: versionId as string,
      type: type as any,
      status: status as any,
      priority: priority as any,
      authorId: authorId as string,
    });

    res.json({
      success: true,
      data: annotations,
    } as ApiResponse<any>);
  } catch (error) {
    console.error('Get annotations error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get annotations',
    } as ApiResponse<never>);
  }
});

/**
 * PUT /api/collaboration/annotations/:annotationId
 * Update an annotation
 */
router.put('/annotations/:annotationId', async (req, res) => {
  try {
    const { annotationId } = req.params;
    const updates = req.body;

    const annotation = await annotationService.updateAnnotation(annotationId, updates);

    res.json({
      success: true,
      data: annotation,
      message: 'Annotation updated successfully',
    } as ApiResponse<any>);
  } catch (error) {
    console.error('Update annotation error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update annotation',
    } as ApiResponse<never>);
  }
});

/**
 * DELETE /api/collaboration/annotations/:annotationId
 * Delete an annotation
 */
router.delete('/annotations/:annotationId', async (req, res) => {
  try {
    const { annotationId } = req.params;

    await annotationService.deleteAnnotation(annotationId);

    res.json({
      success: true,
      message: 'Annotation deleted successfully',
    } as ApiResponse<never>);
  } catch (error) {
    console.error('Delete annotation error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete annotation',
    } as ApiResponse<never>);
  }
});

/**
 * POST /api/collaboration/annotations/:annotationId/reply
 * Add a reply to an annotation
 */
router.post('/annotations/:annotationId/reply', async (req, res) => {
  try {
    const { annotationId } = req.params;
    const { author, content, mentions } = req.body;

    if (!author || !content) {
      return res.status(400).json({
        success: false,
        error: 'Author and content are required',
      } as ApiResponse<never>);
    }

    const annotation = await annotationService.addReply(annotationId, {
      author,
      content,
      mentions,
    });

    res.json({
      success: true,
      data: annotation,
      message: 'Reply added successfully',
    } as ApiResponse<any>);
  } catch (error) {
    console.error('Add reply error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to add reply',
    } as ApiResponse<never>);
  }
});

/**
 * POST /api/collaboration/annotations/:annotationId/resolve
 * Resolve an annotation
 */
router.post('/annotations/:annotationId/resolve', async (req, res) => {
  try {
    const { annotationId } = req.params;
    const { resolvedBy } = req.body;

    if (!resolvedBy) {
      return res.status(400).json({
        success: false,
        error: 'Resolver ID is required',
      } as ApiResponse<never>);
    }

    const annotation = await annotationService.resolveAnnotation(annotationId, resolvedBy);

    res.json({
      success: true,
      data: annotation,
      message: 'Annotation resolved successfully',
    } as ApiResponse<any>);
  } catch (error) {
    console.error('Resolve annotation error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to resolve annotation',
    } as ApiResponse<never>);
  }
});

/**
 * GET /api/collaboration/annotations/stats/:projectId
 * Get annotation statistics
 */
router.get('/annotations/stats/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;

    const stats = await annotationService.getAnnotationStats(projectId);

    res.json({
      success: true,
      data: stats,
    } as ApiResponse<any>);
  } catch (error) {
    console.error('Get annotation stats error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get annotation stats',
    } as ApiResponse<never>);
  }
});

/**
 * GET /api/collaboration/annotations/search/:projectId
 * Search annotations
 */
router.get('/annotations/search/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;
    const { query, versionId, limit } = req.query;

    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Search query is required',
      } as ApiResponse<never>);
    }

    const annotations = await annotationService.searchAnnotations(projectId, query as string, {
      versionId: versionId as string,
      limit: limit ? parseInt(limit as string) : undefined,
    });

    res.json({
      success: true,
      data: annotations,
    } as ApiResponse<any>);
  } catch (error) {
    console.error('Search annotations error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to search annotations',
    } as ApiResponse<never>);
  }
});

export default router;
