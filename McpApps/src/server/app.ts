import { toNodeHandler } from "@modelcontextprotocol/node";
import cors from "cors";
import express from "express";
import { mcpHandler } from "./mcp-handler.js";

const HOST = process.env.HOST ?? "0.0.0.0";
const PORT = Number(process.env.PORT ?? 3001);

// Plain `express()`, not `createMcpExpressApp` (compare `day3/DemoServer`).
// `createMcpExpressApp` bundles a Host/Origin check that guards against DNS
// rebinding — it only accepts requests whose `Host` header names a localhost
// address. That check is exactly right for a server that is meant to be
// reached only from the machine it runs on. This sample is not: MCP App
// hosts talk to it from other origins by design — MCPJam and the MCP
// Inspector run in a browser tab, and Claude reaches it through a public
// tunnel (`cloudflared`/ngrok) whose `Host` header is the tunnel's domain,
// never `localhost`. The DNS-rebinding guard would reject every one of
// those legitimate callers, so we skip it. In exchange, never point this
// server at anything with real data or run it anywhere but a throwaway
// training environment — with no Host check and no auth, anyone who can
// reach the port can call every tool.
const app = express();

app.use(express.json());

// CORS is a *separate* concern from the Host check we chose not to use: it
// governs what a *browser page* is allowed to read back, not who may
// connect. MCPJam/Inspector run as browser pages, so without permissive CORS
// their JavaScript could send the request but never see the JSON response.
// `origin: true` reflects whatever `Origin` the caller sent — acceptable
// here because, again, this server has no per-origin trust to protect.
app.use(
  cors({
    origin: true,
    methods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Accept",
      "Authorization",
      "Mcp-Protocol-Version",
      "Mcp-Session-Id",
      "Mcp-Method",
      "Mcp-Name",
    ],
    exposedHeaders: ["Mcp-Session-Id"],
  }),
);

// Not part of MCP — a plain route to prove the Express app is alive, useful
// when this server sits behind a tunnel and you just want a quick check.
app.get("/health", (_req, res) => res.json({ status: "ok" }));

// One endpoint for the MCP Streamable HTTP transport. `app.all` (rather than
// `app.post`) lets the SDK itself answer GET/DELETE from legacy clients with
// a proper `405 Method Not Allowed` instead of Express's generic 404.
// `req.body` is passed explicitly because `express.json()` already consumed
// the request stream — without it the handler would see an empty body.
const mcpNodeHandler = toNodeHandler(mcpHandler);
app.all("/mcp", (req, res) => void mcpNodeHandler(req, res, req.body));

const httpServer = app.listen(PORT, HOST, () => {
  console.log(`MCP Apps training server listening on http://${HOST}:${PORT}/mcp`);
});
httpServer.on("error", (error) => {
  console.error(`Error starting server: ${error}`);
  process.exit(1);
});

process.on("SIGINT", async () => {
  console.log("Shutting down server...");
  // `close()` aborts in-flight exchanges, which fires `ctx.mcpReq.signal` in
  // every running tool handler.
  await mcpHandler.close();
  httpServer.close(() => process.exit(0));
});
