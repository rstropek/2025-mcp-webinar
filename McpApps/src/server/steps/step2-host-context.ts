import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { APP_MIME, uiResource } from "../lib/ui-meta.js";
import type { ViewStore } from "../lib/view-store.js";

/**
 * Step 2 — Host context & theming.
 *
 * The tool itself is trivial (an empty payload, plain text). The lesson is
 * on the View side (`src/ui/step2-host-context/view.ts`): how a View reads
 * the host's theme, locale, dimensions, and CSS variables, and re-renders
 * when they change. The tool exists purely to mount the view — everything
 * interesting here is the host → view context, not the tool call itself.
 */
const RESOURCE_URI = "ui://step2-host-context/app.html";

export function register(server: McpServer, views: ViewStore): void {
  server.registerTool(
    "step2-host-context",
    {
      title: "Step 2 — Host Context",
      description:
        "Renders an MCP App that displays the host context (theme, display mode, dimensions) and " + "re-renders on changes.",
      inputSchema: z.object({}),
      _meta: uiResource(RESOURCE_URI),
    },
    async () => ({
      content: [{ type: "text", text: "Open the panel to see host context details." }],
    }),
  );

  server.registerResource(
    "step2-host-context-ui",
    RESOURCE_URI,
    {
      title: "Step 2 — Host context view",
      description: "Step 2 — Host context view",
      mimeType: APP_MIME,
    },
    async (uri) => views.read(uri.href, "step2-host-context"),
  );
}
