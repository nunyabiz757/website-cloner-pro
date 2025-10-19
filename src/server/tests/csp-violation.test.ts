import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { CSPViolationService, initializeCSPViolationService } from '../services/csp-violation.service';
import { CSPAlertService, initializeCSPAlertService } from '../services/csp-alert.service';
import { Pool } from 'pg';

/**
 * CSP Violation Reporting Tests
 * Tests for CSP violation logging, alerting, and pattern detection
 */

describe('CSP Violation Service', () => {
  let pool: Pool;
  let cspService: CSPViolationService;
  let alertService: CSPAlertService;

  beforeAll(async () => {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgresql://localhost/test_db',
    });

    // Create tables
    await pool.query(`
      CREATE TABLE IF NOT EXISTS csp_violations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        document_uri TEXT NOT NULL,
        violated_directive TEXT NOT NULL,
        effective_directive TEXT,
        original_policy TEXT,
        blocked_uri TEXT,
        status_code INTEGER,
        source_file TEXT,
        line_number INTEGER,
        column_number INTEGER,
        referrer TEXT,
        user_agent TEXT,
        ip_address VARCHAR(45),
        user_id UUID,
        disposition VARCHAR(20),
        script_sample TEXT,
        severity VARCHAR(20) DEFAULT 'medium',
        is_reviewed BOOLEAN DEFAULT FALSE,
        is_false_positive BOOLEAN DEFAULT FALSE,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        reviewed_at TIMESTAMP,
        reviewed_by UUID
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS csp_violation_patterns (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        pattern_hash VARCHAR(64) UNIQUE NOT NULL,
        violated_directive TEXT NOT NULL,
        blocked_uri TEXT,
        document_uri TEXT,
        occurrence_count INTEGER DEFAULT 1,
        first_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        is_whitelisted BOOLEAN DEFAULT FALSE,
        is_critical BOOLEAN DEFAULT FALSE,
        action_taken VARCHAR(50),
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS csp_violation_alerts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        alert_type VARCHAR(50) NOT NULL,
        severity VARCHAR(20) NOT NULL,
        message TEXT NOT NULL,
        violation_id UUID,
        pattern_id UUID,
        is_acknowledged BOOLEAN DEFAULT FALSE,
        acknowledged_at TIMESTAMP,
        acknowledged_by UUID,
        notification_sent BOOLEAN DEFAULT FALSE,
        notification_sent_at TIMESTAMP,
        notification_method VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    cspService = initializeCSPViolationService(pool);
    alertService = initializeCSPAlertService(pool, { notificationEnabled: false });
  });

  afterAll(async () => {
    await pool.query('DROP TABLE IF EXISTS csp_violation_alerts');
    await pool.query('DROP TABLE IF EXISTS csp_violation_patterns');
    await pool.query('DROP TABLE IF EXISTS csp_violations');
    await pool.end();
  });

  beforeEach(async () => {
    await pool.query('DELETE FROM csp_violation_alerts');
    await pool.query('DELETE FROM csp_violation_patterns');
    await pool.query('DELETE FROM csp_violations');
  });

  describe('Violation Logging', () => {
    it('should log CSP violation successfully', async () => {
      const report = {
        'document-uri': 'https://example.com/page',
        'violated-directive': 'script-src',
        'blocked-uri': 'https://evil.com/malicious.js',
        disposition: 'enforce' as const,
      };

      const context = {
        userAgent: 'Mozilla/5.0',
        ipAddress: '127.0.0.1',
      };

      const violationId = await cspService.logViolation(report, context);

      expect(violationId).toBeDefined();

      const violation = await cspService.getViolation(violationId);
      expect(violation).toBeDefined();
      expect(violation?.documentUri).toBe('https://example.com/page');
      expect(violation?.violatedDirective).toBe('script-src');
      expect(violation?.blockedUri).toBe('https://evil.com/malicious.js');
    });

    it('should calculate severity correctly for critical directives', async () => {
      const report = {
        'document-uri': 'https://example.com/page',
        'violated-directive': 'script-src',
        'blocked-uri': 'https://evil.com/script.js',
      };

      const violationId = await cspService.logViolation(report, {});
      const violation = await cspService.getViolation(violationId);

      expect(violation?.severity).toBe('critical');
    });

    it('should calculate severity for unsafe-inline violations', async () => {
      const report = {
        'document-uri': 'https://example.com/page',
        'violated-directive': 'style-src',
        'blocked-uri': 'unsafe-inline',
      };

      const violationId = await cspService.logViolation(report, {});
      const violation = await cspService.getViolation(violationId);

      expect(violation?.severity).toBe('high');
    });

    it('should calculate severity for script samples', async () => {
      const report = {
        'document-uri': 'https://example.com/page',
        'violated-directive': 'script-src',
        'script-sample': 'alert("XSS")',
      };

      const violationId = await cspService.logViolation(report, {});
      const violation = await cspService.getViolation(violationId);

      expect(violation?.severity).toBe('high');
    });

    it('should store all violation details', async () => {
      const report = {
        'document-uri': 'https://example.com/page',
        'violated-directive': 'script-src',
        'effective-directive': 'script-src-elem',
        'blocked-uri': 'https://cdn.example.com/script.js',
        'status-code': 200,
        'source-file': 'https://example.com/app.js',
        'line-number': 42,
        'column-number': 15,
        referrer: 'https://example.com/',
        disposition: 'enforce' as const,
      };

      const context = {
        userAgent: 'Chrome/120.0',
        ipAddress: '192.168.1.1',
        userId: 'test-user-123',
      };

      const violationId = await cspService.logViolation(report, context);
      const violation = await cspService.getViolation(violationId);

      expect(violation?.effectiveDirective).toBe('script-src-elem');
      expect(violation?.statusCode).toBe(200);
      expect(violation?.sourceFile).toBe('https://example.com/app.js');
      expect(violation?.lineNumber).toBe(42);
      expect(violation?.columnNumber).toBe(15);
      expect(violation?.referrer).toBe('https://example.com/');
      expect(violation?.userAgent).toBe('Chrome/120.0');
      expect(violation?.ipAddress).toBe('192.168.1.1');
      expect(violation?.userId).toBe('test-user-123');
    });
  });

  describe('Violation Patterns', () => {
    it('should create pattern on first violation', async () => {
      const report = {
        'document-uri': 'https://example.com/page',
        'violated-directive': 'img-src',
        'blocked-uri': 'https://images.example.com/logo.png',
      };

      await cspService.logViolation(report, {});

      const patterns = await cspService.getViolationPatterns(1);
      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns[0].violatedDirective).toBe('img-src');
      expect(patterns[0].occurrenceCount).toBe(1);
    });

    it('should increment pattern occurrence count', async () => {
      const report = {
        'document-uri': 'https://example.com/page',
        'violated-directive': 'img-src',
        'blocked-uri': 'https://images.example.com/logo.png',
      };

      // Log same violation 3 times
      await cspService.logViolation(report, {});
      await cspService.logViolation(report, {});
      await cspService.logViolation(report, {});

      const patterns = await cspService.getViolationPatterns(1);
      expect(patterns[0].occurrenceCount).toBe(3);
    });

    it('should create separate patterns for different violations', async () => {
      const report1 = {
        'document-uri': 'https://example.com/page1',
        'violated-directive': 'script-src',
        'blocked-uri': 'https://cdn1.com/script.js',
      };

      const report2 = {
        'document-uri': 'https://example.com/page2',
        'violated-directive': 'style-src',
        'blocked-uri': 'https://cdn2.com/style.css',
      };

      await cspService.logViolation(report1, {});
      await cspService.logViolation(report2, {});

      const patterns = await cspService.getViolationPatterns(1);
      expect(patterns.length).toBe(2);
    });
  });

  describe('Violation Review', () => {
    it('should mark violation as reviewed', async () => {
      const report = {
        'document-uri': 'https://example.com/page',
        'violated-directive': 'script-src',
      };

      const violationId = await cspService.logViolation(report, {});
      await cspService.markAsReviewed(violationId, 'reviewer-123', false, 'Legitimate violation');

      const violation = await cspService.getViolation(violationId);
      expect(violation?.isReviewed).toBe(true);
      expect(violation?.isFalsePositive).toBe(false);
      expect(violation?.notes).toBe('Legitimate violation');
    });

    it('should mark violation as false positive', async () => {
      const report = {
        'document-uri': 'https://example.com/page',
        'violated-directive': 'script-src',
      };

      const violationId = await cspService.logViolation(report, {});
      await cspService.markAsReviewed(violationId, 'reviewer-123', true, 'False alarm');

      const violation = await cspService.getViolation(violationId);
      expect(violation?.isFalsePositive).toBe(true);
    });
  });

  describe('Pattern Management', () => {
    it('should whitelist pattern', async () => {
      const report = {
        'document-uri': 'https://example.com/page',
        'violated-directive': 'img-src',
        'blocked-uri': 'https://trusted.com/image.png',
      };

      await cspService.logViolation(report, {});

      const patterns = await cspService.getViolationPatterns(1);
      const patternId = patterns[0].id;

      await cspService.whitelistPattern(patternId, 'Trusted source');

      const result = await pool.query(
        'SELECT * FROM csp_violation_patterns WHERE id = $1',
        [patternId]
      );

      expect(result.rows[0].is_whitelisted).toBe(true);
      expect(result.rows[0].action_taken).toBe('whitelisted');
    });

    it('should mark pattern as critical', async () => {
      const report = {
        'document-uri': 'https://example.com/page',
        'violated-directive': 'script-src',
        'blocked-uri': 'https://malicious.com/script.js',
      };

      await cspService.logViolation(report, {});

      const patterns = await cspService.getViolationPatterns(1);
      const patternId = patterns[0].id;

      await cspService.markPatternAsCritical(patternId);

      const result = await pool.query(
        'SELECT * FROM csp_violation_patterns WHERE id = $1',
        [patternId]
      );

      expect(result.rows[0].is_critical).toBe(true);
    });
  });

  describe('Violation Statistics', () => {
    it('should calculate violation statistics', async () => {
      // Create multiple violations
      await cspService.logViolation({
        'document-uri': 'https://example.com/page1',
        'violated-directive': 'script-src',
      }, {});

      await cspService.logViolation({
        'document-uri': 'https://example.com/page2',
        'violated-directive': 'script-src',
      }, {});

      await cspService.logViolation({
        'document-uri': 'https://example.com/page3',
        'violated-directive': 'img-src',
      }, {});

      const stats = await cspService.getViolationStats(7);

      expect(stats.totalViolations).toBe(3);
      expect(stats.violationsByDirective['script-src']).toBe(2);
      expect(stats.violationsByDirective['img-src']).toBe(1);
    });
  });

  describe('Violation Cleanup', () => {
    it('should cleanup old reviewed violations', async () => {
      const report = {
        'document-uri': 'https://example.com/page',
        'violated-directive': 'script-src',
      };

      const violationId = await cspService.logViolation(report, {});

      // Mark as reviewed and set old date
      await pool.query(
        `UPDATE csp_violations
         SET is_reviewed = TRUE,
             created_at = NOW() - INTERVAL '100 days'
         WHERE id = $1`,
        [violationId]
      );

      const deletedCount = await cspService.cleanupOldViolations(90);

      expect(deletedCount).toBe(1);
    });

    it('should not cleanup unreviewed violations', async () => {
      const report = {
        'document-uri': 'https://example.com/page',
        'violated-directive': 'script-src',
      };

      const violationId = await cspService.logViolation(report, {});

      // Set old date but keep unreviewed
      await pool.query(
        `UPDATE csp_violations
         SET created_at = NOW() - INTERVAL '100 days'
         WHERE id = $1`,
        [violationId]
      );

      const deletedCount = await cspService.cleanupOldViolations(90);

      expect(deletedCount).toBe(0);

      const violation = await cspService.getViolation(violationId);
      expect(violation).not.toBeNull();
    });
  });

  describe('Alert Service', () => {
    it('should create alert for critical violation', async () => {
      const report = {
        'document-uri': 'https://example.com/page',
        'violated-directive': 'script-src',
        'blocked-uri': 'https://evil.com/malware.js',
      };

      const violationId = await cspService.logViolation(report, {});
      await alertService.checkAndCreateAlerts(violationId);

      const alerts = await alertService.getActiveAlerts();
      expect(alerts.length).toBeGreaterThan(0);
      expect(alerts[0].alertType).toBe('critical_violation');
      expect(alerts[0].severity).toBe('critical');
    });

    it('should acknowledge alert', async () => {
      const alertId = await alertService.createAlert({
        alertType: 'test_alert',
        severity: 'medium',
        message: 'Test alert',
      });

      await alertService.acknowledgeAlert(alertId, 'admin-123');

      const result = await pool.query(
        'SELECT * FROM csp_violation_alerts WHERE id = $1',
        [alertId]
      );

      expect(result.rows[0].is_acknowledged).toBe(true);
      expect(result.rows[0].acknowledged_by).toBe('admin-123');
    });

    it('should prevent duplicate alerts', async () => {
      const alert = {
        alertType: 'threshold_exceeded',
        severity: 'high' as const,
        message: 'Same alert message',
      };

      const id1 = await alertService.createAlert(alert);
      const id2 = await alertService.createAlert(alert);

      // Should return same alert ID (not create duplicate)
      expect(id1).toBe(id2);
    });
  });

  describe('Critical Violations', () => {
    it('should retrieve only critical violations', async () => {
      await cspService.logViolation({
        'document-uri': 'https://example.com/page',
        'violated-directive': 'script-src', // Critical
      }, {});

      await cspService.logViolation({
        'document-uri': 'https://example.com/page',
        'violated-directive': 'img-src', // Not critical
      }, {});

      const critical = await cspService.getCriticalViolations();

      expect(critical.length).toBe(1);
      expect(critical[0].severity).toBe('critical');
    });
  });
});
