/**
 * MCP server entry point.
 *
 * Exposes the Release Cockpit MCP server over Streamable HTTP on
 * `http://localhost:3001/mcp` so it can be added as a custom connector in any
 * MCP host (Claude Desktop, VS Code, Goose, ChatGPT Apps, ...).
 *
 * One McpServer instance is created PER request: the official `McpServer` class
 * binds 1:1 to a transport, so re-using a single instance across HTTP sessions
 * would corrupt the JSON-RPC bookkeeping. This pattern matches the official
 * MCP Apps examples (e.g. budget-allocator-server).
 */
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import cors from "cors";
import express from "express";

import { createServer } from "./src/server/factory.js";

const PORT = Number(process.env.PORT ?? 3001);

const app = express();
app.use(cors());
app.use(express.json({ limit: "4mb" }));

// Lightweight health check so cloudflared / docker-compose / kubernetes can
// verify the process is up without speaking MCP.
app.get("/health", (_req, res) => {
  res.json({ ok: true, server: "release-cockpit", time: new Date().toISOString() });
});

app.post("/mcp", async (req, res) => {
  // Each POST is treated as a fresh JSON-RPC session. `enableJsonResponse`
  // returns the response body inline (instead of upgrading to SSE), which is
  // the simplest mode for stateless connectors.
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  res.on("close", () => {
    void transport.close();
  });

  const server = createServer();
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[release-cockpit] MCP server listening on http://localhost:${PORT}/mcp`);
});
