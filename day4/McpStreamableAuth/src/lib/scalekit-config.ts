import { Scalekit } from "@scalekit-sdk/node";

// The process environment is the only source of configuration. Locally it is
// filled by node's built-in `--env-file=.env` (see the `start:sdk` script); in
// the container the App Service / `docker run -e` settings provide it. There is
// deliberately no `dotenv` fallback, so a missing `.env` in production is not
// silently papered over.
const requiredEnvVars = [
	"SCALEKIT_ENVIRONMENT_URL",
	"SCALEKIT_AUTH_SERVER",
	"SCALEKIT_CLIENT_ID",
	"SCALEKIT_CLIENT_SECRET",
	"MCP_RESOURCE_ID",
	"MCP_SCOPES",
];
const missingEnvVars = requiredEnvVars.filter(
	(varName) => !process.env[varName],
);
if (missingEnvVars.length > 0) {
	throw new Error(
		`Missing required environment variables: ${missingEnvVars.join(", ")}`,
	);
}

// In development we use a localhost URL as the resource identifier so that
// token `aud` claims match what Scalekit sees locally. In production we trust
// MCP_RESOURCE_ID (the public URL of the deployed MCP server).
const devResourceId = `http://localhost:${process.env.PORT || "3000"}/mcp`;
const resourceId =
	process.env.NODE_ENV === "production"
		? (process.env.MCP_RESOURCE_ID as string)
		: devResourceId;

export const SCALEKIT_CONFIG = {
	// Your Scalekit environment URL (e.g., https://yourapp.scalekit.dev)
	environmentUrl: process.env.SCALEKIT_ENVIRONMENT_URL as string,

	// The OAuth 2.0 authorization server that issues tokens for this resource.
	// Its URL is what `/.well-known/oauth-protected-resource/mcp` advertises,
	// and it is where a client fetches `/.well-known/oauth-authorization-server`
	// to learn the authorization, token and registration endpoints.
	authServer: process.env.SCALEKIT_AUTH_SERVER as string,

	// Your Scalekit client credentials
	clientId: process.env.SCALEKIT_CLIENT_ID as string,
	clientSecret: process.env.SCALEKIT_CLIENT_SECRET as string,

	// The identifier tokens must carry in their `aud` claim (see above).
	resourceId,

	// Scopes this resource understands (RFC 6749 §3.3, space-separated).
	supportedScopes: (process.env.MCP_SCOPES as string).split(" "),
};

// The Scalekit client verifies token signatures against the environment's
// published signing keys (JWKS), which it fetches once and caches.
export const scalekit = new Scalekit(
	SCALEKIT_CONFIG.environmentUrl,
	SCALEKIT_CONFIG.clientId,
	SCALEKIT_CONFIG.clientSecret,
);

// Log the resolved resource id at startup. Token validation uses this as the
// expected `aud` claim, so a misconfigured value here means every request
// 401s with no obvious reason.
console.log(`[scalekit] resourceId = ${SCALEKIT_CONFIG.resourceId}`);
console.log(`[scalekit] authServer = ${SCALEKIT_CONFIG.authServer}`);
