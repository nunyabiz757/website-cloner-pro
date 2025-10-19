import express from 'express';
import multer from 'multer';
import path from 'path';
import fileUploadService from '../services/FileUploadService.js';

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/temp');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB
  },
  fileFilter: (req, file, cb) => {
    const allowedExtensions = [
      '.html', '.htm', '.css', '.js', '.mjs',
      '.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.avif',
      '.woff', '.woff2', '.ttf', '.otf', '.eot',
      '.zip', '.json', '.xml', '.txt'
    ];

    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${ext} is not allowed`));
    }
  }
});

/**
 * POST /api/file-upload/upload
 * Upload files (single or multiple, including zip)
 */
router.post('/upload', upload.array('files', 100), async (req, res) => {
  try {
    if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No files uploaded'
      });
    }

    const uploadedFiles = req.files.map(file => ({
      filename: file.originalname,
      path: file.path,
      size: file.size,
      mimetype: file.mimetype
    }));

    // Validate files
    const validation = fileUploadService.validateFiles(uploadedFiles);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        errors: validation.errors
      });
    }

    // Process uploaded files
    const result = await fileUploadService.processUploadedFiles(uploadedFiles);

    res.json(result);
  } catch (error) {
    console.error('File upload error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to process uploaded files'
    });
  }
});

/**
 * GET /api/file-upload/:uploadId/structure
 * Get file structure for an upload
 */
router.get('/:uploadId/structure', async (req, res) => {
  try {
    const { uploadId } = req.params;

    const structure = await fileUploadService.getFileStructure(uploadId);

    res.json({
      success: true,
      uploadId,
      structure
    });
  } catch (error) {
    console.error('Get file structure error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get file structure'
    });
  }
});

/**
 * GET /api/file-upload/:uploadId/file
 * Get file content
 */
router.get('/:uploadId/file', async (req, res) => {
  try {
    const { uploadId } = req.params;
    const { path: filePath } = req.query;

    if (!filePath || typeof filePath !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'File path is required'
      });
    }

    const fullPath = path.join(process.cwd(), 'uploads', uploadId, filePath);
    const content = await fileUploadService.readFileContent(fullPath);

    res.json({
      success: true,
      path: filePath,
      content
    });
  } catch (error) {
    console.error('Read file error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to read file'
    });
  }
});

/**
 * POST /api/file-upload/:uploadId/parse
 * Parse HTML file and extract resources
 */
router.post('/:uploadId/parse', async (req, res) => {
  try {
    const { uploadId } = req.params;
    const { htmlPath } = req.body;

    if (!htmlPath) {
      return res.status(400).json({
        success: false,
        error: 'HTML file path is required'
      });
    }

    const fullPath = path.join(process.cwd(), 'uploads', uploadId, htmlPath);
    const parsed = await fileUploadService.parseHtmlFile(fullPath);

    res.json({
      success: true,
      uploadId,
      ...parsed
    });
  } catch (error) {
    console.error('Parse HTML error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to parse HTML file'
    });
  }
});

/**
 * DELETE /api/file-upload/cleanup
 * Clean up old uploads
 */
router.delete('/cleanup', async (req, res) => {
  try {
    await fileUploadService.cleanupOldUploads();

    res.json({
      success: true,
      message: 'Old uploads cleaned up successfully'
    });
  } catch (error) {
    console.error('Cleanup error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to cleanup old uploads'
    });
  }
});

export default router;
