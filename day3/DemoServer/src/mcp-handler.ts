import { createMcpHandler } from "@modelcontextprotocol/server";
import { buildServer } from "./mcp-server.js";

/**
 * The bridge between HTTP and MCP.
 *
 * `createMcpHandler` takes a *factory*, not a server instance, and calls it for
 * every single HTTP request. That is the whole point of the 2026-07-28
 * revision: there is no `initialize` handshake and no session, so no state has
 * to survive between two requests. Such a server scales horizontally — any
 * instance behind a load balancer can answer any request.
 *
 * The returned handler is web-standard (`handler.fetch(Request): Response`),
 * which is why it needs the `toNodeHandler` adapter in `app.ts` to fit into
 * Express.
 */
export const mcpHandler = createMcpHandler(buildServer, {
  // "stateless": 2025-era clients (VS Code, MCP Inspector in its default mode)
  // that still send `initialize` are served too — from a fresh instance per
  // request, just like modern clients. Use "reject" for a modern-only server.
  legacy: "stateless",

  // "auto": answer with a plain JSON body, and upgrade to `text/event-stream`
  // only when the tool handler emits a notification before its result. Try
  // `"json"` in the training to show that mid-call notifications are then
  // silently dropped, and `"sse"` to always stream.
  responseMode: "auto",
});
