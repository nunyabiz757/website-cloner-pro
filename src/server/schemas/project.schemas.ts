import { z } from 'zod';
import { commonSchemas } from '../middleware/validation.middleware.js';

/**
 * Project/Website cloning validation schemas
 */

export const createProjectSchema = z.object({
  name: z.string().min(1, 'Project name is required').max(200),
  url: commonSchemas.url,
  description: z.string().max(1000).optional(),
  settings: z
    .object({
      includeImages: z.boolean().default(true),
      includeFonts: z.boolean().default(true),
      includeVideos: z.boolean().default(false),
      maxDepth: commonSchemas.nonNegativeInt.max(5).default(1),
      timeout: commonSchemas.positiveInt.max(120000).default(30000),
      userAgent: z.string().max(500).optional(),
      headers: z.record(z.string()).optional(),
    })
    .optional(),
});

export const updateProjectSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  status: z.enum(['pending', 'processing', 'completed', 'failed']).optional(),
  settings: z
    .object({
      includeImages: z.boolean().optional(),
      includeFonts: z.boolean().optional(),
      includeVideos: z.boolean().optional(),
      maxDepth: commonSchemas.nonNegativeInt.max(5).optional(),
      timeout: commonSchemas.positiveInt.max(120000).optional(),
    })
    .optional(),
});

export const cloneWebsiteSchema = z.object({
  url: commonSchemas.url,
  options: z
    .object({
      includeImages: z.boolean().default(true),
      includeFonts: z.boolean().default(true),
      includeVideos: z.boolean().default(false),
      includeJS: z.boolean().default(true),
      includeCSS: z.boolean().default(true),
      maxDepth: commonSchemas.nonNegativeInt.max(5).default(1),
      followExternalLinks: z.boolean().default(false),
      respectRobotsTxt: z.boolean().default(true),
      timeout: commonSchemas.positiveInt.max(120000).default(30000),
      maxConcurrency: commonSchemas.positiveInt.max(10).default(5),
      userAgent: z.string().max(500).optional(),
      headers: z.record(z.string()).optional(),
      proxy: z.string().url().optional(),
    })
    .optional(),
});

export const deployProjectSchema = z.object({
  platform: z.enum(['vercel', 'netlify', 'custom', 'preview']),
  settings: z
    .object({
      subdomain: z.string().regex(/^[a-z0-9-]+$/).min(3).max(63).optional(),
      customDomain: z.string().optional(),
      environmentVariables: z.record(z.string()).optional(),
      buildCommand: z.string().max(500).optional(),
      outputDirectory: z.string().max(200).optional(),
    })
    .optional(),
});

export const exportProjectSchema = z.object({
  format: z.enum(['html', 'wordpress-theme', 'wordpress-plugin', 'static']),
  options: z
    .object({
      minify: z.boolean().default(true),
      optimize: z.boolean().default(true),
      includeSource: z.boolean().default(false),
      generateSitemap: z.boolean().default(true),
    })
    .optional(),
});

export const projectQuerySchema = z.object({
  page: commonSchemas.positiveInt.default(1),
  limit: commonSchemas.positiveInt.max(100).default(20),
  sortBy: z.enum(['createdAt', 'updatedAt', 'name']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  status: z.enum(['pending', 'processing', 'completed', 'failed']).optional(),
  search: z.string().max(200).optional(),
});

// Type exports
export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type CloneWebsiteInput = z.infer<typeof cloneWebsiteSchema>;
export type DeployProjectInput = z.infer<typeof deployProjectSchema>;
export type ExportProjectInput = z.infer<typeof exportProjectSchema>;
export type ProjectQueryInput = z.infer<typeof projectQuerySchema>;
