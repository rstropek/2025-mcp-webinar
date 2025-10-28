import { Request, Response, NextFunction } from 'express';
import { scalekit, SCALEKIT_CONFIG, WWW_AUTHENTICATE_HEADER } from './scalekit-config.js';

// Extend Express Request to include our custom properties
declare global {
  namespace Express {
    interface Request {
      token?: string;
      tokenClaims?: any;
      isAuthenticated?: boolean;
    }
  }
}

/**
 * Optional authentication middleware that extracts Bearer tokens without requiring them
 * This allows the server to know if a user is authenticated, but doesn't block requests
 */
export async function optionalAuthMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // Extract Bearer token from Authorization header
    const authHeader = req.headers['authorization'];
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.split('Bearer ')[1]?.trim()
      : null;

    if (token) {
      try {
        // Validate token if present
        const claims = await scalekit.validateToken(token, {
          audience: [SCALEKIT_CONFIG.resourceId],
          // If necessary, add `requiredScopes` here for tool-specific validation
        });

        // Attach token and claims to request for use by tools
        req.token = token;
        req.tokenClaims = claims;
        req.isAuthenticated = true;
        console.log('✓ Authenticated request with token');
      } catch (err) {
        console.warn('⚠️ Invalid token provided, treating as unauthenticated:', err);
        req.isAuthenticated = false;
      }
    } else {
      req.isAuthenticated = false;
    }

    // Continue regardless of authentication status
    next();
  } catch (err) {
    console.error('Error in optional auth middleware:', err);
    req.isAuthenticated = false;
    next();
  }
}


/**
 * Validates that a token has the required scope(s)
 * Throws an error if validation fails
 */
export async function validateScope(token: string, requiredScopes: string[]): Promise<any> {
  try {
    const claims = await scalekit.validateToken(token, {
      audience: [SCALEKIT_CONFIG.resourceId],
      requiredScopes: requiredScopes
    });
    return claims;
  } catch (err) {
    console.error(`Scope validation failed for scopes '${requiredScopes.join(', ')}':`, err);
    throw err;
  }
}

