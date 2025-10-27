import 'dotenv/config';

/**
 * Custom MCP Client that works with OAuth authentication
 * This bypasses the MCP SDK's transport limitations by making direct HTTP requests
 */
class CustomMcpClient {
  private sessionId: string | null = null;
  private token: string;

  constructor(token: string) {
    this.token = token;
  }

  private async makeRequest(method: string, params: any = {}, id: number = 1) {
    const url = 'http://localhost:3000/mcp';
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
      'Authorization': `Bearer ${this.token}`
    };

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

async function testMcpServer() {
  const token = process.env.MCP_ACCESS_TOKEN;
  
  if (!token) {
    console.log('❌ No MCP_ACCESS_TOKEN found in environment');
    return;
  }

  console.log('🚀 Testing MCP Server with Scalekit OAuth Authentication');
  console.log('Token:', token.substring(0, 20) + '...');
  console.log('');

  const client = new CustomMcpClient(token);

  try {
    // Initialize connection
    await client.initialize();
    console.log('');

    // List available tools, prompts, and resources
    await client.listTools();
    console.log('');
    
    await client.listPrompts();
    console.log('');
    
    await client.listResources();
    console.log('');

    // Test tool calls
    console.log('🧪 Testing tool calls...');
    
    // Test pony_password tool
    await client.callTool('pony_password', {
      minLength: 16,
      special: true
    });
    console.log('');

    // Test pony_password_batch tool
    await client.callTool('pony_password_batch', {
      count: 3,
      minLength: 20,
      special: false
    });
    console.log('');

    // Test prompt
    await client.getPrompt('make-pony-password', {
      minLength: '16',
      special: 'true'
    });
    console.log('');

    // Test resource
    await client.readResource('pony://characters.txt');
    console.log('');

    console.log('🎉 All tests completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testMcpServer();
