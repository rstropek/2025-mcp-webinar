import { createMcpExpressApp } from "@modelcontextprotocol/express";
import { toNodeHandler } from "@modelcontextprotocol/node";
import cors from "cors";
import { mcpHandler } from "./mcp-handler.js";

const HOST = "127.0.0.1";
const PORT = Number(process.env.PORT ?? 3000);

// `createMcpExpressApp` is a normal Express app plus two things every MCP
// server over HTTP needs anyway:
//   * `express.json()` for the JSON-RPC bodies, and
//   * `Host`/`Origin` validation for localhost binds.
// The latter guards against DNS rebinding: a website can make your browser
// resolve `evil.example` to 127.0.0.1 and then talk to this server with your
// machine's privileges. The same-origin policy does not stop that, because to
// the browser the request looks same-origin. Checking that `Host` and `Origin`
// really name a localhost address does.
const app = createMcpExpressApp({ host: HOST });

// CORS is a *separate* problem from the Host/Origin check above: that check
// decides who may talk to us, CORS decides what the browser lets a page read
// back. We need it because the MCP Inspector can talk to this server directly
// from the browser ("Direct" connection type) instead of through its proxy.
// Without the preflight answer below, the browser refuses to send the
// 2026-07-28 headers. `origin: true` reflects the caller's origin — safe here,
// because the app's own Origin validation already rejects anything that is not
// localhost.
app.use(
  cors({
    origin: true,
    methods: ["POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Accept", "MCP-Protocol-Version", "Mcp-Method", "Mcp-Name"],
  }),
);

// Not part of MCP — just a plain route to prove the Express app is alive.
app.get("/ping", (_req, res) => res.json({ message: "pong" }));

// One endpoint, one method: the 2026-07-28 revision only knows POST /mcp.
// Sessions (`Mcp-Session-Id`), the standalone GET SSE stream and DELETE-based
// session termination are gone. We still mount with `app.all` so the SDK — not
// Express — gets to answer GET and DELETE from legacy clients with a proper
// `405 Method Not Allowed`.
// `req.body` is passed along because `express.json()` already consumed the
// request stream; without it the handler would find an empty body.
const mcpNodeHandler = toNodeHandler(mcpHandler);
app.all("/mcp", (req, res) => void mcpNodeHandler(req, res, req.body));

const httpServer = app.listen(PORT, HOST, () => {
  console.log(`MCP server listening on http://${HOST}:${PORT}/mcp`);
});
httpServer.on("error", (error) => {
  console.error(`Error starting server: ${error}`);
  process.exit(1);
});

process.on("SIGINT", async () => {
  console.log("Shutting down server...");
  // `close()` aborts in-flight exchanges, which fires `ctx.mcpReq.signal` in
  // every running tool handler — that is how a long "thinking" call is stopped.
  await mcpHandler.close();
  httpServer.close(() => process.exit(0));
});
