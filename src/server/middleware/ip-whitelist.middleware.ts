import { Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';
import APIKeyService from '../services/api-key.service.js';
import { AppLogger } from '../services/logger.service.js';

/**
 * IP Whitelist Middleware
 * Validates API key requests against IP whitelist
 */

let apiKeyService: APIKeyService | null = null;

export function initializeIPWhitelistMiddleware(pool: Pool): void {
  apiKeyService = new APIKeyService(pool);
}

/**
 * Validate API key with IP whitelist
 */
export function validateAPIKeyIP() {
  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!apiKeyService) {
        throw new Error('IP Whitelist middleware not initialized');
      }

      // Get API key from header
      const apiKey = req.headers['x-api-key'] as string;

      if (!apiKey) {
        res.status(401).json({
          success: false,
          error: 'API key is required',
        });
        return;
      }

      // Get client IP
      const clientIP = getClientIP(req);

      if (!clientIP) {
        res.status(400).json({
          success: false,
          error: 'Unable to determine client IP address',
        });
        return;
      }

      // Verify API key with IP validation
      const verification = await apiKeyService.verifyAPIKeyWithIP(apiKey, clientIP);

      if (verification.denied) {
        AppLogger.logSecurityEvent('api_key.ip_denied', 'medium', {
          ip: clientIP,
          reason: verification.reason,
          endpoint: req.path,
          method: req.method,
          userAgent: req.headers['user-agent'],
        });

        res.status(403).json({
          success: false,
          error: 'Access denied',
          reason: verification.reason,
        });
        return;
      }

      if (!verification.apiKey) {
        res.status(401).json({
          success: false,
          error: 'Invalid API key',
        });
        return;
      }

      // Attach API key to request
      (req as any).apiKey = verification.apiKey;
      (req as any).clientIP = clientIP;

      // Log endpoint and response status after handler completes
      const originalSend = res.send;
      res.send = function (data: any) {
        apiKeyService!.logIPAccess(
          verification.apiKey!.id,
          clientIP,
          true,
          undefined,
          req.path,
          req.method,
          req.headers['user-agent'] as string,
          res.statusCode
        ).catch((err) => {
          AppLogger.error('Failed to log IP access', err);
        });

        return originalSend.call(this, data);
      };

      next();
    } catch (error) {
      AppLogger.error('IP whitelist validation error', error as Error, {
        path: req.path,
        method: req.method,
      });

      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  };
}

/**
 * Check IP blacklist only (without API key)
 */
export function checkIPBlacklist() {
  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!apiKeyService) {
        throw new Error('IP Whitelist middleware not initialized');
      }

      const clientIP = getClientIP(req);

      if (!clientIP) {
        next();
        return;
      }

      const blacklistCheck = await apiKeyService.isIPBlacklisted(clientIP);

      if (blacklistCheck.isBlacklisted) {
        AppLogger.logSecurityEvent('ip_blacklist.blocked', blacklistCheck.severity || 'medium', {
          ip: clientIP,
          reason: blacklistCheck.reason,
          endpoint: req.path,
          method: req.method,
        });

        res.status(403).json({
          success: false,
          error: 'Access denied',
          reason: 'Your IP address has been blocked',
        });
        return;
      }

      next();
    } catch (error) {
      AppLogger.error('IP blacklist check error', error as Error);
      // Don't block request on error
      next();
    }
  };
}

/**
 * Require specific IP whitelist for API key
 */
export function requireIPWhitelist() {
  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!apiKeyService) {
        throw new Error('IP Whitelist middleware not initialized');
      }

      const apiKey = (req as any).apiKey;

      if (!apiKey) {
        res.status(401).json({
          success: false,
          error: 'API key required',
        });
        return;
      }

      const whitelist = await apiKeyService.getIPWhitelist(apiKey.id);

      if (whitelist.length === 0) {
        res.status(403).json({
          success: false,
          error: 'IP whitelist required for this API key',
        });
        return;
      }

      next();
    } catch (error) {
      AppLogger.error('IP whitelist requirement check error', error as Error);

      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  };
}

/**
 * Log suspicious IP access patterns
 */
export function monitorSuspiciousIPAccess() {
  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!apiKeyService) {
        next();
        return;
      }

      const clientIP = getClientIP(req);

      if (!clientIP) {
        next();
        return;
      }

      // Get suspicious access patterns (async, don't block request)
      apiKeyService.getSuspiciousIPAccess()
        .then((suspicious) => {
          const suspiciousIP = suspicious.find((s) => s.ipAddress === clientIP);

          if (suspiciousIP && suspiciousIP.deniedAttempts >= 10) {
            AppLogger.logSecurityEvent('ip_whitelist.suspicious_pattern', 'high', {
              ip: clientIP,
              deniedAttempts: suspiciousIP.deniedAttempts,
              totalAttempts: suspiciousIP.totalAttempts,
              apiKeysAttempted: suspiciousIP.apiKeysAttempted,
              denialReasons: suspiciousIP.denialReasons,
            });

            // Auto-blacklist if threshold exceeded
            if (suspiciousIP.deniedAttempts >= 20) {
              apiKeyService!.addIPToBlacklist(
                clientIP,
                `Automatic blacklist: ${suspiciousIP.deniedAttempts} denied attempts`,
                'high',
                new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hour ban
              ).catch((err) => {
                AppLogger.error('Failed to auto-blacklist IP', err);
              });
            }
          }
        })
        .catch((err) => {
          AppLogger.error('Failed to check suspicious IP access', err);
        });

      next();
    } catch (error) {
      // Don't block request
      next();
    }
  };
}

/**
 * Validate IP format
 */
export function validateIPFormat(ip: string): boolean {
  // IPv4 regex
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;

  // IPv6 regex (simplified)
  const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;

  // CIDR regex
  const cidrRegex = /^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/;

  if (cidrRegex.test(ip)) {
    // Validate CIDR range
    const [baseIP, mask] = ip.split('/');
    const maskNum = parseInt(mask, 10);

    if (maskNum < 0 || maskNum > 32) {
      return false;
    }

    return validateIPFormat(baseIP);
  }

  if (ipv4Regex.test(ip)) {
    // Validate each octet
    const octets = ip.split('.').map((o) => parseInt(o, 10));
    return octets.every((o) => o >= 0 && o <= 255);
  }

  if (ipv6Regex.test(ip)) {
    return true;
  }

  return false;
}

/**
 * Get client IP from request
 */
export function getClientIP(req: Request): string | null {
  // Check X-Forwarded-For header (if behind proxy)
  const xForwardedFor = req.headers['x-forwarded-for'];

  if (xForwardedFor) {
    // X-Forwarded-For can contain multiple IPs, take the first one
    const ips = (xForwardedFor as string).split(',').map((ip) => ip.trim());
    if (ips.length > 0 && ips[0]) {
      return ips[0];
    }
  }

  // Check X-Real-IP header
  const xRealIP = req.headers['x-real-ip'];

  if (xRealIP) {
    return xRealIP as string;
  }

  // Fall back to socket remote address
  if (req.socket?.remoteAddress) {
    // Remove IPv6 prefix if present
    return req.socket.remoteAddress.replace(/^::ffff:/, '');
  }

  // Check req.ip (Express)
  if (req.ip) {
    return req.ip.replace(/^::ffff:/, '');
  }

  return null;
}

/**
 * Middleware to attach client IP to request
 */
export function attachClientIP() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const clientIP = getClientIP(req);

    if (clientIP) {
      (req as any).clientIP = clientIP;
    }

    next();
  };
}

/**
 * Rate limit by IP
 */
export function rateLimitByIP(
  maxRequests: number,
  windowMs: number = 60000
) {
  const ipRequestCounts: Map<string, { count: number; resetAt: number }> = new Map();

  return (req: Request, res: Response, next: NextFunction): void => {
    const clientIP = getClientIP(req);

    if (!clientIP) {
      next();
      return;
    }

    const now = Date.now();
    const ipData = ipRequestCounts.get(clientIP);

    if (!ipData || now > ipData.resetAt) {
      // Reset window
      ipRequestCounts.set(clientIP, {
        count: 1,
        resetAt: now + windowMs,
      });
      next();
      return;
    }

    if (ipData.count >= maxRequests) {
      AppLogger.logSecurityEvent('ip_whitelist.rate_limit_exceeded', 'medium', {
        ip: clientIP,
        maxRequests,
        windowMs,
      });

      res.status(429).json({
        success: false,
        error: 'Too many requests from this IP',
        retryAfter: Math.ceil((ipData.resetAt - now) / 1000),
      });
      return;
    }

    ipData.count++;
    next();
  };
}

/**
 * Log all IP access attempts
 */
export function logIPAccess() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const clientIP = getClientIP(req);

    if (!clientIP) {
      next();
      return;
    }

    AppLogger.info('IP access', {
      ip: clientIP,
      endpoint: req.path,
      method: req.method,
      userAgent: req.headers['user-agent'],
      apiKey: (req as any).apiKey?.id,
    });

    next();
  };
}

/**
 * Whitelist specific IPs (bypass all checks)
 */
export function whitelistIPs(ips: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const clientIP = getClientIP(req);

    if (!clientIP) {
      next();
      return;
    }

    if (ips.includes(clientIP)) {
      (req as any).ipWhitelisted = true;
    }

    next();
  };
}

/**
 * Block specific IPs (blacklist)
 */
export function blockIPs(ips: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const clientIP = getClientIP(req);

    if (!clientIP) {
      next();
      return;
    }

    if (ips.includes(clientIP)) {
      AppLogger.logSecurityEvent('ip_whitelist.blocked_ip', 'high', {
        ip: clientIP,
        endpoint: req.path,
      });

      res.status(403).json({
        success: false,
        error: 'Access denied',
      });
      return;
    }

    next();
  };
}
