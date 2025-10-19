import { Request, Response, NextFunction } from 'express';
import { z, ZodSchema, ZodError } from 'zod';
import { JSDOM } from 'jsdom';
import DOMPurify from 'dompurify';

// Create DOMPurify instance
const window = new JSDOM('').window;
const purify = DOMPurify(window as unknown as Window);

/**
 * Validation middleware factory
 * @param schema Zod schema to validate against
 * @param source Source of data to validate ('body', 'query', 'params')
 * @returns Express middleware
 */
export const validate = (
  schema: ZodSchema,
  source: 'body' | 'query' | 'params' = 'body'
) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = req[source];
      const validated = await schema.parseAsync(data);
      req[source] = validated;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: error.errors.map((err) => ({
            field: err.path.join('.'),
            message: err.message,
            code: err.code,
          })),
        });
        return;
      }

      console.error('Validation middleware error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      });
    }
  };
};

/**
 * Sanitize HTML middleware
 * Removes potentially dangerous HTML/JavaScript
 */
export const sanitizeHTML = (fields: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      for (const field of fields) {
        const value = req.body[field];
        if (typeof value === 'string') {
          req.body[field] = purify.sanitize(value, {
            ALLOWED_TAGS: [
              'p',
              'br',
              'strong',
              'em',
              'u',
              's',
              'h1',
              'h2',
              'h3',
              'h4',
              'h5',
              'h6',
              'blockquote',
              'code',
              'pre',
              'ul',
              'ol',
              'li',
              'a',
            ],
            ALLOWED_ATTR: ['href', 'title', 'target'],
            ALLOW_DATA_ATTR: false,
          });
        }
      }
      next();
    } catch (error) {
      console.error('HTML sanitization error:', error);
      res.status(500).json({
        success: false,
        error: 'Sanitization failed',
        code: 'SANITIZATION_ERROR',
      });
    }
  };
};

/**
 * Strip all HTML tags middleware
 * Removes all HTML, leaving only text
 */
export const stripHTML = (fields: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      for (const field of fields) {
        const value = req.body[field];
        if (typeof value === 'string') {
          req.body[field] = purify.sanitize(value, {
            ALLOWED_TAGS: [],
            ALLOWED_ATTR: [],
          });
        }
      }
      next();
    } catch (error) {
      console.error('HTML stripping error:', error);
      res.status(500).json({
        success: false,
        error: 'Sanitization failed',
        code: 'SANITIZATION_ERROR',
      });
    }
  };
};

/**
 * Prevent SQL injection by escaping common patterns
 * Note: This is a fallback - use parameterized queries as primary defense
 */
export const preventSQLInjection = (fields: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const sqlPatterns = [
        /(\bUNION\b.*\bSELECT\b)/gi,
        /(\bSELECT\b.*\bFROM\b)/gi,
        /(\bINSERT\b.*\bINTO\b)/gi,
        /(\bDELETE\b.*\bFROM\b)/gi,
        /(\bUPDATE\b.*\bSET\b)/gi,
        /(\bDROP\b.*\bTABLE\b)/gi,
        /(\bEXEC\b|\bEXECUTE\b)/gi,
        /(--|;|\/\*|\*\/)/g,
      ];

      for (const field of fields) {
        const value = req.body[field];
        if (typeof value === 'string') {
          for (const pattern of sqlPatterns) {
            if (pattern.test(value)) {
              res.status(400).json({
                success: false,
                error: 'Invalid input detected',
                code: 'INVALID_INPUT',
              });
              return;
            }
          }
        }
      }
      next();
    } catch (error) {
      console.error('SQL injection prevention error:', error);
      res.status(500).json({
        success: false,
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
      });
    }
  };
};

/**
 * Prevent NoSQL injection by sanitizing MongoDB operators
 */
export const preventNoSQLInjection = (fields: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const sanitizeValue = (value: any): any => {
        if (typeof value === 'object' && value !== null) {
          if (Array.isArray(value)) {
            return value.map(sanitizeValue);
          }

          const sanitized: any = {};
          for (const key of Object.keys(value)) {
            // Remove MongoDB operators
            if (!key.startsWith('$') && !key.startsWith('_')) {
              sanitized[key] = sanitizeValue(value[key]);
            }
          }
          return sanitized;
        }
        return value;
      };

      for (const field of fields) {
        if (req.body[field] !== undefined) {
          req.body[field] = sanitizeValue(req.body[field]);
        }
      }
      next();
    } catch (error) {
      console.error('NoSQL injection prevention error:', error);
      res.status(500).json({
        success: false,
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
      });
    }
  };
};

/**
 * Prevent XSS attacks by escaping dangerous characters
 */
export const preventXSS = (fields: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const escapeHTML = (str: string): string => {
        const escapeMap: Record<string, string> = {
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#x27;',
          '/': '&#x2F;',
        };
        return str.replace(/[&<>"'/]/g, (char) => escapeMap[char]);
      };

      for (const field of fields) {
        const value = req.body[field];
        if (typeof value === 'string') {
          req.body[field] = escapeHTML(value);
        }
      }
      next();
    } catch (error) {
      console.error('XSS prevention error:', error);
      res.status(500).json({
        success: false,
        error: 'Sanitization failed',
        code: 'SANITIZATION_ERROR',
      });
    }
  };
};

/**
 * Validate and sanitize URL
 */
export const sanitizeURL = (fields: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      for (const field of fields) {
        const value = req.body[field];
        if (typeof value === 'string') {
          try {
            const url = new URL(value);
            // Only allow http and https protocols
            if (!['http:', 'https:'].includes(url.protocol)) {
              res.status(400).json({
                success: false,
                error: `Invalid protocol in ${field}. Only HTTP and HTTPS are allowed.`,
                code: 'INVALID_URL',
              });
              return;
            }
            req.body[field] = url.toString();
          } catch (error) {
            res.status(400).json({
              success: false,
              error: `Invalid URL in ${field}`,
              code: 'INVALID_URL',
            });
            return;
          }
        }
      }
      next();
    } catch (error) {
      console.error('URL sanitization error:', error);
      res.status(500).json({
        success: false,
        error: 'URL validation failed',
        code: 'VALIDATION_ERROR',
      });
    }
  };
};

/**
 * Trim whitespace from string fields
 */
export const trimStrings = (fields: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      for (const field of fields) {
        const value = req.body[field];
        if (typeof value === 'string') {
          req.body[field] = value.trim();
        }
      }
      next();
    } catch (error) {
      console.error('String trimming error:', error);
      next();
    }
  };
};

/**
 * Prevent path traversal attacks
 */
export const preventPathTraversal = (fields: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const pathTraversalPattern = /(\.\.(\/|\\))|(\.\.$)/gi;

      for (const field of fields) {
        const value = req.body[field];
        if (typeof value === 'string' && pathTraversalPattern.test(value)) {
          res.status(400).json({
            success: false,
            error: 'Invalid path detected',
            code: 'INVALID_PATH',
          });
          return;
        }
      }
      next();
    } catch (error) {
      console.error('Path traversal prevention error:', error);
      res.status(500).json({
        success: false,
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
      });
    }
  };
};

// Common validation schemas
export const commonSchemas = {
  email: z.string().email('Invalid email format').toLowerCase(),
  password: z
    .string()
    .min(12, 'Password must be at least 12 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(
      /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/,
      'Password must contain at least one special character'
    ),
  url: z.string().url('Invalid URL format'),
  uuid: z.string().uuid('Invalid UUID format'),
  positiveInt: z.number().int().positive('Must be a positive integer'),
  nonNegativeInt: z.number().int().nonnegative('Must be a non-negative integer'),
  alphanumeric: z
    .string()
    .regex(/^[a-zA-Z0-9]+$/, 'Must contain only letters and numbers'),
  slug: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Invalid slug format'),
  hexColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid hex color format'),
  phoneNumber: z.string().regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number format'),
  ipAddress: z.string().ip('Invalid IP address'),
  dateISO: z.string().datetime('Invalid ISO date format'),
};
