import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface CreateClonedPageParams {
  userId: string;
  sourceUrl: string;
  sourceTitle?: string;
  pageData: any;
  creditsConsumed?: number;
}

export interface ListClonedPagesParams {
  userId: string;
  limit?: number;
  status?: 'copied' | 'failed';
  search?: string;
}

export class ClonedPageService {
  /**
   * Create a new cloned page
   */
  static async createClonedPage(params: CreateClonedPageParams) {
    const { userId, sourceUrl, sourceTitle, pageData, creditsConsumed = 1 } = params;

    const clonedPage = await prisma.clonedPage.create({
      data: {
        userId,
        sourceUrl,
        sourceTitle: sourceTitle || null,
        pageData: JSON.stringify(pageData),
        creditsConsumed,
        status: 'copied',
      },
    });

    return {
      id: clonedPage.id,
      userId: clonedPage.userId,
      sourceUrl: clonedPage.sourceUrl,
      sourceTitle: clonedPage.sourceTitle,
      creditsConsumed: clonedPage.creditsConsumed,
      status: clonedPage.status,
      createdAt: clonedPage.createdAt,
    };
  }

  /**
   * Get cloned page by ID
   */
  static async getClonedPage(id: string, userId: string) {
    const clonedPage = await prisma.clonedPage.findFirst({
      where: {
        id,
        userId,
      },
    });

    if (!clonedPage) {
      throw new Error('Cloned page not found or access denied');
    }

    return {
      id: clonedPage.id,
      userId: clonedPage.userId,
      sourceUrl: clonedPage.sourceUrl,
      sourceTitle: clonedPage.sourceTitle,
      pageData: JSON.parse(clonedPage.pageData),
      creditsConsumed: clonedPage.creditsConsumed,
      status: clonedPage.status,
      createdAt: clonedPage.createdAt,
    };
  }

  /**
   * List cloned pages for a user
   */
  static async listClonedPages(params: ListClonedPagesParams) {
    const { userId, limit = 50, status, search } = params;

    const where: any = { userId };

    if (status) {
      where.status = status;
    }

    if (search) {
      where.OR = [
        { sourceTitle: { contains: search, mode: 'insensitive' } },
        { sourceUrl: { contains: search, mode: 'insensitive' } },
      ];
    }

    const clonedPages = await prisma.clonedPage.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        sourceUrl: true,
        sourceTitle: true,
        creditsConsumed: true,
        status: true,
        createdAt: true,
        _count: {
          select: {
            pasteSessions: true,
          },
        },
      },
    });

    return clonedPages.map((page) => ({
      id: page.id,
      sourceUrl: page.sourceUrl,
      sourceTitle: page.sourceTitle,
      creditsConsumed: page.creditsConsumed,
      status: page.status,
      createdAt: page.createdAt,
      pasteCount: page._count.pasteSessions,
    }));
  }

  /**
   * Delete cloned page
   */
  static async deleteClonedPage(id: string, userId: string) {
    const clonedPage = await prisma.clonedPage.findFirst({
      where: {
        id,
        userId,
      },
    });

    if (!clonedPage) {
      throw new Error('Cloned page not found or access denied');
    }

    await prisma.clonedPage.delete({
      where: { id },
    });

    return { success: true };
  }

  /**
   * Get user's cloned pages statistics
   */
  static async getStatistics(userId: string) {
    const totalPages = await prisma.clonedPage.count({
      where: { userId },
    });

    const totalCredits = await prisma.clonedPage.aggregate({
      where: { userId },
      _sum: {
        creditsConsumed: true,
      },
    });

    const totalPasteSessions = await prisma.pasteSession.count({
      where: { userId },
    });

    const successfulPastes = await prisma.pasteSession.count({
      where: {
        userId,
        status: 'completed',
      },
    });

    return {
      totalPages,
      totalCreditsUsed: totalCredits._sum.creditsConsumed || 0,
      totalPasteSessions,
      successfulPastes,
    };
  }
}
