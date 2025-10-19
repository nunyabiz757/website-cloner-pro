import fs from 'fs/promises';
import path from 'path';
import archiver from 'archiver';
import { createWriteStream } from 'fs';
import crypto from 'crypto';
import type { ClonedWebsite, Deployment } from '../../shared/types/index.js';
import { logAuditEvent } from '../utils/audit-logger.js';

interface DeploymentConfig {
  platform: 'vercel' | 'netlify';
  projectName: string;
  websiteId: string;
}

export class DeploymentService {
  private deployments: Map<string, Deployment> = new Map();

  /**
   * Deploy website to Vercel or Netlify
   */
  async deploy(
    website: ClonedWebsite,
    config: DeploymentConfig
  ): Promise<Deployment> {
    const deploymentId = crypto.randomUUID();

    try {
      // Create deployment directory
      const deploymentDir = await this.prepareDeploymentFiles(website);

      let previewUrl: string;
      let deploymentInfo: any;

      if (config.platform === 'vercel') {
        const result = await this.deployToVercel(deploymentDir, config.projectName);
        previewUrl = result.url;
        deploymentInfo = result;
      } else {
        const result = await this.deployToNetlify(deploymentDir, config.projectName);
        previewUrl = result.url;
        deploymentInfo = result;
      }

      const deployment: Deployment = {
        id: deploymentId,
        websiteId: website.id,
        platform: config.platform,
        status: 'success',
        previewUrl,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
        metadata: deploymentInfo,
      };

      this.deployments.set(deploymentId, deployment);
      return deployment;
    } catch (error) {
      const failedDeployment: Deployment = {
        id: deploymentId,
        websiteId: website.id,
        platform: config.platform,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Deployment failed',
        createdAt: new Date().toISOString(),
      };

      this.deployments.set(deploymentId, failedDeployment);
      throw error;
    }
  }

  /**
   * Deploy to Vercel using Vercel API
   */
  private async deployToVercel(
    deploymentDir: string,
    projectName: string
  ): Promise<{ url: string; deploymentId: string }> {
    const vercelToken = process.env.VERCEL_TOKEN;

    if (!vercelToken) {
      throw new Error('VERCEL_TOKEN environment variable is not set');
    }

    // Prepare files for deployment
    const files = await this.getFilesForDeployment(deploymentDir);

    // Create Vercel deployment
    const response = await fetch('https://api.vercel.com/v13/deployments', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${vercelToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: projectName,
        files,
        projectSettings: {
          framework: null,
          buildCommand: null,
          outputDirectory: null,
        },
        target: 'production',
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Vercel deployment failed: ${error}`);
    }

    const data = await response.json();

    return {
      url: `https://${data.url}`,
      deploymentId: data.id,
    };
  }

  /**
   * Deploy to Netlify using Netlify API
   */
  private async deployToNetlify(
    deploymentDir: string,
    projectName: string
  ): Promise<{ url: string; deploymentId: string }> {
    const netlifyToken = process.env.NETLIFY_AUTH_TOKEN;

    if (!netlifyToken) {
      throw new Error('NETLIFY_AUTH_TOKEN environment variable is not set');
    }

    // Create a ZIP file of the deployment directory
    const zipPath = await this.createZipFile(deploymentDir);

    // Create site if it doesn't exist
    const siteResponse = await fetch('https://api.netlify.com/api/v1/sites', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${netlifyToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: projectName,
      }),
    });

    if (!siteResponse.ok) {
      const error = await siteResponse.text();
      throw new Error(`Netlify site creation failed: ${error}`);
    }

    const site = await siteResponse.json();

    // Deploy the ZIP file
    const zipBuffer = await fs.readFile(zipPath);

    const deployResponse = await fetch(
      `https://api.netlify.com/api/v1/sites/${site.id}/deploys`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${netlifyToken}`,
          'Content-Type': 'application/zip',
        },
        body: zipBuffer,
      }
    );

    if (!deployResponse.ok) {
      const error = await deployResponse.text();
      throw new Error(`Netlify deployment failed: ${error}`);
    }

    const deployment = await deployResponse.json();

    // Clean up ZIP file
    await fs.unlink(zipPath);

    return {
      url: deployment.deploy_ssl_url || deployment.deploy_url,
      deploymentId: deployment.id,
      siteId: site.id, // Store site ID for later deletion
    };
  }

  /**
   * Prepare deployment files from cloned website
   */
  private async prepareDeploymentFiles(website: ClonedWebsite): Promise<string> {
    const deploymentDir = path.join(process.cwd(), 'temp', 'deployments', website.id);
    await fs.mkdir(deploymentDir, { recursive: true });

    // Copy index.html
    const sourceDir = path.join(process.cwd(), 'uploads', website.id);
    const indexPath = path.join(sourceDir, 'index.html');

    if (await this.fileExists(indexPath)) {
      await fs.copyFile(indexPath, path.join(deploymentDir, 'index.html'));
    } else {
      // Create index.html from website.html
      await fs.writeFile(
        path.join(deploymentDir, 'index.html'),
        website.html,
        'utf-8'
      );
    }

    // Copy assets directory
    const assetsDir = path.join(sourceDir, 'assets');
    if (await this.fileExists(assetsDir)) {
      await this.copyDirectory(assetsDir, path.join(deploymentDir, 'assets'));
    }

    // Copy CSS files
    for (const css of website.css) {
      const cssPath = path.join(sourceDir, css.localPath || '');
      if (await this.fileExists(cssPath)) {
        const destPath = path.join(deploymentDir, path.basename(cssPath));
        await fs.copyFile(cssPath, destPath);
      }
    }

    // Copy JavaScript files
    for (const js of website.javascript) {
      const jsPath = path.join(sourceDir, js.localPath || '');
      if (await this.fileExists(jsPath)) {
        const destPath = path.join(deploymentDir, path.basename(jsPath));
        await fs.copyFile(jsPath, destPath);
      }
    }

    return deploymentDir;
  }

  /**
   * Get files for Vercel deployment
   */
  private async getFilesForDeployment(
    deploymentDir: string
  ): Promise<Array<{ file: string; data: string }>> {
    const files: Array<{ file: string; data: string }> = [];
    const entries = await fs.readdir(deploymentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(deploymentDir, entry.name);

      if (entry.isFile()) {
        const content = await fs.readFile(fullPath, 'utf-8');
        files.push({
          file: entry.name,
          data: content,
        });
      } else if (entry.isDirectory()) {
        const subFiles = await this.getFilesRecursive(fullPath, entry.name);
        files.push(...subFiles);
      }
    }

    return files;
  }

  /**
   * Get files recursively for deployment
   */
  private async getFilesRecursive(
    dir: string,
    prefix: string
  ): Promise<Array<{ file: string; data: string }>> {
    const files: Array<{ file: string; data: string }> = [];
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = `${prefix}/${entry.name}`;

      if (entry.isFile()) {
        const content = await fs.readFile(fullPath, 'utf-8');
        files.push({
          file: relativePath,
          data: content,
        });
      } else if (entry.isDirectory()) {
        const subFiles = await this.getFilesRecursive(fullPath, relativePath);
        files.push(...subFiles);
      }
    }

    return files;
  }

  /**
   * Create ZIP file for Netlify deployment
   */
  private async createZipFile(sourceDir: string): Promise<string> {
    const zipPath = path.join(process.cwd(), 'temp', `${crypto.randomUUID()}.zip`);
    await fs.mkdir(path.dirname(zipPath), { recursive: true });

    return new Promise((resolve, reject) => {
      const output = createWriteStream(zipPath);
      const archive = archiver('zip', { zlib: { level: 9 } });

      output.on('close', () => resolve(zipPath));
      archive.on('error', (err) => reject(err));

      archive.pipe(output);
      archive.directory(sourceDir, false);
      archive.finalize();
    });
  }

  /**
   * Copy directory recursively
   */
  private async copyDirectory(source: string, destination: string): Promise<void> {
    await fs.mkdir(destination, { recursive: true });
    const entries = await fs.readdir(source, { withFileTypes: true });

    for (const entry of entries) {
      const sourcePath = path.join(source, entry.name);
      const destPath = path.join(destination, entry.name);

      if (entry.isDirectory()) {
        await this.copyDirectory(sourcePath, destPath);
      } else {
        await fs.copyFile(sourcePath, destPath);
      }
    }
  }

  /**
   * Check if file exists
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get deployment by ID
   */
  getDeployment(deploymentId: string): Deployment | undefined {
    return this.deployments.get(deploymentId);
  }

  /**
   * Get all deployments for a website
   */
  getDeploymentsByWebsiteId(websiteId: string): Deployment[] {
    return Array.from(this.deployments.values()).filter(
      (deployment) => deployment.websiteId === websiteId
    );
  }

  /**
   * Delete deployment
   */
  async deleteDeployment(deploymentId: string, userId?: string): Promise<void> {
    const deployment = this.deployments.get(deploymentId);
    if (!deployment) {
      throw new Error('Deployment not found');
    }

    const startTime = Date.now();

    try {
      // Delete from platform first (Vercel/Netlify)
      await this.deletePlatformDeployment(deployment);

      // Clean up local deployment files if they exist
      await this.cleanupDeploymentFiles(deployment.websiteId);

      // Remove from in-memory storage
      this.deployments.delete(deploymentId);

      console.log(`[DEPLOYMENT] Successfully deleted deployment ${deploymentId} from ${deployment.platform}`);

      // Log successful deletion to audit log
      await logAuditEvent({
        userId: userId || 'system',
        action: 'deployment.delete.success',
        resourceType: 'deployment',
        resourceId: deploymentId,
        details: {
          platform: deployment.platform,
          websiteId: deployment.websiteId,
          previewUrl: deployment.previewUrl,
        },
        durationMs: Date.now() - startTime,
        severity: 'info',
        category: 'deployment',
      });
    } catch (error) {
      console.error(`[DEPLOYMENT] Error deleting deployment ${deploymentId}:`, error);

      // Log failed deletion to audit log
      await logAuditEvent({
        userId: userId || 'system',
        action: 'deployment.delete.failed',
        resourceType: 'deployment',
        resourceId: deploymentId,
        details: {
          platform: deployment.platform,
          websiteId: deployment.websiteId,
        },
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        durationMs: Date.now() - startTime,
        severity: 'error',
        category: 'deployment',
      });

      // Still remove from memory even if platform deletion failed
      this.deployments.delete(deploymentId);
      throw error;
    }
  }

  /**
   * Check deployment status
   */
  async checkDeploymentStatus(deploymentId: string): Promise<Deployment> {
    const deployment = this.deployments.get(deploymentId);
    if (!deployment) {
      throw new Error('Deployment not found');
    }

    // Check if deployment has expired
    if (deployment.expiresAt) {
      const expiresAt = new Date(deployment.expiresAt);
      if (expiresAt < new Date()) {
        deployment.status = 'expired';
      }
    }

    return deployment;
  }

  /**
   * Deploy both original and optimized versions for comparison
   */
  async deployBothVersions(
    originalWebsite: ClonedWebsite,
    optimizedWebsite: ClonedWebsite,
    config: DeploymentConfig
  ): Promise<{ original: Deployment; optimized: Deployment }> {
    // Deploy original
    const originalDeployment = await this.deploy(originalWebsite, {
      ...config,
      projectName: `${config.projectName}-original`,
    });

    // Deploy optimized
    const optimizedDeployment = await this.deploy(optimizedWebsite, {
      ...config,
      projectName: `${config.projectName}-optimized`,
    });

    // Link the deployments
    originalDeployment.optimizedUrl = optimizedDeployment.previewUrl;
    optimizedDeployment.originalUrl = originalDeployment.previewUrl;

    return {
      original: originalDeployment,
      optimized: optimizedDeployment,
    };
  }

  /**
   * Generate shareable link with optional password protection
   */
  generateShareableLink(
    deploymentId: string,
    options?: { password?: string; expiresInDays?: number }
  ): { shareUrl: string; shareId: string } {
    const deployment = this.deployments.get(deploymentId);
    if (!deployment) {
      throw new Error('Deployment not found');
    }

    const shareId = crypto.randomUUID();
    const shareUrl = `${deployment.previewUrl}?share=${shareId}`;

    // Store share metadata
    if (options?.password) {
      // In production, store encrypted password
      deployment.metadata = {
        ...deployment.metadata,
        share: {
          id: shareId,
          protected: true,
          expiresAt: options.expiresInDays
            ? new Date(Date.now() + options.expiresInDays * 24 * 60 * 60 * 1000).toISOString()
            : undefined,
        },
      };
    }

    return { shareUrl, shareId };
  }

  /**
   * Clean up expired deployments
   */
  async cleanupExpiredDeployments(): Promise<{ deleted: number; errors: string[] }> {
    const now = new Date();
    const toDelete: string[] = [];
    const errors: string[] = [];

    for (const [id, deployment] of this.deployments.entries()) {
      if (deployment.expiresAt) {
        const expiresAt = new Date(deployment.expiresAt);
        if (expiresAt < now) {
          toDelete.push(id);
        }
      }
    }

    let deleted = 0;
    for (const id of toDelete) {
      try {
        await this.deleteDeployment(id);
        deleted++;
      } catch (error) {
        errors.push(`Failed to delete ${id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return { deleted, errors };
  }

  /**
   * Update deployment with performance metrics
   */
  updatePerformanceMetrics(deploymentId: string, metrics: any): void {
    const deployment = this.deployments.get(deploymentId);
    if (deployment) {
      deployment.performanceMetrics = metrics;
    }
  }

  /**
   * Delete deployment from platform
   */
  private async deletePlatformDeployment(deployment: Deployment): Promise<void> {
    if (deployment.platform === 'vercel') {
      await this.deleteVercelDeployment(deployment);
    } else if (deployment.platform === 'netlify') {
      await this.deleteNetlifyDeployment(deployment);
    }
  }

  /**
   * Delete Vercel deployment
   */
  private async deleteVercelDeployment(deployment: Deployment): Promise<void> {
    const vercelToken = process.env.VERCEL_TOKEN;

    if (!vercelToken) {
      throw new Error('VERCEL_TOKEN environment variable is not set');
    }

    if (!deployment.metadata?.deploymentId) {
      console.warn(`[VERCEL] No deployment ID found for ${deployment.id}, skipping platform deletion`);
      return;
    }

    const deploymentId = deployment.metadata.deploymentId;

    try {
      console.log(`[VERCEL] Deleting deployment ${deploymentId}...`);

      const response = await fetch(
        `https://api.vercel.com/v13/deployments/${deploymentId}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${vercelToken}`,
          },
        }
      );

      if (!response.ok) {
        // Vercel returns 404 if deployment already deleted, which is OK
        if (response.status === 404) {
          console.log(`[VERCEL] Deployment ${deploymentId} already deleted`);
          return;
        }

        const errorText = await response.text();
        throw new Error(
          `Vercel deletion failed (${response.status}): ${errorText}`
        );
      }

      const result = await response.json();
      console.log(`[VERCEL] Successfully deleted deployment ${deploymentId}`, result);
    } catch (error) {
      if (error instanceof Error && error.message.includes('404')) {
        // Deployment already deleted, not an error
        console.log(`[VERCEL] Deployment ${deploymentId} not found (already deleted)`);
        return;
      }

      console.error(`[VERCEL] Failed to delete deployment ${deploymentId}:`, error);
      throw error;
    }
  }

  /**
   * Delete Netlify deployment
   */
  private async deleteNetlifyDeployment(deployment: Deployment): Promise<void> {
    const netlifyToken = process.env.NETLIFY_AUTH_TOKEN;

    if (!netlifyToken) {
      throw new Error('NETLIFY_AUTH_TOKEN environment variable is not set');
    }

    if (!deployment.metadata?.deploymentId) {
      console.warn(`[NETLIFY] No deployment ID found for ${deployment.id}, skipping platform deletion`);
      return;
    }

    const deploymentId = deployment.metadata.deploymentId;
    const siteId = deployment.metadata?.siteId;

    try {
      console.log(`[NETLIFY] Deleting deployment ${deploymentId}...`);

      // Netlify requires deleting the site, not just the deployment
      // If we have a site ID, delete the entire site
      if (siteId) {
        const siteResponse = await fetch(
          `https://api.netlify.com/api/v1/sites/${siteId}`,
          {
            method: 'DELETE',
            headers: {
              Authorization: `Bearer ${netlifyToken}`,
            },
          }
        );

        if (!siteResponse.ok) {
          // Netlify returns 404 if site already deleted
          if (siteResponse.status === 404) {
            console.log(`[NETLIFY] Site ${siteId} already deleted`);
            return;
          }

          const errorText = await siteResponse.text();
          throw new Error(
            `Netlify site deletion failed (${siteResponse.status}): ${errorText}`
          );
        }

        console.log(`[NETLIFY] Successfully deleted site ${siteId}`);
      } else {
        // Fallback: try to delete just the deployment
        const deployResponse = await fetch(
          `https://api.netlify.com/api/v1/deploys/${deploymentId}`,
          {
            method: 'DELETE',
            headers: {
              Authorization: `Bearer ${netlifyToken}`,
            },
          }
        );

        if (!deployResponse.ok) {
          if (deployResponse.status === 404) {
            console.log(`[NETLIFY] Deployment ${deploymentId} already deleted`);
            return;
          }

          const errorText = await deployResponse.text();
          throw new Error(
            `Netlify deployment deletion failed (${deployResponse.status}): ${errorText}`
          );
        }

        console.log(`[NETLIFY] Successfully deleted deployment ${deploymentId}`);
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('404')) {
        // Deployment/site already deleted, not an error
        console.log(`[NETLIFY] Resource ${deploymentId} not found (already deleted)`);
        return;
      }

      console.error(`[NETLIFY] Failed to delete deployment ${deploymentId}:`, error);
      throw error;
    }
  }

  /**
   * Clean up local deployment files
   */
  private async cleanupDeploymentFiles(websiteId: string): Promise<void> {
    const deploymentDir = path.join(process.cwd(), 'temp', 'deployments', websiteId);

    try {
      if (await this.fileExists(deploymentDir)) {
        await fs.rm(deploymentDir, { recursive: true, force: true });
        console.log(`[CLEANUP] Removed deployment files for ${websiteId}`);
      }
    } catch (error) {
      console.error(`[CLEANUP] Failed to remove deployment files:`, error);
      // Don't throw - file cleanup failure shouldn't fail the deletion
    }
  }
}
