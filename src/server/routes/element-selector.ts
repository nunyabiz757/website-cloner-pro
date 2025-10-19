import { Router } from 'express';
import { ElementSelectorService } from '../services/ElementSelectorService.js';

const router = Router();
const selectorService = new ElementSelectorService();

/**
 * Get element at specific position
 * POST /api/element-selector/at-position
 */
router.post('/at-position', async (req, res) => {
  try {
    const { url, x, y, viewport } = req.body;

    if (!url || x === undefined || y === undefined) {
      return res.status(400).json({
        success: false,
        error: 'url, x, and y coordinates are required',
      });
    }

    const elementInfo = await selectorService.getElementAtPosition(url, x, y, viewport);

    if (!elementInfo) {
      return res.status(404).json({
        success: false,
        error: 'No element found at specified position',
      });
    }

    res.json({
      success: true,
      data: elementInfo,
    });
  } catch (error) {
    console.error('Error getting element at position:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get element',
    });
  }
});

/**
 * Generate selector suggestions
 * POST /api/element-selector/suggestions
 */
router.post('/suggestions', async (req, res) => {
  try {
    const { url, selector } = req.body;

    if (!url || !selector) {
      return res.status(400).json({
        success: false,
        error: 'url and selector are required',
      });
    }

    const suggestions = await selectorService.generateSelectorSuggestions(url, selector);

    res.json({
      success: true,
      data: suggestions,
    });
  } catch (error) {
    console.error('Error generating suggestions:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate suggestions',
    });
  }
});

/**
 * Find all elements matching selector
 * POST /api/element-selector/find
 */
router.post('/find', async (req, res) => {
  try {
    const { url, selector } = req.body;

    if (!url || !selector) {
      return res.status(400).json({
        success: false,
        error: 'url and selector are required',
      });
    }

    const elements = await selectorService.findElements(url, selector);

    res.json({
      success: true,
      data: {
        count: elements.length,
        elements,
      },
    });
  } catch (error) {
    console.error('Error finding elements:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to find elements',
    });
  }
});

/**
 * Validate selector
 * POST /api/element-selector/validate
 */
router.post('/validate', async (req, res) => {
  try {
    const { url, selector } = req.body;

    if (!url || !selector) {
      return res.status(400).json({
        success: false,
        error: 'url and selector are required',
      });
    }

    const result = await selectorService.validateSelector(url, selector);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Error validating selector:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to validate selector',
    });
  }
});

/**
 * Extract all interactive elements
 * POST /api/element-selector/interactive
 */
router.post('/interactive', async (req, res) => {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'url is required',
      });
    }

    const elements = await selectorService.extractInteractiveElements(url);

    res.json({
      success: true,
      data: {
        count: elements.length,
        elements,
      },
    });
  } catch (error) {
    console.error('Error extracting interactive elements:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to extract interactive elements',
    });
  }
});

/**
 * Close browser (cleanup)
 * POST /api/element-selector/cleanup
 */
router.post('/cleanup', async (req, res) => {
  try {
    await selectorService.closeBrowser();

    res.json({
      success: true,
      message: 'Browser closed successfully',
    });
  } catch (error) {
    console.error('Error cleaning up:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to cleanup',
    });
  }
});

export default router;
