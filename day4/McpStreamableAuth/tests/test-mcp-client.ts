import 'dotenv/config';

/**
 * Custom MCP Client that works with OAuth authentication
 * This bypasses the MCP SDK's transport limitations by making direct HTTP requests
 */
class CustomMcpClient {
  private sessionId: string | null = null;
  private token: string | null;

  constructor(token?: string) {
    this.token = token || null;
  }

  private async makeRequest(method: string, params: any = {}, id: number = 1) {
    const url = 'http://localhost:3000/mcp';
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
    };

    // Add authorization header only if token is provided
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    // Add session ID if we have one
    if (this.sessionId) {
      headers['mcp-session-id'] = this.sessionId;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id,
        method,
        params
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    // Extract session ID from response headers
    const newSessionId = response.headers.get('mcp-session-id');
    if (newSessionId) {
      this.sessionId = newSessionId;
    }

    // Parse Server-Sent Events response
    const text = await response.text();
    const lines = text.split('\n');
    
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.substring(6);
        if (data.trim()) {
          return JSON.parse(data);
        }
      }
    }

    throw new Error('No valid response data found');
  }

  async initialize() {
    console.log('🔧 Initializing MCP connection...');
    const result = await this.makeRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: {
        name: 'custom-oauth-client',
        version: '1.0.0'
      }
    });
    console.log('✅ Connected! Session ID:', this.sessionId);
    return result;
  }

  async listTools() {
    console.log('🔧 Listing tools...');
    const result = await this.makeRequest('tools/list');
    console.log('📋 Available tools:');
    for (const tool of result.result.tools) {
      console.log(`  - ${tool.name}: ${tool.description}`);
    }
    return result;
  }

  async listPrompts() {
    console.log('🔧 Listing prompts...');
    const result = await this.makeRequest('prompts/list');
    console.log('📋 Available prompts:');
    for (const prompt of result.result.prompts) {
      console.log(`  - ${prompt.name}: ${prompt.description}`);
    }
    return result;
  }

  async listResources() {
    console.log('🔧 Listing resources...');
    const result = await this.makeRequest('resources/list');
    console.log('📋 Available resources:');
    for (const resource of result.result.resources) {
      console.log(`  - ${resource.name}: ${resource.description}`);
    }
    return result;
  }

  async callTool(name: string, args: any) {
    console.log(`🔧 Calling tool: ${name}`);
    const result = await this.makeRequest('tools/call', {
      name,
      arguments: args
    });
    console.log('✅ Tool result:', result.result);
    return result;
  }

  async getPrompt(name: string, args: any) {
    console.log(`🔧 Getting prompt: ${name}`);
    const result = await this.makeRequest('prompts/get', {
      name,
      arguments: args
    });
    console.log('✅ Prompt result:', result.result);
    return result;
  }

  async readResource(uri: string) {
    console.log(`🔧 Reading resource: ${uri}`);
    const result = await this.makeRequest('resources/read', { uri });
    console.log('✅ Resource result:', result.result);
    return result;
  }
}

async function runTests() {
  console.log('🚀 Testing MCP Server - Public Tools and Authenticated Tools');
  console.log('');

  // TEST RUN 1: Without authentication (null token)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('TEST RUN 1: WITHOUT AUTHENTICATION (Null Token)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  
  const publicClient = new CustomMcpClient(); // No token
  
  try {
    console.log('🔧 Initializing connection WITHOUT token...');
    await publicClient.initialize();
    console.log('');
    
    // List available tools
    await publicClient.listTools();
    console.log('');
    
    // Test public pony_password tool
    console.log('📝 Testing public pony_password tool (without auth)...');
    await publicClient.callTool('pony_password', {
      minLength: 16,
      special: true
    });
    console.log('');
    
    // Test public pony_password_batch tool
    console.log('📝 Testing public pony_password_batch tool (without auth)...');
    await publicClient.callTool('pony_password_batch', {
      count: 3,
      minLength: 20,
      special: false
    });
    console.log('');
    
    // Try authenticated tool without token (should fail)
    console.log('🔒 Testing authenticated tool without token (should fail)...');
    try {
      await publicClient.callTool('pony_password_advanced', {
        length: 20,
        includeNumbers: true,
        includeSymbols: true,
        includeUppercase: true
      });
      console.log('❌ FAILED: Tool should have required authentication');
    } catch (error: any) {
      console.log('✅ PASSED: Tool correctly requires authentication');
      console.log('   Error:', error.message.substring(0, 100));
    }
    console.log('');
    
    console.log('✅ TEST RUN 1 COMPLETED: Public tools work without authentication');
    
  } catch (error: any) {
    console.error('❌ TEST RUN 1 FAILED:', error.message);
  }
  
  console.log('\n\n');

  // TEST RUN 2: With authentication (token from .env)
  const token = process.env.MCP_ACCESS_TOKEN;
  
  if (!token) {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST RUN 2: SKIPPED - No MCP_ACCESS_TOKEN in .env');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('To run authenticated tests:');
    console.log('1. Run: npm run get-token');
    console.log('2. This will set MCP_ACCESS_TOKEN in your .env file');
    console.log('3. Run: npm run test-mcp-client');
    console.log('');
  } else {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST RUN 2: WITH AUTHENTICATION (Token from .env)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    
    const authenticatedClient = new CustomMcpClient(token);
    
    try {
      console.log('🔧 Initializing connection WITH token...');
      console.log('Token:', token.substring(0, 20) + '...');
      await authenticatedClient.initialize();
      console.log('');
      
      // List available tools
      await authenticatedClient.listTools();
      console.log('');
      
      // Test public tools still work with authentication
      console.log('📝 Testing public pony_password tool (with auth)...');
      await authenticatedClient.callTool('pony_password', {
        minLength: 12,
        special: false
      });
      console.log('');
      
      // Test authenticated pony_password_advanced tool with all features
      console.log('🔐 Testing authenticated pony_password_advanced tool (full features)...');
      await authenticatedClient.callTool('pony_password_advanced', {
        length: 24,
        includeNumbers: true,
        includeSymbols: true,
        includeUppercase: true
      });
      console.log('');
      
      // Test with only numbers (no symbols)
      console.log('🔐 Testing authenticated tool (numbers only, no symbols)...');
      await authenticatedClient.callTool('pony_password_advanced', {
        length: 16,
        includeNumbers: true,
        includeSymbols: false,
        includeUppercase: false
      });
      console.log('');
      
      // Test with custom ponies
      console.log('🔐 Testing authenticated tool (custom ponies with all features)...');
      await authenticatedClient.callTool('pony_password_advanced', {
        length: 20,
        includeNumbers: true,
        includeSymbols: true,
        includeUppercase: true,
        customPonies: ['Twilight', 'Pinkie', 'Rainbow']
      });
      console.log('');
      
      console.log('✅ TEST RUN 2 COMPLETED: All authenticated tools work correctly');
      
    } catch (error: any) {
      console.error('❌ TEST RUN 2 FAILED:', error.message);
      console.error('Full error:', error);
    }
  }
  
  console.log('\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎉 All test runs completed!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

runTests();
