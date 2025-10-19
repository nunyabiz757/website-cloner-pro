/**
 * Audit Logger Usage Examples
 *
 * This file demonstrates how to use the enhanced audit logging system
 */

import { logAuditEvent, logAuditEventBatch, queryAuditLogs, getAuditStatistics, getFailedLogsQueueSize } from './audit-logger.js';

// ============================================================================
// Example 1: Basic Audit Log
// ============================================================================

export async function exampleBasicAuditLog() {
    await logAuditEvent({
        userId: 'user-123',
        action: 'user.login',
        resourceType: 'user',
        resourceId: 'user-123',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0...',
        severity: 'info',
        category: 'authentication'
    });
}

// ============================================================================
// Example 2: Audit Log with Additional Details
// ============================================================================

export async function exampleDetailedAuditLog() {
    await logAuditEvent({
        userId: 'user-456',
        action: 'deployment.create',
        resourceType: 'deployment',
        resourceId: 'deploy-789',
        details: {
            platform: 'vercel',
            projectName: 'my-website',
            region: 'us-east-1',
            buildTime: 45000
        },
        ipAddress: '10.0.0.1',
        userAgent: 'Website Cloner Pro/1.0',
        requestMethod: 'POST',
        requestPath: '/api/deployment/deploy',
        statusCode: 201,
        durationMs: 2500,
        severity: 'info',
        category: 'deployment'
    });
}

// ============================================================================
// Example 3: Error Logging
// ============================================================================

export async function exampleErrorAuditLog() {
    await logAuditEvent({
        userId: 'user-789',
        action: 'export.download',
        resourceType: 'export',
        resourceId: 'export-101',
        errorMessage: 'File not found: export-101.zip',
        statusCode: 404,
        severity: 'error',
        category: 'export'
    });
}

// ============================================================================
// Example 4: Security Event
// ============================================================================

export async function exampleSecurityAuditLog() {
    await logAuditEvent({
        userId: 'unknown',
        action: 'auth.failed_login',
        resourceType: 'user',
        resourceId: 'admin@example.com',
        details: {
            attemptCount: 5,
            locked: true,
            reason: 'Too many failed attempts'
        },
        ipAddress: '203.0.113.42',
        severity: 'warning',
        category: 'security'
    });
}

// ============================================================================
// Example 5: Payment/Compliance Event (7-year retention)
// ============================================================================

export async function examplePaymentAuditLog() {
    await logAuditEvent({
        userId: 'user-999',
        action: 'payment.completed',
        resourceType: 'payment',
        resourceId: 'pay-12345',
        details: {
            amount: 4999, // $49.99
            currency: 'USD',
            plan: 'pro',
            stripeChargeId: 'ch_xyz123'
        },
        severity: 'info',
        category: 'payment' // Automatically retained for 7 years per policy
    });
}

// ============================================================================
// Example 6: Batch Logging (High Performance)
// ============================================================================

export async function exampleBatchAuditLogs() {
    const events = [
        {
            userId: 'user-111',
            action: 'website.clone',
            resourceType: 'website',
            resourceId: 'site-001',
            category: 'data_modification' as const
        },
        {
            userId: 'user-111',
            action: 'optimization.run',
            resourceType: 'website',
            resourceId: 'site-001',
            category: 'configuration' as const
        },
        {
            userId: 'user-111',
            action: 'export.generate',
            resourceType: 'export',
            resourceId: 'export-202',
            category: 'export' as const
        }
    ];

    // More efficient than individual logs - uses transaction
    await logAuditEventBatch(events);
}

// ============================================================================
// Example 7: Query Audit Logs
// ============================================================================

export async function exampleQueryAuditLogs() {
    // Get all deployments for a user in the last 7 days
    const logs = await queryAuditLogs({
        userId: 'user-123',
        action: 'deployment.create',
        startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        limit: 50,
        offset: 0
    });

    console.log(`Found ${logs.length} deployment events`);
    return logs;
}

// ============================================================================
// Example 8: Query by Severity
// ============================================================================

export async function exampleQueryErrors() {
    // Get all critical/error events in the last 24 hours
    const errorLogs = await queryAuditLogs({
        severity: 'error',
        startDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
        limit: 100
    });

    console.log(`Found ${errorLogs.length} error events`);
    return errorLogs;
}

// ============================================================================
// Example 9: Get Statistics
// ============================================================================

export async function exampleGetStatistics() {
    // Get daily statistics for a user
    const stats = await getAuditStatistics({
        userId: 'user-123',
        startDate: new Date('2025-10-01'),
        endDate: new Date('2025-10-31')
    });

    console.log('Audit Statistics:', stats);
    return stats;
}

// ============================================================================
// Example 10: Monitoring Failed Logs Queue
// ============================================================================

export async function exampleMonitorQueue() {
    const queueSize = getFailedLogsQueueSize();

    if (queueSize > 100) {
        console.warn(`⚠️ Audit log queue is large: ${queueSize} pending logs`);
        // Alert operations team
    }

    return queueSize;
}

// ============================================================================
// Example 11: Skip Database (Testing/Development)
// ============================================================================

export async function exampleSkipDatabase() {
    // Useful during testing or when database is down
    await logAuditEvent(
        {
            userId: 'test-user',
            action: 'test.action',
            resourceType: 'test',
            resourceId: 'test-123'
        },
        {
            skipDatabase: true, // Only logs to console
            fallbackToConsole: true
        }
    );
}

// ============================================================================
// Example 12: Custom Retry Configuration
// ============================================================================

export async function exampleCustomRetry() {
    // Critical log that should retry more aggressively
    await logAuditEvent(
        {
            userId: 'user-critical',
            action: 'security.breach_detected',
            resourceType: 'system',
            resourceId: 'firewall',
            severity: 'critical',
            category: 'security'
        },
        {
            retryAttempts: 10, // Retry up to 10 times
            retryDelayMs: 500,  // Start with 500ms delay
            fallbackToConsole: true
        }
    );
}

// ============================================================================
// Express Middleware Example
// ============================================================================

import type { Request, Response, NextFunction } from 'express';

export function auditLogMiddleware(req: Request, res: Response, next: NextFunction) {
    const startTime = Date.now();

    // Capture response on finish
    res.on('finish', async () => {
        const durationMs = Date.now() - startTime;

        // Only log significant actions (not health checks, static files, etc.)
        if (req.path.startsWith('/api/')) {
            await logAuditEvent({
                userId: (req as any).user?.id || 'anonymous',
                action: `api.${req.method.toLowerCase()}.${req.path.split('/')[2] || 'unknown'}`,
                resourceType: 'api',
                resourceId: req.path,
                ipAddress: req.ip,
                userAgent: req.get('user-agent'),
                requestMethod: req.method,
                requestPath: req.path,
                statusCode: res.statusCode,
                durationMs,
                severity: res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warning' : 'info',
                category: 'data_access'
            });
        }
    });

    next();
}

// ============================================================================
// Real-World Usage Pattern: User Authentication
// ============================================================================

export async function auditUserLogin(userId: string, success: boolean, req: Request) {
    await logAuditEvent({
        userId: success ? userId : 'unknown',
        action: success ? 'auth.login.success' : 'auth.login.failed',
        resourceType: 'user',
        resourceId: userId,
        details: {
            success,
            method: 'password'
        },
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        statusCode: success ? 200 : 401,
        severity: success ? 'info' : 'warning',
        category: 'authentication'
    });
}

// ============================================================================
// Real-World Usage Pattern: Data Export
// ============================================================================

export async function auditDataExport(
    userId: string,
    exportId: string,
    format: string,
    fileSize: number,
    success: boolean,
    error?: string
) {
    await logAuditEvent({
        userId,
        action: success ? 'export.completed' : 'export.failed',
        resourceType: 'export',
        resourceId: exportId,
        details: {
            format,
            fileSizeBytes: fileSize,
            success
        },
        errorMessage: error,
        statusCode: success ? 200 : 500,
        severity: success ? 'info' : 'error',
        category: 'export' // Retained for 180 days
    });
}
