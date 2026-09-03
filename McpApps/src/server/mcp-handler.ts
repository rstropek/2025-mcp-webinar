import { createMcpHandler } from "@modelcontextprotocol/server";
import { buildServer } from "./mcp-server.js";

/**
 * The bridge between HTTP and MCP.
 *
 * `createMcpHandler` takes a *factory*, not a server instance, and calls it
 * for every single HTTP request. That is the whole point of the 2026-07-28
 * revision: there is no `initialize` handshake and no session, so no state
 * has to survive between two requests. Such a server scales horizontally —
 * any instance behind a load balancer can answer any request.
 *
 * The returned handler is web-standard (`handler.fetch(Request): Response`),
 * which is why it needs the `toNodeHandler` adapter in `app.ts` to fit into
 * Express.
 */
export const mcpHandler = createMcpHandler(buildServer, {
  // "stateless": today's (2025-era) MCP Apps hosts — MCPJam, Claude, and
  // VS Code — still send an `initialize` request before their first real
  // call. "stateless" answers that handshake too, from a fresh instance per
  // request, just like modern clients get. Use "reject" once every host you
  // care about has moved to the session-less 2026-07-28 flow end to end.
  legacy: "stateless",

  // "auto": answer with a plain JSON body, and upgrade to `text/event-stream`
  // only when a tool handler emits a notification before its result. None of
  // the training steps stream progress notifications today, but "auto" costs
  // nothing and keeps the door open (e.g. for a future streamed-argument demo).
  responseMode: "auto",
});
