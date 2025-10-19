import { Pool } from 'pg';
import { getPool } from '../config/database.js';
import { getRedisCacheService } from './redis-cache.service.js';
import type { RedisCacheService } from './redis-cache.service.js';
import { logAuditEvent } from '../utils/audit-logger.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';

// =====================================================================================
// Types and Interfaces
// =====================================================================================

export interface ExportPackage {
    id: string;
    user_id: string;
    package_name: string;
    package_format: 'json' | 'zip';
    template_ids: string[];
    include_versions: boolean;
    include_reviews: boolean;
    include_assets: boolean;
    include_analytics: boolean;
    package_size?: number;
    file_path?: string;
    download_url?: string;
    download_count: number;
    last_downloaded_at?: Date;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    error_message?: string;
    expires_at?: Date;
    metadata: Record<string, any>;
    created_at: Date;
    updated_at: Date;
}

export interface ImportJob {
    id: string;
    user_id: string;
    package_source: 'file' | 'url' | 'export_package';
    package_format: 'json' | 'zip';
    source_reference: string;
    status: 'pending' | 'validating' | 'processing' | 'completed' | 'failed' | 'cancelled';
    total_templates: number;
    imported_templates: number;
    failed_templates: number;
    skipped_templates: number;
    import_options: Record<string, any>;
    conflict_resolution: 'skip' | 'overwrite' | 'rename' | 'merge';
    template_mappings: Record<string, string>;
    error_log?: string;
    warnings: any[];
    started_at?: Date;
    completed_at?: Date;
    created_at: Date;
    updated_at: Date;
}

export interface CreateExportParams {
    user_id: string;
    package_name: string;
    package_format?: 'json' | 'zip';
    template_ids: string[];
    include_versions?: boolean;
    include_reviews?: boolean;
    include_assets?: boolean;
    include_analytics?: boolean;
    expires_in_days?: number;
}

export interface CreateImportParams {
    user_id: string;
    package_source: 'file' | 'url' | 'export_package';
    package_format: 'json' | 'zip';
    source_reference: string;
    import_options?: Record<string, any>;
    conflict_resolution?: 'skip' | 'overwrite' | 'rename' | 'merge';
}

// =====================================================================================
// Template Export/Import Service
// =====================================================================================

export class TemplateExportImportService {
    private pool: Pool;
    private cache: RedisCacheService;
    private exportDir: string;

    constructor() {
        this.pool = getPool();
        this.cache = getRedisCacheService();
        this.exportDir = process.env.EXPORT_DIR || path.join(process.cwd(), 'exports');
    }

    // =====================================================================================
    // Export Management
    // =====================================================================================

    /**
     * Create export package
     */
    async createExport(params: CreateExportParams): Promise<ExportPackage> {
        const client = await this.pool.connect();

        try {
            await client.query('BEGIN');

            // Calculate expiry date
            const expiresAt = params.expires_in_days
                ? new Date(Date.now() + params.expires_in_days * 24 * 60 * 60 * 1000)
                : null;

            // Create export record
            const result = await client.query<ExportPackage>(
                `INSERT INTO template_export_packages (
                    user_id, package_name, package_format,
                    template_ids, include_versions, include_reviews,
                    include_assets, include_analytics, expires_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                RETURNING *`,
                [
                    params.user_id,
                    params.package_name,
                    params.package_format || 'json',
                    params.template_ids,
                    params.include_versions || false,
                    params.include_reviews || false,
                    params.include_assets || true,
                    params.include_analytics || false,
                    expiresAt
                ]
            );

            await client.query('COMMIT');

            const exportPackage = result.rows[0];

            // Audit log
            await logAuditEvent({
                userId: params.user_id,
                action: 'export.created',
                resourceType: 'export_package',
                resourceId: exportPackage.id,
                details: {
                    package_name: params.package_name,
                    template_count: params.template_ids.length
                }
            });

            return this.formatExport(exportPackage);
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Get export package by ID
     */
    async getExportById(exportId: string, userId: string): Promise<ExportPackage | null> {
        const result = await this.pool.query<ExportPackage>(
            'SELECT * FROM template_export_packages WHERE id = $1 AND user_id = $2',
            [exportId, userId]
        );

        if (result.rows.length === 0) {
            return null;
        }

        return this.formatExport(result.rows[0]);
    }

    /**
     * Get user's exports
     */
    async getUserExports(
        userId: string,
        limit: number = 50,
        offset: number = 0
    ): Promise<ExportPackage[]> {
        const result = await this.pool.query<ExportPackage>(
            `SELECT * FROM template_export_packages
             WHERE user_id = $1
             ORDER BY created_at DESC
             LIMIT $2 OFFSET $3`,
            [userId, limit, offset]
        );

        return result.rows.map(row => this.formatExport(row));
    }

    /**
     * Process export (generate package file)
     */
    async processExport(exportId: string): Promise<ExportPackage> {
        const client = await this.pool.connect();

        try {
            await client.query('BEGIN');

            // Update status to processing
            await client.query(
                `UPDATE template_export_packages
                 SET status = 'processing', updated_at = NOW()
                 WHERE id = $1`,
                [exportId]
            );

            // Get export details
            const exportResult = await client.query<ExportPackage>(
                'SELECT * FROM template_export_packages WHERE id = $1',
                [exportId]
            );

            const exportPackage = exportResult.rows[0];

            // Fetch template data
            const templatesResult = await client.query(
                `SELECT * FROM templates WHERE id = ANY($1)`,
                [exportPackage.template_ids]
            );

            const templates = templatesResult.rows;

            // Build export data
            const exportData: any = {
                export_version: '1.0',
                created_at: new Date().toISOString(),
                templates: templates.map(t => ({
                    id: t.id,
                    name: t.name,
                    description: t.description,
                    html_content: t.html_content,
                    css_content: t.css_content,
                    js_content: t.js_content,
                    category: t.category,
                    tags: t.tags,
                    thumbnail_url: t.thumbnail_url,
                    metadata: t.metadata
                }))
            };

            // Include versions if requested
            if (exportPackage.include_versions) {
                const versionsResult = await client.query(
                    `SELECT * FROM template_versions WHERE template_id = ANY($1)`,
                    [exportPackage.template_ids]
                );
                exportData.versions = versionsResult.rows;
            }

            // Include reviews if requested
            if (exportPackage.include_reviews) {
                const reviewsResult = await client.query(
                    `SELECT * FROM template_reviews WHERE template_id = ANY($1)`,
                    [exportPackage.template_ids]
                );
                exportData.reviews = reviewsResult.rows;
            }

            // Generate unique filename
            const filename = `${crypto.randomBytes(16).toString('hex')}.json`;
            const filePath = path.join(this.exportDir, filename);

            // Ensure export directory exists
            await fs.mkdir(this.exportDir, { recursive: true });

            // Write export file
            await fs.writeFile(filePath, JSON.stringify(exportData, null, 2), 'utf-8');

            // Get file size
            const stats = await fs.stat(filePath);
            const packageSize = stats.size;

            // Generate download URL (temporary, expires with package)
            const downloadUrl = `/api/phase4b/exports/${exportId}/download`;

            // Update export record
            const updateResult = await client.query<ExportPackage>(
                `UPDATE template_export_packages
                 SET status = 'completed',
                     file_path = $2,
                     download_url = $3,
                     package_size = $4,
                     updated_at = NOW()
                 WHERE id = $1
                 RETURNING *`,
                [exportId, filePath, downloadUrl, packageSize]
            );

            await client.query('COMMIT');

            return this.formatExport(updateResult.rows[0]);
        } catch (error: any) {
            await client.query('ROLLBACK');

            // Update status to failed
            await this.pool.query(
                `UPDATE template_export_packages
                 SET status = 'failed', error_message = $2, updated_at = NOW()
                 WHERE id = $1`,
                [exportId, error.message]
            );

            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Track download
     */
    async trackDownload(exportId: string, userId: string): Promise<void> {
        await this.pool.query(
            `UPDATE template_export_packages
             SET download_count = download_count + 1,
                 last_downloaded_at = NOW()
             WHERE id = $1 AND user_id = $2`,
            [exportId, userId]
        );
    }

    /**
     * Delete export package
     */
    async deleteExport(exportId: string, userId: string): Promise<void> {
        const exportPackage = await this.getExportById(exportId, userId);

        if (!exportPackage) {
            throw new Error('Export not found');
        }

        // Delete file if exists
        if (exportPackage.file_path) {
            try {
                await fs.unlink(exportPackage.file_path);
            } catch (error) {
                console.error('Error deleting export file:', error);
            }
        }

        // Delete database record
        await this.pool.query(
            'DELETE FROM template_export_packages WHERE id = $1',
            [exportId]
        );

        // Audit log
        await logAuditEvent({
            userId,
            action: 'export.deleted',
            resourceType: 'export_package',
            resourceId: exportId,
            details: {}
        });
    }

    // =====================================================================================
    // Import Management
    // =====================================================================================

    /**
     * Create import job
     */
    async createImport(params: CreateImportParams): Promise<ImportJob> {
        const result = await this.pool.query<ImportJob>(
            `INSERT INTO template_import_jobs (
                user_id, package_source, package_format,
                source_reference, import_options, conflict_resolution
            ) VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *`,
            [
                params.user_id,
                params.package_source,
                params.package_format,
                params.source_reference,
                JSON.stringify(params.import_options || {}),
                params.conflict_resolution || 'skip'
            ]
        );

        const importJob = result.rows[0];

        // Audit log
        await logAuditEvent({
            userId: params.user_id,
            action: 'import.created',
            resourceType: 'import_job',
            resourceId: importJob.id,
            details: {
                package_source: params.package_source,
                conflict_resolution: params.conflict_resolution
            }
        });

        return this.formatImport(importJob);
    }

    /**
     * Get import job by ID
     */
    async getImportById(importId: string, userId: string): Promise<ImportJob | null> {
        const result = await this.pool.query<ImportJob>(
            'SELECT * FROM template_import_jobs WHERE id = $1 AND user_id = $2',
            [importId, userId]
        );

        if (result.rows.length === 0) {
            return null;
        }

        return this.formatImport(result.rows[0]);
    }

    /**
     * Get user's imports
     */
    async getUserImports(
        userId: string,
        limit: number = 50,
        offset: number = 0
    ): Promise<ImportJob[]> {
        const result = await this.pool.query<ImportJob>(
            `SELECT * FROM template_import_jobs
             WHERE user_id = $1
             ORDER BY created_at DESC
             LIMIT $2 OFFSET $3`,
            [userId, limit, offset]
        );

        return result.rows.map(row => this.formatImport(row));
    }

    /**
     * Process import
     */
    async processImport(importId: string): Promise<ImportJob> {
        const client = await this.pool.connect();

        try {
            await client.query('BEGIN');

            // Update status to processing
            await client.query(
                `UPDATE template_import_jobs
                 SET status = 'processing', started_at = NOW(), updated_at = NOW()
                 WHERE id = $1`,
                [importId]
            );

            // Get import details
            const importResult = await client.query<ImportJob>(
                'SELECT * FROM template_import_jobs WHERE id = $1',
                [importId]
            );

            const importJob = importResult.rows[0];

            // Read import file
            let importData: any;
            if (importJob.package_source === 'file') {
                const fileContent = await fs.readFile(importJob.source_reference, 'utf-8');
                importData = JSON.parse(fileContent);
            } else if (importJob.package_source === 'export_package') {
                const exportResult = await client.query(
                    'SELECT file_path FROM template_export_packages WHERE id = $1',
                    [importJob.source_reference]
                );
                const filePath = exportResult.rows[0].file_path;
                const fileContent = await fs.readFile(filePath, 'utf-8');
                importData = JSON.parse(fileContent);
            }

            const templates = importData.templates || [];
            const totalTemplates = templates.length;
            const templateMappings: Record<string, string> = {};
            let importedCount = 0;
            let failedCount = 0;
            let skippedCount = 0;

            // Process each template
            for (const templateData of templates) {
                try {
                    // Check for conflicts
                    const existingResult = await client.query(
                        'SELECT id FROM templates WHERE name = $1 AND user_id = $2',
                        [templateData.name, importJob.user_id]
                    );

                    if (existingResult.rows.length > 0) {
                        // Handle conflict based on resolution strategy
                        if (importJob.conflict_resolution === 'skip') {
                            skippedCount++;
                            continue;
                        } else if (importJob.conflict_resolution === 'rename') {
                            templateData.name = `${templateData.name} (imported)`;
                        }
                        // overwrite and merge handled below
                    }

                    // Insert or update template
                    const insertResult = await client.query(
                        `INSERT INTO templates (
                            user_id, name, description, html_content,
                            css_content, js_content, category, tags,
                            thumbnail_url, metadata
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                        ON CONFLICT (name, user_id)
                        DO UPDATE SET
                            description = EXCLUDED.description,
                            html_content = EXCLUDED.html_content,
                            css_content = EXCLUDED.css_content,
                            js_content = EXCLUDED.js_content,
                            updated_at = NOW()
                        RETURNING id`,
                        [
                            importJob.user_id,
                            templateData.name,
                            templateData.description,
                            templateData.html_content,
                            templateData.css_content,
                            templateData.js_content,
                            templateData.category,
                            templateData.tags,
                            templateData.thumbnail_url,
                            JSON.stringify(templateData.metadata || {})
                        ]
                    );

                    const newTemplateId = insertResult.rows[0].id;
                    templateMappings[templateData.id] = newTemplateId;
                    importedCount++;
                } catch (error: any) {
                    console.error(`Failed to import template ${templateData.name}:`, error);
                    failedCount++;
                }
            }

            // Update import job
            const updateResult = await client.query<ImportJob>(
                `UPDATE template_import_jobs
                 SET status = 'completed',
                     total_templates = $2,
                     imported_templates = $3,
                     failed_templates = $4,
                     skipped_templates = $5,
                     template_mappings = $6,
                     completed_at = NOW(),
                     updated_at = NOW()
                 WHERE id = $1
                 RETURNING *`,
                [importId, totalTemplates, importedCount, failedCount, skippedCount, JSON.stringify(templateMappings)]
            );

            await client.query('COMMIT');

            return this.formatImport(updateResult.rows[0]);
        } catch (error: any) {
            await client.query('ROLLBACK');

            // Update status to failed
            await this.pool.query(
                `UPDATE template_import_jobs
                 SET status = 'failed', error_log = $2, updated_at = NOW()
                 WHERE id = $1`,
                [importId, error.message]
            );

            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Cancel import
     */
    async cancelImport(importId: string, userId: string): Promise<ImportJob> {
        const result = await this.pool.query<ImportJob>(
            `UPDATE template_import_jobs
             SET status = 'cancelled', updated_at = NOW()
             WHERE id = $1 AND user_id = $2 AND status IN ('pending', 'validating')
             RETURNING *`,
            [importId, userId]
        );

        if (result.rows.length === 0) {
            throw new Error('Import not found or cannot be cancelled');
        }

        return this.formatImport(result.rows[0]);
    }

    // =====================================================================================
    // Cleanup
    // =====================================================================================

    /**
     * Cleanup expired exports
     */
    async cleanupExpiredExports(): Promise<number> {
        const result = await this.pool.query<{ id: string; file_path: string }>(
            `SELECT id, file_path
             FROM template_export_packages
             WHERE expires_at IS NOT NULL
             AND expires_at < NOW()
             AND status = 'completed'`
        );

        const expiredPackages = result.rows;

        // Delete files
        for (const pkg of expiredPackages) {
            if (pkg.file_path) {
                try {
                    await fs.unlink(pkg.file_path);
                } catch (error) {
                    console.error(`Error deleting expired export file ${pkg.file_path}:`, error);
                }
            }
        }

        // Delete database records
        const deleteResult = await this.pool.query<{ count: number }>(
            `WITH deleted AS (
                DELETE FROM template_export_packages
                WHERE expires_at IS NOT NULL
                AND expires_at < NOW()
                AND status = 'completed'
                RETURNING id
             )
             SELECT COUNT(*)::int as count FROM deleted`
        );

        return deleteResult.rows[0]?.count || 0;
    }

    // =====================================================================================
    // Helper Methods
    // =====================================================================================

    /**
     * Format export from database
     */
    private formatExport(row: any): ExportPackage {
        return {
            ...row,
            metadata: typeof row.metadata === 'object' ? row.metadata : JSON.parse(row.metadata || '{}')
        };
    }

    /**
     * Format import from database
     */
    private formatImport(row: any): ImportJob {
        return {
            ...row,
            import_options: typeof row.import_options === 'object'
                ? row.import_options
                : JSON.parse(row.import_options || '{}'),
            template_mappings: typeof row.template_mappings === 'object'
                ? row.template_mappings
                : JSON.parse(row.template_mappings || '{}'),
            warnings: typeof row.warnings === 'object'
                ? row.warnings
                : JSON.parse(row.warnings || '[]')
        };
    }
}

// Singleton instance
let templateExportImportServiceInstance: TemplateExportImportService | null = null;

export function getTemplateExportImportService(): TemplateExportImportService {
    if (!templateExportImportServiceInstance) {
        templateExportImportServiceInstance = new TemplateExportImportService();
    }
    return templateExportImportServiceInstance;
}
