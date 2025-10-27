import 'dotenv/config';

async function testTokenDirectly() {
  const token = process.env.MCP_ACCESS_TOKEN;
  
  if (!token) {
    console.log('❌ No token found in environment');
    return;
  }
  
  console.log('🔍 Testing token directly...');
  console.log('Token:', token.substring(0, 20) + '...');
  
  try {
    // Test the initialize request (this should work without session ID)
    const response = await fetch('http://localhost:3000/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: {
            name: 'test-client',
            version: '1.0.0'
          }
        }
      })
    });
    
    console.log('Response status:', response.status);
    console.log('Response headers:', Object.fromEntries(response.headers.entries()));
    
    const text = await response.text();
    console.log('Response body:', text);
    
    if (response.ok) {
      console.log('✅ Token is valid!');
    } else {
      console.log('❌ Token validation failed');
    }
    
  } catch (error) {
    console.error('❌ Request failed:', error);
  }
}

testTokenDirectly();
