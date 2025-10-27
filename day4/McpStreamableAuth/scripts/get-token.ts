import 'dotenv/config';
import { getAccessToken, loadOAuthConfigFromEnv } from '../src/lib/oauth-client.ts';

async function getMcpAccessToken() {
  try {
    console.log('🔐 Obtaining access token from Scalekit...');
    
    const config = loadOAuthConfigFromEnv();
    console.log('📋 Configuration loaded:');
    console.log(`   Authorization Server: ${config.authorizationServerUrl}`);
    console.log(`   Client ID: ${config.clientId}`);
    console.log(`   Resource ID: ${config.resourceId}`);
    console.log(`   Scopes: ${config.scope.join(' ')}`);
    const tokenResponse = await getAccessToken(config);
    
    console.log('✅ Access token obtained successfully!');
    console.log(`   Token: ${tokenResponse.access_token}`);
    console.log(`   Expires in: ${tokenResponse.expires_in} seconds`);
    console.log(`   Scope: ${tokenResponse.scope}`);
    
    console.log('\n📋 Add this to your .env file:');
    console.log(`MCP_ACCESS_TOKEN=${tokenResponse.access_token}`);
    
    return tokenResponse.access_token;
  } catch (error) {
    console.error('❌ Failed to obtain access token:', error);
    throw error;
  }
}

getMcpAccessToken();
