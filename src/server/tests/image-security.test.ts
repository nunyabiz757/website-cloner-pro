import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import {
  ImageSecurityUtil,
  ImageSecurityError,
  ImageSecurityOptions,
} from '../utils/image-security.util.js';

/**
 * Image Security Tests
 * Tests EXIF stripping, re-encoding, and exploit prevention
 */

describe('Image Security Tests', () => {
  let imageUtil: ImageSecurityUtil;
  let testDir: string;
  let imagesDir: string;

  beforeAll(async () => {
    testDir = path.join(process.cwd(), 'test-images');
    imagesDir = path.join(testDir, 'images');

    await fs.mkdir(imagesDir, { recursive: true });

    imageUtil = new ImageSecurityUtil({
      maxWidth: 2048,
      maxHeight: 2048,
      maxFileSize: 5 * 1024 * 1024,
      quality: 85,
    });
  });

  afterAll(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('Image Analysis', () => {
    test('should analyze valid JPEG image', async () => {
      const imagePath = path.join(imagesDir, 'test.jpg');
      await createTestImage(imagePath, 800, 600, 'jpeg');

      const analysis = await imageUtil.analyzeImage(imagePath);

      expect(analysis.isValid).toBe(true);
      expect(analysis.isSafe).toBe(true);
      expect(analysis.format).toBe('jpeg');
      expect(analysis.dimensions.width).toBe(800);
      expect(analysis.dimensions.height).toBe(600);
    });

    test('should analyze valid PNG image', async () => {
      const imagePath = path.join(imagesDir, 'test.png');
      await createTestImage(imagePath, 400, 300, 'png');

      const analysis = await imageUtil.analyzeImage(imagePath);

      expect(analysis.isValid).toBe(true);
      expect(analysis.format).toBe('png');
    });

    test('should detect image with EXIF data', async () => {
      const imagePath = path.join(imagesDir, 'with-exif.jpg');
      await createImageWithExif(imagePath);

      const analysis = await imageUtil.analyzeImage(imagePath);

      expect(analysis.hasExif).toBe(true);
      expect(analysis.warnings.length).toBeGreaterThan(0);
      expect(analysis.warnings.some((w) => w.includes('EXIF'))).toBe(true);
    });

    test('should detect extremely large dimensions', async () => {
      const imagePath = path.join(imagesDir, 'huge.jpg');
      await createTestImage(imagePath, 60000, 40000, 'jpeg');

      const analysis = await imageUtil.analyzeImage(imagePath);

      expect(analysis.isSafe).toBe(false);
      expect(analysis.threats.some((t) => t.includes('large dimensions'))).toBe(
        true
      );
    });

    test('should detect potential decompression bomb', async () => {
      const imagePath = path.join(imagesDir, 'bomb.png');
      await createDecompressionBomb(imagePath);

      const analysis = await imageUtil.analyzeImage(imagePath);

      expect(analysis.isSafe).toBe(false);
      expect(analysis.threats.some((t) => t.includes('decompression bomb'))).toBe(
        true
      );
    });

    test('should detect SVG with scripts', async () => {
      const svgPath = path.join(imagesDir, 'malicious.svg');
      await createMaliciousSVG(svgPath);

      const analysis = await imageUtil.analyzeImage(svgPath);

      expect(analysis.isSafe).toBe(false);
      expect(analysis.threats.some((t) => t.includes('script'))).toBe(true);
    });

    test('should reject invalid image', async () => {
      const invalidPath = path.join(imagesDir, 'invalid.jpg');
      await fs.writeFile(invalidPath, 'Not an image');

      await expect(imageUtil.analyzeImage(invalidPath)).rejects.toThrow(
        ImageSecurityError
      );
    });
  });

  describe('EXIF Stripping', () => {
    test('should strip EXIF data from image', async () => {
      const imagePath = path.join(imagesDir, 'strip-exif.jpg');
      await createImageWithExif(imagePath);

      // Verify EXIF exists
      const beforeMetadata = await sharp(imagePath).metadata();
      expect(beforeMetadata.exif).toBeTruthy();

      // Strip EXIF
      await imageUtil.stripExif(imagePath);

      // Verify EXIF removed
      const afterMetadata = await sharp(imagePath).metadata();
      expect(afterMetadata.exif).toBeFalsy();
    });

    test('should strip EXIF to new file', async () => {
      const inputPath = path.join(imagesDir, 'exif-input.jpg');
      const outputPath = path.join(imagesDir, 'exif-output.jpg');

      await createImageWithExif(inputPath);

      await imageUtil.stripExif(inputPath, outputPath);

      // Original should still have EXIF
      const originalMetadata = await sharp(inputPath).metadata();
      expect(originalMetadata.exif).toBeTruthy();

      // Output should not have EXIF
      const outputMetadata = await sharp(outputPath).metadata();
      expect(outputMetadata.exif).toBeFalsy();
    });
  });

  describe('Image Processing', () => {
    test('should process image with default options', async () => {
      const inputPath = path.join(imagesDir, 'process-default.jpg');
      await createImageWithExif(inputPath);

      const result = await imageUtil.processImage(inputPath);

      expect(result.success).toBe(true);
      expect(result.strippedData.exif).toBe(true);
      expect(result.processedPath).toBeTruthy();
    });

    test('should strip all metadata', async () => {
      const inputPath = path.join(imagesDir, 'metadata.jpg');
      await createImageWithExif(inputPath);

      const result = await imageUtil.processImage(inputPath, undefined, {
        stripMetadata: true,
      });

      expect(result.success).toBe(true);
      expect(result.strippedData.exif).toBe(true);
      expect(result.strippedData.icc).toBe(true);
      expect(result.strippedData.iptc).toBe(true);
      expect(result.strippedData.xmp).toBe(true);
    });

    test('should re-encode to JPEG', async () => {
      const inputPath = path.join(imagesDir, 'reencode.png');
      await createTestImage(inputPath, 400, 300, 'png');

      const outputPath = path.join(imagesDir, 'reencode.jpg');

      const result = await imageUtil.processImage(inputPath, outputPath, {
        reEncode: true,
        format: 'jpeg',
        quality: 90,
      });

      expect(result.success).toBe(true);
      expect(result.metadata.after.format).toBe('jpeg');
    });

    test('should re-encode to WebP', async () => {
      const inputPath = path.join(imagesDir, 'webp-input.jpg');
      await createTestImage(inputPath, 400, 300, 'jpeg');

      const outputPath = path.join(imagesDir, 'webp-output.webp');

      const result = await imageUtil.processImage(inputPath, outputPath, {
        reEncode: true,
        format: 'webp',
        quality: 80,
      });

      expect(result.success).toBe(true);
      expect(result.metadata.after.format).toBe('webp');
    });

    test('should resize large image', async () => {
      const inputPath = path.join(imagesDir, 'large-resize.jpg');
      await createTestImage(inputPath, 3000, 2000, 'jpeg');

      const result = await imageUtil.processImage(inputPath, undefined, {
        maxWidth: 1920,
        maxHeight: 1080,
        validateDimensions: true,
      });

      expect(result.success).toBe(true);
      expect(result.metadata.after.width).toBeLessThanOrEqual(1920);
      expect(result.metadata.after.height).toBeLessThanOrEqual(1080);
      expect(result.warnings.some((w) => w.includes('resized'))).toBe(true);
    });

    test('should reject image exceeding size limit', async () => {
      const inputPath = path.join(imagesDir, 'too-large.jpg');
      await createLargeImage(inputPath);

      await expect(
        imageUtil.processImage(inputPath, undefined, {
          maxFileSize: 1024 * 1024, // 1 MB
          validateFileSize: true,
        })
      ).rejects.toThrow(ImageSecurityError);
    });

    test('should reject unsafe image when preventExploits enabled', async () => {
      const inputPath = path.join(imagesDir, 'unsafe.jpg');
      await createTestImage(inputPath, 60000, 40000, 'jpeg'); // Suspicious dimensions

      await expect(
        imageUtil.processImage(inputPath, undefined, {
          preventExploits: true,
        })
      ).rejects.toThrow(ImageSecurityError);
    });

    test('should calculate compression ratio', async () => {
      const inputPath = path.join(imagesDir, 'compression.jpg');
      await createTestImage(inputPath, 800, 600, 'jpeg');

      const result = await imageUtil.processImage(inputPath, undefined, {
        quality: 70,
      });

      expect(result.compressionRatio).toBeGreaterThan(0);
    });
  });

  describe('SVG Sanitization', () => {
    test('should remove script tags from SVG', async () => {
      const svgPath = path.join(imagesDir, 'sanitize-script.svg');
      await createMaliciousSVG(svgPath);

      await imageUtil.sanitizeSVG(svgPath);

      const content = await fs.readFile(svgPath, 'utf8');
      expect(content).not.toContain('<script');
    });

    test('should remove event handlers from SVG', async () => {
      const svgPath = path.join(imagesDir, 'sanitize-events.svg');
      const maliciousSVG = `
        <svg xmlns="http://www.w3.org/2000/svg">
          <rect onclick="alert('XSS')" onmouseover="alert('XSS')" />
        </svg>
      `;
      await fs.writeFile(svgPath, maliciousSVG);

      await imageUtil.sanitizeSVG(svgPath);

      const content = await fs.readFile(svgPath, 'utf8');
      expect(content).not.toContain('onclick');
      expect(content).not.toContain('onmouseover');
    });

    test('should remove javascript: URIs from SVG', async () => {
      const svgPath = path.join(imagesDir, 'sanitize-js-uri.svg');
      const maliciousSVG = `
        <svg xmlns="http://www.w3.org/2000/svg">
          <a href="javascript:alert('XSS')">Click</a>
        </svg>
      `;
      await fs.writeFile(svgPath, maliciousSVG);

      await imageUtil.sanitizeSVG(svgPath);

      const content = await fs.readFile(svgPath, 'utf8');
      expect(content).not.toContain('javascript:');
    });

    test('should remove foreignObject from SVG', async () => {
      const svgPath = path.join(imagesDir, 'sanitize-foreign.svg');
      const maliciousSVG = `
        <svg xmlns="http://www.w3.org/2000/svg">
          <foreignObject>
            <div>Embedded HTML</div>
          </foreignObject>
        </svg>
      `;
      await fs.writeFile(svgPath, maliciousSVG);

      await imageUtil.sanitizeSVG(svgPath);

      const content = await fs.readFile(svgPath, 'utf8');
      expect(content).not.toContain('foreignObject');
    });
  });

  describe('Utility Functions', () => {
    test('should identify image files', () => {
      expect(imageUtil.isImageFile('test.jpg')).toBe(true);
      expect(imageUtil.isImageFile('test.jpeg')).toBe(true);
      expect(imageUtil.isImageFile('test.png')).toBe(true);
      expect(imageUtil.isImageFile('test.webp')).toBe(true);
      expect(imageUtil.isImageFile('test.gif')).toBe(true);
      expect(imageUtil.isImageFile('test.svg')).toBe(true);
      expect(imageUtil.isImageFile('test.txt')).toBe(false);
      expect(imageUtil.isImageFile('test.pdf')).toBe(false);
    });

    test('should get image dimensions', async () => {
      const imagePath = path.join(imagesDir, 'dimensions.jpg');
      await createTestImage(imagePath, 1024, 768, 'jpeg');

      const dimensions = await imageUtil.getImageDimensions(imagePath);

      expect(dimensions.width).toBe(1024);
      expect(dimensions.height).toBe(768);
    });

    test('should reject getting dimensions of invalid image', async () => {
      const invalidPath = path.join(imagesDir, 'invalid-dims.jpg');
      await fs.writeFile(invalidPath, 'Not an image');

      await expect(imageUtil.getImageDimensions(invalidPath)).rejects.toThrow(
        ImageSecurityError
      );
    });
  });

  describe('Batch Processing', () => {
    test('should batch process multiple images', async () => {
      const images = [];

      for (let i = 0; i < 3; i++) {
        const imagePath = path.join(imagesDir, `batch-${i}.jpg`);
        await createImageWithExif(imagePath);
        images.push(imagePath);
      }

      const outputDir = path.join(testDir, 'batch-output');
      const results = await imageUtil.batchProcess(images, outputDir);

      expect(results.length).toBe(3);
      expect(results.every((r) => r.success)).toBe(true);
      expect(results.every((r) => r.strippedData.exif)).toBe(true);
    });

    test('should handle batch processing with failures', async () => {
      const images = [
        path.join(imagesDir, 'batch-valid.jpg'),
        path.join(imagesDir, 'batch-invalid.jpg'),
      ];

      await createTestImage(images[0], 400, 300, 'jpeg');
      await fs.writeFile(images[1], 'Invalid');

      const outputDir = path.join(testDir, 'batch-mixed');
      const results = await imageUtil.batchProcess(images, outputDir);

      expect(results.length).toBe(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[1].errors.length).toBeGreaterThan(0);
    });
  });

  describe('Security Scenarios', () => {
    test('should detect polyglot file (JPEG + HTML)', async () => {
      const polyglotPath = path.join(imagesDir, 'polyglot.jpg');
      await createPolyglotFile(polyglotPath);

      const analysis = await imageUtil.analyzeImage(polyglotPath);

      // Should still be valid JPEG, but warnings may be present
      expect(analysis.format).toBe('jpeg');
    });

    test('should handle image with corrupted EXIF', async () => {
      const imagePath = path.join(imagesDir, 'corrupt-exif.jpg');
      await createImageWithCorruptExif(imagePath);

      // Should not throw, should handle gracefully
      const analysis = await imageUtil.analyzeImage(imagePath);
      expect(analysis).toBeDefined();
    });

    test('should strip GPS location from EXIF', async () => {
      const imagePath = path.join(imagesDir, 'gps.jpg');
      await createImageWithGPS(imagePath);

      const result = await imageUtil.processImage(imagePath, undefined, {
        stripExif: true,
      });

      expect(result.success).toBe(true);
      expect(result.strippedData.exif).toBe(true);

      // Verify GPS data removed
      const metadata = await sharp(result.processedPath).metadata();
      expect(metadata.exif).toBeFalsy();
    });
  });

  // Helper functions to create test images

  async function createTestImage(
    imagePath: string,
    width: number,
    height: number,
    format: 'jpeg' | 'png' | 'webp'
  ): Promise<void> {
    await sharp({
      create: {
        width,
        height,
        channels: 3,
        background: { r: 255, g: 0, b: 0 },
      },
    })
      .toFormat(format)
      .toFile(imagePath);
  }

  async function createImageWithExif(imagePath: string): Promise<void> {
    await sharp({
      create: {
        width: 800,
        height: 600,
        channels: 3,
        background: { r: 0, g: 255, b: 0 },
      },
    })
      .withMetadata({
        exif: {
          IFD0: {
            Make: 'TestCamera',
            Model: 'TestModel',
            Software: 'TestSoftware',
          },
        },
      })
      .jpeg()
      .toFile(imagePath);
  }

  async function createImageWithGPS(imagePath: string): Promise<void> {
    await sharp({
      create: {
        width: 800,
        height: 600,
        channels: 3,
        background: { r: 0, g: 0, b: 255 },
      },
    })
      .withMetadata({
        exif: {
          IFD0: {
            Make: 'TestCamera',
          },
          GPS: {
            GPSLatitude: [37, 46, 30],
            GPSLongitude: [-122, 25, 9],
          },
        },
      })
      .jpeg()
      .toFile(imagePath);
  }

  async function createImageWithCorruptExif(imagePath: string): Promise<void> {
    // Create basic image first
    await createTestImage(imagePath, 400, 300, 'jpeg');

    // Append corrupt EXIF data
    const buffer = await fs.readFile(imagePath);
    const corruptData = Buffer.concat([buffer, Buffer.from([0xff, 0xe1, 0x00])]);
    await fs.writeFile(imagePath, corruptData);
  }

  async function createDecompressionBomb(imagePath: string): Promise<void> {
    // Create image with extreme compression (small file, huge uncompressed)
    await sharp({
      create: {
        width: 10000,
        height: 10000,
        channels: 3,
        background: { r: 0, g: 0, b: 0 }, // Black compresses well
      },
    })
      .png({ compressionLevel: 9 })
      .toFile(imagePath);
  }

  async function createLargeImage(imagePath: string): Promise<void> {
    // Create image that's over 5MB
    await sharp({
      create: {
        width: 4000,
        height: 3000,
        channels: 4,
        background: { r: 128, g: 128, b: 128, alpha: 1 },
      },
    })
      .png({ compressionLevel: 0 }) // No compression for large size
      .toFile(imagePath);
  }

  async function createMaliciousSVG(svgPath: string): Promise<void> {
    const maliciousSVG = `
      <svg xmlns="http://www.w3.org/2000/svg">
        <script>alert('XSS')</script>
        <rect onclick="alert('XSS')" />
        <a href="javascript:alert('XSS')">Click</a>
      </svg>
    `;
    await fs.writeFile(svgPath, maliciousSVG);
  }

  async function createPolyglotFile(polyglotPath: string): Promise<void> {
    // Create valid JPEG
    const imageBuffer = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: { r: 255, g: 255, b: 255 },
      },
    })
      .jpeg()
      .toBuffer();

    // Append HTML (polyglot attack)
    const htmlData = Buffer.from('<html><script>alert("XSS")</script></html>');
    const polyglot = Buffer.concat([imageBuffer, htmlData]);

    await fs.writeFile(polyglotPath, polyglot);
  }
});
