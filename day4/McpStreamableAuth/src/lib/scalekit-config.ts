import 'dotenv/config';
import { Scalekit } from '@scalekit-sdk/node';

const requiredEnvVars = [
  'SCALEKIT_ENVIRONMENT_URL',
  'SCALEKIT_AUTH_SERVER',
  'SCALEKIT_CLIENT_ID',
  'SCALEKIT_CLIENT_SECRET',
  'MCP_RESOURCE_ID',
  'MCP_SCOPES'
];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingEnvVars.length > 0) {
  throw new Error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
}

const devResourceId = `http://localhost:${process.env.PORT || '3000'}/mcp`;
const resourceId = process.env.NODE_ENV === 'production' ? process.env.MCP_RESOURCE_ID : devResourceId;

// Scalekit configuration - Replace these with your actual Scalekit credentials
export const SCALEKIT_CONFIG = {
  // Your Scalekit environment URL (e.g., https://yourapp.scalekit.com)
  environmentUrl: process.env.SCALEKIT_ENVIRONMENT_URL!,
  authServer: process.env.SCALEKIT_AUTH_SERVER!,

  // Your Scalekit client credentials
  clientId: process.env.SCALEKIT_CLIENT_ID!,
  clientSecret: process.env.SCALEKIT_CLIENT_SECRET!,

  // Your MCP server resource identifier
  audience: process.env.MCP_RESOURCE_ID!,
  resourceId,

  resourceMetadata: process.env.MCP_RESOURCE_METADATA,

  // Supported scopes for your MCP server
  supportedScopes: process.env.MCP_SCOPES!.split(' '),
};

// Initialize Scalekit client
export const scalekit = new Scalekit(
  SCALEKIT_CONFIG.environmentUrl,
  SCALEKIT_CONFIG.clientId,
  SCALEKIT_CONFIG.clientSecret
);

/**
 * WWW-Authenticate header for unauthorized responses (HTTP 401)
 * 
 * This header implements RFC 6750 (OAuth 2.0 Bearer Token Usage) and serves multiple purposes:
 * 
 * 1. **Authentication Challenge**: Informs clients that the resource requires OAuth 2.0 Bearer token
 *    authentication when they attempt to access protected endpoints without valid credentials.
 * 
 * 2. **Discovery Mechanism**: The `resource_metadata` parameter provides a URI where clients can
 *    discover OAuth protected resource metadata (RFC 8693), including:
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
  key: 'WWW-Authenticate',
  value: `Bearer realm="OAuth", resource_metadata="${resourceId}/.well-known/oauth-protected-resource"`
};
