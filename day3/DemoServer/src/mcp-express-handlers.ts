import { InMemoryEventStore } from '@modelcontextprotocol/sdk/examples/shared/inMemoryEventStore.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { randomUUID } from 'crypto';
import { getServer } from './mcp-server.js';
import type { Request, Response } from 'express';

const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};

// See also JsonRPC specification for error codes
type JsonRpcError = {
  code: number;
  message: string;
};
const NO_VALID_SESSION_ID_ERROR: JsonRpcError = {
  code: -32000,
  message: 'Bad Request: No valid session ID provided',
};
const INTERNAL_SERVER_ERROR: JsonRpcError = {
  code: -32603,
  message: 'Internal server error',
};
const METHOD_NOT_ALLOWED_ERROR: JsonRpcError = {
  code: -32000,
  message: 'Method not allowed',
};
function getJsonRpcError(error: JsonRpcError) {
  return {
    jsonrpc: '2.0',
    error: error,
    id: null,
  };
}

export async function mcpPostHandler(req: Request, res: Response) {
  // For details about session handling, see https://modelcontextprotocol.io/specification/2025-06-18/basic/transports#session-management
  let sessionId: string | undefined = undefined;
  if (req.headers && req.headers['mcp-session-id']) {
    sessionId = req.headers['mcp-session-id'] as string;
  }

  if (sessionId) {
    console.log(`Received MCP request for session: ${sessionId}`);
  } else {
    console.log('Request body:', req.body);
  }

  try {
    let transport: StreamableHTTPServerTransport;
    if (sessionId && transports[sessionId]) {
      // Reuse existing transport
      transport = transports[sessionId]!;
    } else if (!sessionId && isInitializeRequest(req.body)) {
      // New initialization request
      const eventStore = new InMemoryEventStore();
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(), // Set to undefined if the MCP server is stateless
        eventStore, // Enable resumability
        onsessioninitialized: (sessionId) => {
          // Store the transport by session ID when session is initialized
          // This avoids race conditions where requests might come in before the session is stored
          console.log(`Session initialized with ID: ${sessionId}`);
          transports[sessionId] = transport;
        },
      });

      // Set up onclose handler to clean up transport when closed
      transport.onclose = () => {
        const sid = transport.sessionId;
        if (sid && transports[sid]) {
          console.log(`Transport closed for session ${sid}, removing from transports map`);
          delete transports[sid];
        }
      };

      // Connect the transport to the MCP server BEFORE handling the request
      // so responses can flow back through the same transport
      const server = getServer();
      await server.connect(transport);

      await transport.handleRequest(req, res, req.body);
      return; // Already handled
    } else {
      // Invalid request - no session ID or not initialization request
      res.status(400).json(getJsonRpcError(NO_VALID_SESSION_ID_ERROR));
      return;
    }

    // Handle the request with existing transport - no need to reconnect
    // The existing transport is already connected to the server
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error('Error handling MCP request:', error);
    if (!res.headersSent) {
      res.status(500).json(getJsonRpcError(INTERNAL_SERVER_ERROR));
    }
  }
}

export function mcpMethodNotAllowedHandler(req: Request, res: Response) {
    res.writeHead(405).end(JSON.stringify(getJsonRpcError(METHOD_NOT_ALLOWED_ERROR)));
}
