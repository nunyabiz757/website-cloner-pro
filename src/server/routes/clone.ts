import express from 'express';
import multer from 'multer';
import path from 'path';
import CloneService from '../services/CloneService.js';
import type { ApiResponse, CloneRequest, ClonedWebsite } from '../../shared/types/index.js';

const router = express.Router();

// Configure file upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/temp');
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } }); // 50MB limit

/**
 * POST /api/clone/url
 * Clone a website from a URL
 */
router.post('/url', async (req, res) => {
  try {
    const { url, options } = req.body;

    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL is required',
      } as ApiResponse<never>);
    }

    const request: CloneRequest = {
      type: 'url',
      source: url,
      options: options || {},
    };

    const result = await CloneService.cloneWebsite(request);

    res.json({
      success: true,
      data: result,
      message: 'Website cloned successfully',
    } as ApiResponse<ClonedWebsite>);

  } catch (error) {
    console.error('Clone error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to clone website',
    } as ApiResponse<never>);
  }
});

/**
 * POST /api/clone/upload
 * Clone a website from uploaded files
 */
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'File is required',
      } as ApiResponse<never>);
    }

    const request: CloneRequest = {
      type: 'upload',
      source: req.file.path,
      options: req.body.options ? JSON.parse(req.body.options) : {},
    };

    const result = await CloneService.cloneWebsite(request);

    res.json({
      success: true,
      data: result,
      message: 'Website cloned successfully from upload',
    } as ApiResponse<ClonedWebsite>);

  } catch (error) {
    console.error('Upload clone error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to clone from upload',
    } as ApiResponse<never>);
  }
});

export default router;
