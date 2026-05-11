import { Scalekit } from "@scalekit-sdk/node";
import "dotenv/config";

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

// Scalekit configuration - Replace these with your actual Scalekit credentials
export const SCALEKIT_CONFIG = {
	// Your Scalekit environment URL (e.g., https://yourapp.scalekit.com)
	environmentUrl: process.env.SCALEKIT_ENVIRONMENT_URL as string,
	authServer: process.env.SCALEKIT_AUTH_SERVER as string,

	// Your Scalekit client credentials
	clientId: process.env.SCALEKIT_CLIENT_ID as string,
	clientSecret: process.env.SCALEKIT_CLIENT_SECRET as string,

	// Your MCP server resource identifier
	audience: process.env.MCP_RESOURCE_ID as string,
	resourceId,

	resourceMetadata: process.env.MCP_RESOURCE_METADATA,

	// Supported scopes for your MCP server
	supportedScopes: (process.env.MCP_SCOPES as string).split(" "),
};

// Initialize Scalekit client
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

/**
 * WWW-Authenticate header for unauthorized responses (HTTP 401)
 *
 * This header implements RFC 6750 (OAuth 2.0 Bearer Token Usage) and serves multiple purposes:
 *
 * 1. **Authentication Challenge**: Informs clients that the resource requires OAuth 2.0 Bearer token
 *    authentication when they attempt to access protected endpoints without valid credentials.
 *
 * 2. **Discovery Mechanism**: The `resource_metadata` parameter provides a URI where clients can
 *    discover OAuth protected resource metadata (RFC 9728), including:
 *    - Authorization server endpoint
 *    - Supported scopes
 *    - Token endpoint
 *    - Resource capabilities
 *
 * 3. **MCP Protocol Compliance**: This header is part of the Model Context Protocol (MCP)
 *    authentication flow, enabling MCP clients to automatically discover authentication
 *    requirements and initiate the OAuth 2.0 flow.
 *
 * Format: WWW-Authenticate: Bearer realm="OAuth", resource_metadata="<metadata-uri>"
 * - `realm`: Describes the protection space (here: OAuth)
 * - `resource_metadata`: URL to fetch OAuth Protected Resource Metadata document
 *
 * When a client receives this header in a 401 response, it should:
 * 1. Fetch the metadata from the provided URI
 * 2. Discover the authorization server and required scopes
 * 3. Initiate the OAuth authorization flow
 * 4. Retry the request with a valid Bearer token
 */
export const WWW_AUTHENTICATE_HEADER = {
	key: "WWW-Authenticate",
	value: `Bearer realm="OAuth", resource_metadata="${resourceId}/.well-known/oauth-protected-resource"`,
};
