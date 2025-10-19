import fs from 'fs/promises';
import path from 'path';
import AdmZip from 'adm-zip';
import tar from 'tar';
import {
  ArchiveUtil,
  ArchiveSecurityError,
  ArchiveExtractionOptions,
} from '../utils/archive.util.js';

/**
 * Archive Utility Tests
 * Tests safe archive extraction with decompression bomb prevention
 */

describe('Archive Utility Tests', () => {
  let archiveUtil: ArchiveUtil;
  let testDir: string;
  let archivesDir: string;
  let extractDir: string;

  beforeAll(async () => {
    testDir = path.join(process.cwd(), 'test-archives');
    archivesDir = path.join(testDir, 'archives');
    extractDir = path.join(testDir, 'extracted');

    await fs.mkdir(archivesDir, { recursive: true });
    await fs.mkdir(extractDir, { recursive: true });

    archiveUtil = new ArchiveUtil({
      maxTotalSize: 10 * 1024 * 1024, // 10 MB for tests
      maxFileSize: 5 * 1024 * 1024, // 5 MB for tests
      maxFiles: 100,
      maxNestingLevel: 2,
    });
  });

  afterAll(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('Archive Analysis', () => {
    test('should analyze simple ZIP archive', async () => {
      const zipPath = path.join(archivesDir, 'simple.zip');
      await createSimpleZip(zipPath);

      const info = await archiveUtil.analyzeArchive(zipPath);

      expect(info.totalFiles).toBeGreaterThan(0);
      expect(info.totalUncompressedSize).toBeGreaterThan(0);
      expect(info.compressionRatio).toBeGreaterThan(0);
      expect(info.files.length).toBe(info.totalFiles);
      expect(info.isSuspicious).toBe(false);
    });

    test('should analyze TAR archive', async () => {
      const tarPath = path.join(archivesDir, 'simple.tar');
      await createSimpleTar(tarPath);

      const info = await archiveUtil.analyzeArchive(tarPath);

      expect(info.totalFiles).toBeGreaterThan(0);
      expect(info.totalUncompressedSize).toBeGreaterThan(0);
      expect(info.files.length).toBe(info.totalFiles);
    });

    test('should detect high compression ratio', async () => {
      const zipPath = path.join(archivesDir, 'high-compression.zip');
      await createHighCompressionZip(zipPath);

      const info = await archiveUtil.analyzeArchive(zipPath);

      expect(info.compressionRatio).toBeGreaterThan(10);
      expect(info.isSuspicious).toBe(true);
      expect(info.warnings.length).toBeGreaterThan(0);
    });

    test('should detect nested archives', async () => {
      const zipPath = path.join(archivesDir, 'nested.zip');
      await createNestedZip(zipPath);

      const info = await archiveUtil.analyzeArchive(zipPath);

      expect(info.nestingLevel).toBeGreaterThan(0);
      expect(info.isSuspicious).toBe(true);
    });

    test('should detect path traversal attempts', async () => {
      const zipPath = path.join(archivesDir, 'traversal.zip');
      await createTraversalZip(zipPath);

      const info = await archiveUtil.analyzeArchive(zipPath);

      expect(info.isSuspicious).toBe(true);
      expect(info.warnings.some((w) => w.includes('Path traversal'))).toBe(true);
    });

    test('should reject unsupported format', async () => {
      const rarPath = path.join(archivesDir, 'test.rar');
      await fs.writeFile(rarPath, 'fake rar content');

      await expect(archiveUtil.analyzeArchive(rarPath)).rejects.toThrow(
        ArchiveSecurityError
      );
    });
  });

  describe('Archive Extraction', () => {
    test('should extract simple ZIP archive', async () => {
      const zipPath = path.join(archivesDir, 'extract-simple.zip');
      await createSimpleZip(zipPath);

      const extractPath = path.join(extractDir, 'extract-simple');
      const result = await archiveUtil.extractArchive(zipPath, { extractPath });

      expect(result.success).toBe(true);
      expect(result.extractedFiles.length).toBeGreaterThan(0);
      expect(result.errors.length).toBe(0);

      // Verify files exist
      for (const file of result.extractedFiles) {
        await expect(fs.access(file)).resolves.not.toThrow();
      }
    });

    test('should extract TAR archive', async () => {
      const tarPath = path.join(archivesDir, 'extract-tar.tar');
      await createSimpleTar(tarPath);

      const extractPath = path.join(extractDir, 'extract-tar');
      const result = await archiveUtil.extractArchive(tarPath, { extractPath });

      expect(result.success).toBe(true);
      expect(result.extractedFiles.length).toBeGreaterThan(0);
    });

    test('should reject extraction exceeding size limit', async () => {
      const zipPath = path.join(archivesDir, 'large.zip');
      await createLargeZip(zipPath, 15 * 1024 * 1024); // 15 MB (exceeds 10 MB limit)

      await expect(
        archiveUtil.extractArchive(zipPath, {
          extractPath: path.join(extractDir, 'large'),
        })
      ).rejects.toThrow(ArchiveSecurityError);
    });

    test('should reject extraction exceeding file count', async () => {
      const zipPath = path.join(archivesDir, 'many-files.zip');
      await createManyFilesZip(zipPath, 150); // 150 files (exceeds 100 limit)

      await expect(
        archiveUtil.extractArchive(zipPath, {
          extractPath: path.join(extractDir, 'many-files'),
        })
      ).rejects.toThrow(ArchiveSecurityError);
    });

    test('should reject decompression bomb', async () => {
      const zipPath = path.join(archivesDir, 'bomb.zip');
      await createDecompressionBomb(zipPath);

      await expect(
        archiveUtil.extractArchive(zipPath, {
          extractPath: path.join(extractDir, 'bomb'),
        })
      ).rejects.toThrow(ArchiveSecurityError);
    });

    test('should block path traversal during extraction', async () => {
      const zipPath = path.join(archivesDir, 'traversal-extract.zip');
      await createTraversalZip(zipPath);

      const extractPath = path.join(extractDir, 'traversal-extract');
      const result = await archiveUtil.extractArchive(zipPath, { extractPath });

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some((w) => w.includes('path traversal'))).toBe(true);

      // Verify no files outside extract path
      for (const file of result.extractedFiles) {
        const resolved = path.resolve(file);
        expect(resolved.startsWith(path.resolve(extractPath))).toBe(true);
      }
    });

    test('should respect overwrite option', async () => {
      const zipPath = path.join(archivesDir, 'overwrite.zip');
      await createSimpleZip(zipPath);

      const extractPath = path.join(extractDir, 'overwrite');

      // First extraction
      await archiveUtil.extractArchive(zipPath, { extractPath });

      // Second extraction without overwrite
      const result = await archiveUtil.extractArchive(zipPath, {
        extractPath,
        overwrite: false,
      });

      expect(result.warnings.some((w) => w.includes('already exists'))).toBe(true);
    });

    test('should filter by allowed extensions', async () => {
      const zipPath = path.join(archivesDir, 'mixed-extensions.zip');
      await createMixedExtensionsZip(zipPath);

      await expect(
        archiveUtil.extractArchive(zipPath, {
          extractPath: path.join(extractDir, 'filtered'),
          allowedExtensions: ['.txt'],
        })
      ).rejects.toThrow(ArchiveSecurityError);
    });

    test('should handle empty archive', async () => {
      const zipPath = path.join(archivesDir, 'empty.zip');
      const zip = new AdmZip();
      zip.writeZip(zipPath);

      const extractPath = path.join(extractDir, 'empty');
      const result = await archiveUtil.extractArchive(zipPath, { extractPath });

      expect(result.success).toBe(true);
      expect(result.extractedFiles.length).toBe(0);
    });
  });

  describe('Nested Archive Detection', () => {
    test('should detect nested archives', async () => {
      const zipPath = path.join(archivesDir, 'detect-nested.zip');
      await createNestedZip(zipPath);

      const nested = await archiveUtil.detectNestedArchives(zipPath);

      expect(nested.length).toBeGreaterThan(0);
      expect(nested.some((f) => f.endsWith('.zip'))).toBe(true);
    });

    test('should calculate nesting level', async () => {
      const zipPath = path.join(archivesDir, 'nesting-level.zip');
      await createNestedZip(zipPath);

      const level = await archiveUtil.calculateNestingLevel(zipPath);

      expect(level).toBeGreaterThan(0);
    });

    test('should reject excessive nesting', async () => {
      const zipPath = path.join(archivesDir, 'deep-nested.zip');
      await createDeeplyNestedZip(zipPath);

      await expect(
        archiveUtil.extractArchive(zipPath, {
          extractPath: path.join(extractDir, 'deep-nested'),
          maxNestingLevel: 1,
        })
      ).rejects.toThrow(ArchiveSecurityError);
    });
  });

  describe('Archive Format Detection', () => {
    test('should identify ZIP archive', () => {
      expect(archiveUtil.isArchive('test.zip')).toBe(true);
    });

    test('should identify TAR archive', () => {
      expect(archiveUtil.isArchive('test.tar')).toBe(true);
      expect(archiveUtil.isArchive('test.tar.gz')).toBe(true);
      expect(archiveUtil.isArchive('test.tgz')).toBe(true);
    });

    test('should reject non-archive files', () => {
      expect(archiveUtil.isArchive('test.txt')).toBe(false);
      expect(archiveUtil.isArchive('test.jpg')).toBe(false);
    });
  });

  describe('Path Sanitization', () => {
    test('should sanitize safe paths', () => {
      // Accessing private method via reflection for testing
      const sanitizePath = (archiveUtil as any).sanitizePath.bind(archiveUtil);

      expect(sanitizePath('file.txt')).toBe('file.txt');
      expect(sanitizePath('folder/file.txt')).toBe('folder/file.txt');
    });

    test('should reject traversal paths', () => {
      const sanitizePath = (archiveUtil as any).sanitizePath.bind(archiveUtil);

      expect(sanitizePath('../file.txt')).toBeNull();
      expect(sanitizePath('../../etc/passwd')).toBeNull();
      expect(sanitizePath('/etc/passwd')).toBeNull();
    });

    test('should reject null bytes', () => {
      const sanitizePath = (archiveUtil as any).sanitizePath.bind(archiveUtil);

      expect(sanitizePath('file\0.txt')).toBeNull();
    });
  });

  describe('Streaming Extraction', () => {
    test('should extract TAR archive via streaming', async () => {
      const tarPath = path.join(archivesDir, 'stream-tar.tar');
      await createSimpleTar(tarPath);

      const extractPath = path.join(extractDir, 'stream-tar');
      const result = await archiveUtil.extractArchiveStreaming(
        tarPath,
        extractPath
      );

      expect(result.success).toBe(true);
      expect(result.extractedFiles.length).toBeGreaterThan(0);
    });

    test('should reject streaming for ZIP', async () => {
      const zipPath = path.join(archivesDir, 'stream-zip.zip');
      await createSimpleZip(zipPath);

      await expect(
        archiveUtil.extractArchiveStreaming(
          zipPath,
          path.join(extractDir, 'stream-zip')
        )
      ).rejects.toThrow(ArchiveSecurityError);
    });
  });

  describe('Security Events', () => {
    test('should log security event for path traversal', async () => {
      const zipPath = path.join(archivesDir, 'security-traversal.zip');
      await createTraversalZip(zipPath);

      const extractPath = path.join(extractDir, 'security-traversal');
      await archiveUtil.extractArchive(zipPath, { extractPath });

      // Security event should be logged (check logs in real implementation)
    });

    test('should log security event for decompression bomb', async () => {
      const zipPath = path.join(archivesDir, 'security-bomb.zip');
      await createDecompressionBomb(zipPath);

      await expect(
        archiveUtil.extractArchive(zipPath, {
          extractPath: path.join(extractDir, 'security-bomb'),
        })
      ).rejects.toThrow();

      // Security event should be logged
    });
  });

  // Helper functions to create test archives

  async function createSimpleZip(zipPath: string): Promise<void> {
    const zip = new AdmZip();
    zip.addFile('file1.txt', Buffer.from('Hello World 1'));
    zip.addFile('file2.txt', Buffer.from('Hello World 2'));
    zip.addFile('folder/file3.txt', Buffer.from('Hello World 3'));
    zip.writeZip(zipPath);
  }

  async function createSimpleTar(tarPath: string): Promise<void> {
    const tempDir = path.join(testDir, 'tar-temp');
    await fs.mkdir(tempDir, { recursive: true });

    await fs.writeFile(path.join(tempDir, 'file1.txt'), 'Hello World 1');
    await fs.writeFile(path.join(tempDir, 'file2.txt'), 'Hello World 2');

    await tar.create(
      {
        file: tarPath,
        cwd: tempDir,
      },
      ['file1.txt', 'file2.txt']
    );

    await fs.rm(tempDir, { recursive: true });
  }

  async function createHighCompressionZip(zipPath: string): Promise<void> {
    const zip = new AdmZip();
    // Create highly compressible content (repeated characters)
    const content = 'A'.repeat(1024 * 1024); // 1 MB of 'A's
    zip.addFile('repeated.txt', Buffer.from(content));
    zip.writeZip(zipPath);
  }

  async function createNestedZip(zipPath: string): Promise<void> {
    // Create inner zip
    const innerZip = new AdmZip();
    innerZip.addFile('inner.txt', Buffer.from('Inner content'));

    // Create outer zip with inner zip
    const outerZip = new AdmZip();
    outerZip.addFile('inner.zip', innerZip.toBuffer());
    outerZip.addFile('outer.txt', Buffer.from('Outer content'));
    outerZip.writeZip(zipPath);
  }

  async function createDeeplyNestedZip(zipPath: string): Promise<void> {
    // Create level 2 zip
    const level2Zip = new AdmZip();
    level2Zip.addFile('level2.txt', Buffer.from('Level 2'));

    // Create level 1 zip
    const level1Zip = new AdmZip();
    level1Zip.addFile('level2.zip', level2Zip.toBuffer());
    level1Zip.addFile('level1.txt', Buffer.from('Level 1'));

    // Create outer zip
    const outerZip = new AdmZip();
    outerZip.addFile('level1.zip', level1Zip.toBuffer());
    outerZip.addFile('outer.txt', Buffer.from('Outer'));
    outerZip.writeZip(zipPath);
  }

  async function createTraversalZip(zipPath: string): Promise<void> {
    const zip = new AdmZip();
    zip.addFile('../../../etc/passwd', Buffer.from('malicious'));
    zip.addFile('normal.txt', Buffer.from('Normal content'));
    zip.writeZip(zipPath);
  }

  async function createLargeZip(
    zipPath: string,
    totalSize: number
  ): Promise<void> {
    const zip = new AdmZip();
    const fileSize = 5 * 1024 * 1024; // 5 MB per file
    const fileCount = Math.ceil(totalSize / fileSize);

    for (let i = 0; i < fileCount; i++) {
      const content = Buffer.alloc(fileSize, 'X');
      zip.addFile(`large-file-${i}.bin`, content);
    }

    zip.writeZip(zipPath);
  }

  async function createManyFilesZip(
    zipPath: string,
    fileCount: number
  ): Promise<void> {
    const zip = new AdmZip();

    for (let i = 0; i < fileCount; i++) {
      zip.addFile(`file-${i}.txt`, Buffer.from(`Content ${i}`));
    }

    zip.writeZip(zipPath);
  }

  async function createDecompressionBomb(zipPath: string): Promise<void> {
    const zip = new AdmZip();

    // Create a file with highly repetitive content that compresses well
    // This creates a high compression ratio
    const bomSize = 100 * 1024 * 1024; // 100 MB uncompressed
    const content = Buffer.alloc(bomSize, 0); // All zeros compress extremely well

    zip.addFile('bomb.bin', content);
    zip.writeZip(zipPath);
  }

  async function createMixedExtensionsZip(zipPath: string): Promise<void> {
    const zip = new AdmZip();
    zip.addFile('file.txt', Buffer.from('Text file'));
    zip.addFile('file.jpg', Buffer.from('JPEG data'));
    zip.addFile('file.exe', Buffer.from('Executable'));
    zip.writeZip(zipPath);
  }
});
