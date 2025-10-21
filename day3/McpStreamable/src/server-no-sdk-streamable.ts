import express from "express";
import { buildPassword } from "./lib/password.js";
import { loadPoniesFromFile } from "./lib/ponies.js";
import type { Request, Response } from 'express';

type JR = { jsonrpc: "2.0"; id?: number | string | null; method?: string; params?: any; result?: any; error?: any };

const app = express();
app.use(express.json());

function handleInitialize(id: JR["id"]) {
  const result = {
    protocolVersion: "2024-11-05",
    serverInfo: { name: "pony-no-sdk-streamable", version: "0.1.0" },
    capabilities: {
      tools: { listChanged: true },
    }
  };
  return { jsonrpc: "2.0" as const, id, result };
}

function handleToolsList(id: JR["id"]) {
  const result = {
    tools: [
      {
        name: "pony_password",
        description: "Generiert ein Passwort aus My-Little-Pony-Charakternamen.",
        inputSchema: {
          type: "object",
          properties: {
            minLength: { type: "number", minimum: 1, default: 16 },
            special: { type: "boolean", default: false }
          },
          additionalProperties: false
        }
      }
    ]
  };
  return { jsonrpc: "2.0" as const, id, result };
}

function handleToolsCall(id: JR["id"], params: any) {
  const { name, arguments: args } = params ?? {};
  if (name !== "pony_password") {
    return { jsonrpc: "2.0" as const, id, error: { code: -32601, message: "Unknown tool" } };
  }
  const minLength = Number(args?.minLength ?? 16);
  const special = Boolean(args?.special ?? false);
  const ponies = loadPoniesFromFile();
  const pwd = buildPassword({ minLength, special }, ponies);
  return { jsonrpc: "2.0" as const, id, result: { content: [{ type: "text", text: pwd }] } };
}

// See also JsonRPC specification for error codes
type JsonRpcError = {
  code: number;
  message: string;
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

export function mcpMethodNotAllowedHandler(req: Request, res: Response) {
    res.writeHead(405).end(JSON.stringify(getJsonRpcError(METHOD_NOT_ALLOWED_ERROR)));
}

// Handle POST requests for JSON-RPC
app.post("/mcp", (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string;
  const msg: JR = req.body;
  
  // For initialize requests, we don't require session ID yet
  if (msg.method === "initialize") {
    const response = handleInitialize(msg.id);
    res.json(response);
    return;
  }
  
  let response: JR;

  try {
    if (msg.method === "tools/list") {
      response = handleToolsList(msg.id);
    } else if (msg.method === "tools/call") {
      response = handleToolsCall(msg.id, msg.params);
    } else {
      response = { 
        jsonrpc: "2.0" as const, 
        id: msg.id ?? null, 
        error: { code: -32601, message: `Unsupported method: ${msg.method}` } 
      };
    }
  } catch (error) {
    response = {
      jsonrpc: "2.0" as const,
      id: msg.id ?? null,
      error: { code: -32603, message: "Internal error" }
    };
  }

  res.json(response);
});

app.get("/mcp", mcpMethodNotAllowedHandler);
app.delete("/mcp", mcpMethodNotAllowedHandler);

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    serverName: "pony-no-sdk-streamable",
    serverVersion: "0.1.0"
  });
});

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
  console.log(`MCP server (pony-no-sdk-streamable) running at http://127.0.0.1:${PORT}/mcp`);
  console.log(`Health check: http://127.0.0.1:${PORT}/health`);
});
