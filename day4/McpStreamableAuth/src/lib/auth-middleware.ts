import type { NextFunction, Request, Response } from "express";
import {
	SCALEKIT_CONFIG,
	scalekit,
	WWW_AUTHENTICATE_HEADER,
} from "./scalekit-config.js";

// Extend Express Request to include our custom properties
declare global {
	namespace Express {
		interface Request {
			token?: string;
			// biome-ignore lint/suspicious/noExplicitAny: JWT claims are provider-specific
			tokenClaims?: any;
			isAuthenticated?: boolean;
		}
	}
}

/**
 * Mandatory authentication middleware that requires valid Bearer tokens for all requests
 * Requests without valid tokens will be rejected with 401 Unauthorized
 */
export async function requiredAuthMiddleware(
	req: Request,
	res: Response,
	next: NextFunction,
): Promise<void> {
	try {
		// Extract Bearer token from Authorization header (scheme is case-insensitive per RFC 7235)
		const authHeader = req.headers.authorization;
		const token = authHeader?.toLowerCase().startsWith("bearer ")
			? authHeader.slice("bearer ".length).trim()
			: null;

		if (!token) {
			throw new Error("Bearer token required");
		}

		// Validate token signature, expiry, issuer, and audience.
		//
		// We intentionally do NOT pass `requiredScopes` here because different
		// tools need different scopes — gating everything at the middleware
		// would either lock out tools that don't need a scope or force us to
		// grant the union of all scopes to every caller.
		//
		// Instead we enforce scopes inside each tool handler via
		// `requireScopes(...)` from `auth-context.ts`. See
		// `pony_password_advanced` for a working example. To gate a scope
		// globally (e.g. "any caller must have `mcp:access`"), add
		// `requiredScopes: ["mcp:access"]` here — Scalekit will then 401 any
		// token missing those scopes before it ever reaches a tool handler.
		const claims = await scalekit.validateToken(token, {
			audience: [SCALEKIT_CONFIG.resourceId],
		});

		// Attach token and claims to request for use by tools
		req.token = token;
		req.tokenClaims = claims;
		req.isAuthenticated = true;
		console.log("✓ Authenticated request with token");

		next();
	} catch (err) {
		// Invalid or missing token - return 401 with WWW-Authenticate header
		console.warn("⚠️ Authentication failed:", err);
		res
			.status(401)
			.header(WWW_AUTHENTICATE_HEADER.key, WWW_AUTHENTICATE_HEADER.value)
			.end();
	}
}
