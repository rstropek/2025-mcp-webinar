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
 * Mandatory authentication middleware that requires valid Bearer tokens for all requests
 * Requests without valid tokens will be rejected with 401 Unauthorized
 */
export async function requiredAuthMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // Extract Bearer token from Authorization header
    const authHeader = req.headers['authorization'];
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.split('Bearer ')[1]?.trim()
      : null;

    if (!token) {
      throw new Error('Bearer token required');
    }

    // Validate token
    const claims = await scalekit.validateToken(token, {
      audience: [SCALEKIT_CONFIG.resourceId!],
      // OAuth 2.0 Scopes: Fine-grained permissions for API access control
      // 
      // Scopes allow you to limit what an authenticated user/client can do with their token.
      // They provide authorization (what you can do) on top of authentication (who you are).
      //
      // When to use `requiredScopes`:
      // - When different tools/endpoints need different permission levels
      // - Example: 'read:ponies' for listing, 'write:ponies' for creating/modifying
      // - Example: 'admin:system' for administrative operations
      //
      // How to implement:
      // 1. Define scopes in your OAuth provider (Scalekit, Auth0, etc.)
      // 2. Request specific scopes when obtaining tokens (in OAuth flow)
      // 3. Add `requiredScopes: ['scope1', 'scope2']` here to enforce them
      // 4. Scalekit will verify the token contains ALL required scopes
      //
      // Example usage:
      //   requiredScopes: ['read:ponies']        // For read-only operations
      //   requiredScopes: ['write:ponies']       // For write operations
      //   requiredScopes: ['read:ponies', 'write:ponies']  // For full access
      //
      // If token lacks required scopes, validation will fail with 401 Unauthorized
    });

    // Attach token and claims to request for use by tools
    req.token = token;
    req.tokenClaims = claims;
    req.isAuthenticated = true;
    console.log('✓ Authenticated request with token');

    // Continue to next middleware
    next();
  } catch (err) {
    // Invalid or missing token - return 401 with WWW-Authenticate header
    console.warn('⚠️ Authentication failed:', err);
    res.status(401)
      .header(WWW_AUTHENTICATE_HEADER.key, WWW_AUTHENTICATE_HEADER.value)
      .end();
  }
}


