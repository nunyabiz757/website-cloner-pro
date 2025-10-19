import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

export interface CreatePasteSessionParams {
  clonedPageId: string;
  userId: string;
  expiresInMinutes?: number;
}

export interface CompletePasteParams {
  pasteCode: string;
  destinationUrl: string;
  status: 'completed' | 'failed' | 'partial';
  elementsCount?: number;
  errors?: Array<{ type: string; message: string; element?: string }>;
  warnings?: Array<{ type: string; message: string }>;
}

export interface PasteSessionData {
  id: string;
  pasteCode: string;
  status: string;
  expiresAt: Date;
  expiresIn: number;
  clonedPage: {
    id: string;
    sourceUrl: string;
    sourceTitle: string | null;
    pageData: any;
  };
}

export class PasteSessionService {
  /**
   * Generate unique paste code (8 characters, URL-safe)
   */
  private static generatePasteCode(): string {
    return crypto.randomBytes(6).toString('base64url').substring(0, 8).toUpperCase();
  }

  /**
   * Create a new paste session
   */
  static async createPasteSession(params: CreatePasteSessionParams): Promise<PasteSessionData> {
    const { clonedPageId, userId, expiresInMinutes = 5 } = params;

    // Verify cloned page exists and belongs to user
    const clonedPage = await prisma.clonedPage.findFirst({
      where: {
        id: clonedPageId,
        userId,
      },
    });

    if (!clonedPage) {
      throw new Error('Cloned page not found or access denied');
    }

    // Generate unique paste code
    let pasteCode: string;
    let attempts = 0;
    const maxAttempts = 10;

    do {
      pasteCode = this.generatePasteCode();
      attempts++;

      if (attempts >= maxAttempts) {
        throw new Error('Failed to generate unique paste code');
      }

      // Check if code already exists
      const existing = await prisma.pasteSession.findUnique({
        where: { pasteCode },
      });

      if (!existing) break;
    } while (attempts < maxAttempts);

    // Calculate expiration
    const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);

    // Create paste session
    const session = await prisma.pasteSession.create({
      data: {
        clonedPageId,
        userId,
        pasteCode,
        expiresAt,
        status: 'pending',
      },
      include: {
        clonedPage: true,
      },
    });

    return {
      id: session.id,
      pasteCode: session.pasteCode,
      status: session.status,
      expiresAt: session.expiresAt,
      expiresIn: expiresInMinutes * 60,
      clonedPage: {
        id: session.clonedPage.id,
        sourceUrl: session.clonedPage.sourceUrl,
        sourceTitle: session.clonedPage.sourceTitle,
        pageData: JSON.parse(session.clonedPage.pageData),
      },
    };
  }

  /**
   * Get paste session by paste code (for bookmarklet)
   */
  static async getPasteSession(pasteCode: string): Promise<PasteSessionData> {
    const session = await prisma.pasteSession.findUnique({
      where: { pasteCode },
      include: {
        clonedPage: true,
      },
    });

    if (!session) {
      throw new Error('Paste session not found');
    }

    // Check if expired
    if (new Date() > session.expiresAt) {
      await prisma.pasteSession.update({
        where: { id: session.id },
        data: { status: 'expired' },
      });
      throw new Error('Paste session expired');
    }

    // Check if already used
    if (session.status === 'completed') {
      throw new Error('Paste session already used');
    }

    if (session.status === 'failed') {
      throw new Error('Paste session failed');
    }

    // Mark as active
    if (session.status === 'pending') {
      await prisma.pasteSession.update({
        where: { id: session.id },
        data: { status: 'active' },
      });
    }

    const expiresIn = Math.max(0, Math.floor((session.expiresAt.getTime() - Date.now()) / 1000));

    return {
      id: session.id,
      pasteCode: session.pasteCode,
      status: 'active',
      expiresAt: session.expiresAt,
      expiresIn,
      clonedPage: {
        id: session.clonedPage.id,
        sourceUrl: session.clonedPage.sourceUrl,
        sourceTitle: session.clonedPage.sourceTitle,
        pageData: JSON.parse(session.clonedPage.pageData),
      },
    };
  }

  /**
   * Complete paste session (called after successful paste)
   */
  static async completePasteSession(params: CompletePasteParams): Promise<void> {
    const { pasteCode, destinationUrl, status, elementsCount, errors, warnings } = params;

    const session = await prisma.pasteSession.findUnique({
      where: { pasteCode },
    });

    if (!session) {
      throw new Error('Paste session not found');
    }

    await prisma.pasteSession.update({
      where: { id: session.id },
      data: {
        status,
        destinationUrl,
        elementsCount: elementsCount || 0,
        errors: errors ? JSON.stringify(errors) : null,
        warnings: warnings ? JSON.stringify(warnings) : null,
        completedAt: new Date(),
      },
    });
  }

  /**
   * List user's paste sessions
   */
  static async listPasteSessions(userId: string, limit = 50) {
    const sessions = await prisma.pasteSession.findMany({
      where: { userId },
      include: {
        clonedPage: {
          select: {
            id: true,
            sourceUrl: true,
            sourceTitle: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return sessions.map((session) => ({
      id: session.id,
      pasteCode: session.pasteCode,
      status: session.status,
      destinationUrl: session.destinationUrl,
      elementsCount: session.elementsCount,
      expiresAt: session.expiresAt,
      completedAt: session.completedAt,
      createdAt: session.createdAt,
      clonedPage: session.clonedPage,
    }));
  }

  /**
   * Cleanup expired sessions (cron job)
   */
  static async cleanupExpiredSessions(): Promise<number> {
    const result = await prisma.pasteSession.updateMany({
      where: {
        expiresAt: {
          lt: new Date(),
        },
        status: {
          in: ['pending', 'active'],
        },
      },
      data: {
        status: 'expired',
      },
    });

    return result.count;
  }

  /**
   * Delete old completed sessions (cron job - keep last 30 days)
   */
  static async deleteOldSessions(daysToKeep = 30): Promise<number> {
    const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);

    const result = await prisma.pasteSession.deleteMany({
      where: {
        createdAt: {
          lt: cutoffDate,
        },
        status: {
          in: ['completed', 'failed', 'expired'],
        },
      },
    });

    return result.count;
  }
}
