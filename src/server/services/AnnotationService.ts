import fs from 'fs/promises';
import path from 'path';

export type AnnotationType = 'comment' | 'highlight' | 'markup' | 'suggestion' | 'issue';
export type AnnotationStatus = 'open' | 'resolved' | 'in_progress' | 'rejected';
export type Priority = 'low' | 'medium' | 'high' | 'critical';

export interface Annotation {
  id: string;
  projectId: string;
  versionId?: string;
  type: AnnotationType;
  status: AnnotationStatus;
  priority?: Priority;
  author: {
    userId: string;
    name: string;
    avatarUrl?: string;
  };
  content: string;
  position: AnnotationPosition;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt?: Date;
  resolvedBy?: string;
  replies: AnnotationReply[];
  tags: string[];
  mentions: string[]; // User IDs mentioned in the comment
  attachments: Attachment[];
  metadata?: Record<string, any>;
}

export interface AnnotationPosition {
  type: 'element' | 'text' | 'area' | 'page';
  selector?: string; // CSS selector for element
  xpath?: string; // XPath for precise element location
  textRange?: {
    start: number;
    end: number;
    text: string;
  };
  coordinates?: {
    x: number;
    y: number;
    width?: number;
    height?: number;
  };
  pageUrl?: string;
}

export interface AnnotationReply {
  id: string;
  author: {
    userId: string;
    name: string;
    avatarUrl?: string;
  };
  content: string;
  createdAt: Date;
  mentions: string[];
}

export interface Attachment {
  id: string;
  filename: string;
  type: string;
  size: number;
  url: string;
  uploadedAt: Date;
}

export interface MarkupStyle {
  color: string;
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  opacity?: number;
}

export interface CreateAnnotationOptions {
  projectId: string;
  versionId?: string;
  type: AnnotationType;
  content: string;
  position: AnnotationPosition;
  author: {
    userId: string;
    name: string;
    avatarUrl?: string;
  };
  priority?: Priority;
  tags?: string[];
  mentions?: string[];
  attachments?: Attachment[];
}

export interface AnnotationFilter {
  projectId: string;
  versionId?: string;
  type?: AnnotationType;
  status?: AnnotationStatus;
  priority?: Priority;
  authorId?: string;
  tags?: string[];
  dateFrom?: Date;
  dateTo?: Date;
}

export interface AnnotationStats {
  projectId: string;
  totalAnnotations: number;
  byType: Record<AnnotationType, number>;
  byStatus: Record<AnnotationStatus, number>;
  byPriority: Record<Priority, number>;
  byAuthor: Array<{
    userId: string;
    name: string;
    count: number;
  }>;
  recentActivity: Annotation[];
  unresolvedCount: number;
  avgResolutionTime: number; // in hours
}

export class AnnotationService {
  private dataDir: string;

  constructor(baseDir: string = './annotations') {
    this.dataDir = baseDir;
  }

  /**
   * Initialize annotations directory
   */
  async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
      await fs.mkdir(path.join(this.dataDir, 'attachments'), { recursive: true });
      console.log('Annotation service initialized');
    } catch (error) {
      console.error('Failed to initialize annotation service:', error);
      throw error;
    }
  }

  /**
   * Create a new annotation
   */
  async createAnnotation(options: CreateAnnotationOptions): Promise<Annotation> {
    try {
      const annotation: Annotation = {
        id: this.generateId(),
        projectId: options.projectId,
        versionId: options.versionId,
        type: options.type,
        status: 'open',
        priority: options.priority,
        author: options.author,
        content: options.content,
        position: options.position,
        createdAt: new Date(),
        updatedAt: new Date(),
        replies: [],
        tags: options.tags || [],
        mentions: options.mentions || [],
        attachments: options.attachments || [],
      };

      await this.saveAnnotation(annotation);

      return annotation;
    } catch (error) {
      console.error('Failed to create annotation:', error);
      throw error;
    }
  }

  /**
   * Get annotation by ID
   */
  async getAnnotation(annotationId: string): Promise<Annotation | null> {
    try {
      const annotationPath = this.getAnnotationPath(annotationId);
      const content = await fs.readFile(annotationPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      return null;
    }
  }

  /**
   * Update annotation
   */
  async updateAnnotation(
    annotationId: string,
    updates: Partial<Annotation>
  ): Promise<Annotation> {
    try {
      const annotation = await this.getAnnotation(annotationId);
      if (!annotation) {
        throw new Error('Annotation not found');
      }

      Object.assign(annotation, updates, { updatedAt: new Date() });
      await this.saveAnnotation(annotation);

      return annotation;
    } catch (error) {
      console.error('Failed to update annotation:', error);
      throw error;
    }
  }

  /**
   * Delete annotation
   */
  async deleteAnnotation(annotationId: string): Promise<void> {
    try {
      const annotationPath = this.getAnnotationPath(annotationId);
      await fs.unlink(annotationPath);
    } catch (error) {
      console.error('Failed to delete annotation:', error);
      throw error;
    }
  }

  /**
   * Add reply to annotation
   */
  async addReply(
    annotationId: string,
    reply: {
      author: { userId: string; name: string; avatarUrl?: string };
      content: string;
      mentions?: string[];
    }
  ): Promise<Annotation> {
    try {
      const annotation = await this.getAnnotation(annotationId);
      if (!annotation) {
        throw new Error('Annotation not found');
      }

      const newReply: AnnotationReply = {
        id: this.generateId(),
        author: reply.author,
        content: reply.content,
        createdAt: new Date(),
        mentions: reply.mentions || [],
      };

      annotation.replies.push(newReply);
      annotation.updatedAt = new Date();

      await this.saveAnnotation(annotation);

      return annotation;
    } catch (error) {
      console.error('Failed to add reply:', error);
      throw error;
    }
  }

  /**
   * Resolve annotation
   */
  async resolveAnnotation(annotationId: string, resolvedBy: string): Promise<Annotation> {
    try {
      const annotation = await this.getAnnotation(annotationId);
      if (!annotation) {
        throw new Error('Annotation not found');
      }

      annotation.status = 'resolved';
      annotation.resolvedAt = new Date();
      annotation.resolvedBy = resolvedBy;
      annotation.updatedAt = new Date();

      await this.saveAnnotation(annotation);

      return annotation;
    } catch (error) {
      console.error('Failed to resolve annotation:', error);
      throw error;
    }
  }

  /**
   * Reopen annotation
   */
  async reopenAnnotation(annotationId: string): Promise<Annotation> {
    try {
      const annotation = await this.getAnnotation(annotationId);
      if (!annotation) {
        throw new Error('Annotation not found');
      }

      annotation.status = 'open';
      annotation.resolvedAt = undefined;
      annotation.resolvedBy = undefined;
      annotation.updatedAt = new Date();

      await this.saveAnnotation(annotation);

      return annotation;
    } catch (error) {
      console.error('Failed to reopen annotation:', error);
      throw error;
    }
  }

  /**
   * Get annotations with filters
   */
  async getAnnotations(filter: AnnotationFilter): Promise<Annotation[]> {
    try {
      const projectDir = path.join(this.dataDir, filter.projectId);

      try {
        await fs.access(projectDir);
      } catch {
        return [];
      }

      const files = await fs.readdir(projectDir);
      const annotations: Annotation[] = [];

      for (const file of files) {
        if (!file.endsWith('.json')) continue;

        const annotationPath = path.join(projectDir, file);
        const content = await fs.readFile(annotationPath, 'utf-8');
        const annotation: Annotation = JSON.parse(content);

        // Apply filters
        if (filter.versionId && annotation.versionId !== filter.versionId) continue;
        if (filter.type && annotation.type !== filter.type) continue;
        if (filter.status && annotation.status !== filter.status) continue;
        if (filter.priority && annotation.priority !== filter.priority) continue;
        if (filter.authorId && annotation.author.userId !== filter.authorId) continue;
        if (filter.tags && !filter.tags.some((tag) => annotation.tags.includes(tag))) continue;
        if (filter.dateFrom && new Date(annotation.createdAt) < filter.dateFrom) continue;
        if (filter.dateTo && new Date(annotation.createdAt) > filter.dateTo) continue;

        annotations.push(annotation);
      }

      // Sort by creation date descending
      annotations.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      return annotations;
    } catch (error) {
      console.error('Failed to get annotations:', error);
      return [];
    }
  }

  /**
   * Get annotations by element selector
   */
  async getAnnotationsByElement(
    projectId: string,
    selector: string,
    versionId?: string
  ): Promise<Annotation[]> {
    try {
      const annotations = await this.getAnnotations({
        projectId,
        versionId,
      });

      return annotations.filter((a) => a.position.selector === selector);
    } catch (error) {
      console.error('Failed to get annotations by element:', error);
      return [];
    }
  }

  /**
   * Search annotations by content
   */
  async searchAnnotations(
    projectId: string,
    query: string,
    options?: { versionId?: string; limit?: number }
  ): Promise<Annotation[]> {
    try {
      const annotations = await this.getAnnotations({
        projectId,
        versionId: options?.versionId,
      });

      const lowerQuery = query.toLowerCase();
      const results = annotations.filter(
        (a) =>
          a.content.toLowerCase().includes(lowerQuery) ||
          a.replies.some((r) => r.content.toLowerCase().includes(lowerQuery)) ||
          a.tags.some((t) => t.toLowerCase().includes(lowerQuery))
      );

      return options?.limit ? results.slice(0, options.limit) : results;
    } catch (error) {
      console.error('Failed to search annotations:', error);
      return [];
    }
  }

  /**
   * Get annotation statistics
   */
  async getAnnotationStats(projectId: string): Promise<AnnotationStats> {
    try {
      const annotations = await this.getAnnotations({ projectId });

      const byType: Record<string, number> = {};
      const byStatus: Record<string, number> = {};
      const byPriority: Record<string, number> = {};
      const byAuthorMap = new Map<string, { name: string; count: number }>();

      let totalResolutionTime = 0;
      let resolvedCount = 0;

      annotations.forEach((annotation) => {
        // Count by type
        byType[annotation.type] = (byType[annotation.type] || 0) + 1;

        // Count by status
        byStatus[annotation.status] = (byStatus[annotation.status] || 0) + 1;

        // Count by priority
        if (annotation.priority) {
          byPriority[annotation.priority] = (byPriority[annotation.priority] || 0) + 1;
        }

        // Count by author
        const authorData = byAuthorMap.get(annotation.author.userId) || {
          name: annotation.author.name,
          count: 0,
        };
        authorData.count++;
        byAuthorMap.set(annotation.author.userId, authorData);

        // Calculate resolution time
        if (annotation.status === 'resolved' && annotation.resolvedAt) {
          const resolutionTime =
            new Date(annotation.resolvedAt).getTime() - new Date(annotation.createdAt).getTime();
          totalResolutionTime += resolutionTime;
          resolvedCount++;
        }
      });

      const byAuthor = Array.from(byAuthorMap.entries())
        .map(([userId, data]) => ({
          userId,
          name: data.name,
          count: data.count,
        }))
        .sort((a, b) => b.count - a.count);

      const avgResolutionTime =
        resolvedCount > 0 ? totalResolutionTime / resolvedCount / (1000 * 60 * 60) : 0; // Convert to hours

      const unresolvedCount = annotations.filter((a) => a.status !== 'resolved').length;

      const recentActivity = annotations
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, 10);

      return {
        projectId,
        totalAnnotations: annotations.length,
        byType: byType as Record<AnnotationType, number>,
        byStatus: byStatus as Record<AnnotationStatus, number>,
        byPriority: byPriority as Record<Priority, number>,
        byAuthor,
        recentActivity,
        unresolvedCount,
        avgResolutionTime,
      };
    } catch (error) {
      console.error('Failed to get annotation stats:', error);
      throw error;
    }
  }

  /**
   * Export annotations to various formats
   */
  async exportAnnotations(
    projectId: string,
    format: 'json' | 'csv' | 'markdown'
  ): Promise<string> {
    try {
      const annotations = await this.getAnnotations({ projectId });

      switch (format) {
        case 'json':
          return JSON.stringify(annotations, null, 2);

        case 'csv':
          return this.generateCSV(annotations);

        case 'markdown':
          return this.generateMarkdown(annotations);

        default:
          throw new Error(`Unsupported export format: ${format}`);
      }
    } catch (error) {
      console.error('Failed to export annotations:', error);
      throw error;
    }
  }

  /**
   * Bulk update annotation status
   */
  async bulkUpdateStatus(
    annotationIds: string[],
    status: AnnotationStatus,
    userId: string
  ): Promise<number> {
    let updateCount = 0;

    for (const annotationId of annotationIds) {
      try {
        const annotation = await this.getAnnotation(annotationId);
        if (annotation) {
          annotation.status = status;
          annotation.updatedAt = new Date();

          if (status === 'resolved') {
            annotation.resolvedAt = new Date();
            annotation.resolvedBy = userId;
          }

          await this.saveAnnotation(annotation);
          updateCount++;
        }
      } catch (error) {
        console.error(`Failed to update annotation ${annotationId}:`, error);
      }
    }

    return updateCount;
  }

  /**
   * Get annotations that mention a user
   */
  async getMentions(projectId: string, userId: string): Promise<Annotation[]> {
    try {
      const annotations = await this.getAnnotations({ projectId });

      return annotations.filter(
        (a) =>
          a.mentions.includes(userId) ||
          a.replies.some((r) => r.mentions.includes(userId))
      );
    } catch (error) {
      console.error('Failed to get mentions:', error);
      return [];
    }
  }

  // Private helper methods

  private getAnnotationPath(annotationId: string): string {
    // Extract project ID from annotation (would need to be stored in filename or searched)
    // For simplicity, we'll search through all project directories
    // In production, you'd want a better indexing system
    return path.join(this.dataDir, `${annotationId}.json`);
  }

  private async saveAnnotation(annotation: Annotation): Promise<void> {
    const projectDir = path.join(this.dataDir, annotation.projectId);
    await fs.mkdir(projectDir, { recursive: true });

    const annotationPath = path.join(projectDir, `${annotation.id}.json`);
    await fs.writeFile(annotationPath, JSON.stringify(annotation, null, 2), 'utf-8');
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateCSV(annotations: Annotation[]): string {
    const headers = [
      'ID',
      'Type',
      'Status',
      'Priority',
      'Author',
      'Content',
      'Created',
      'Resolved',
      'Replies',
      'Tags',
    ];

    const rows = annotations.map((a) => [
      a.id,
      a.type,
      a.status,
      a.priority || '',
      a.author.name,
      a.content.replace(/"/g, '""'),
      a.createdAt.toISOString(),
      a.resolvedAt?.toISOString() || '',
      a.replies.length.toString(),
      a.tags.join(', '),
    ]);

    const csv = [headers, ...rows].map((row) => row.map((cell) => `"${cell}"`).join(',')).join('\n');

    return csv;
  }

  private generateMarkdown(annotations: Annotation[]): string {
    let markdown = '# Annotations Report\n\n';
    markdown += `Generated: ${new Date().toISOString()}\n\n`;
    markdown += `Total Annotations: ${annotations.length}\n\n`;
    markdown += '---\n\n';

    annotations.forEach((annotation) => {
      markdown += `## ${annotation.type.toUpperCase()}: ${annotation.content.slice(0, 50)}...\n\n`;
      markdown += `**Status:** ${annotation.status}\n`;
      markdown += `**Priority:** ${annotation.priority || 'N/A'}\n`;
      markdown += `**Author:** ${annotation.author.name}\n`;
      markdown += `**Created:** ${annotation.createdAt.toISOString()}\n`;

      if (annotation.resolvedAt) {
        markdown += `**Resolved:** ${annotation.resolvedAt.toISOString()}\n`;
      }

      if (annotation.tags.length > 0) {
        markdown += `**Tags:** ${annotation.tags.join(', ')}\n`;
      }

      markdown += `\n**Content:**\n${annotation.content}\n\n`;

      if (annotation.replies.length > 0) {
        markdown += `**Replies (${annotation.replies.length}):**\n\n`;
        annotation.replies.forEach((reply) => {
          markdown += `- ${reply.author.name} (${reply.createdAt.toISOString()}): ${reply.content}\n`;
        });
        markdown += '\n';
      }

      markdown += '---\n\n';
    });

    return markdown;
  }
}
