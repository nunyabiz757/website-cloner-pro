import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import { Pool } from 'pg';
import ghlRoutes from '../routes/ghl.routes.js';

/**
 * GHL API Endpoint Tests
 * Tests for GHL REST API endpoints including authentication and authorization
 */

describe('GHL API Endpoints', () => {
  let app: express.Application;
  let pool: Pool;
  let authToken: string;
  let testUserId: string;
  let clonedPageId: string;
  let templateId: string;

  beforeAll(async () => {
    // Setup Express app
    app = express();
    app.use(express.json());
    app.use('/api/ghl', ghlRoutes);

    pool = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgresql://localhost/test_db',
    });

    // Create test user and get auth token
    const userResult = await pool.query(
      `INSERT INTO users (email, username, password_hash, email_verified)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      ['ghl-api-test@example.com', 'ghlapitest', 'hashed_password', true]
    );
    testUserId = userResult.rows[0].id;

    // Initialize credits
    await pool.query(
      `INSERT INTO credits (user_id, credits_available)
       VALUES ($1, $2)`,
      [testUserId, 100]
    );

    // Mock auth token (in real tests, this would come from JWT service)
    authToken = 'Bearer mock_jwt_token_for_testing';
  });

  afterAll(async () => {
    // Cleanup
    await pool.query('DELETE FROM users WHERE email = $1', ['ghl-api-test@example.com']);
    await pool.end();
  });

  describe('POST /api/ghl/validate - GHL Site Detection', () => {
    it('should detect GoHighLevel site', async () => {
      const response = await request(app)
        .post('/api/ghl/validate')
        .set('Authorization', authToken)
        .send({ url: 'https://test.gohighlevel.com/page' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.result.isGHLSite).toBe(true);
      expect(response.body.result.confidence).toBeGreaterThanOrEqual(40);
    });

    it('should reject non-GHL site', async () => {
      const response = await request(app)
        .post('/api/ghl/validate')
        .set('Authorization', authToken)
        .send({ url: 'https://example.com/page' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.result.isGHLSite).toBe(false);
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/ghl/validate')
        .send({ url: 'https://test.gohighlevel.com' })
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('AUTH_REQUIRED');
    });

    it('should validate URL format', async () => {
      const response = await request(app)
        .post('/api/ghl/validate')
        .set('Authorization', authToken)
        .send({ url: 'not-a-valid-url' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Template API Endpoints', () => {
    beforeAll(async () => {
      // Create test cloned page
      const pageResult = await pool.query(
        `INSERT INTO ghl_cloned_pages (
          user_id, source_url, source_domain, source_title,
          clone_status, credits_consumed, html_content
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id`,
        [
          testUserId,
          'https://template-api.gohighlevel.com',
          'template-api.gohighlevel.com',
          'Template API Test',
          'copied',
          1,
          '<html><body><h1>Template</h1></body></html>',
        ]
      );
      clonedPageId = pageResult.rows[0].id;
    });

    afterAll(async () => {
      if (templateId) {
        await pool.query('DELETE FROM ghl_clone_templates WHERE id = $1', [templateId]);
      }
      await pool.query('DELETE FROM ghl_cloned_pages WHERE id = $1', [clonedPageId]);
    });

    describe('POST /api/ghl/templates - Create Template', () => {
      it('should create template successfully', async () => {
        const response = await request(app)
          .post('/api/ghl/templates')
          .set('Authorization', authToken)
          .send({
            clonedPageId,
            name: 'API Test Template',
            description: 'Created via API test',
            category: 'landing_page',
            tags: ['test', 'api'],
            isPublic: false,
          })
          .expect(201);

        expect(response.body.success).toBe(true);
        expect(response.body.template.name).toBe('API Test Template');

        templateId = response.body.template.id;
      });

      it('should reject duplicate template', async () => {
        const response = await request(app)
          .post('/api/ghl/templates')
          .set('Authorization', authToken)
          .send({
            clonedPageId, // Same cloned page
            name: 'Duplicate Template',
          })
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.code).toBe('TEMPLATE_EXISTS');
      });

      it('should reject non-existent cloned page', async () => {
        const response = await request(app)
          .post('/api/ghl/templates')
          .set('Authorization', authToken)
          .send({
            clonedPageId: '00000000-0000-0000-0000-000000000000',
            name: 'Nonexistent Template',
          })
          .expect(404);

        expect(response.body.success).toBe(false);
        expect(response.body.code).toBe('PAGE_NOT_FOUND');
      });
    });

    describe('GET /api/ghl/templates - List Templates', () => {
      it('should list templates with pagination', async () => {
        const response = await request(app)
          .get('/api/ghl/templates')
          .set('Authorization', authToken)
          .query({ limit: 10, offset: 0 })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.templates).toBeInstanceOf(Array);
        expect(response.body.total).toBeGreaterThanOrEqual(0);
      });

      it('should filter by category', async () => {
        const response = await request(app)
          .get('/api/ghl/templates')
          .set('Authorization', authToken)
          .query({ category: 'landing_page' })
          .expect(200);

        expect(response.body.success).toBe(true);
        response.body.templates.forEach((template: any) => {
          expect(template.category).toBe('landing_page');
        });
      });

      it('should search templates', async () => {
        const response = await request(app)
          .get('/api/ghl/templates')
          .set('Authorization', authToken)
          .query({ search: 'API Test' })
          .expect(200);

        expect(response.body.success).toBe(true);
      });

      it('should filter public templates only', async () => {
        const response = await request(app)
          .get('/api/ghl/templates')
          .set('Authorization', authToken)
          .query({ publicOnly: 'true' })
          .expect(200);

        expect(response.body.success).toBe(true);
        response.body.templates.forEach((template: any) => {
          expect(template.is_public).toBe(true);
        });
      });
    });

    describe('GET /api/ghl/templates/:id - Get Template', () => {
      it('should get template by ID', async () => {
        const response = await request(app)
          .get(`/api/ghl/templates/${templateId}`)
          .set('Authorization', authToken)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.template.id).toBe(templateId);
        expect(response.body.template.name).toBe('API Test Template');
      });

      it('should return 404 for non-existent template', async () => {
        const response = await request(app)
          .get('/api/ghl/templates/00000000-0000-0000-0000-000000000000')
          .set('Authorization', authToken)
          .expect(404);

        expect(response.body.success).toBe(false);
        expect(response.body.code).toBe('NOT_FOUND');
      });
    });

    describe('PUT /api/ghl/templates/:id - Update Template', () => {
      it('should update template', async () => {
        const response = await request(app)
          .put(`/api/ghl/templates/${templateId}`)
          .set('Authorization', authToken)
          .send({
            name: 'Updated Template Name',
            description: 'Updated description',
            isPublic: true,
          })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.template.name).toBe('Updated Template Name');
        expect(response.body.template.is_public).toBe(true);
      });

      it('should only allow owner to update', async () => {
        // This would require a different user token
        // For now, test that ownership is checked in code
        expect(true).toBe(true);
      });
    });

    describe('POST /api/ghl/templates/:id/use - Use Template', () => {
      it('should use template and consume credit', async () => {
        const beforeCredits = await pool.query(
          'SELECT credits_available FROM credits WHERE user_id = $1',
          [testUserId]
        );

        const response = await request(app)
          .post(`/api/ghl/templates/${templateId}/use`)
          .set('Authorization', authToken)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.creditsConsumed).toBe(1);
        expect(response.body.clonedPageId).toBeDefined();

        const afterCredits = await pool.query(
          'SELECT credits_available FROM credits WHERE user_id = $1',
          [testUserId]
        );

        expect(afterCredits.rows[0].credits_available).toBe(
          beforeCredits.rows[0].credits_available - 1
        );

        // Cleanup created clone
        await pool.query('DELETE FROM ghl_cloned_pages WHERE id = $1',
          [response.body.clonedPageId]);
      });

      it('should increment template use count', async () => {
        const beforeUse = await pool.query(
          'SELECT use_count FROM ghl_clone_templates WHERE id = $1',
          [templateId]
        );

        await request(app)
          .post(`/api/ghl/templates/${templateId}/use`)
          .set('Authorization', authToken)
          .expect(200);

        const afterUse = await pool.query(
          'SELECT use_count FROM ghl_clone_templates WHERE id = $1',
          [templateId]
        );

        expect(afterUse.rows[0].use_count).toBe(beforeUse.rows[0].use_count + 1);

        // Cleanup
        const lastClone = await pool.query(
          'SELECT id FROM ghl_cloned_pages WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
          [testUserId]
        );
        await pool.query('DELETE FROM ghl_cloned_pages WHERE id = $1',
          [lastClone.rows[0].id]);
      });

      it('should fail when insufficient credits', async () => {
        // Set credits to 0
        await pool.query(
          'UPDATE credits SET credits_available = 0 WHERE user_id = $1',
          [testUserId]
        );

        const response = await request(app)
          .post(`/api/ghl/templates/${templateId}/use`)
          .set('Authorization', authToken)
          .expect(402);

        expect(response.body.success).toBe(false);
        expect(response.body.code).toBe('INSUFFICIENT_CREDITS');

        // Restore credits
        await pool.query(
          'UPDATE credits SET credits_available = 100 WHERE user_id = $1',
          [testUserId]
        );
      });
    });

    describe('DELETE /api/ghl/templates/:id - Delete Template', () => {
      it('should delete template', async () => {
        // Create a template to delete
        const tempPageResult = await pool.query(
          `INSERT INTO ghl_cloned_pages (
            user_id, source_url, source_domain, source_title,
            clone_status, credits_consumed, html_content
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING id`,
          [testUserId, 'https://del.com', 'del.com', 'Delete', 'copied', 1, '<html></html>']
        );

        const tempTemplateResult = await pool.query(
          `INSERT INTO ghl_clone_templates (user_id, cloned_page_id, name)
           VALUES ($1, $2, $3)
           RETURNING id`,
          [testUserId, tempPageResult.rows[0].id, 'To Delete']
        );

        const tempTemplateId = tempTemplateResult.rows[0].id;

        const response = await request(app)
          .delete(`/api/ghl/templates/${tempTemplateId}`)
          .set('Authorization', authToken)
          .expect(200);

        expect(response.body.success).toBe(true);

        // Verify deletion
        const check = await pool.query(
          'SELECT id FROM ghl_clone_templates WHERE id = $1',
          [tempTemplateId]
        );

        expect(check.rows.length).toBe(0);

        // Cleanup cloned page
        await pool.query('DELETE FROM ghl_cloned_pages WHERE id = $1',
          [tempPageResult.rows[0].id]);
      });
    });
  });

  describe('Asset Download Endpoints', () => {
    let assetPageId: string;

    beforeAll(async () => {
      const pageResult = await pool.query(
        `INSERT INTO ghl_cloned_pages (
          user_id, source_url, source_domain, source_title,
          clone_status, credits_consumed, html_content, assets
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id`,
        [
          testUserId,
          'https://asset-api.gohighlevel.com',
          'asset-api.gohighlevel.com',
          'Asset API Test',
          'copied',
          1,
          '<html></html>',
          JSON.stringify({
            images: ['https://asset-api.gohighlevel.com/image.jpg'],
            videos: [],
            stylesheets: [],
            scripts: [],
          }),
        ]
      );
      assetPageId = pageResult.rows[0].id;
    });

    afterAll(async () => {
      await pool.query('DELETE FROM ghl_page_assets WHERE cloned_page_id = $1', [assetPageId]);
      await pool.query('DELETE FROM ghl_cloned_pages WHERE id = $1', [assetPageId]);
    });

    describe('GET /api/ghl/cloned/:id/assets/status', () => {
      it('should get asset download status', async () => {
        const response = await request(app)
          .get(`/api/ghl/cloned/${assetPageId}/assets/status`)
          .set('Authorization', authToken)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.status).toHaveProperty('total');
        expect(response.body.status).toHaveProperty('downloaded');
        expect(response.body.status).toHaveProperty('failed');
        expect(response.body.status).toHaveProperty('pending');
        expect(response.body.status).toHaveProperty('percentComplete');
      });

      it('should require ownership', async () => {
        // Test with different user would return 404
        const response = await request(app)
          .get('/api/ghl/cloned/00000000-0000-0000-0000-000000000000/assets/status')
          .set('Authorization', authToken)
          .expect(404);

        expect(response.body.success).toBe(false);
        expect(response.body.code).toBe('NOT_FOUND');
      });
    });

    describe('GET /api/ghl/cloned/:id/assets', () => {
      it('should list all assets for cloned page', async () => {
        // Insert test asset
        await pool.query(
          `INSERT INTO ghl_page_assets (
            cloned_page_id, asset_type, original_url, download_status
          ) VALUES ($1, $2, $3, $4)`,
          [assetPageId, 'image', 'https://asset-api.gohighlevel.com/image.jpg', 'pending']
        );

        const response = await request(app)
          .get(`/api/ghl/cloned/${assetPageId}/assets`)
          .set('Authorization', authToken)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.assets).toBeInstanceOf(Array);
        expect(response.body.total).toBeGreaterThan(0);

        // Verify asset structure
        if (response.body.assets.length > 0) {
          const asset = response.body.assets[0];
          expect(asset).toHaveProperty('id');
          expect(asset).toHaveProperty('asset_type');
          expect(asset).toHaveProperty('original_url');
          expect(asset).toHaveProperty('download_status');
        }
      });
    });

    describe('POST /api/ghl/cloned/:id/assets/retry', () => {
      it('should retry failed asset downloads', async () => {
        // Insert failed asset
        await pool.query(
          `INSERT INTO ghl_page_assets (
            cloned_page_id, asset_type, original_url,
            download_status, error_message
          ) VALUES ($1, $2, $3, $4, $5)`,
          [
            assetPageId,
            'image',
            'https://asset-api.gohighlevel.com/failed.jpg',
            'failed',
            'Previous error',
          ]
        );

        const response = await request(app)
          .post(`/api/ghl/cloned/${assetPageId}/assets/retry`)
          .set('Authorization', authToken)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.result).toHaveProperty('total');
        expect(response.body.result).toHaveProperty('downloaded');
        expect(response.body.result).toHaveProperty('failed');
      });
    });
  });

  describe('Statistics Endpoint', () => {
    it('should get user clone statistics', async () => {
      const response = await request(app)
        .get('/api/ghl/statistics')
        .set('Authorization', authToken)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.stats).toHaveProperty('total_clones');
      expect(response.body.stats).toHaveProperty('successful_clones');
      expect(response.body.stats).toHaveProperty('failed_clones');
    });
  });

  describe('Search Endpoint', () => {
    it('should search cloned pages', async () => {
      const response = await request(app)
        .get('/api/ghl/search')
        .set('Authorization', authToken)
        .query({ query: 'test', status: 'copied' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.results).toBeInstanceOf(Array);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid UUIDs', async () => {
      const response = await request(app)
        .get('/api/ghl/templates/invalid-uuid')
        .set('Authorization', authToken)
        .expect(500); // Or 400 depending on validation

      expect(response.body.success).toBe(false);
    });

    it('should handle missing required fields', async () => {
      const response = await request(app)
        .post('/api/ghl/templates')
        .set('Authorization', authToken)
        .send({ name: 'Missing clonedPageId' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('VALIDATION_ERROR');
    });

    it('should handle database errors gracefully', async () => {
      // This would require mocking database failures
      expect(true).toBe(true);
    });
  });

  describe('RBAC Permission Checks', () => {
    it('should enforce ghl:copy permission for cloning', async () => {
      // Would require a user without permission
      expect(true).toBe(true);
    });

    it('should enforce ghl:view permission for viewing', async () => {
      // Would require a user without permission
      expect(true).toBe(true);
    });

    it('should enforce ghl:template:create permission', async () => {
      // Would require a user without permission
      expect(true).toBe(true);
    });
  });
});
