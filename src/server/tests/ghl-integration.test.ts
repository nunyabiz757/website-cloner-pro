import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import { Pool } from 'pg';
import { GHLDetectionService } from '../services/ghl-detection.service.js';
import { RedisCacheService } from '../services/redis-cache.service.js';
import { CreditService } from '../services/credit.service.js';
import GHLAssetDownloadService from '../services/ghl-asset-download.service.js';

/**
 * GHL Integration Tests
 * Tests for GoHighLevel detection, cloning, credit consumption, and asset downloads
 */

describe('GHL Integration Tests', () => {
  let pool: Pool;
  let cache: RedisCacheService;
  let ghlDetectionService: GHLDetectionService;
  let creditService: CreditService;
  let assetDownloadService: GHLAssetDownloadService;
  let testUserId: string;

  beforeAll(async () => {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgresql://localhost/test_db',
      max: 10,
    });

    cache = new RedisCacheService();
    ghlDetectionService = new GHLDetectionService(pool, cache);
    creditService = new CreditService(pool, cache);
    assetDownloadService = new GHLAssetDownloadService(pool);

    // Create test user
    const userResult = await pool.query(
      `INSERT INTO users (email, username, password_hash, email_verified)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      ['ghl-test@example.com', 'ghltest', 'hashed_password', true]
    );
    testUserId = userResult.rows[0].id;

    // Initialize user credits
    await pool.query(
      `INSERT INTO credits (user_id, credits_available)
       VALUES ($1, $2)`,
      [testUserId, 100]
    );
  });

  afterAll(async () => {
    // Cleanup test data
    await pool.query('DELETE FROM users WHERE email = $1', ['ghl-test@example.com']);
    await pool.end();
    await cache.disconnect();
  });

  describe('GHL Detection Service', () => {
    it('should detect GoHighLevel site from domain', async () => {
      const url = 'https://example.gohighlevel.com/page';

      const result = await ghlDetectionService.detectGHLSite(url);

      expect(result.isGHLSite).toBe(true);
      expect(result.confidence).toBeGreaterThanOrEqual(40); // Domain match = 40%
      expect(result.detectionMethod).toContain('domain_pattern');
    });

    it('should detect non-GHL site', async () => {
      const url = 'https://example.com/page';

      const result = await ghlDetectionService.detectGHLSite(url);

      expect(result.isGHLSite).toBe(false);
      expect(result.confidence).toBeLessThan(50);
    });

    it('should cache detection results', async () => {
      const url = 'https://cached-test.gohighlevel.com';

      // First call
      const result1 = await ghlDetectionService.detectGHLSite(url);

      // Second call (should be cached)
      const result2 = await ghlDetectionService.detectGHLSite(url);

      expect(result1).toEqual(result2);
      expect(result1.isGHLSite).toBe(true);
    });

    it('should handle invalid URLs gracefully', async () => {
      const invalidUrl = 'not-a-url';

      await expect(
        ghlDetectionService.detectGHLSite(invalidUrl)
      ).rejects.toThrow();
    });

    it('should detect multiple GHL domains', () => {
      const ghlDomains = [
        'test.gohighlevel.com',
        'test.highlevelsite.com',
        'test.leadconnectorhq.com',
        'test.msgsndr.com',
      ];

      ghlDomains.forEach(domain => {
        const result = ghlDetectionService['detectGHLPatterns'](`https://${domain}`);
        expect(result.isGHLSite).toBe(true);
      });
    });
  });

  describe('Credit Consumption Flow', () => {
    beforeEach(async () => {
      // Reset credits
      await pool.query(
        'UPDATE credits SET credits_available = $1 WHERE user_id = $2',
        [100, testUserId]
      );
    });

    it('should consume credits successfully for GHL clone', async () => {
      const initialCredits = await pool.query(
        'SELECT credits_available FROM credits WHERE user_id = $1',
        [testUserId]
      );

      const result = await creditService.consumeCredits(testUserId, 1, {
        operation: 'ghl_clone',
        resourceType: 'ghl_page',
        description: 'Clone GHL page',
      });

      expect(result.success).toBe(true);
      expect(result.creditsAfter).toBe(initialCredits.rows[0].credits_available - 1);

      // Verify transaction record
      const transaction = await pool.query(
        `SELECT * FROM credit_transactions
         WHERE user_id = $1 AND transaction_type = 'debit'
         ORDER BY created_at DESC LIMIT 1`,
        [testUserId]
      );

      expect(transaction.rows.length).toBe(1);
      expect(transaction.rows[0].amount).toBe(-1);
      expect(transaction.rows[0].description).toContain('Clone GHL page');
    });

    it('should fail credit consumption when insufficient credits', async () => {
      // Set credits to 0
      await pool.query(
        'UPDATE credits SET credits_available = $1 WHERE user_id = $2',
        [0, testUserId]
      );

      const result = await creditService.consumeCredits(testUserId, 1, {
        operation: 'ghl_clone',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Insufficient credits');
    });

    it('should add credits successfully', async () => {
      const result = await creditService.addCredits(
        testUserId,
        50,
        'purchase',
        99.99,
        'test_payment_intent_123',
        undefined,
        undefined,
        'Test credit purchase'
      );

      expect(result.success).toBe(true);
      expect(result.creditsAfter).toBeGreaterThan(100);

      // Verify transaction
      const transaction = await pool.query(
        `SELECT * FROM credit_transactions
         WHERE user_id = $1 AND transaction_type = 'credit'
         ORDER BY created_at DESC LIMIT 1`,
        [testUserId]
      );

      expect(transaction.rows.length).toBe(1);
      expect(transaction.rows[0].amount).toBe(50);
    });

    it('should track credit consumption metadata', async () => {
      const metadata = {
        operation: 'ghl_clone',
        resourceType: 'ghl_page',
        resourceId: 'test-page-id',
        sourceUrl: 'https://test.gohighlevel.com',
      };

      await creditService.consumeCredits(testUserId, 1, metadata);

      const transaction = await pool.query(
        `SELECT metadata FROM credit_transactions
         WHERE user_id = $1
         ORDER BY created_at DESC LIMIT 1`,
        [testUserId]
      );

      expect(transaction.rows[0].metadata).toMatchObject(metadata);
    });
  });

  describe('GHL Cloned Pages', () => {
    let clonedPageId: string;

    beforeEach(async () => {
      // Create test cloned page
      const pageResult = await pool.query(
        `INSERT INTO ghl_cloned_pages (
          user_id, source_url, source_domain, source_title,
          clone_status, credits_consumed, html_content, assets
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id`,
        [
          testUserId,
          'https://test.gohighlevel.com/page',
          'test.gohighlevel.com',
          'Test GHL Page',
          'copied',
          1,
          '<html><body><h1>Test</h1></body></html>',
          JSON.stringify({
            images: ['https://test.gohighlevel.com/image1.jpg'],
            videos: [],
            stylesheets: ['https://test.gohighlevel.com/style.css'],
            scripts: [],
          }),
        ]
      );
      clonedPageId = pageResult.rows[0].id;
    });

    afterEach(async () => {
      await pool.query('DELETE FROM ghl_cloned_pages WHERE id = $1', [clonedPageId]);
    });

    it('should create cloned page successfully', async () => {
      const page = await pool.query(
        'SELECT * FROM ghl_cloned_pages WHERE id = $1',
        [clonedPageId]
      );

      expect(page.rows.length).toBe(1);
      expect(page.rows[0].user_id).toBe(testUserId);
      expect(page.rows[0].clone_status).toBe('copied');
    });

    it('should retrieve cloned page with assets', async () => {
      const page = await pool.query(
        'SELECT * FROM ghl_cloned_pages WHERE id = $1',
        [clonedPageId]
      );

      const assets = page.rows[0].assets;
      expect(assets.images).toHaveLength(1);
      expect(assets.stylesheets).toHaveLength(1);
    });

    it('should update clone status', async () => {
      await pool.query(
        `UPDATE ghl_cloned_pages
         SET clone_status = $1, completed_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        ['pasted', clonedPageId]
      );

      const page = await pool.query(
        'SELECT clone_status, completed_at FROM ghl_cloned_pages WHERE id = $1',
        [clonedPageId]
      );

      expect(page.rows[0].clone_status).toBe('pasted');
      expect(page.rows[0].completed_at).not.toBeNull();
    });

    it('should enforce expiration date', async () => {
      await pool.query(
        `UPDATE ghl_cloned_pages
         SET expires_at = CURRENT_TIMESTAMP - INTERVAL '1 day'
         WHERE id = $1`,
        [clonedPageId]
      );

      const expiredPages = await pool.query(
        `SELECT id FROM ghl_cloned_pages
         WHERE id = $1 AND expires_at < CURRENT_TIMESTAMP`,
        [clonedPageId]
      );

      expect(expiredPages.rows.length).toBe(1);
    });
  });

  describe('GHL Templates', () => {
    let clonedPageId: string;
    let templateId: string;

    beforeEach(async () => {
      // Create cloned page for template
      const pageResult = await pool.query(
        `INSERT INTO ghl_cloned_pages (
          user_id, source_url, source_domain, source_title,
          clone_status, credits_consumed, html_content
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id`,
        [
          testUserId,
          'https://template.gohighlevel.com/page',
          'template.gohighlevel.com',
          'Template Page',
          'copied',
          1,
          '<html><body><h1>Template</h1></body></html>',
        ]
      );
      clonedPageId = pageResult.rows[0].id;
    });

    afterEach(async () => {
      if (templateId) {
        await pool.query('DELETE FROM ghl_clone_templates WHERE id = $1', [templateId]);
      }
      await pool.query('DELETE FROM ghl_cloned_pages WHERE id = $1', [clonedPageId]);
    });

    it('should create template from cloned page', async () => {
      const templateResult = await pool.query(
        `INSERT INTO ghl_clone_templates (
          user_id, cloned_page_id, name, description, category, is_public
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id`,
        [testUserId, clonedPageId, 'Test Template', 'A test template', 'landing_page', false]
      );

      templateId = templateResult.rows[0].id;

      const template = await pool.query(
        'SELECT * FROM ghl_clone_templates WHERE id = $1',
        [templateId]
      );

      expect(template.rows.length).toBe(1);
      expect(template.rows[0].name).toBe('Test Template');
      expect(template.rows[0].is_public).toBe(false);
    });

    it('should increment template use count', async () => {
      const templateResult = await pool.query(
        `INSERT INTO ghl_clone_templates (
          user_id, cloned_page_id, name, use_count
        ) VALUES ($1, $2, $3, $4)
        RETURNING id`,
        [testUserId, clonedPageId, 'Use Count Test', 0]
      );

      templateId = templateResult.rows[0].id;

      // Increment use count
      await pool.query('SELECT increment_template_use_count($1)', [templateId]);

      const template = await pool.query(
        'SELECT use_count FROM ghl_clone_templates WHERE id = $1',
        [templateId]
      );

      expect(template.rows[0].use_count).toBe(1);
    });

    it('should list public templates only', async () => {
      const publicTemplateResult = await pool.query(
        `INSERT INTO ghl_clone_templates (
          user_id, cloned_page_id, name, is_public
        ) VALUES ($1, $2, $3, $4)
        RETURNING id`,
        [testUserId, clonedPageId, 'Public Template', true]
      );

      const publicTemplates = await pool.query(
        'SELECT * FROM ghl_clone_templates WHERE is_public = true'
      );

      expect(publicTemplates.rows.length).toBeGreaterThan(0);

      // Cleanup
      await pool.query('DELETE FROM ghl_clone_templates WHERE id = $1',
        [publicTemplateResult.rows[0].id]);
    });
  });

  describe('GHL Clone Sessions', () => {
    let clonedPageId: string;
    let sessionToken: string;

    beforeEach(async () => {
      // Create cloned page
      const pageResult = await pool.query(
        `INSERT INTO ghl_cloned_pages (
          user_id, source_url, source_domain, source_title,
          clone_status, credits_consumed, html_content
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id`,
        [
          testUserId,
          'https://session.gohighlevel.com/page',
          'session.gohighlevel.com',
          'Session Page',
          'copied',
          1,
          '<html><body><h1>Session</h1></body></html>',
        ]
      );
      clonedPageId = pageResult.rows[0].id;
    });

    afterEach(async () => {
      if (sessionToken) {
        await pool.query('DELETE FROM ghl_clone_sessions WHERE session_token = $1', [sessionToken]);
      }
      await pool.query('DELETE FROM ghl_cloned_pages WHERE id = $1', [clonedPageId]);
    });

    it('should create paste session', async () => {
      const sessionResult = await pool.query(
        `INSERT INTO ghl_clone_sessions (
          user_id, cloned_page_id, session_token, status,
          expires_at, browser_info
        ) VALUES ($1, $2, gen_random_uuid(), $3, CURRENT_TIMESTAMP + INTERVAL '1 hour', $4)
        RETURNING session_token`,
        [testUserId, clonedPageId, 'active', JSON.stringify({ browser: 'Chrome' })]
      );

      sessionToken = sessionResult.rows[0].session_token;

      const session = await pool.query(
        'SELECT * FROM ghl_clone_sessions WHERE session_token = $1',
        [sessionToken]
      );

      expect(session.rows.length).toBe(1);
      expect(session.rows[0].status).toBe('active');
    });

    it('should expire session after timeout', async () => {
      const expiredSessionResult = await pool.query(
        `INSERT INTO ghl_clone_sessions (
          user_id, cloned_page_id, session_token, status,
          expires_at
        ) VALUES ($1, $2, gen_random_uuid(), $3, CURRENT_TIMESTAMP - INTERVAL '1 hour')
        RETURNING session_token`,
        [testUserId, clonedPageId, 'active']
      );

      const expiredToken = expiredSessionResult.rows[0].session_token;

      const expiredSessions = await pool.query(
        `SELECT * FROM ghl_clone_sessions
         WHERE session_token = $1 AND expires_at < CURRENT_TIMESTAMP`,
        [expiredToken]
      );

      expect(expiredSessions.rows.length).toBe(1);

      // Cleanup
      await pool.query('DELETE FROM ghl_clone_sessions WHERE session_token = $1', [expiredToken]);
    });

    it('should mark session as completed', async () => {
      const sessionResult = await pool.query(
        `INSERT INTO ghl_clone_sessions (
          user_id, cloned_page_id, session_token, status,
          expires_at
        ) VALUES ($1, $2, gen_random_uuid(), $3, CURRENT_TIMESTAMP + INTERVAL '1 hour')
        RETURNING session_token`,
        [testUserId, clonedPageId, 'active']
      );

      sessionToken = sessionResult.rows[0].session_token;

      await pool.query(
        `UPDATE ghl_clone_sessions
         SET status = $1, pasted_at = CURRENT_TIMESTAMP
         WHERE session_token = $2`,
        ['completed', sessionToken]
      );

      const session = await pool.query(
        'SELECT status, pasted_at FROM ghl_clone_sessions WHERE session_token = $1',
        [sessionToken]
      );

      expect(session.rows[0].status).toBe('completed');
      expect(session.rows[0].pasted_at).not.toBeNull();
    });
  });

  describe('Asset Download Service', () => {
    let clonedPageId: string;

    beforeEach(async () => {
      const pageResult = await pool.query(
        `INSERT INTO ghl_cloned_pages (
          user_id, source_url, source_domain, source_title,
          clone_status, credits_consumed, html_content, assets
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id`,
        [
          testUserId,
          'https://assets.gohighlevel.com/page',
          'assets.gohighlevel.com',
          'Assets Page',
          'copied',
          1,
          '<html><body><img src="/test.jpg"></body></html>',
          JSON.stringify({
            images: ['https://assets.gohighlevel.com/test.jpg'],
            videos: [],
            stylesheets: [],
            scripts: [],
          }),
        ]
      );
      clonedPageId = pageResult.rows[0].id;
    });

    afterEach(async () => {
      // Cleanup assets
      await pool.query('DELETE FROM ghl_page_assets WHERE cloned_page_id = $1', [clonedPageId]);
      await pool.query('DELETE FROM ghl_cloned_pages WHERE id = $1', [clonedPageId]);
    });

    it('should get asset download status', async () => {
      const status = await assetDownloadService.getAssetStatus(clonedPageId);

      expect(status).toHaveProperty('total');
      expect(status).toHaveProperty('downloaded');
      expect(status).toHaveProperty('failed');
      expect(status).toHaveProperty('pending');
      expect(status).toHaveProperty('percentComplete');
    });

    it('should track asset download in database', async () => {
      await pool.query(
        `INSERT INTO ghl_page_assets (
          cloned_page_id, asset_type, original_url, download_status
        ) VALUES ($1, $2, $3, $4)`,
        [clonedPageId, 'image', 'https://assets.gohighlevel.com/test.jpg', 'pending']
      );

      const assets = await pool.query(
        'SELECT * FROM ghl_page_assets WHERE cloned_page_id = $1',
        [clonedPageId]
      );

      expect(assets.rows.length).toBe(1);
      expect(assets.rows[0].download_status).toBe('pending');
    });

    it('should update asset download status to completed', async () => {
      const assetResult = await pool.query(
        `INSERT INTO ghl_page_assets (
          cloned_page_id, asset_type, original_url, download_status
        ) VALUES ($1, $2, $3, $4)
        RETURNING id`,
        [clonedPageId, 'image', 'https://assets.gohighlevel.com/test.jpg', 'pending']
      );

      const assetId = assetResult.rows[0].id;

      await pool.query(
        `UPDATE ghl_page_assets
         SET download_status = $1,
             downloaded_url = $2,
             file_size_bytes = $3
         WHERE id = $4`,
        ['downloaded', '/uploads/ghl-assets/test.jpg', 12345, assetId]
      );

      const asset = await pool.query(
        'SELECT * FROM ghl_page_assets WHERE id = $1',
        [assetId]
      );

      expect(asset.rows[0].download_status).toBe('downloaded');
      expect(asset.rows[0].downloaded_url).toBe('/uploads/ghl-assets/test.jpg');
      expect(asset.rows[0].file_size_bytes).toBe(12345);
    });

    it('should mark failed asset downloads', async () => {
      await pool.query(
        `INSERT INTO ghl_page_assets (
          cloned_page_id, asset_type, original_url,
          download_status, error_message
        ) VALUES ($1, $2, $3, $4, $5)`,
        [
          clonedPageId,
          'image',
          'https://assets.gohighlevel.com/404.jpg',
          'failed',
          'HTTP 404 Not Found',
        ]
      );

      const failedAssets = await pool.query(
        `SELECT * FROM ghl_page_assets
         WHERE cloned_page_id = $1 AND download_status = 'failed'`,
        [clonedPageId]
      );

      expect(failedAssets.rows.length).toBe(1);
      expect(failedAssets.rows[0].error_message).toContain('404');
    });
  });

  describe('Database Functions', () => {
    it('should call cleanup_expired_clone_sessions function', async () => {
      const result = await pool.query('SELECT cleanup_expired_clone_sessions() as count');

      expect(result.rows[0]).toHaveProperty('count');
      expect(typeof result.rows[0].count).toBe('number');
    });

    it('should call cleanup_expired_cloned_pages function', async () => {
      const result = await pool.query('SELECT cleanup_expired_cloned_pages() as count');

      expect(result.rows[0]).toHaveProperty('count');
      expect(typeof result.rows[0].count).toBe('number');
    });

    it('should call get_user_clone_stats function', async () => {
      const result = await pool.query('SELECT * FROM get_user_clone_stats($1)', [testUserId]);

      expect(result.rows[0]).toHaveProperty('total_clones');
      expect(result.rows[0]).toHaveProperty('successful_clones');
      expect(result.rows[0]).toHaveProperty('failed_clones');
    });

    it('should increment template use count', async () => {
      // Create template first
      const clonedPageResult = await pool.query(
        `INSERT INTO ghl_cloned_pages (
          user_id, source_url, source_domain, source_title,
          clone_status, credits_consumed, html_content
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id`,
        [testUserId, 'https://test.com', 'test.com', 'Test', 'copied', 1, '<html></html>']
      );

      const templateResult = await pool.query(
        `INSERT INTO ghl_clone_templates (
          user_id, cloned_page_id, name, use_count
        ) VALUES ($1, $2, $3, $4)
        RETURNING id`,
        [testUserId, clonedPageResult.rows[0].id, 'Function Test', 0]
      );

      const templateId = templateResult.rows[0].id;
      const initialCount = 0;

      await pool.query('SELECT increment_template_use_count($1)', [templateId]);

      const updated = await pool.query(
        'SELECT use_count FROM ghl_clone_templates WHERE id = $1',
        [templateId]
      );

      expect(updated.rows[0].use_count).toBe(initialCount + 1);

      // Cleanup
      await pool.query('DELETE FROM ghl_clone_templates WHERE id = $1', [templateId]);
      await pool.query('DELETE FROM ghl_cloned_pages WHERE id = $1', [clonedPageResult.rows[0].id]);
    });
  });

  describe('GHL Detection Accuracy', () => {
    const testCases = [
      {
        url: 'https://mysite.gohighlevel.com/landing-page',
        expected: true,
        reason: 'Primary GHL domain',
      },
      {
        url: 'https://demo.highlevelsite.com/page',
        expected: true,
        reason: 'HighLevel site domain',
      },
      {
        url: 'https://business.leadconnectorhq.com/funnel',
        expected: true,
        reason: 'LeadConnector domain',
      },
      {
        url: 'https://agent.msgsndr.com/widget',
        expected: true,
        reason: 'MsgSndr domain',
      },
      {
        url: 'https://example.com/page',
        expected: false,
        reason: 'Non-GHL domain',
      },
      {
        url: 'https://fake-gohighlevel.com/phishing',
        expected: false,
        reason: 'Similar but not actual GHL domain',
      },
    ];

    testCases.forEach(({ url, expected, reason }) => {
      it(`should ${expected ? 'detect' : 'not detect'} GHL site: ${reason}`, async () => {
        const result = await ghlDetectionService.detectGHLSite(url);
        expect(result.isGHLSite).toBe(expected);
      });
    });
  });

  describe('Credit Transaction History', () => {
    it('should maintain transaction history', async () => {
      // Perform multiple transactions
      await creditService.consumeCredits(testUserId, 1, { operation: 'clone1' });
      await creditService.consumeCredits(testUserId, 2, { operation: 'clone2' });
      await creditService.addCredits(testUserId, 10, 'purchase');

      const transactions = await pool.query(
        `SELECT * FROM credit_transactions
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT 3`,
        [testUserId]
      );

      expect(transactions.rows.length).toBe(3);
      expect(transactions.rows[0].transaction_type).toBe('credit'); // Latest is add
      expect(transactions.rows[1].amount).toBe(-2); // Second consumption
      expect(transactions.rows[2].amount).toBe(-1); // First consumption
    });

    it('should calculate running balance correctly', async () => {
      const beforeBalance = await pool.query(
        'SELECT credits_available FROM credits WHERE user_id = $1',
        [testUserId]
      );

      await creditService.consumeCredits(testUserId, 5, { operation: 'test' });

      const afterBalance = await pool.query(
        'SELECT credits_available FROM credits WHERE user_id = $1',
        [testUserId]
      );

      expect(afterBalance.rows[0].credits_available).toBe(
        beforeBalance.rows[0].credits_available - 5
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle non-existent user for credit operations', async () => {
      const fakeUserId = '00000000-0000-0000-0000-000000000000';

      await expect(
        creditService.consumeCredits(fakeUserId, 1, { operation: 'test' })
      ).rejects.toThrow();
    });

    it('should handle invalid cloned page ID', async () => {
      const fakePageId = '00000000-0000-0000-0000-000000000000';

      const status = await assetDownloadService.getAssetStatus(fakePageId);

      expect(status.total).toBe(0);
      expect(status.percentComplete).toBe(0);
    });

    it('should handle duplicate template creation attempt', async () => {
      const pageResult = await pool.query(
        `INSERT INTO ghl_cloned_pages (
          user_id, source_url, source_domain, source_title,
          clone_status, credits_consumed, html_content
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id`,
        [testUserId, 'https://dup.com', 'dup.com', 'Dup', 'copied', 1, '<html></html>']
      );

      const clonedPageId = pageResult.rows[0].id;

      // Create first template
      await pool.query(
        `INSERT INTO ghl_clone_templates (
          user_id, cloned_page_id, name
        ) VALUES ($1, $2, $3)`,
        [testUserId, clonedPageId, 'First Template']
      );

      // Attempt to create duplicate should be handled at application level
      const existingCheck = await pool.query(
        'SELECT id FROM ghl_clone_templates WHERE cloned_page_id = $1 AND user_id = $2',
        [clonedPageId, testUserId]
      );

      expect(existingCheck.rows.length).toBe(1);

      // Cleanup
      await pool.query('DELETE FROM ghl_clone_templates WHERE cloned_page_id = $1', [clonedPageId]);
      await pool.query('DELETE FROM ghl_cloned_pages WHERE id = $1', [clonedPageId]);
    });
  });
});
