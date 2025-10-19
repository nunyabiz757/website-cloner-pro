import express from 'express';
import path from 'path';
import fs from 'fs/promises';
import { nanoid } from 'nanoid';
import archiver from 'archiver';
import { createWriteStream } from 'fs';

interface HostedSite {
  id: string;
  previewUrl: string;
  name: string;
  cloneId: string;
  createdAt: string;
  expiresAt: string;
  filePath: string;
  indexPath: string;
  size: number;
  fileCount: number;
  isActive: boolean;
}

interface HostingOptions {
  name?: string;
  ttlHours?: number; // Time to live in hours
  customDomain?: boolean;
  password?: string;
  allowIndexing?: boolean;
}

export class TemporaryHostingService {
  private readonly hostedSites = new Map<string, HostedSite>();
  private readonly previewBasePath: string;
  private readonly defaultTTL = 24; // 24 hours default
  private readonly maxTTL = 168; // 7 days maximum

  constructor(previewBasePath: string = 'temp/previews') {
    this.previewBasePath = previewBasePath;
    this.initializeCleanupScheduler();
  }

  /**
   * Host a cloned site temporarily
   */
  async hostSite(
    cloneId: string,
    htmlContent: string,
    assets: { path: string; content: Buffer }[],
    options: HostingOptions = {}
  ): Promise<HostedSite> {
    // Generate unique preview ID
    const previewId = nanoid(10);
    const sitePath = path.join(this.previewBasePath, previewId);

    // Create directory structure
    await fs.mkdir(sitePath, { recursive: true });

    // Write HTML file
    const indexPath = path.join(sitePath, 'index.html');
    await fs.writeFile(indexPath, htmlContent);

    // Write assets
    let totalSize = Buffer.byteLength(htmlContent);
    for (const asset of assets) {
      const assetPath = path.join(sitePath, asset.path);
      await fs.mkdir(path.dirname(assetPath), { recursive: true });
      await fs.writeFile(assetPath, asset.content);
      totalSize += asset.content.length;
    }

    // Calculate expiration
    const ttlHours = Math.min(options.ttlHours || this.defaultTTL, this.maxTTL);
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

    // Create hosted site record
    const hostedSite: HostedSite = {
      id: previewId,
      previewUrl: `/preview/${previewId}`,
      name: options.name || `Preview ${previewId}`,
      cloneId,
      createdAt: new Date().toISOString(),
      expiresAt: expiresAt.toISOString(),
      filePath: sitePath,
      indexPath,
      size: totalSize,
      fileCount: assets.length + 1,
      isActive: true,
    };

    // Add robots.txt if indexing not allowed
    if (!options.allowIndexing) {
      const robotsPath = path.join(sitePath, 'robots.txt');
      await fs.writeFile(robotsPath, 'User-agent: *\nDisallow: /\n');
    }

    this.hostedSites.set(previewId, hostedSite);

    return hostedSite;
  }

  /**
   * Get hosted site information
   */
  async getHostedSite(previewId: string): Promise<HostedSite | null> {
    return this.hostedSites.get(previewId) || null;
  }

  /**
   * List all active hosted sites
   */
  async listHostedSites(): Promise<HostedSite[]> {
    const sites = Array.from(this.hostedSites.values());
    return sites.filter((site) => site.isActive);
  }

  /**
   * Delete hosted site
   */
  async deleteHostedSite(previewId: string): Promise<boolean> {
    const site = this.hostedSites.get(previewId);
    if (!site) return false;

    try {
      // Delete files
      await fs.rm(site.filePath, { recursive: true, force: true });

      // Mark as inactive
      site.isActive = false;
      this.hostedSites.delete(previewId);

      return true;
    } catch (error) {
      console.error('Failed to delete hosted site:', error);
      return false;
    }
  }

  /**
   * Extend hosting period
   */
  async extendHosting(previewId: string, additionalHours: number): Promise<HostedSite | null> {
    const site = this.hostedSites.get(previewId);
    if (!site) return null;

    const currentExpiry = new Date(site.expiresAt);
    const newExpiry = new Date(currentExpiry.getTime() + additionalHours * 60 * 60 * 1000);

    // Check max TTL
    const totalHours = (newExpiry.getTime() - new Date(site.createdAt).getTime()) / (60 * 60 * 1000);
    if (totalHours > this.maxTTL) {
      return null;
    }

    site.expiresAt = newExpiry.toISOString();
    return site;
  }

  /**
   * Create shareable link with optional password protection
   */
  async createShareableLink(
    previewId: string,
    password?: string
  ): Promise<{ shareUrl: string; password?: string }> {
    const site = this.hostedSites.get(previewId);
    if (!site) throw new Error('Site not found');

    const shareToken = nanoid(16);
    const shareUrl = `/preview/${previewId}?share=${shareToken}`;

    // In a real implementation, store the share token with password hash
    // For now, just return the URL

    return {
      shareUrl,
      password,
    };
  }

  /**
   * Generate QR code for mobile preview
   */
  async generateQRCode(previewUrl: string): Promise<string> {
    // In a real implementation, use a QR code library like 'qrcode'
    // For now, return a placeholder data URL
    return `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><text x="10" y="100">QR Code: ${previewUrl}</text></svg>`;
  }

  /**
   * Get preview statistics
   */
  async getPreviewStats(previewId: string): Promise<{
    views: number;
    uniqueVisitors: number;
    lastAccessed: string;
    devices: { mobile: number; tablet: number; desktop: number };
  }> {
    // In a real implementation, track actual statistics
    // For now, return placeholder data
    return {
      views: 0,
      uniqueVisitors: 0,
      lastAccessed: new Date().toISOString(),
      devices: {
        mobile: 0,
        tablet: 0,
        desktop: 0,
      },
    };
  }

  /**
   * Create ZIP download of hosted site
   */
  async createDownloadArchive(previewId: string): Promise<string> {
    const site = this.hostedSites.get(previewId);
    if (!site) throw new Error('Site not found');

    const zipPath = path.join(this.previewBasePath, `${previewId}.zip`);
    const output = createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    return new Promise((resolve, reject) => {
      output.on('close', () => resolve(zipPath));
      archive.on('error', reject);

      archive.pipe(output);
      archive.directory(site.filePath, false);
      archive.finalize();
    });
  }

  /**
   * Clone a hosted site (create a copy)
   */
  async cloneSite(previewId: string, newName?: string): Promise<HostedSite> {
    const originalSite = this.hostedSites.get(previewId);
    if (!originalSite) throw new Error('Site not found');

    // Read all files from original site
    const htmlContent = await fs.readFile(originalSite.indexPath, 'utf-8');

    // Read all assets
    const assets: { path: string; content: Buffer }[] = [];
    const files = await this.getAllFiles(originalSite.filePath);

    for (const file of files) {
      if (file === originalSite.indexPath) continue; // Skip index.html
      const relativePath = path.relative(originalSite.filePath, file);
      const content = await fs.readFile(file);
      assets.push({ path: relativePath, content });
    }

    // Create new hosted site
    return this.hostSite(originalSite.cloneId, htmlContent, assets, {
      name: newName || `${originalSite.name} (Copy)`,
    });
  }

  /**
   * Get all files in directory recursively
   */
  private async getAllFiles(dirPath: string): Promise<string[]> {
    const files: string[] = [];

    async function scan(currentPath: string) {
      const entries = await fs.readdir(currentPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name);

        if (entry.isDirectory()) {
          await scan(fullPath);
        } else if (entry.isFile()) {
          files.push(fullPath);
        }
      }
    }

    await scan(dirPath);
    return files;
  }

  /**
   * Cleanup expired sites
   */
  async cleanupExpiredSites(): Promise<number> {
    let cleanedCount = 0;
    const now = new Date();

    for (const [previewId, site] of this.hostedSites.entries()) {
      const expiresAt = new Date(site.expiresAt);

      if (now > expiresAt) {
        const deleted = await this.deleteHostedSite(previewId);
        if (deleted) cleanedCount++;
      }
    }

    return cleanedCount;
  }

  /**
   * Initialize cleanup scheduler (runs every hour)
   */
  private initializeCleanupScheduler(): void {
    setInterval(
      async () => {
        const cleaned = await this.cleanupExpiredSites();
        if (cleaned > 0) {
          console.log(`Cleaned up ${cleaned} expired preview sites`);
        }
      },
      60 * 60 * 1000
    ); // Run every hour
  }

  /**
   * Get Express router for serving preview sites
   */
  getPreviewRouter(): express.Router {
    const router = express.Router();

    // Serve preview site
    router.get('/:previewId/*?', async (req, res, next) => {
      const { previewId } = req.params;
      const site = this.hostedSites.get(previewId);

      if (!site || !site.isActive) {
        return res.status(404).send('Preview not found or expired');
      }

      // Check if expired
      if (new Date() > new Date(site.expiresAt)) {
        await this.deleteHostedSite(previewId);
        return res.status(410).send('Preview has expired');
      }

      // Serve requested file or index.html
      const requestedPath = req.params[0] || 'index.html';
      const filePath = path.join(site.filePath, requestedPath);

      try {
        await fs.access(filePath);
        res.sendFile(path.resolve(filePath));
      } catch {
        // Try serving index.html if file not found
        try {
          await fs.access(site.indexPath);
          res.sendFile(path.resolve(site.indexPath));
        } catch {
          res.status(404).send('File not found');
        }
      }
    });

    return router;
  }

  /**
   * Update hosted site metadata
   */
  async updateSiteMetadata(
    previewId: string,
    metadata: { name?: string; allowIndexing?: boolean }
  ): Promise<HostedSite | null> {
    const site = this.hostedSites.get(previewId);
    if (!site) return null;

    if (metadata.name) {
      site.name = metadata.name;
    }

    if (metadata.allowIndexing !== undefined) {
      const robotsPath = path.join(site.filePath, 'robots.txt');
      if (metadata.allowIndexing) {
        // Remove robots.txt
        try {
          await fs.unlink(robotsPath);
        } catch {}
      } else {
        // Add robots.txt
        await fs.writeFile(robotsPath, 'User-agent: *\nDisallow: /\n');
      }
    }

    return site;
  }

  /**
   * Get hosting capacity information
   */
  getCapacityInfo(): {
    totalSites: number;
    activeSites: number;
    totalSize: number;
    availableSlots: number;
  } {
    const activeSites = Array.from(this.hostedSites.values()).filter((s) => s.isActive);
    const totalSize = activeSites.reduce((sum, site) => sum + site.size, 0);

    return {
      totalSites: this.hostedSites.size,
      activeSites: activeSites.length,
      totalSize,
      availableSlots: 100 - activeSites.length, // Assuming max 100 concurrent sites
    };
  }
}
