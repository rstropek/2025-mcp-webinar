import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { randomUUID } from 'node:crypto';
import cors from 'cors';
import { SCALEKIT_CONFIG } from './scalekit-config.js';
import { authMiddleware } from './auth-middleware.js';

/**
 * Creates and starts a streamable HTTP server for MCP (Model Context Protocol) communication.
 *
 * This function sets up a complete HTTP server that handles MCP protocol communication
 * using the Streamable HTTP transport. It provides session management, automatic transport
 * cleanup, and health monitoring capabilities.
 *
 * HTTP Endpoints:
 * - POST /mcp - Main JSON-RPC endpoint for MCP protocol communication
 * - GET /mcp - Server-to-client notifications via Server-Sent Events (SSE)
 * - DELETE /mcp - Session termination endpoint
 * - GET /health - Health check endpoint with server status and active session count
 *
 * @param server - The MCP server instance to wrap with HTTP transport
 * @param serverName - Human-readable name for the server (used in logs and health checks)
 * @param serverVersion - Version string for the server (used in logs and health checks)
 * @param port - Default port number for the server (can be overridden by PORT environment variable)
 */
export function createStreamableHTTPServer(server: McpServer, serverName: string, serverVersion: string, port: number): void {
  // Initialize Express application for HTTP server
  const app = express();
  app.use(
    cors({
      origin: '*',
      // Note: In CORS, “exposed headers” are the HTTP response headers that the browser
      // is allowed to make visible to JavaScript code running in the web page.
      exposedHeaders: ['Mcp-Session-Id'],
    })
  );

  // Configure Express to parse JSON request bodies automatically
  app.use(express.json());

  // OAuth Protected Resource Metadata endpoint - Required for MCP client discovery
  // This endpoint provides metadata about your OAuth protected resource, including supported scopes and token types.
  app.get('/.well-known/oauth-protected-resource', (req, res) => {
    res.json({
      "authorization_servers": [
        "https://softwarearchitectsgmbh.scalekit.dev/resources/res_96046550358164486"
      ],
      "bearer_methods_supported": [
        "header"
      ],
      "resource": SCALEKIT_CONFIG.resourceId,
      "resource_documentation": `${SCALEKIT_CONFIG.resourceId}/docs`,
      "scopes_supported": SCALEKIT_CONFIG.supportedScopes
    });
  });

  // Apply authentication middleware to all MCP endpoints
  app.use('/', authMiddleware);

  // Map to store active transports by session ID for session management
  // This allows the server to reuse existing transports for ongoing sessions
  const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};

  /**
   * Main MCP endpoint handler for JSON-RPC requests.
   * Handles session management and routes requests to appropriate transports.
   */
  app.post('/mcp', async (req, res) => {
    // Extract session ID from request headers (if present)
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    let transport: StreamableHTTPServerTransport;

    if (sessionId && transports[sessionId]) {
      // Reuse existing transport for ongoing session
      transport = transports[sessionId];
    } else if (!sessionId && req.body && req.body.method === 'initialize') {
      // Create new transport for initial connection (initialize request)
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sessionId) => {
          // Store the transport for future reuse
          transports[sessionId] = transport;
          // Set the session ID in response header so client knows what to use
          res.setHeader('mcp-session-id', sessionId);
        },
      });

      // Clean up transport when session closes to prevent memory leaks
      transport.onclose = () => {
        if (transport.sessionId) {
          delete transports[transport.sessionId];
        }
      };

      // Connect the MCP server to the new transport
      server.connect(transport);
    } else {
      // Invalid request - no session ID provided for non-initialize requests
      res.status(400).json({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Bad Request: No valid session ID provided',
        },
        id: null,
      });
      return;
    }

    // Delegate the actual request handling to the transport
    await transport.handleRequest(req, res, req.body);
  });

  /**
   * Reusable handler for GET and DELETE requests that require session validation.
   * Used for Server-Sent Events (SSE) notifications and session termination.
   */
  const handleSessionRequest = async (req: express.Request, res: express.Response) => {
    // Validate session ID exists and transport is available
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId || !transports[sessionId]) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }

    // Get the existing transport and delegate request handling
    const transport = transports[sessionId];
    await transport.handleRequest(req, res);
  };

  // Handle GET requests for server-to-client notifications via SSE
  app.get('/mcp', handleSessionRequest);
  // Handle DELETE requests for session termination
  app.delete('/mcp', handleSessionRequest);

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      activeSessions: Object.keys(transports).length,
      serverName: serverName,
      serverVersion: serverVersion,
    });
  });

  const PORT = process.env.PORT || port;
  app.listen(PORT, () => {
    console.log(`MCP server (${serverName}) running at http://127.0.0.1:${PORT}/mcp`);
    console.log(`Health check: http://127.0.0.1:${PORT}/health`);
  });
}
