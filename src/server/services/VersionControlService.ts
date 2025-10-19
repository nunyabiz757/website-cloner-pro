import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import AdmZip from 'adm-zip';

export interface Version {
  id: string;
  projectId: string;
  versionNumber: number;
  name: string;
  description?: string;
  createdBy: string;
  createdAt: Date;
  fileHash: string;
  fileSize: number;
  filePath: string;
  metadata: {
    htmlSize: number;
    cssSize: number;
    jsSize: number;
    imageCount: number;
    totalAssets: number;
  };
  tags: string[];
  isLatest: boolean;
}

export interface VersionSnapshot {
  html: string;
  css: string;
  js: string;
  assets: Array<{
    path: string;
    content: Buffer;
    type: string;
  }>;
  metadata: Record<string, any>;
}

export interface VersionDiff {
  versionA: Version;
  versionB: Version;
  changes: {
    added: number;
    removed: number;
    modified: number;
  };
  fileDiffs: Array<{
    file: string;
    type: 'added' | 'removed' | 'modified';
    linesAdded: number;
    linesRemoved: number;
  }>;
}

export interface VersionHistory {
  projectId: string;
  versions: Version[];
  totalVersions: number;
  latestVersion: Version | null;
  storageUsed: number; // in bytes
}

export interface CreateVersionOptions {
  projectId: string;
  name: string;
  description?: string;
  createdBy: string;
  snapshot: VersionSnapshot;
  tags?: string[];
  setAsLatest?: boolean;
}

export interface RestoreVersionOptions {
  versionId: string;
  projectId: string;
  createBackup?: boolean;
}

export class VersionControlService {
  private versionsDir: string;
  private maxVersionsPerProject: number = 50;

  constructor(baseDir: string = './versions') {
    this.versionsDir = baseDir;
  }

  /**
   * Initialize version control directory structure
   */
  async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.versionsDir, { recursive: true });
      console.log('Version control initialized');
    } catch (error) {
      console.error('Failed to initialize version control:', error);
      throw error;
    }
  }

  /**
   * Create a new version snapshot
   */
  async createVersion(options: CreateVersionOptions): Promise<Version> {
    const {
      projectId,
      name,
      description,
      createdBy,
      snapshot,
      tags = [],
      setAsLatest = true,
    } = options;

    try {
      // Get current version count for this project
      const history = await this.getVersionHistory(projectId);
      const versionNumber = history.totalVersions + 1;

      // Generate version ID
      const versionId = this.generateVersionId(projectId, versionNumber);

      // Create project directory
      const projectDir = path.join(this.versionsDir, projectId);
      await fs.mkdir(projectDir, { recursive: true });

      // Create version snapshot file
      const versionPath = path.join(projectDir, `${versionId}.zip`);
      await this.saveSnapshot(versionPath, snapshot);

      // Calculate file hash and size
      const fileBuffer = await fs.readFile(versionPath);
      const fileHash = this.calculateHash(fileBuffer);
      const fileSize = fileBuffer.length;

      // Calculate metadata
      const metadata = this.calculateSnapshotMetadata(snapshot);

      // Create version object
      const version: Version = {
        id: versionId,
        projectId,
        versionNumber,
        name,
        description,
        createdBy,
        createdAt: new Date(),
        fileHash,
        fileSize,
        filePath: versionPath,
        metadata,
        tags,
        isLatest: setAsLatest,
      };

      // Save version metadata
      await this.saveVersionMetadata(version);

      // Update latest flag if needed
      if (setAsLatest) {
        await this.updateLatestVersion(projectId, versionId);
      }

      // Check and enforce version limit
      await this.enforceVersionLimit(projectId);

      return version;
    } catch (error) {
      console.error('Failed to create version:', error);
      throw new Error(`Version creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get version by ID
   */
  async getVersion(versionId: string, projectId: string): Promise<Version | null> {
    try {
      const metadataPath = path.join(
        this.versionsDir,
        projectId,
        `${versionId}.json`
      );

      const metadataContent = await fs.readFile(metadataPath, 'utf-8');
      return JSON.parse(metadataContent);
    } catch (error) {
      console.error('Failed to get version:', error);
      return null;
    }
  }

  /**
   * Get version history for a project
   */
  async getVersionHistory(projectId: string): Promise<VersionHistory> {
    try {
      const projectDir = path.join(this.versionsDir, projectId);

      // Check if project directory exists
      try {
        await fs.access(projectDir);
      } catch {
        return {
          projectId,
          versions: [],
          totalVersions: 0,
          latestVersion: null,
          storageUsed: 0,
        };
      }

      // Read all version metadata files
      const files = await fs.readdir(projectDir);
      const metadataFiles = files.filter((f) => f.endsWith('.json'));

      const versions: Version[] = [];
      let storageUsed = 0;

      for (const file of metadataFiles) {
        const metadataPath = path.join(projectDir, file);
        const content = await fs.readFile(metadataPath, 'utf-8');
        const version = JSON.parse(content);
        versions.push(version);
        storageUsed += version.fileSize;
      }

      // Sort by version number descending
      versions.sort((a, b) => b.versionNumber - a.versionNumber);

      const latestVersion = versions.find((v) => v.isLatest) || versions[0] || null;

      return {
        projectId,
        versions,
        totalVersions: versions.length,
        latestVersion,
        storageUsed,
      };
    } catch (error) {
      console.error('Failed to get version history:', error);
      throw error;
    }
  }

  /**
   * Restore a specific version
   */
  async restoreVersion(options: RestoreVersionOptions): Promise<VersionSnapshot> {
    const { versionId, projectId, createBackup = true } = options;

    try {
      // Get version metadata
      const version = await this.getVersion(versionId, projectId);
      if (!version) {
        throw new Error('Version not found');
      }

      // Create backup of current version if requested
      if (createBackup) {
        // This would create a new version from current state
        // Implementation depends on how current state is accessed
      }

      // Load version snapshot
      const snapshot = await this.loadSnapshot(version.filePath);

      // Update latest flag
      await this.updateLatestVersion(projectId, versionId);

      return snapshot;
    } catch (error) {
      console.error('Failed to restore version:', error);
      throw new Error(`Version restoration failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Delete a version
   */
  async deleteVersion(versionId: string, projectId: string): Promise<void> {
    try {
      const version = await this.getVersion(versionId, projectId);
      if (!version) {
        throw new Error('Version not found');
      }

      if (version.isLatest) {
        throw new Error('Cannot delete the latest version');
      }

      // Delete version file
      await fs.unlink(version.filePath);

      // Delete metadata file
      const metadataPath = path.join(
        this.versionsDir,
        projectId,
        `${versionId}.json`
      );
      await fs.unlink(metadataPath);
    } catch (error) {
      console.error('Failed to delete version:', error);
      throw error;
    }
  }

  /**
   * Tag a version
   */
  async tagVersion(
    versionId: string,
    projectId: string,
    tags: string[]
  ): Promise<Version> {
    try {
      const version = await this.getVersion(versionId, projectId);
      if (!version) {
        throw new Error('Version not found');
      }

      version.tags = [...new Set([...version.tags, ...tags])];
      await this.saveVersionMetadata(version);

      return version;
    } catch (error) {
      console.error('Failed to tag version:', error);
      throw error;
    }
  }

  /**
   * Search versions by tags
   */
  async searchVersionsByTag(projectId: string, tag: string): Promise<Version[]> {
    try {
      const history = await this.getVersionHistory(projectId);
      return history.versions.filter((v) => v.tags.includes(tag));
    } catch (error) {
      console.error('Failed to search versions by tag:', error);
      throw error;
    }
  }

  /**
   * Compare two versions
   */
  async compareVersions(
    projectId: string,
    versionIdA: string,
    versionIdB: string
  ): Promise<VersionDiff> {
    try {
      const versionA = await this.getVersion(versionIdA, projectId);
      const versionB = await this.getVersion(versionIdB, projectId);

      if (!versionA || !versionB) {
        throw new Error('One or both versions not found');
      }

      // Load both snapshots
      const snapshotA = await this.loadSnapshot(versionA.filePath);
      const snapshotB = await this.loadSnapshot(versionB.filePath);

      // Calculate differences
      const fileDiffs = this.calculateFileDiffs(snapshotA, snapshotB);

      const changes = {
        added: fileDiffs.filter((d) => d.type === 'added').length,
        removed: fileDiffs.filter((d) => d.type === 'removed').length,
        modified: fileDiffs.filter((d) => d.type === 'modified').length,
      };

      return {
        versionA,
        versionB,
        changes,
        fileDiffs,
      };
    } catch (error) {
      console.error('Failed to compare versions:', error);
      throw error;
    }
  }

  /**
   * Get version statistics
   */
  async getVersionStats(projectId: string): Promise<{
    totalVersions: number;
    storageUsed: number;
    averageVersionSize: number;
    oldestVersion: Version | null;
    newestVersion: Version | null;
    tagDistribution: Record<string, number>;
  }> {
    try {
      const history = await this.getVersionHistory(projectId);

      const tagDistribution: Record<string, number> = {};
      history.versions.forEach((v) => {
        v.tags.forEach((tag) => {
          tagDistribution[tag] = (tagDistribution[tag] || 0) + 1;
        });
      });

      return {
        totalVersions: history.totalVersions,
        storageUsed: history.storageUsed,
        averageVersionSize:
          history.totalVersions > 0
            ? history.storageUsed / history.totalVersions
            : 0,
        oldestVersion: history.versions[history.versions.length - 1] || null,
        newestVersion: history.versions[0] || null,
        tagDistribution,
      };
    } catch (error) {
      console.error('Failed to get version stats:', error);
      throw error;
    }
  }

  /**
   * Clean up old versions (keep only N most recent)
   */
  async cleanupOldVersions(projectId: string, keepCount: number = 20): Promise<number> {
    try {
      const history = await this.getVersionHistory(projectId);

      if (history.totalVersions <= keepCount) {
        return 0;
      }

      // Sort by version number and keep the most recent ones
      const versionsToDelete = history.versions
        .sort((a, b) => b.versionNumber - a.versionNumber)
        .slice(keepCount)
        .filter((v) => !v.isLatest); // Never delete the latest version

      let deletedCount = 0;
      for (const version of versionsToDelete) {
        try {
          await this.deleteVersion(version.id, projectId);
          deletedCount++;
        } catch (error) {
          console.error(`Failed to delete version ${version.id}:`, error);
        }
      }

      return deletedCount;
    } catch (error) {
      console.error('Failed to cleanup old versions:', error);
      throw error;
    }
  }

  // Private helper methods

  private generateVersionId(projectId: string, versionNumber: number): string {
    const timestamp = Date.now();
    return `v${versionNumber}-${timestamp}`;
  }

  private calculateHash(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  private calculateSnapshotMetadata(snapshot: VersionSnapshot): Version['metadata'] {
    return {
      htmlSize: Buffer.byteLength(snapshot.html, 'utf-8'),
      cssSize: Buffer.byteLength(snapshot.css, 'utf-8'),
      jsSize: Buffer.byteLength(snapshot.js, 'utf-8'),
      imageCount: snapshot.assets.filter((a) => a.type.startsWith('image/')).length,
      totalAssets: snapshot.assets.length,
    };
  }

  private async saveSnapshot(filePath: string, snapshot: VersionSnapshot): Promise<void> {
    const zip = new AdmZip();

    // Add HTML
    zip.addFile('index.html', Buffer.from(snapshot.html, 'utf-8'));

    // Add CSS
    if (snapshot.css) {
      zip.addFile('styles.css', Buffer.from(snapshot.css, 'utf-8'));
    }

    // Add JS
    if (snapshot.js) {
      zip.addFile('script.js', Buffer.from(snapshot.js, 'utf-8'));
    }

    // Add assets
    for (const asset of snapshot.assets) {
      zip.addFile(asset.path, asset.content);
    }

    // Add metadata
    zip.addFile('metadata.json', Buffer.from(JSON.stringify(snapshot.metadata), 'utf-8'));

    // Write to file
    zip.writeZip(filePath);
  }

  private async loadSnapshot(filePath: string): Promise<VersionSnapshot> {
    const zip = new AdmZip(filePath);
    const entries = zip.getEntries();

    let html = '';
    let css = '';
    let js = '';
    const assets: VersionSnapshot['assets'] = [];
    let metadata = {};

    for (const entry of entries) {
      const content = entry.getData();

      if (entry.entryName === 'index.html') {
        html = content.toString('utf-8');
      } else if (entry.entryName === 'styles.css') {
        css = content.toString('utf-8');
      } else if (entry.entryName === 'script.js') {
        js = content.toString('utf-8');
      } else if (entry.entryName === 'metadata.json') {
        metadata = JSON.parse(content.toString('utf-8'));
      } else {
        assets.push({
          path: entry.entryName,
          content,
          type: this.getMimeType(entry.entryName),
        });
      }
    }

    return { html, css, js, assets, metadata };
  }

  private getMimeType(filename: string): string {
    const ext = path.extname(filename).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'application/javascript',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.webp': 'image/webp',
      '.woff': 'font/woff',
      '.woff2': 'font/woff2',
      '.ttf': 'font/ttf',
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }

  private async saveVersionMetadata(version: Version): Promise<void> {
    const metadataPath = path.join(
      this.versionsDir,
      version.projectId,
      `${version.id}.json`
    );
    await fs.writeFile(metadataPath, JSON.stringify(version, null, 2), 'utf-8');
  }

  private async updateLatestVersion(projectId: string, versionId: string): Promise<void> {
    const history = await this.getVersionHistory(projectId);

    // Remove latest flag from all versions
    for (const version of history.versions) {
      if (version.isLatest && version.id !== versionId) {
        version.isLatest = false;
        await this.saveVersionMetadata(version);
      } else if (version.id === versionId && !version.isLatest) {
        version.isLatest = true;
        await this.saveVersionMetadata(version);
      }
    }
  }

  private async enforceVersionLimit(projectId: string): Promise<void> {
    await this.cleanupOldVersions(projectId, this.maxVersionsPerProject);
  }

  private calculateFileDiffs(
    snapshotA: VersionSnapshot,
    snapshotB: VersionSnapshot
  ): VersionDiff['fileDiffs'] {
    const diffs: VersionDiff['fileDiffs'] = [];

    // Compare HTML
    if (snapshotA.html !== snapshotB.html) {
      diffs.push({
        file: 'index.html',
        type: 'modified',
        linesAdded: this.countLines(snapshotB.html) - this.countLines(snapshotA.html),
        linesRemoved: this.countLines(snapshotA.html) - this.countLines(snapshotB.html),
      });
    }

    // Compare CSS
    if (snapshotA.css !== snapshotB.css) {
      diffs.push({
        file: 'styles.css',
        type: 'modified',
        linesAdded: this.countLines(snapshotB.css) - this.countLines(snapshotA.css),
        linesRemoved: this.countLines(snapshotA.css) - this.countLines(snapshotB.css),
      });
    }

    // Compare JS
    if (snapshotA.js !== snapshotB.js) {
      diffs.push({
        file: 'script.js',
        type: 'modified',
        linesAdded: this.countLines(snapshotB.js) - this.countLines(snapshotA.js),
        linesRemoved: this.countLines(snapshotA.js) - this.countLines(snapshotB.js),
      });
    }

    // Compare assets
    const assetsA = new Map(snapshotA.assets.map((a) => [a.path, a]));
    const assetsB = new Map(snapshotB.assets.map((a) => [a.path, a]));

    // Find added assets
    for (const [path, asset] of assetsB) {
      if (!assetsA.has(path)) {
        diffs.push({
          file: path,
          type: 'added',
          linesAdded: 1,
          linesRemoved: 0,
        });
      }
    }

    // Find removed assets
    for (const [path, asset] of assetsA) {
      if (!assetsB.has(path)) {
        diffs.push({
          file: path,
          type: 'removed',
          linesAdded: 0,
          linesRemoved: 1,
        });
      }
    }

    return diffs;
  }

  private countLines(text: string): number {
    return text.split('\n').length;
  }
}
