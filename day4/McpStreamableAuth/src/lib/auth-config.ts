// Configuration of the OAuth 2.0 protected resource (this MCP server).
//
// Every value has a default that matches the local Keycloak from ../../keycloak
// (`docker compose up -d --wait` there), so the sample runs without any
// configuration. Environment variables override the defaults; `npm run start:sdk`
// loads an optional `.env` file (see config.env.template).

const port = process.env.PORT || "3000";

export const AUTH_CONFIG = {
	// The authorization server that issues tokens for this resource. It is
	// advertised in `/.well-known/oauth-protected-resource/mcp`, clients fetch
	// its metadata to learn the authorize and token endpoints, and every
	// token's `iss` claim must match it exactly.
	issuer:
		process.env.OAUTH_ISSUER || "http://localhost:8080/realms/mcp-webinar",

	// Our own canonical URL, which is also the identifier tokens must carry in
	// their `aud` claim (RFC 8707). In Keycloak it is the `resource_url` of the
	// resource-server client.
	resourceId: process.env.MCP_RESOURCE_ID || `http://localhost:${port}/mcp`,

	// Scopes this resource understands (RFC 6749 §3.3, space-separated).
	supportedScopes: (process.env.MCP_SCOPES || "ponypwd:generate").split(" "),
};

// Token validation uses these as the expected `iss` and `aud` claims, so a
// misconfigured value here means every request 401s with no obvious reason.
console.log(`[auth] issuer     = ${AUTH_CONFIG.issuer}`);
console.log(`[auth] resourceId = ${AUTH_CONFIG.resourceId}`);
