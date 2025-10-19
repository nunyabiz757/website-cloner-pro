import request from 'supertest';
import express from 'express';
import { Pool } from 'pg';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import fileServeRouter from '../routes/file-serve.routes.js';
import { PreSignedUrlUtil } from '../utils/presigned-url.util.js';
import { FileAccessService } from '../services/file-access.service.js';

/**
 * Pre-signed URL Tests
 * Tests file serving with secure pre-signed URLs
 */

describe('Pre-signed URL Tests', () => {
  let app: express.Application;
  let pool: Pool;
  let preSignedUtil: PreSignedUrlUtil;
  let fileAccessService: FileAccessService;
  let testUserId: string;
  let testFilePath: string;
  let uploadDir: string;

  beforeAll(async () => {
    // Setup test database
    pool = new Pool({
      connectionString: process.env.TEST_DATABASE_URL,
    });

    // Initialize services
    const signingKey = crypto.randomBytes(32).toString('hex');
    preSignedUtil = new PreSignedUrlUtil(signingKey);
    fileAccessService = new FileAccessService(pool);

    // Setup test user
    const userResult = await pool.query(
      `INSERT INTO users (email, password_hash, email_verified)
       VALUES ('test@example.com', 'hash', true)
       RETURNING id`
    );
    testUserId = userResult.rows[0].id;

    // Setup test file
    uploadDir = path.join(process.cwd(), 'test-uploads');
    await fs.mkdir(uploadDir, { recursive: true });
    testFilePath = 'test-file.txt';
    const fullPath = path.join(uploadDir, testFilePath);
    await fs.writeFile(fullPath, 'This is a test file for pre-signed URL testing.');

    // Setup Express app
    app = express();
    app.use(express.json());
    app.use('/api/files', fileServeRouter);

    process.env.UPLOAD_DIR = uploadDir;
  });

  afterAll(async () => {
    // Cleanup
    await fs.rm(uploadDir, { recursive: true, force: true });
    await pool.query('DELETE FROM file_access_logs');
    await pool.query('DELETE FROM file_access_tokens');
    await pool.query('DELETE FROM users WHERE id = $1', [testUserId]);
    await pool.end();
  });

  describe('Pre-signed URL Generation', () => {
    test('should generate valid pre-signed URL', () => {
      const result = preSignedUtil.generatePresignedUrl(
        testFilePath,
        'http://localhost:3000/api/files',
        {
          expiresIn: 3600,
          userId: testUserId,
        }
      );

      expect(result.url).toContain('http://localhost:3000/api/files?token=');
      expect(result.token).toBeTruthy();
      expect(result.expiresAt).toBeInstanceOf(Date);
      expect(result.filePath).toBe(testFilePath);
      expect(result.metadata?.userId).toBe(testUserId);
    });

    test('should generate URL with download limit', () => {
      const result = preSignedUtil.generatePresignedUrl(
        testFilePath,
        'http://localhost:3000/api/files',
        {
          expiresIn: 3600,
          maxDownloads: 5,
        }
      );

      expect(result.metadata?.maxDownloads).toBe(5);
    });

    test('should generate URL with IP restriction', () => {
      const result = preSignedUtil.generatePresignedUrl(
        testFilePath,
        'http://localhost:3000/api/files',
        {
          expiresIn: 3600,
          allowedIpAddress: '192.168.1.100',
        }
      );

      expect(result.metadata?.allowedIpAddress).toBe('192.168.1.100');
    });

    test('should generate URL with custom content type and filename', () => {
      const result = preSignedUtil.generatePresignedUrl(
        testFilePath,
        'http://localhost:3000/api/files',
        {
          expiresIn: 3600,
          contentType: 'text/plain',
          contentDisposition: 'attachment',
          filename: 'custom-name.txt',
        }
      );

      expect(result.url).toBeTruthy();
    });

    test('should generate quick download token (5 minutes)', () => {
      const token = preSignedUtil.generateQuickDownloadToken(
        testFilePath,
        testUserId
      );

      expect(token).toBeTruthy();

      const expiration = preSignedUtil.getTokenExpiration(token);
      expect(expiration).toBeInstanceOf(Date);

      const now = Date.now();
      const expirationTime = expiration!.getTime();
      const diffMinutes = (expirationTime - now) / 1000 / 60;

      expect(diffMinutes).toBeGreaterThan(4);
      expect(diffMinutes).toBeLessThanOrEqual(5);
    });

    test('should generate limited download token', () => {
      const token = preSignedUtil.generateLimitedDownloadToken(
        testFilePath,
        3, // max 3 downloads
        3600,
        testUserId
      );

      expect(token).toBeTruthy();
    });

    test('should generate IP-restricted token', () => {
      const token = preSignedUtil.generateIpRestrictedToken(
        testFilePath,
        '192.168.1.100',
        3600,
        testUserId
      );

      expect(token).toBeTruthy();
    });
  });

  describe('Token Validation', () => {
    test('should validate valid token', () => {
      const result = preSignedUtil.generatePresignedUrl(
        testFilePath,
        'http://localhost:3000/api/files',
        {
          expiresIn: 3600,
          userId: testUserId,
        }
      );

      const payload = preSignedUtil.validateToken(result.token, {
        userId: testUserId,
      });

      expect(payload).toBeTruthy();
      expect(payload?.filePath).toBe(testFilePath);
      expect(payload?.userId).toBe(testUserId);
    });

    test('should reject expired token', async () => {
      const result = preSignedUtil.generatePresignedUrl(
        testFilePath,
        'http://localhost:3000/api/files',
        {
          expiresIn: 1, // 1 second
        }
      );

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 1100));

      const payload = preSignedUtil.validateToken(result.token);

      expect(payload).toBeNull();
      expect(preSignedUtil.isTokenExpired(result.token)).toBe(true);
    });

    test('should reject token with wrong IP address', () => {
      const result = preSignedUtil.generatePresignedUrl(
        testFilePath,
        'http://localhost:3000/api/files',
        {
          expiresIn: 3600,
          allowedIpAddress: '192.168.1.100',
        }
      );

      const payload = preSignedUtil.validateToken(result.token, {
        ipAddress: '192.168.1.101', // Different IP
      });

      expect(payload).toBeNull();
    });

    test('should reject token with wrong user ID', () => {
      const result = preSignedUtil.generatePresignedUrl(
        testFilePath,
        'http://localhost:3000/api/files',
        {
          expiresIn: 3600,
          userId: testUserId,
        }
      );

      const payload = preSignedUtil.validateToken(result.token, {
        userId: 'different-user-id',
      });

      expect(payload).toBeNull();
    });

    test('should reject tampered token', () => {
      const result = preSignedUtil.generatePresignedUrl(
        testFilePath,
        'http://localhost:3000/api/files',
        {
          expiresIn: 3600,
        }
      );

      // Tamper with token
      const tamperedToken = result.token.substring(0, result.token.length - 5) + 'AAAAA';

      const payload = preSignedUtil.validateToken(tamperedToken);

      expect(payload).toBeNull();
    });

    test('should reject invalid token format', () => {
      const payload = preSignedUtil.validateToken('invalid-token-format');

      expect(payload).toBeNull();
    });

    test('should get file path from valid token', () => {
      const result = preSignedUtil.generatePresignedUrl(
        testFilePath,
        'http://localhost:3000/api/files',
        {
          expiresIn: 3600,
        }
      );

      const filePath = preSignedUtil.getFilePathFromToken(result.token);

      expect(filePath).toBe(testFilePath);
    });

    test('should return null file path for invalid token', () => {
      const filePath = preSignedUtil.getFilePathFromToken('invalid-token');

      expect(filePath).toBeNull();
    });
  });

  describe('File Serving', () => {
    test('should serve file with valid token', async () => {
      const result = preSignedUtil.generatePresignedUrl(
        testFilePath,
        'http://localhost:3000/api/files',
        {
          expiresIn: 3600,
        }
      );

      // Store token in database
      await fileAccessService.createToken({
        token: result.token,
        filePath: testFilePath,
        expiresAt: result.expiresAt,
      });

      const response = await request(app)
        .get(`/api/files/${result.token}`)
        .expect(200);

      expect(response.text).toBe('This is a test file for pre-signed URL testing.');
      expect(response.headers['content-type']).toContain('text/plain');
    });

    test('should reject file serving with invalid token', async () => {
      const response = await request(app)
        .get('/api/files/invalid-token')
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid or expired access token');
    });

    test('should reject file serving with expired token', async () => {
      const result = preSignedUtil.generatePresignedUrl(
        testFilePath,
        'http://localhost:3000/api/files',
        {
          expiresIn: 1,
        }
      );

      await fileAccessService.createToken({
        token: result.token,
        filePath: testFilePath,
        expiresAt: result.expiresAt,
      });

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 1100));

      const response = await request(app)
        .get(`/api/files/${result.token}`)
        .expect(403);

      expect(response.body.success).toBe(false);
    });

    test('should reject directory traversal attempt', async () => {
      const maliciousPath = '../../../etc/passwd';

      const result = preSignedUtil.generatePresignedUrl(
        maliciousPath,
        'http://localhost:3000/api/files',
        {
          expiresIn: 3600,
        }
      );

      const response = await request(app)
        .get(`/api/files/${result.token}`)
        .expect(403);

      expect(response.body.error).toContain('Invalid file path');
    });

    test('should reject non-existent file', async () => {
      const result = preSignedUtil.generatePresignedUrl(
        'non-existent-file.txt',
        'http://localhost:3000/api/files',
        {
          expiresIn: 3600,
        }
      );

      await fileAccessService.createToken({
        token: result.token,
        filePath: 'non-existent-file.txt',
        expiresAt: result.expiresAt,
      });

      const response = await request(app)
        .get(`/api/files/${result.token}`)
        .expect(404);

      expect(response.body.error).toContain('File not found');
    });

    test('should enforce download limit', async () => {
      const result = preSignedUtil.generatePresignedUrl(
        testFilePath,
        'http://localhost:3000/api/files',
        {
          expiresIn: 3600,
          maxDownloads: 2,
        }
      );

      await fileAccessService.createToken({
        token: result.token,
        filePath: testFilePath,
        expiresAt: result.expiresAt,
        maxDownloads: 2,
      });

      // First download - should succeed
      await request(app).get(`/api/files/${result.token}`).expect(200);

      // Second download - should succeed
      await request(app).get(`/api/files/${result.token}`).expect(200);

      // Third download - should fail (limit exceeded)
      const response = await request(app)
        .get(`/api/files/${result.token}`)
        .expect(429);

      expect(response.body.error).toContain('Download limit exceeded');
    });

    test('should serve file with custom filename', async () => {
      const result = preSignedUtil.generatePresignedUrl(
        testFilePath,
        'http://localhost:3000/api/files',
        {
          expiresIn: 3600,
          filename: 'custom-download-name.txt',
          contentDisposition: 'attachment',
        }
      );

      await fileAccessService.createToken({
        token: result.token,
        filePath: testFilePath,
        expiresAt: result.expiresAt,
        customFilename: 'custom-download-name.txt',
        contentDisposition: 'attachment',
      });

      const response = await request(app)
        .get(`/api/files/${result.token}`)
        .expect(200);

      expect(response.headers['content-disposition']).toContain('attachment');
      expect(response.headers['content-disposition']).toContain('custom-download-name.txt');
    });

    test('should handle HEAD requests', async () => {
      const result = preSignedUtil.generatePresignedUrl(
        testFilePath,
        'http://localhost:3000/api/files',
        {
          expiresIn: 3600,
        }
      );

      await fileAccessService.createToken({
        token: result.token,
        filePath: testFilePath,
        expiresAt: result.expiresAt,
      });

      const response = await request(app)
        .head(`/api/files/${result.token}`)
        .expect(200);

      expect(response.headers['content-type']).toContain('text/plain');
      expect(response.headers['content-length']).toBeTruthy();
      expect(response.text).toBeFalsy(); // No body for HEAD request
    });
  });

  describe('File Access Service', () => {
    test('should create token in database', async () => {
      const result = preSignedUtil.generatePresignedUrl(
        testFilePath,
        'http://localhost:3000/api/files',
        {
          expiresIn: 3600,
          maxDownloads: 5,
          userId: testUserId,
        }
      );

      const tokenId = await fileAccessService.createToken({
        token: result.token,
        filePath: testFilePath,
        userId: testUserId,
        expiresAt: result.expiresAt,
        maxDownloads: 5,
      });

      expect(tokenId).toBeTruthy();

      // Verify token exists
      const storedToken = await fileAccessService.getToken(result.token);
      expect(storedToken).toBeTruthy();
      expect(storedToken?.filePath).toBe(testFilePath);
      expect(storedToken?.maxDownloads).toBe(5);
    });

    test('should check download limit', async () => {
      const result = preSignedUtil.generatePresignedUrl(
        testFilePath,
        'http://localhost:3000/api/files',
        {
          expiresIn: 3600,
          maxDownloads: 1,
        }
      );

      await fileAccessService.createToken({
        token: result.token,
        filePath: testFilePath,
        expiresAt: result.expiresAt,
        maxDownloads: 1,
      });

      // Check limit before download
      let canDownload = await fileAccessService.checkDownloadLimit(result.token);
      expect(canDownload).toBe(true);

      // Increment download count
      await fileAccessService.incrementDownloadCount(result.token);

      // Check limit after download
      canDownload = await fileAccessService.checkDownloadLimit(result.token);
      expect(canDownload).toBe(false);
    });

    test('should revoke token', async () => {
      const result = preSignedUtil.generatePresignedUrl(
        testFilePath,
        'http://localhost:3000/api/files',
        {
          expiresIn: 3600,
        }
      );

      await fileAccessService.createToken({
        token: result.token,
        filePath: testFilePath,
        expiresAt: result.expiresAt,
      });

      // Revoke token
      await fileAccessService.revokeToken(
        result.token,
        testUserId,
        'Test revocation'
      );

      // Token should still exist but marked as revoked
      const storedToken = await fileAccessService.getToken(result.token);
      expect(storedToken?.isRevoked).toBe(true);
    });

    test('should log file access', async () => {
      const logId = await fileAccessService.logAccess({
        filePath: testFilePath,
        fileSize: 1024,
        contentType: 'text/plain',
        userId: testUserId,
        ipAddress: '192.168.1.100',
        userAgent: 'Test Agent',
        method: 'GET',
        statusCode: 200,
        bytesSent: 1024,
        durationMs: 50,
        accessGranted: true,
      });

      expect(logId).toBeTruthy();

      // Verify log was created
      const logs = await fileAccessService.getAccessLogs(1, testFilePath);
      expect(logs.length).toBeGreaterThan(0);
      expect(logs[0].filePath).toBe(testFilePath);
      expect(logs[0].accessGranted).toBe(true);
    });

    test('should get access logs', async () => {
      // Create multiple log entries
      for (let i = 0; i < 3; i++) {
        await fileAccessService.logAccess({
          filePath: testFilePath,
          method: 'GET',
          statusCode: 200,
          durationMs: 50,
          accessGranted: true,
        });
      }

      const logs = await fileAccessService.getAccessLogs(10, testFilePath);
      expect(logs.length).toBeGreaterThanOrEqual(3);
    });

    test('should get file access statistics', async () => {
      const stats = await fileAccessService.getStatistics(7);

      expect(stats.totalAccesses).toBeGreaterThanOrEqual(0);
      expect(stats.uniqueFiles).toBeGreaterThanOrEqual(0);
      expect(stats.accessesByStatus).toBeDefined();
      expect(stats.topFiles).toBeInstanceOf(Array);
    });

    test('should get user tokens', async () => {
      const result = preSignedUtil.generatePresignedUrl(
        testFilePath,
        'http://localhost:3000/api/files',
        {
          expiresIn: 3600,
          userId: testUserId,
        }
      );

      await fileAccessService.createToken({
        token: result.token,
        filePath: testFilePath,
        userId: testUserId,
        expiresAt: result.expiresAt,
      });

      const tokens = await fileAccessService.getUserTokens(testUserId);
      expect(tokens.length).toBeGreaterThan(0);
      expect(tokens[0].userId).toBe(testUserId);
    });

    test('should get file tokens', async () => {
      const tokens = await fileAccessService.getFileTokens(testFilePath);
      expect(tokens.length).toBeGreaterThanOrEqual(0);
    });

    test('should cleanup expired tokens', async () => {
      const deletedCount = await fileAccessService.cleanupExpiredTokens(30);
      expect(deletedCount).toBeGreaterThanOrEqual(0);
    });

    test('should cleanup old logs', async () => {
      const deletedCount = await fileAccessService.cleanupOldLogs(90);
      expect(deletedCount).toBeGreaterThanOrEqual(0);
    });

    test('should detect suspicious access patterns', async () => {
      // Create multiple denied access attempts
      for (let i = 0; i < 6; i++) {
        await fileAccessService.logAccess({
          filePath: testFilePath,
          ipAddress: '192.168.1.200',
          method: 'GET',
          statusCode: 403,
          durationMs: 10,
          accessGranted: false,
          denialReason: 'Invalid token',
        });
      }

      const suspicious = await fileAccessService.getSuspiciousAccess();
      expect(suspicious.length).toBeGreaterThan(0);

      const suspiciousEntry = suspicious.find(
        (s) => s.ipAddress === '192.168.1.200'
      );
      expect(suspiciousEntry).toBeDefined();
      expect(suspiciousEntry?.deniedAttempts).toBeGreaterThanOrEqual(5);
    });
  });

  describe('Token Security', () => {
    test('should generate unique tokens for same file', () => {
      const result1 = preSignedUtil.generatePresignedUrl(
        testFilePath,
        'http://localhost:3000/api/files',
        { expiresIn: 3600 }
      );

      const result2 = preSignedUtil.generatePresignedUrl(
        testFilePath,
        'http://localhost:3000/api/files',
        { expiresIn: 3600 }
      );

      expect(result1.token).not.toBe(result2.token);
    });

    test('should include nonce in token payload', () => {
      const result = preSignedUtil.generatePresignedUrl(
        testFilePath,
        'http://localhost:3000/api/files',
        { expiresIn: 3600 }
      );

      const payload = preSignedUtil.validateToken(result.token);
      expect(payload?.nonce).toBeTruthy();
      expect(payload?.nonce.length).toBe(32); // 16 bytes as hex
    });

    test('should use authenticated encryption', () => {
      const result = preSignedUtil.generatePresignedUrl(
        testFilePath,
        'http://localhost:3000/api/files',
        { expiresIn: 3600 }
      );

      // Token should contain encrypted data with auth tag
      const tokenData = JSON.parse(
        Buffer.from(result.token, 'base64url').toString('utf8')
      );

      expect(tokenData.iv).toBeTruthy();
      expect(tokenData.data).toBeTruthy();
      expect(tokenData.tag).toBeTruthy(); // Authentication tag
    });

    test('should generate revocation hash', () => {
      const result = preSignedUtil.generatePresignedUrl(
        testFilePath,
        'http://localhost:3000/api/files',
        { expiresIn: 3600 }
      );

      const hash = preSignedUtil.generateRevocationHash(result.token);
      expect(hash).toBeTruthy();
      expect(hash.length).toBe(64); // SHA-256 hex
    });
  });
});
