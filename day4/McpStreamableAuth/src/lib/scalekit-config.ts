import 'dotenv/config';
import { Scalekit } from '@scalekit-sdk/node';

// Scalekit configuration - Replace these with your actual Scalekit credentials
export const SCALEKIT_CONFIG = {
  // Your Scalekit environment URL (e.g., https://yourapp.scalekit.com)
  environmentUrl: process.env.SCALEKIT_ENVIRONMENT_URL || 'https://your-app.scalekit.com',
  authServer: process.env.SCALEKIT_AUTH_SERVER || 'https://your-app.scalekit.com/something',
  
  // Your Scalekit client credentials
  clientId: process.env.SCALEKIT_CLIENT_ID || 'your-client-id',
  clientSecret: process.env.SCALEKIT_CLIENT_SECRET || 'your-client-secret',
  
  // Your MCP server resource identifier
  resourceId: process.env.MCP_RESOURCE_ID || 'https://mcp.yourapp.com',
  
  // Supported scopes for your MCP server
  supportedScopes: [
    'password:generate',
  ],
};

// Initialize Scalekit client
export const scalekit = new Scalekit(
  SCALEKIT_CONFIG.environmentUrl,
  SCALEKIT_CONFIG.clientId,
  SCALEKIT_CONFIG.clientSecret
);

// WWW-Authenticate header for unauthorized responses
export const WWW_AUTHENTICATE_HEADER = {
  key: 'WWW-Authenticate',
  value: `Bearer realm="OAuth", resource_metadata="${SCALEKIT_CONFIG.resourceId}/.well-known/oauth-protected-resource"`
};
