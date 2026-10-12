import type {
	AuthInfo,
	OAuthTokenVerifier,
} from "@modelcontextprotocol/server";
import { OAuthError, OAuthErrorCode } from "@modelcontextprotocol/server";
import { createRemoteJWKSet, type JWTPayload, jwtVerify } from "jose";
import { AUTH_CONFIG } from "./auth-config.js";

/** The subset of JWT claims this resource server cares about. */
type TokenClaims = JWTPayload & {
	scope?: string;
	scopes?: string[];
	client_id?: string;
	azp?: string;
};

/**
 * The authorization server's signing keys (JWKS).
 *
 * The JWKS URL comes from the issuer's metadata document instead of being
 * hard-coded, which keeps this file independent of the authorization server
 * product. It is fetched on the first token, not at startup, so the MCP server
 * can start before Keycloak is up. `createRemoteJWKSet` caches the keys and
 * refetches them when a token names a key id it doesn't know (key rotation).
 */
let jwks: Promise<ReturnType<typeof createRemoteJWKSet>> | undefined;

function getJwks() {
	jwks ??= (async () => {
		const response = await fetch(
			`${AUTH_CONFIG.issuer}/.well-known/openid-configuration`,
		);
		if (!response.ok) {
			throw new Error(
				`Fetching the metadata of ${AUTH_CONFIG.issuer} failed: HTTP ${response.status}`,
			);
		}
		const { jwks_uri } = (await response.json()) as { jwks_uri: string };
		return createRemoteJWKSet(new URL(jwks_uri));
	})().catch((err) => {
		// Don't cache a failure (e.g. Keycloak not started yet); retry next time.
		jwks = undefined;
		throw err;
	});
	return jwks;
}

/**
 * Reads the granted scopes off the token.
 *
 * Keycloak (like most issuers) emits the standard `scope` claim: a single
 * space-separated string (RFC 6749 §3.3). Some issuers also/instead emit
 * `scopes` as an array — we accept either.
 */
function readScopes(claims: TokenClaims): string[] {
	if (typeof claims.scope === "string") {
		return claims.scope.split(/\s+/).filter(Boolean);
	}
	if (Array.isArray(claims.scopes)) {
		return claims.scopes.filter((s): s is string => typeof s === "string");
	}
	return [];
}

/**
 * The `aud` claim is what binds a token to *this* resource (RFC 8707). It may
 * be a single string or an array; we keep the entry that matches our resource
 * id so `AuthInfo.resource` describes the audience the token was minted for.
 */
function readResource(claims: TokenClaims): URL | undefined {
	const audiences =
		typeof claims.aud === "string" ? [claims.aud] : (claims.aud ?? []);
	const match =
		audiences.find((a) => a === AUTH_CONFIG.resourceId) ?? audiences[0];
	if (!match) return undefined;
	try {
		return new URL(match);
	} catch {
		// A non-URL audience (some issuers use opaque identifiers) is not an
		// error — we simply have nothing to put into the typed field.
		return undefined;
	}
}

/**
 * OAuth 2.0 Resource Server token verification for JWT access tokens.
 *
 * `requireBearerAuth` (from `@modelcontextprotocol/express`) pulls the token
 * out of the `Authorization` header and hands it to `verifyAccessToken`. What
 * comes back is attached to `req.auth`, which `toNodeHandler` forwards into the
 * MCP request context — that is how a tool handler gets at `ctx.http.authInfo`.
 *
 * The contract of the interface is narrow but strict:
 *
 * - Throw `OAuthError(OAuthErrorCode.InvalidToken, …)` for anything wrong with
 *   the token. The SDK turns that into `401` plus a
 *   `WWW-Authenticate: Bearer error="invalid_token", …` challenge. Any *other*
 *   exception would become an opaque `500`, which tells a client nothing about
 *   how to recover.
 * - Populate `expiresAt`. Bearer verification rejects a token without an
 *   expiry outright, so a missing `exp` claim would fail every request.
 */
export const tokenVerifier: OAuthTokenVerifier = {
	async verifyAccessToken(token: string): Promise<AuthInfo> {
		// Failing to reach the authorization server is our problem, not the
		// client's, so it stays an ordinary error (-> 500).
		const keys = await getJwks();

		let claims: TokenClaims;
		try {
			// Validates signature, expiry, issuer and — crucially — that the
			// token's `aud` names this MCP server. A token minted for another
			// resource is rejected here, which is what stops a token stolen
			// from one MCP server being replayed against another.
			//
			// We deliberately do NOT check scopes here: different tools need
			// different scopes, so gating them all here would either lock out
			// tools that need none or force every caller to hold the union of
			// all scopes. Scope enforcement lives in the tool handlers (see
			// `checkScopes` in `scopes.ts`).
			({ payload: claims } = await jwtVerify<TokenClaims>(token, keys, {
				issuer: AUTH_CONFIG.issuer,
				audience: AUTH_CONFIG.resourceId,
			}));
		} catch (err) {
			const reason = err instanceof Error ? err.message : String(err);
			throw new OAuthError(
				OAuthErrorCode.InvalidToken,
				`Token validation failed: ${reason}`,
			);
		}

		if (typeof claims.exp !== "number") {
			throw new OAuthError(
				OAuthErrorCode.InvalidToken,
				"Token has no `exp` claim",
			);
		}

		return {
			token,
			// Which client the token was issued to. Keycloak emits `azp`, the
			// OIDC spelling; other issuers use `client_id` (RFC 9068). `sub` is
			// the last resort (for a machine token the subject *is* the client).
			clientId: claims.client_id ?? claims.azp ?? claims.sub ?? "unknown",
			scopes: readScopes(claims),
			expiresAt: claims.exp,
			resource: readResource(claims),
			// The full claim set travels along so tool handlers can inspect it
			// (see the `get_token_claims` tool). `AuthInfo` itself is
			// intentionally minimal; `extra` is the documented place for
			// everything provider-specific.
			extra: { claims },
		};
	},
};
