import multer, { FileFilterCallback } from 'multer';
import path from 'path';
import crypto from 'crypto';
import { Request } from 'express';
import { fileTypeFromBuffer } from 'file-type';
import sharp from 'sharp';
import NodeClam from 'clamscan';

/**
 * File Upload Security Middleware
 * Implements comprehensive file validation and virus scanning
 */

// Allowed file types with their MIME types and magic numbers
const ALLOWED_FILE_TYPES = {
  images: {
    mimes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'],
    extensions: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'],
    magicNumbers: {
      'ffd8ff': 'image/jpeg', // JPEG
      '89504e47': 'image/png', // PNG
      '47494638': 'image/gif', // GIF
      '52494646': 'image/webp', // WEBP (RIFF)
    },
  },
  documents: {
    mimes: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    extensions: ['.pdf', '.doc', '.docx'],
    magicNumbers: {
      '25504446': 'application/pdf', // PDF
      'd0cf11e0': 'application/msword', // DOC
      '504b0304': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // DOCX (ZIP)
    },
  },
  archives: {
    mimes: ['application/zip', 'application/x-rar-compressed', 'application/x-7z-compressed'],
    extensions: ['.zip', '.rar', '.7z'],
    magicNumbers: {
      '504b0304': 'application/zip', // ZIP
      '526172211a07': 'application/x-rar-compressed', // RAR
      '377abcaf271c': 'application/x-7z-compressed', // 7Z
    },
  },
};

// File size limits (in bytes)
const FILE_SIZE_LIMITS = {
  image: 10 * 1024 * 1024, // 10MB
  document: 50 * 1024 * 1024, // 50MB
  archive: 100 * 1024 * 1024, // 100MB
  default: 10 * 1024 * 1024, // 10MB
};

/**
 * Configure multer storage
 */
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = process.env.UPLOAD_DIR || './uploads';
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniquePrefix = crypto.randomBytes(16).toString('hex');
    const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    cb(null, `${uniquePrefix}-${Date.now()}-${sanitizedName}`);
  },
});

/**
 * Validate file type by checking magic numbers
 */
const validateMagicNumber = async (filePath: string): Promise<boolean> => {
  try {
    const fs = await import('fs/promises');
    const buffer = await fs.readFile(filePath);
    const fileType = await fileTypeFromBuffer(buffer);

    if (!fileType) {
      return false;
    }

    // Check if detected type is in allowed types
    for (const category of Object.values(ALLOWED_FILE_TYPES)) {
      if (category.mimes.includes(fileType.mime)) {
        return true;
      }
    }

    return false;
  } catch (error) {
    console.error('Magic number validation error:', error);
    return false;
  }
};

/**
 * Scan file for viruses using ClamAV
 */
let clamScannerInstance: any = null;

const getClamScanner = async () => {
  if (clamScannerInstance) {
    return clamScannerInstance;
  }

  try {
    const clamscan = await new NodeClam().init({
      clamdscan: {
        host: process.env.CLAMAV_HOST || 'localhost',
        port: parseInt(process.env.CLAMAV_PORT || '3310'),
      },
      preference: 'clamdscan',
    });
    clamScannerInstance = clamscan;
    return clamscan;
  } catch (error) {
    console.error('ClamAV initialization error:', error);
    return null;
  }
};

const scanFileForViruses = async (filePath: string): Promise<{ isInfected: boolean; viruses?: string[] }> => {
  try {
    const scanner = await getClamScanner();
    if (!scanner) {
      console.warn('ClamAV not available, skipping virus scan');
      return { isInfected: false };
    }

    const { isInfected, viruses } = await scanner.isInfected(filePath);
    return { isInfected, viruses };
  } catch (error) {
    console.error('Virus scanning error:', error);
    // In case of error, allow upload but log the issue
    return { isInfected: false };
  }
};

/**
 * File filter for multer
 */
const fileFilter = (req: Request, file: Express.Multer.File, cb: FileFilterCallback): void => {
  const ext = path.extname(file.originalname).toLowerCase();
  const mime = file.mimetype.toLowerCase();

  // Check if file extension and MIME type are allowed
  let isAllowed = false;
  for (const category of Object.values(ALLOWED_FILE_TYPES)) {
    if (category.extensions.includes(ext) && category.mimes.includes(mime)) {
      isAllowed = true;
      break;
    }
  }

  if (!isAllowed) {
    cb(new Error(`File type not allowed: ${ext} (${mime})`));
    return;
  }

  cb(null, true);
};

/**
 * Get file size limit based on file type
 */
const getFileSizeLimit = (file: Express.Multer.File): number => {
  const mime = file.mimetype.toLowerCase();

  if (mime.startsWith('image/')) {
    return FILE_SIZE_LIMITS.image;
  } else if (mime.includes('pdf') || mime.includes('document') || mime.includes('word')) {
    return FILE_SIZE_LIMITS.document;
  } else if (mime.includes('zip') || mime.includes('rar') || mime.includes('7z')) {
    return FILE_SIZE_LIMITS.archive;
  }

  return FILE_SIZE_LIMITS.default;
};

/**
 * Base upload middleware
 */
export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: Math.max(...Object.values(FILE_SIZE_LIMITS)),
    files: parseInt(process.env.MAX_FILES_PER_UPLOAD || '10'),
    fields: 20,
    fieldSize: 1024 * 1024, // 1MB per field
  },
});

/**
 * Single file upload with security checks
 */
export const uploadSingle = (fieldName: string) => {
  return [
    upload.single(fieldName),
    async (req: Request, res: any, next: any) => {
      try {
        if (!req.file) {
          return next();
        }

        // Validate magic number
        const isValidMagicNumber = await validateMagicNumber(req.file.path);
        if (!isValidMagicNumber) {
          const fs = await import('fs/promises');
          await fs.unlink(req.file.path); // Delete invalid file
          return res.status(400).json({
            success: false,
            error: 'Invalid file type detected',
            code: 'INVALID_FILE_TYPE',
          });
        }

        // Scan for viruses
        const { isInfected, viruses } = await scanFileForViruses(req.file.path);
        if (isInfected) {
          const fs = await import('fs/promises');
          await fs.unlink(req.file.path); // Delete infected file
          return res.status(400).json({
            success: false,
            error: 'File contains malware',
            code: 'MALWARE_DETECTED',
            viruses,
          });
        }

        // If it's an image, process it with sharp for additional validation
        if (req.file.mimetype.startsWith('image/')) {
          try {
            await sharp(req.file.path).metadata();
          } catch (error) {
            const fs = await import('fs/promises');
            await fs.unlink(req.file.path);
            return res.status(400).json({
              success: false,
              error: 'Invalid image file',
              code: 'INVALID_IMAGE',
            });
          }
        }

        next();
      } catch (error) {
        console.error('File upload validation error:', error);
        if (req.file) {
          const fs = await import('fs/promises');
          await fs.unlink(req.file.path).catch(() => {});
        }
        res.status(500).json({
          success: false,
          error: 'File upload validation failed',
          code: 'UPLOAD_VALIDATION_ERROR',
        });
      }
    },
  ];
};

/**
 * Multiple files upload with security checks
 */
export const uploadMultiple = (fieldName: string, maxCount: number = 10) => {
  return [
    upload.array(fieldName, maxCount),
    async (req: Request, res: any, next: any) => {
      try {
        if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
          return next();
        }

        const fs = await import('fs/promises');

        // Validate each file
        for (const file of req.files) {
          // Validate magic number
          const isValidMagicNumber = await validateMagicNumber(file.path);
          if (!isValidMagicNumber) {
            // Delete all uploaded files
            await Promise.all(req.files.map(f => fs.unlink(f.path).catch(() => {})));
            return res.status(400).json({
              success: false,
              error: `Invalid file type detected: ${file.originalname}`,
              code: 'INVALID_FILE_TYPE',
            });
          }

          // Scan for viruses
          const { isInfected, viruses } = await scanFileForViruses(file.path);
          if (isInfected) {
            // Delete all uploaded files
            await Promise.all(req.files.map(f => fs.unlink(f.path).catch(() => {})));
            return res.status(400).json({
              success: false,
              error: `Malware detected in file: ${file.originalname}`,
              code: 'MALWARE_DETECTED',
              viruses,
            });
          }

          // Validate images
          if (file.mimetype.startsWith('image/')) {
            try {
              await sharp(file.path).metadata();
            } catch (error) {
              await Promise.all(req.files.map(f => fs.unlink(f.path).catch(() => {})));
              return res.status(400).json({
                success: false,
                error: `Invalid image file: ${file.originalname}`,
                code: 'INVALID_IMAGE',
              });
            }
          }
        }

        next();
      } catch (error) {
        console.error('Multiple file upload validation error:', error);
        if (req.files && Array.isArray(req.files)) {
          const fs = await import('fs/promises');
          await Promise.all(req.files.map(f => fs.unlink(f.path).catch(() => {})));
        }
        res.status(500).json({
          success: false,
          error: 'File upload validation failed',
          code: 'UPLOAD_VALIDATION_ERROR',
        });
      }
    },
  ];
};

/**
 * Image optimization middleware
 * Optimizes uploaded images
 */
export const optimizeImage = async (req: Request, res: any, next: any): Promise<void> => {
  try {
    if (!req.file || !req.file.mimetype.startsWith('image/')) {
      return next();
    }

    const optimizedPath = req.file.path.replace(/\.(jpg|jpeg|png)$/i, '-optimized.$1');

    await sharp(req.file.path)
      .resize(2048, 2048, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .png({ compressionLevel: 9 })
      .toFile(optimizedPath);

    // Replace original with optimized
    const fs = await import('fs/promises');
    await fs.unlink(req.file.path);
    await fs.rename(optimizedPath, req.file.path);

    next();
  } catch (error) {
    console.error('Image optimization error:', error);
    next(); // Continue even if optimization fails
  }
};

/**
 * Clean up uploaded files on error
 */
export const cleanupUploadedFiles = (req: Request, res: any, next: any): void => {
  res.on('finish', async () => {
    if (res.statusCode >= 400) {
      const fs = await import('fs/promises');
      if (req.file) {
        await fs.unlink(req.file.path).catch(() => {});
      }
      if (req.files && Array.isArray(req.files)) {
        await Promise.all(req.files.map(f => fs.unlink(f.path).catch(() => {})));
      }
    }
  });
  next();
};

export { ALLOWED_FILE_TYPES, FILE_SIZE_LIMITS };
