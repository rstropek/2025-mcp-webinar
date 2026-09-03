import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { APP_MIME, uiResource } from "../lib/ui-meta.js";
import type { ViewStore } from "../lib/view-store.js";

/**
 * Step 1 — Tool ↔ UI link.
 *
 * The smallest possible MCP App: one tool, one UI resource, joined by
 * `_meta.ui.resourceUri`. When the host calls the tool it sees that link,
 * fetches the resource via `resources/read`, and mounts the returned HTML in
 * a sandboxed iframe — that iframe is the View in
 * `src/ui/step1-hello/view.ts`.
 *
 * `structuredContent` is the typed payload routed to the View next to the
 * plain `content` the model sees.
 */
const RESOURCE_URI = "ui://step1-hello/app.html";

export function register(server: McpServer, views: ViewStore): void {
  server.registerTool(
    "step1-hello",
    {
      title: "Step 1 — Hello",
      description: "Returns a greeting and the current server time. Renders an MCP App UI.",
      inputSchema: z.object({}),
      outputSchema: z.object({
        time: z.string().describe("Current server time, ISO 8601."),
        greeting: z.string(),
      }),
      // This single line is what turns a plain tool into an MCP App tool.
      _meta: uiResource(RESOURCE_URI),
    },
    async () => {
      const time = new Date().toISOString();
      const greeting = "Hello, MCP Apps!";
      return {
        // `content`: shown to the model (and to humans in fallback hosts).
        content: [{ type: "text", text: `${greeting} (server time ${time})` }],
        // `structuredContent`: shipped verbatim to the View — same fields, no text round-trip.
        structuredContent: { time, greeting },
      };
    },
  );

  server.registerResource(
    "step1-hello-ui",
    RESOURCE_URI,
    {
      title: "Step 1 — Hello view",
      description: "Step 1 — Hello view",
      mimeType: APP_MIME,
    },
    async (uri) => views.read(uri.href, "step1-hello"),
  );
}
