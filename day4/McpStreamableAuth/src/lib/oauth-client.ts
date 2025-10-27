/**
 * OAuth 2.1 Client Credentials Flow Helper
 * This helper demonstrates how to obtain an access token from Scalekit
 * using the Client Credentials flow for MCP server authentication
 */

export interface ScalekitOAuthConfig {
  authorizationServerUrl: string;
  clientId: string;
  clientSecret: string;
  scope: string[];
  resourceId: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

/**
 * Obtain an access token using OAuth 2.1 Client Credentials flow
 * This is suitable for server-to-server authentication
 */
export async function getAccessToken(config: ScalekitOAuthConfig): Promise<TokenResponse> {
  const tokenUrl = `${config.authorizationServerUrl}/oauth/token`;
  
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: config.clientId,
    client_secret: config.clientSecret,
    scope: config.scope.join(' '),
    audience: config.resourceId,
  });

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token request failed: ${response.status} ${response.statusText} - ${errorText}`);
  }

  return await response.json();
}

/**
 * Example configuration for your MCP server
 * Replace these values with your actual Scalekit configuration
 */
export const EXAMPLE_OAUTH_CONFIG: ScalekitOAuthConfig = {
  authorizationServerUrl: 'https://your-app.scalekit.com', // Replace with your Scalekit environment URL
  clientId: 'your-client-id', // Replace with your Scalekit client ID
  clientSecret: 'your-client-secret', // Replace with your Scalekit client secret
  scope: [
    'pony:password:read',
    'pony:password:write',
    'pony:characters:read',
    'pony:prompts:read'
  ],
  resourceId: 'https://mcp.yourapp.com', // Replace with your MCP server resource ID
};

/**
 * Example function to demonstrate OAuth token acquisition
 */
export async function demonstrateOAuthFlow(): Promise<string> {
  try {
    console.log('🔐 Obtaining access token from Scalekit...');
    
    const tokenResponse = await getAccessToken(EXAMPLE_OAUTH_CONFIG);
    
    console.log('✅ Access token obtained successfully!');
    console.log(`   Token type: ${tokenResponse.token_type}`);
    console.log(`   Expires in: ${tokenResponse.expires_in} seconds`);
    console.log(`   Scope: ${tokenResponse.scope}`);
    
    return tokenResponse.access_token;
  } catch (error) {
    console.error('❌ Failed to obtain access token:', error);
    throw error;
  }
}

/**
 * Environment-based configuration loader
 * Loads OAuth configuration from environment variables
 */
export function loadOAuthConfigFromEnv(): ScalekitOAuthConfig {
  return {
    authorizationServerUrl: process.env.SCALEKIT_ENVIRONMENT_URL || 'https://your-app.scalekit.com',
    clientId: process.env.SCALEKIT_CLIENT_ID || 'your-client-id',
    clientSecret: process.env.SCALEKIT_CLIENT_SECRET || 'your-client-secret',
    scope: (process.env.MCP_SCOPES || 'pony:password:read pony:password:write pony:characters:read pony:prompts:read').split(' '),
    resourceId: process.env.MCP_RESOURCE_ID || 'https://mcp.yourapp.com',
  };
}
