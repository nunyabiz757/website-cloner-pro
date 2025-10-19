import express from 'express';
import { PrismaClient } from '../../../generated/prisma/index.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();
const prisma = new PrismaClient();

// All project routes require authentication
router.use(authenticate);

/**
 * GET /api/projects
 * Get all projects for the authenticated user
 */
router.get('/', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const projects = await prisma.project.findMany({
      where: {
        userId: req.user.userId,
      },
      include: {
        results: {
          orderBy: {
            createdAt: 'desc',
          },
          take: 1, // Get only the latest result
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    res.json(projects);
  } catch (error) {
    console.error('Get projects error:', error);
    res.status(500).json({
      error: 'Failed to fetch projects',
    });
  }
});

/**
 * GET /api/projects/:id
 * Get a specific project by ID
 */
router.get('/:id', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { id } = req.params;

    const project = await prisma.project.findFirst({
      where: {
        id,
        userId: req.user.userId,
      },
      include: {
        results: {
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
    });

    if (!project) {
      return res.status(404).json({
        error: 'Project not found',
      });
    }

    res.json(project);
  } catch (error) {
    console.error('Get project error:', error);
    res.status(500).json({
      error: 'Failed to fetch project',
    });
  }
});

/**
 * POST /api/projects
 * Create a new project
 */
router.post('/', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { name, description, originalUrl } = req.body;

    // Validate input
    if (!name || !originalUrl) {
      return res.status(400).json({
        error: 'Name and originalUrl are required',
      });
    }

    // Validate URL format
    try {
      new URL(originalUrl);
    } catch {
      return res.status(400).json({
        error: 'Invalid URL format',
      });
    }

    const project = await prisma.project.create({
      data: {
        name,
        description,
        originalUrl,
        userId: req.user.userId,
      },
      include: {
        results: true,
      },
    });

    res.status(201).json(project);
  } catch (error) {
    console.error('Create project error:', error);
    res.status(500).json({
      error: 'Failed to create project',
    });
  }
});

/**
 * PUT /api/projects/:id
 * Update a project
 */
router.put('/:id', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { id } = req.params;
    const { name, description, originalUrl } = req.body;

    // Check if project exists and belongs to user
    const existingProject = await prisma.project.findFirst({
      where: {
        id,
        userId: req.user.userId,
      },
    });

    if (!existingProject) {
      return res.status(404).json({
        error: 'Project not found',
      });
    }

    // Validate URL if provided
    if (originalUrl) {
      try {
        new URL(originalUrl);
      } catch {
        return res.status(400).json({
          error: 'Invalid URL format',
        });
      }
    }

    const project = await prisma.project.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(originalUrl && { originalUrl }),
      },
      include: {
        results: {
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
    });

    res.json(project);
  } catch (error) {
    console.error('Update project error:', error);
    res.status(500).json({
      error: 'Failed to update project',
    });
  }
});

/**
 * DELETE /api/projects/:id
 * Delete a project
 */
router.delete('/:id', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { id } = req.params;

    // Check if project exists and belongs to user
    const existingProject = await prisma.project.findFirst({
      where: {
        id,
        userId: req.user.userId,
      },
    });

    if (!existingProject) {
      return res.status(404).json({
        error: 'Project not found',
      });
    }

    await prisma.project.delete({
      where: { id },
    });

    res.json({
      message: 'Project deleted successfully',
    });
  } catch (error) {
    console.error('Delete project error:', error);
    res.status(500).json({
      error: 'Failed to delete project',
    });
  }
});

/**
 * POST /api/projects/:id/results
 * Create an optimization result for a project
 */
router.post('/:id/results', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { id } = req.params;
    const {
      optimizedUrl,
      status,
      performanceData,
      filesData,
      networkData,
      aiInsights,
      errorMessage,
    } = req.body;

    // Check if project exists and belongs to user
    const existingProject = await prisma.project.findFirst({
      where: {
        id,
        userId: req.user.userId,
      },
    });

    if (!existingProject) {
      return res.status(404).json({
        error: 'Project not found',
      });
    }

    const result = await prisma.optimizationResult.create({
      data: {
        projectId: id,
        optimizedUrl,
        status: status || 'pending',
        performanceData: performanceData ? JSON.stringify(performanceData) : null,
        filesData: filesData ? JSON.stringify(filesData) : null,
        networkData: networkData ? JSON.stringify(networkData) : null,
        aiInsights: aiInsights ? JSON.stringify(aiInsights) : null,
        errorMessage,
      },
    });

    res.status(201).json(result);
  } catch (error) {
    console.error('Create result error:', error);
    res.status(500).json({
      error: 'Failed to create optimization result',
    });
  }
});

/**
 * GET /api/projects/:projectId/results/:resultId
 * Get a specific optimization result
 */
router.get('/:projectId/results/:resultId', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { projectId, resultId } = req.params;

    // Check if project belongs to user
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        userId: req.user.userId,
      },
    });

    if (!project) {
      return res.status(404).json({
        error: 'Project not found',
      });
    }

    const result = await prisma.optimizationResult.findFirst({
      where: {
        id: resultId,
        projectId,
      },
    });

    if (!result) {
      return res.status(404).json({
        error: 'Optimization result not found',
      });
    }

    // Parse JSON strings back to objects
    const parsedResult = {
      ...result,
      performanceData: result.performanceData
        ? JSON.parse(result.performanceData)
        : null,
      filesData: result.filesData ? JSON.parse(result.filesData) : null,
      networkData: result.networkData ? JSON.parse(result.networkData) : null,
      aiInsights: result.aiInsights ? JSON.parse(result.aiInsights) : null,
    };

    res.json(parsedResult);
  } catch (error) {
    console.error('Get result error:', error);
    res.status(500).json({
      error: 'Failed to fetch optimization result',
    });
  }
});

/**
 * PUT /api/projects/:projectId/results/:resultId
 * Update an optimization result
 */
router.put('/:projectId/results/:resultId', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { projectId, resultId } = req.params;
    const {
      optimizedUrl,
      status,
      performanceData,
      filesData,
      networkData,
      aiInsights,
      errorMessage,
    } = req.body;

    // Check if project belongs to user
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        userId: req.user.userId,
      },
    });

    if (!project) {
      return res.status(404).json({
        error: 'Project not found',
      });
    }

    const result = await prisma.optimizationResult.update({
      where: { id: resultId },
      data: {
        ...(optimizedUrl !== undefined && { optimizedUrl }),
        ...(status && { status }),
        ...(performanceData !== undefined && {
          performanceData: performanceData ? JSON.stringify(performanceData) : null,
        }),
        ...(filesData !== undefined && {
          filesData: filesData ? JSON.stringify(filesData) : null,
        }),
        ...(networkData !== undefined && {
          networkData: networkData ? JSON.stringify(networkData) : null,
        }),
        ...(aiInsights !== undefined && {
          aiInsights: aiInsights ? JSON.stringify(aiInsights) : null,
        }),
        ...(errorMessage !== undefined && { errorMessage }),
      },
    });

    res.json(result);
  } catch (error) {
    console.error('Update result error:', error);
    res.status(500).json({
      error: 'Failed to update optimization result',
    });
  }
});

/**
 * DELETE /api/projects/:projectId/results/:resultId
 * Delete an optimization result
 */
router.delete('/:projectId/results/:resultId', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { projectId, resultId } = req.params;

    // Check if project belongs to user
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        userId: req.user.userId,
      },
    });

    if (!project) {
      return res.status(404).json({
        error: 'Project not found',
      });
    }

    await prisma.optimizationResult.delete({
      where: { id: resultId },
    });

    res.json({
      message: 'Optimization result deleted successfully',
    });
  } catch (error) {
    console.error('Delete result error:', error);
    res.status(500).json({
      error: 'Failed to delete optimization result',
    });
  }
});

export default router;
