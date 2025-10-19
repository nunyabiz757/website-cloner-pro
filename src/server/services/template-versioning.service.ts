/**
 * Template Versioning Service
 * Handles template version creation, retrieval, restoration, and comparison
 */

import { Pool } from 'pg';
import { getPool } from '../config/database.js';
import { RedisCacheService } from './redis-cache.service.js';
import { logAuditEvent } from '../utils/audit-logger.js';

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface TemplateVersion {
    id: string;
    templateId: string;
    versionNumber: number;
    versionName: string | null;
    changelog: string | null;
    name: string;
    description: string | null;
    categoryId: string | null;
    thumbnailUrl: string | null;
    previewUrl: string | null;
    htmlContent: string | null;
    customCss: string | null;
    customJs: string | null;
    assets: any;
    metadata: any;
    createdBy: string;
    createdAt: Date;
    isCurrent: boolean;
    sizeBytes: number | null;
}

export interface VersionComparison {
    id: string;
    templateId: string;
    versionFrom: number;
    versionTo: number;
    comparedBy: string;
    comparisonResult: any;
    comparedAt: Date;
}

export interface CreateVersionParams {
    templateId: string;
    userId: string;
    versionName?: string;
    changelog?: string;
}

export interface RestoreVersionParams {
    templateId: string;
    versionNumber: number;
    userId: string;
}

export interface CompareVersionsParams {
    templateId: string;
    versionFrom: number;
    versionTo: number;
    userId: string;
}

export interface VersionDiff {
    field: string;
    oldValue: any;
    newValue: any;
    changeType: 'added' | 'removed' | 'modified';
}

// ============================================================================
// Service Class
// ============================================================================

export class TemplateVersioningService {
    private pool: Pool;
    private cache: RedisCacheService;

    constructor(pool: Pool, cache: RedisCacheService) {
        this.pool = pool;
        this.cache = cache;
    }

    // ========================================================================
    // Version Management
    // ========================================================================

    /**
     * Create a new version of a template
     */
    async createVersion(params: CreateVersionParams): Promise<TemplateVersion> {
        const { templateId, userId, versionName, changelog } = params;

        try {
            const result = await this.pool.query(
                `SELECT create_template_version($1, $2, $3, $4) as version_id`,
                [templateId, userId, versionName || null, changelog || null]
            );

            const versionId = result.rows[0].version_id;

            // Invalidate cache
            await this.invalidateVersionCache(templateId);

            await logAuditEvent({
                userId,
                action: 'template:version:create',
                resource: 'template_version',
                resourceId: versionId,
                details: { templateId, versionName, changelog }
            });

            // Fetch and return the created version
            return await this.getVersionById(versionId);

        } catch (error: any) {
            console.error('Error creating template version:', error);
            throw new Error(`Failed to create template version: ${error.message}`);
        }
    }

    /**
     * Get all versions for a template
     */
    async getVersions(templateId: string, limit: number = 50): Promise<TemplateVersion[]> {
        const cacheKey = `template:${templateId}:versions`;
        const cached = await this.cache.get(cacheKey);

        if (cached) {
            return JSON.parse(cached);
        }

        const result = await this.pool.query(
            `SELECT * FROM template_versions
             WHERE template_id = $1
             ORDER BY version_number DESC
             LIMIT $2`,
            [templateId, limit]
        );

        const versions = result.rows.map(row => this.mapVersionRow(row));

        // Cache for 5 minutes
        await this.cache.set(cacheKey, JSON.stringify(versions), 300);

        return versions;
    }

    /**
     * Get a specific version by ID
     */
    async getVersionById(versionId: string): Promise<TemplateVersion> {
        const result = await this.pool.query(
            `SELECT * FROM template_versions WHERE id = $1`,
            [versionId]
        );

        if (result.rows.length === 0) {
            throw new Error('Version not found');
        }

        return this.mapVersionRow(result.rows[0]);
    }

    /**
     * Get a specific version by template ID and version number
     */
    async getVersion(templateId: string, versionNumber: number): Promise<TemplateVersion> {
        const result = await this.pool.query(
            `SELECT * FROM template_versions
             WHERE template_id = $1 AND version_number = $2`,
            [templateId, versionNumber]
        );

        if (result.rows.length === 0) {
            throw new Error(`Version ${versionNumber} not found for template ${templateId}`);
        }

        return this.mapVersionRow(result.rows[0]);
    }

    /**
     * Get current version of a template
     */
    async getCurrentVersion(templateId: string): Promise<TemplateVersion | null> {
        const result = await this.pool.query(
            `SELECT * FROM template_versions
             WHERE template_id = $1 AND is_current = true
             LIMIT 1`,
            [templateId]
        );

        if (result.rows.length === 0) {
            return null;
        }

        return this.mapVersionRow(result.rows[0]);
    }

    /**
     * Get latest version number for a template
     */
    async getLatestVersionNumber(templateId: string): Promise<number> {
        const result = await this.pool.query(
            `SELECT get_latest_version_number($1) as version_number`,
            [templateId]
        );

        return result.rows[0].version_number || 0;
    }

    /**
     * Restore a template to a specific version
     */
    async restoreVersion(params: RestoreVersionParams): Promise<boolean> {
        const { templateId, versionNumber, userId } = params;

        try {
            await this.pool.query(
                `SELECT restore_template_version($1, $2, $3)`,
                [templateId, versionNumber, userId]
            );

            // Invalidate cache
            await this.invalidateVersionCache(templateId);
            await this.cache.del(`template:${templateId}`);

            await logAuditEvent({
                userId,
                action: 'template:version:restore',
                resource: 'template',
                resourceId: templateId,
                details: { versionNumber }
            });

            return true;

        } catch (error: any) {
            console.error('Error restoring template version:', error);
            throw new Error(`Failed to restore version: ${error.message}`);
        }
    }

    /**
     * Delete a specific version
     */
    async deleteVersion(
        templateId: string,
        versionNumber: number,
        userId: string
    ): Promise<void> {
        // Verify ownership
        const template = await this.pool.query(
            `SELECT user_id FROM ghl_clone_templates WHERE id = $1`,
            [templateId]
        );

        if (template.rows.length === 0) {
            throw new Error('Template not found');
        }

        if (template.rows[0].user_id !== userId) {
            throw new Error('Not authorized to delete this version');
        }

        // Cannot delete current version
        const version = await this.getVersion(templateId, versionNumber);
        if (version.isCurrent) {
            throw new Error('Cannot delete the current version');
        }

        await this.pool.query(
            `DELETE FROM template_versions
             WHERE template_id = $1 AND version_number = $2`,
            [templateId, versionNumber]
        );

        await this.invalidateVersionCache(templateId);

        await logAuditEvent({
            userId,
            action: 'template:version:delete',
            resource: 'template_version',
            resourceId: version.id,
            details: { templateId, versionNumber }
        });
    }

    // ========================================================================
    // Version Comparison
    // ========================================================================

    /**
     * Compare two versions of a template
     */
    async compareVersions(params: CompareVersionsParams): Promise<{
        versionFrom: TemplateVersion;
        versionTo: TemplateVersion;
        diff: VersionDiff[];
    }> {
        const { templateId, versionFrom, versionTo, userId } = params;

        // Get both versions
        const fromVersion = await this.getVersion(templateId, versionFrom);
        const toVersion = await this.getVersion(templateId, versionTo);

        // Calculate diff
        const diff = this.calculateDiff(fromVersion, toVersion);

        // Store comparison result
        const comparisonResult = {
            changes: diff.length,
            diff: diff
        };

        await this.pool.query(
            `INSERT INTO template_version_comparisons (
                template_id, version_from, version_to, compared_by, comparison_result
            ) VALUES ($1, $2, $3, $4, $5)`,
            [templateId, versionFrom, versionTo, userId, JSON.stringify(comparisonResult)]
        );

        await logAuditEvent({
            userId,
            action: 'template:version:compare',
            resource: 'template',
            resourceId: templateId,
            details: { versionFrom, versionTo, changesCount: diff.length }
        });

        return {
            versionFrom: fromVersion,
            versionTo: toVersion,
            diff
        };
    }

    /**
     * Get comparison history for a template
     */
    async getComparisonHistory(
        templateId: string,
        limit: number = 20
    ): Promise<VersionComparison[]> {
        const result = await this.pool.query(
            `SELECT * FROM template_version_comparisons
             WHERE template_id = $1
             ORDER BY compared_at DESC
             LIMIT $2`,
            [templateId, limit]
        );

        return result.rows.map(row => this.mapComparisonRow(row));
    }

    // ========================================================================
    // Helper Methods
    // ========================================================================

    /**
     * Calculate diff between two versions
     */
    private calculateDiff(
        fromVersion: TemplateVersion,
        toVersion: TemplateVersion
    ): VersionDiff[] {
        const diff: VersionDiff[] = [];
        const fieldsToCompare = [
            'name',
            'description',
            'categoryId',
            'thumbnailUrl',
            'previewUrl',
            'htmlContent',
            'customCss',
            'customJs'
        ];

        for (const field of fieldsToCompare) {
            const oldValue = (fromVersion as any)[field];
            const newValue = (toVersion as any)[field];

            if (oldValue !== newValue) {
                let changeType: 'added' | 'removed' | 'modified' = 'modified';

                if (oldValue === null && newValue !== null) {
                    changeType = 'added';
                } else if (oldValue !== null && newValue === null) {
                    changeType = 'removed';
                }

                diff.push({
                    field,
                    oldValue,
                    newValue,
                    changeType
                });
            }
        }

        return diff;
    }

    /**
     * Invalidate version cache for a template
     */
    private async invalidateVersionCache(templateId: string): Promise<void> {
        await this.cache.del(`template:${templateId}:versions`);
    }

    /**
     * Map database row to TemplateVersion
     */
    private mapVersionRow(row: any): TemplateVersion {
        return {
            id: row.id,
            templateId: row.template_id,
            versionNumber: row.version_number,
            versionName: row.version_name,
            changelog: row.changelog,
            name: row.name,
            description: row.description,
            categoryId: row.category_id,
            thumbnailUrl: row.thumbnail_url,
            previewUrl: row.preview_url,
            htmlContent: row.html_content,
            customCss: row.custom_css,
            customJs: row.custom_js,
            assets: row.assets,
            metadata: row.metadata,
            createdBy: row.created_by,
            createdAt: new Date(row.created_at),
            isCurrent: row.is_current,
            sizeBytes: row.size_bytes
        };
    }

    /**
     * Map database row to VersionComparison
     */
    private mapComparisonRow(row: any): VersionComparison {
        return {
            id: row.id,
            templateId: row.template_id,
            versionFrom: row.version_from,
            versionTo: row.version_to,
            comparedBy: row.compared_by,
            comparisonResult: row.comparison_result,
            comparedAt: new Date(row.compared_at)
        };
    }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let versioningServiceInstance: TemplateVersioningService | null = null;

export async function getTemplateVersioningService(): Promise<TemplateVersioningService> {
    if (!versioningServiceInstance) {
        const pool = getPool();
        const cache = new RedisCacheService();
        await cache.initialize();
        versioningServiceInstance = new TemplateVersioningService(pool, cache);
    }
    return versioningServiceInstance;
}
