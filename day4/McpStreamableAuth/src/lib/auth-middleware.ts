import { Request, Response, NextFunction } from 'express';
import { scalekit, SCALEKIT_CONFIG, WWW_AUTHENTICATE_HEADER } from './scalekit-config.js';

/**
 * Authentication middleware for MCP server endpoints
 * Validates Bearer tokens and enforces OAuth 2.1 authorization
 */
export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // Allow public access to well-known endpoints for metadata discovery
    if (req.path.includes('.well-known')) {
      return next();
    }

    // Allow public access to health check endpoint
    if (req.path === '/health') {
      return next();
    }

    // Extract Bearer token from Authorization header
    const authHeader = req.headers['authorization'];
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.split('Bearer ')[1]?.trim()
      : null;

    if (!token) {
      throw new Error('Missing or invalid Bearer token');
    }

    // Validate token against configured resource audience
    await scalekit.validateToken(token, {
      audience: [SCALEKIT_CONFIG.resourceId]
    });

    // Token is valid, continue to next middleware
    next();
  } catch (err) {
    console.error('Authentication failed:', err);
    res
      .status(401)
      .set(WWW_AUTHENTICATE_HEADER.key, WWW_AUTHENTICATE_HEADER.value)
      .json({
        error: 'unauthorized',
        error_description: 'Valid Bearer token required',
      });
    return;
  }
}

/**
 * Scope validation middleware for specific tools
 * Validates that the token has the required scope for the tool
 */
export function requireScope(requiredScope: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authHeader = req.headers['authorization'];
      const token = authHeader?.startsWith('Bearer ')
        ? authHeader.split('Bearer ')[1]?.trim()
        : null;

      if (!token) {
        throw new Error('Missing Bearer token');
      }

      // Validate token with required scope
      await scalekit.validateToken(token, {
        audience: [SCALEKIT_CONFIG.resourceId],
        requiredScopes: [requiredScope]
      });

      next();
    } catch (err) {
      console.error(`Scope validation failed for scope '${requiredScope}':`, err);
      res
        .status(403)
        .json({
          error: 'insufficient_scope',
          error_description: `Required scope: ${requiredScope}`,
          scope: requiredScope
        });
      return;
    }
  };
}
