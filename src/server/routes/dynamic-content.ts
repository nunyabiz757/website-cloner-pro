import express from 'express';
import DynamicContentService from '../services/DynamicContentService.js';

const router = express.Router();

/**
 * Detect dynamic content in HTML
 * POST /api/dynamic-content/detect
 */
router.post('/detect', async (req, res) => {
  try {
    const { html, url } = req.body;

    if (!html) {
      return res.status(400).json({
        success: false,
        error: 'HTML content is required',
      });
    }

    const detection = await DynamicContentService.detectDynamicContent(
      html,
      url || 'https://example.com'
    );

    res.json({
      success: true,
      detection,
    });
  } catch (error) {
    console.error('Failed to detect dynamic content:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to detect dynamic content',
    });
  }
});

/**
 * Create content migration plan
 * POST /api/dynamic-content/migration-plan
 */
router.post('/migration-plan', async (req, res) => {
  try {
    const { detection } = req.body;

    if (!detection) {
      return res.status(400).json({
        success: false,
        error: 'Detection result is required',
      });
    }

    const plan = DynamicContentService.createMigrationPlan(detection);

    res.json({
      success: true,
      plan,
    });
  } catch (error) {
    console.error('Failed to create migration plan:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create migration plan',
    });
  }
});

/**
 * Preserve dynamic content
 * POST /api/dynamic-content/preserve
 */
router.post('/preserve', async (req, res) => {
  try {
    const { html, detection, apiData } = req.body;

    if (!html || !detection) {
      return res.status(400).json({
        success: false,
        error: 'HTML content and detection result are required',
      });
    }

    const preservation = await DynamicContentService.preserveDynamicContent(
      html,
      detection,
      apiData
    );

    res.json({
      success: true,
      preservation,
    });
  } catch (error) {
    console.error('Failed to preserve dynamic content:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to preserve content',
    });
  }
});

/**
 * Analyze and create migration plan in one step
 * POST /api/dynamic-content/analyze
 */
router.post('/analyze', async (req, res) => {
  try {
    const { html, url } = req.body;

    if (!html) {
      return res.status(400).json({
        success: false,
        error: 'HTML content is required',
      });
    }

    // Detect dynamic content
    const detection = await DynamicContentService.detectDynamicContent(
      html,
      url || 'https://example.com'
    );

    // Create migration plan
    const plan = DynamicContentService.createMigrationPlan(detection);

    res.json({
      success: true,
      analysis: {
        detection,
        plan,
        summary: {
          hasDynamicContent: detection.hasDynamicContent,
          confidence: detection.confidence,
          totalDynamicElements: detection.totalDynamicElements,
          cms: detection.cmsDetection.cms,
          framework: detection.frameworkDetection.framework,
          migrationStrategy: plan.strategy,
          estimatedTime: plan.estimatedTime,
          complexity: plan.estimatedComplexity,
          automationLevel: plan.automationLevel,
        },
      },
    });
  } catch (error) {
    console.error('Failed to analyze dynamic content:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to analyze',
    });
  }
});

/**
 * Get CMS-specific information
 * POST /api/dynamic-content/cms-info
 */
router.post('/cms-info', async (req, res) => {
  try {
    const { html, url } = req.body;

    if (!html) {
      return res.status(400).json({
        success: false,
        error: 'HTML content is required',
      });
    }

    const detection = await DynamicContentService.detectDynamicContent(html, url || 'https://example.com');

    res.json({
      success: true,
      cmsInfo: {
        detected: detection.cmsDetection.detected,
        cms: detection.cmsDetection.cms,
        version: detection.cmsDetection.version,
        confidence: detection.cmsDetection.confidence,
        apiAvailable: detection.cmsDetection.apiAvailable,
        apiEndpoints: detection.cmsDetection.apiEndpoints,
        contentTypes: detection.cmsDetection.contentTypes,
        customPostTypes: detection.cmsDetection.customPostTypes,
        taxonomies: detection.cmsDetection.taxonomies,
        plugins: detection.cmsDetection.plugins,
        databaseContent: detection.databaseContent,
      },
    });
  } catch (error) {
    console.error('Failed to get CMS info:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get CMS info',
    });
  }
});

/**
 * Get framework-specific information
 * POST /api/dynamic-content/framework-info
 */
router.post('/framework-info', async (req, res) => {
  try {
    const { html, url } = req.body;

    if (!html) {
      return res.status(400).json({
        success: false,
        error: 'HTML content is required',
      });
    }

    const detection = await DynamicContentService.detectDynamicContent(html, url || 'https://example.com');

    res.json({
      success: true,
      frameworkInfo: {
        detected: detection.frameworkDetection.detected,
        framework: detection.frameworkDetection.framework,
        version: detection.frameworkDetection.version,
        rendering: detection.frameworkDetection.rendering,
        hydration: detection.frameworkDetection.hydration,
        components: detection.frameworkDetection.components,
        stateManagement: detection.frameworkDetection.stateManagement,
      },
    });
  } catch (error) {
    console.error('Failed to get framework info:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get framework info',
    });
  }
});

/**
 * Get API endpoints
 * POST /api/dynamic-content/api-endpoints
 */
router.post('/api-endpoints', async (req, res) => {
  try {
    const { html, url } = req.body;

    if (!html) {
      return res.status(400).json({
        success: false,
        error: 'HTML content is required',
      });
    }

    const detection = await DynamicContentService.detectDynamicContent(html, url || 'https://example.com');

    // Group endpoints by type
    const endpointsByType = detection.apiEndpoints.reduce((acc, endpoint) => {
      if (!acc[endpoint.type]) {
        acc[endpoint.type] = [];
      }
      acc[endpoint.type].push(endpoint);
      return acc;
    }, {} as Record<string, typeof detection.apiEndpoints>);

    res.json({
      success: true,
      apiEndpoints: {
        total: detection.apiEndpoints.length,
        endpoints: detection.apiEndpoints,
        byType: endpointsByType,
        critical: detection.apiEndpoints.filter(e => e.critical),
      },
    });
  } catch (error) {
    console.error('Failed to get API endpoints:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get API endpoints',
    });
  }
});

/**
 * Get dynamic areas
 * POST /api/dynamic-content/dynamic-areas
 */
router.post('/dynamic-areas', async (req, res) => {
  try {
    const { html, url } = req.body;

    if (!html) {
      return res.status(400).json({
        success: false,
        error: 'HTML content is required',
      });
    }

    const detection = await DynamicContentService.detectDynamicContent(html, url || 'https://example.com');

    // Group areas by type
    const areasByType = detection.dynamicAreas.reduce((acc, area) => {
      if (!acc[area.type]) {
        acc[area.type] = [];
      }
      acc[area.type].push(area);
      return acc;
    }, {} as Record<string, typeof detection.dynamicAreas>);

    // Group by preservation strategy
    const areasByStrategy = detection.dynamicAreas.reduce((acc, area) => {
      if (!acc[area.preservationStrategy]) {
        acc[area.preservationStrategy] = [];
      }
      acc[area.preservationStrategy].push(area);
      return acc;
    }, {} as Record<string, typeof detection.dynamicAreas>);

    res.json({
      success: true,
      dynamicAreas: {
        total: detection.dynamicAreas.length,
        areas: detection.dynamicAreas,
        byType: areasByType,
        byStrategy: areasByStrategy,
      },
    });
  } catch (error) {
    console.error('Failed to get dynamic areas:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get dynamic areas',
    });
  }
});

/**
 * Get database content mapping
 * POST /api/dynamic-content/database-content
 */
router.post('/database-content', async (req, res) => {
  try {
    const { html, url } = req.body;

    if (!html) {
      return res.status(400).json({
        success: false,
        error: 'HTML content is required',
      });
    }

    const detection = await DynamicContentService.detectDynamicContent(html, url || 'https://example.com');

    // Group by content type
    const contentByType = detection.databaseContent.reduce((acc, content) => {
      if (!acc[content.contentType]) {
        acc[content.contentType] = [];
      }
      acc[content.contentType].push(content);
      return acc;
    }, {} as Record<string, typeof detection.databaseContent>);

    // Group by priority
    const contentByPriority = detection.databaseContent.reduce((acc, content) => {
      if (!acc[content.migrationPriority]) {
        acc[content.migrationPriority] = [];
      }
      acc[content.migrationPriority].push(content);
      return acc;
    }, {} as Record<string, typeof detection.databaseContent>);

    res.json({
      success: true,
      databaseContent: {
        total: detection.databaseContent.length,
        content: detection.databaseContent,
        byType: contentByType,
        byPriority: contentByPriority,
      },
    });
  } catch (error) {
    console.error('Failed to get database content:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get database content',
    });
  }
});

/**
 * Generate export commands for CMS
 * POST /api/dynamic-content/export-commands
 */
router.post('/export-commands', async (req, res) => {
  try {
    const { html, url } = req.body;

    if (!html) {
      return res.status(400).json({
        success: false,
        error: 'HTML content is required',
      });
    }

    const detection = await DynamicContentService.detectDynamicContent(html, url || 'https://example.com');

    if (!detection.cmsDetection.detected) {
      return res.json({
        success: true,
        commands: [],
        message: 'No CMS detected - no export commands available',
      });
    }

    const plan = DynamicContentService.createMigrationPlan(detection);
    const exportStep = plan.steps.find(step => step.commands && step.commands.length > 0);

    res.json({
      success: true,
      cms: detection.cmsDetection.cms,
      commands: exportStep?.commands || [],
      prerequisites: plan.prerequisites,
    });
  } catch (error) {
    console.error('Failed to generate export commands:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate commands',
    });
  }
});

/**
 * Validate dynamic content preservation
 * POST /api/dynamic-content/validate-preservation
 */
router.post('/validate-preservation', async (req, res) => {
  try {
    const { preservation } = req.body;

    if (!preservation) {
      return res.status(400).json({
        success: false,
        error: 'Preservation result is required',
      });
    }

    const validation = {
      isValid: true,
      errors: [] as string[],
      warnings: [] as string[],
      statistics: {
        totalAreas: preservation.dynamicAreas.length,
        preservedAreas: preservation.dynamicAreas.filter((a: any) => a.staticHTML).length,
        areasWithData: preservation.dynamicAreas.filter((a: any) => a.dataSnapshot).length,
        areasWithAPIEndpoint: preservation.dynamicAreas.filter((a: any) => a.apiEndpoint).length,
      },
    };

    // Validate each preserved area
    preservation.dynamicAreas.forEach((area: any, index: number) => {
      if (!area.staticHTML) {
        validation.errors.push(`Area ${index} (${area.selector}): No static HTML preserved`);
        validation.isValid = false;
      }

      if (area.apiEndpoint && !area.dataSnapshot) {
        validation.warnings.push(`Area ${index} (${area.selector}): Has API endpoint but no data snapshot`);
      }

      if (!area.originalHTML) {
        validation.errors.push(`Area ${index} (${area.selector}): No original HTML captured`);
        validation.isValid = false;
      }
    });

    res.json({
      success: true,
      validation,
    });
  } catch (error) {
    console.error('Failed to validate preservation:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to validate',
    });
  }
});

/**
 * Get migration complexity score
 * POST /api/dynamic-content/complexity-score
 */
router.post('/complexity-score', async (req, res) => {
  try {
    const { html, url } = req.body;

    if (!html) {
      return res.status(400).json({
        success: false,
        error: 'HTML content is required',
      });
    }

    const detection = await DynamicContentService.detectDynamicContent(html, url || 'https://example.com');
    const plan = DynamicContentService.createMigrationPlan(detection);

    // Calculate complexity score (0-100)
    let complexityScore = 0;

    // Dynamic areas add complexity
    complexityScore += Math.min(detection.dynamicAreas.length * 5, 30);

    // API endpoints add complexity
    complexityScore += Math.min(detection.apiEndpoints.length * 3, 20);

    // Database content adds complexity
    complexityScore += Math.min(detection.databaseContent.length * 5, 20);

    // Framework detection adds complexity
    if (detection.frameworkDetection.detected) {
      if (detection.frameworkDetection.rendering === 'csr') {
        complexityScore += 15;
      } else if (detection.frameworkDetection.rendering === 'ssr') {
        complexityScore += 10;
      }
    }

    // CMS adds moderate complexity
    if (detection.cmsDetection.detected) {
      complexityScore += 10;
    }

    // WebSocket adds high complexity
    const hasWebSocket = detection.dynamicAreas.some(a => a.type === 'websocket');
    if (hasWebSocket) {
      complexityScore += 15;
    }

    complexityScore = Math.min(complexityScore, 100);

    // Determine complexity level
    let complexityLevel: string;
    if (complexityScore < 25) complexityLevel = 'Low';
    else if (complexityScore < 50) complexityLevel = 'Medium';
    else if (complexityScore < 75) complexityLevel = 'High';
    else complexityLevel = 'Very High';

    res.json({
      success: true,
      complexity: {
        score: complexityScore,
        level: complexityLevel,
        factors: {
          dynamicAreas: detection.dynamicAreas.length,
          apiEndpoints: detection.apiEndpoints.length,
          databaseContent: detection.databaseContent.length,
          framework: detection.frameworkDetection.framework,
          cms: detection.cmsDetection.cms,
          hasWebSocket,
        },
        migrationPlan: {
          strategy: plan.strategy,
          estimatedTime: plan.estimatedTime,
          automationLevel: plan.automationLevel,
          totalSteps: plan.steps.length,
        },
      },
    });
  } catch (error) {
    console.error('Failed to calculate complexity score:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to calculate complexity',
    });
  }
});

/**
 * Get recommendations for dynamic content handling
 * POST /api/dynamic-content/recommendations
 */
router.post('/recommendations', async (req, res) => {
  try {
    const { html, url } = req.body;

    if (!html) {
      return res.status(400).json({
        success: false,
        error: 'HTML content is required',
      });
    }

    const detection = await DynamicContentService.detectDynamicContent(html, url || 'https://example.com');
    const plan = DynamicContentService.createMigrationPlan(detection);

    const recommendations = [...plan.recommendations];

    // Add specific recommendations based on detection
    if (detection.frameworkDetection.detected) {
      recommendations.push(
        `Consider using server-side rendering or static site generation instead of ${detection.frameworkDetection.rendering}`
      );
    }

    if (detection.apiEndpoints.length > 5) {
      recommendations.push('High number of API endpoints detected - consider API consolidation');
    }

    if (!detection.cmsDetection.apiAvailable && detection.cmsDetection.detected) {
      recommendations.push(`Enable API access for ${detection.cmsDetection.cms} to facilitate automated migration`);
    }

    const websocketAreas = detection.dynamicAreas.filter(a => a.type === 'websocket');
    if (websocketAreas.length > 0) {
      recommendations.push('WebSocket content requires special handling - consider polling alternatives for static export');
    }

    res.json({
      success: true,
      recommendations: {
        immediate: recommendations,
        risks: plan.risks,
        prerequisites: plan.prerequisites,
        bestPractices: [
          'Always backup source site before migration',
          'Test migration on staging environment first',
          'Validate all dynamic content after migration',
          'Monitor API rate limits during export',
          'Document any manual steps required',
        ],
      },
    });
  } catch (error) {
    console.error('Failed to get recommendations:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get recommendations',
    });
  }
});

export default router;
