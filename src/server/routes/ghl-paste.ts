import express from 'express';
import { PasteSessionService } from '../services/PasteSessionService.js';
import { ClonedPageService } from '../services/ClonedPageService.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

/**
 * POST /api/ghl-paste/cloned-pages
 * Create a new cloned page
 */
router.post('/cloned-pages', authenticate, async (req, res) => {
  try {
    const { sourceUrl, sourceTitle, pageData, creditsConsumed } = req.body;
    const userId = req.user!.id;

    if (!sourceUrl || !pageData) {
      return res.status(400).json({
        error: 'sourceUrl and pageData are required',
      });
    }

    const clonedPage = await ClonedPageService.createClonedPage({
      userId,
      sourceUrl,
      sourceTitle,
      pageData,
      creditsConsumed,
    });

    res.status(201).json({
      success: true,
      clonedPage,
    });
  } catch (error) {
    console.error('Create cloned page error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to create cloned page',
    });
  }
});

/**
 * GET /api/ghl-paste/cloned-pages
 * List user's cloned pages
 */
router.get('/cloned-pages', authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { limit, status, search } = req.query;

    const clonedPages = await ClonedPageService.listClonedPages({
      userId,
      limit: limit ? parseInt(limit as string) : undefined,
      status: status as 'copied' | 'failed' | undefined,
      search: search as string | undefined,
    });

    res.json({
      success: true,
      clonedPages,
    });
  } catch (error) {
    console.error('List cloned pages error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to list cloned pages',
    });
  }
});

/**
 * GET /api/ghl-paste/cloned-pages/:id
 * Get a specific cloned page
 */
router.get('/cloned-pages/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const clonedPage = await ClonedPageService.getClonedPage(id, userId);

    res.json({
      success: true,
      clonedPage,
    });
  } catch (error) {
    console.error('Get cloned page error:', error);
    res.status(error instanceof Error && error.message.includes('not found') ? 404 : 500).json({
      error: error instanceof Error ? error.message : 'Failed to get cloned page',
    });
  }
});

/**
 * DELETE /api/ghl-paste/cloned-pages/:id
 * Delete a cloned page
 */
router.delete('/cloned-pages/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    await ClonedPageService.deleteClonedPage(id, userId);

    res.json({
      success: true,
      message: 'Cloned page deleted successfully',
    });
  } catch (error) {
    console.error('Delete cloned page error:', error);
    res.status(error instanceof Error && error.message.includes('not found') ? 404 : 500).json({
      error: error instanceof Error ? error.message : 'Failed to delete cloned page',
    });
  }
});

/**
 * GET /api/ghl-paste/statistics
 * Get user's paste statistics
 */
router.get('/statistics', authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;

    const statistics = await ClonedPageService.getStatistics(userId);

    res.json({
      success: true,
      statistics,
    });
  } catch (error) {
    console.error('Get statistics error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get statistics',
    });
  }
});

/**
 * POST /api/ghl-paste/paste-sessions
 * Create a new paste session (generates paste code)
 */
router.post('/paste-sessions', authenticate, async (req, res) => {
  try {
    const { clonedPageId, expiresInMinutes } = req.body;
    const userId = req.user!.id;

    if (!clonedPageId) {
      return res.status(400).json({
        error: 'clonedPageId is required',
      });
    }

    const session = await PasteSessionService.createPasteSession({
      clonedPageId,
      userId,
      expiresInMinutes: expiresInMinutes || 5,
    });

    res.status(201).json({
      success: true,
      session,
    });
  } catch (error) {
    console.error('Create paste session error:', error);
    res.status(error instanceof Error && error.message.includes('not found') ? 404 : 500).json({
      error: error instanceof Error ? error.message : 'Failed to create paste session',
    });
  }
});

/**
 * GET /api/ghl-paste/paste-sessions
 * List user's paste sessions
 */
router.get('/paste-sessions', authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { limit } = req.query;

    const sessions = await PasteSessionService.listPasteSessions(
      userId,
      limit ? parseInt(limit as string) : undefined
    );

    res.json({
      success: true,
      sessions,
    });
  } catch (error) {
    console.error('List paste sessions error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to list paste sessions',
    });
  }
});

/**
 * GET /api/ghl-paste/paste-data/:pasteCode
 * Get paste data by paste code (for bookmarklet - no auth required)
 */
router.get('/paste-data/:pasteCode', async (req, res) => {
  try {
    const { pasteCode } = req.params;

    if (!pasteCode || pasteCode.length !== 8) {
      return res.status(400).json({
        error: 'Invalid paste code',
      });
    }

    const session = await PasteSessionService.getPasteSession(pasteCode);

    res.json({
      success: true,
      data: session.clonedPage.pageData,
      expiresIn: session.expiresIn,
      sourceUrl: session.clonedPage.sourceUrl,
      sourceTitle: session.clonedPage.sourceTitle,
    });
  } catch (error) {
    console.error('Get paste data error:', error);
    const statusCode = error instanceof Error &&
      (error.message.includes('not found') ||
       error.message.includes('expired') ||
       error.message.includes('already used')) ? 404 : 500;

    res.status(statusCode).json({
      error: error instanceof Error ? error.message : 'Failed to get paste data',
    });
  }
});

/**
 * POST /api/ghl-paste/paste-complete/:pasteCode
 * Complete a paste session (called by bookmarklet)
 */
router.post('/paste-complete/:pasteCode', async (req, res) => {
  try {
    const { pasteCode } = req.params;
    const { destinationUrl, status, elementsCount, errors, warnings } = req.body;

    if (!pasteCode || !destinationUrl || !status) {
      return res.status(400).json({
        error: 'pasteCode, destinationUrl, and status are required',
      });
    }

    await PasteSessionService.completePasteSession({
      pasteCode,
      destinationUrl,
      status,
      elementsCount,
      errors,
      warnings,
    });

    res.json({
      success: true,
      message: 'Paste session completed successfully',
    });
  } catch (error) {
    console.error('Complete paste error:', error);
    res.status(error instanceof Error && error.message.includes('not found') ? 404 : 500).json({
      error: error instanceof Error ? error.message : 'Failed to complete paste session',
    });
  }
});

/**
 * GET /api/ghl-paste/bookmarklet
 * Generate bookmarklet code
 */
router.get('/bookmarklet', (req, res) => {
  const { pasteCode } = req.query;

  if (!pasteCode) {
    return res.status(400).json({
      error: 'pasteCode is required',
    });
  }

  // Bookmarklet code (will be minified in production)
  const bookmarkletCode = `
(function() {
  const API_URL = '${req.protocol}://${req.get('host')}/api/ghl-paste';
  const PASTE_CODE = '${pasteCode}';

  // Create overlay
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.8);z-index:999999;display:flex;align-items:center;justify-content:center;font-family:sans-serif;';
  overlay.innerHTML = '<div style="background:white;padding:30px;border-radius:8px;max-width:400px;text-align:center;"><h2 style="margin:0 0 20px">Pasting Content...</h2><div id="paste-status">Loading paste data...</div></div>';
  document.body.appendChild(overlay);

  const updateStatus = (msg) => {
    const el = document.getElementById('paste-status');
    if (el) el.textContent = msg;
  };

  // Fetch paste data
  fetch(API_URL + '/paste-data/' + PASTE_CODE)
    .then(r => r.json())
    .then(data => {
      if (!data.success) throw new Error(data.error);

      updateStatus('Injecting content...');

      // Simple injection logic (customize based on your needs)
      const { data: pageData } = data;

      // Example: inject HTML
      if (pageData.html) {
        const container = document.querySelector('[contenteditable="true"], .editor, #content');
        if (container) {
          container.innerHTML = pageData.html;
          updateStatus('Content pasted successfully!');
        } else {
          throw new Error('Could not find editor container');
        }
      }

      // Report completion
      return fetch(API_URL + '/paste-complete/' + PASTE_CODE, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          destinationUrl: window.location.href,
          status: 'completed',
          elementsCount: 1,
        })
      });
    })
    .then(() => {
      updateStatus('✅ Paste complete!');
      setTimeout(() => overlay.remove(), 2000);
    })
    .catch(err => {
      updateStatus('❌ Error: ' + err.message);
      setTimeout(() => overlay.remove(), 3000);
    });
})();
`.trim();

  const minified = bookmarkletCode.replace(/\s+/g, ' ').replace(/\n/g, '');
  const encoded = 'javascript:' + encodeURIComponent(minified);

  res.json({
    success: true,
    bookmarklet: encoded,
    raw: bookmarkletCode,
  });
});

export default router;
