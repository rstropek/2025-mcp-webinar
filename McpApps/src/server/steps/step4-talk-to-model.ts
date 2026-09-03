import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { APP_MIME, uiResource } from "../lib/ui-meta.js";
import type { ViewStore } from "../lib/view-store.js";

/**
 * Step 4 — Talk to model.
 *
 * The tool side is intentionally boring (a placeholder result). The lesson
 * is what the View (`src/ui/step4-talk-to-model/view.ts`) can do *after* it
 * mounts: push messages (`app.sendMessage`), pin context silently
 * (`app.updateModelContext`), and open external links (`app.openLink`) — all
 * through the host, never via DOM tricks in the sandboxed iframe.
 */
const RESOURCE_URI = "ui://step4-talk-to-model/app.html";

export function register(server: McpServer, views: ViewStore): void {
  server.registerTool(
    "step4-talk-to-model",
    {
      title: "Step 4 — Talk to model",
      description: "Opens a panel with buttons that push messages, pin context, and open links via the host.",
      inputSchema: z.object({}),
      _meta: uiResource(RESOURCE_URI),
    },
    async () => ({
      content: [{ type: "text", text: "Panel opened. Use the buttons to interact with the model." }],
    }),
  );

  server.registerResource(
    "step4-talk-to-model-ui",
    RESOURCE_URI,
    {
      title: "Step 4 — Talk to model view",
      description: "Step 4 — Talk to model view",
      mimeType: APP_MIME,
    },
    async (uri) => views.read(uri.href, "step4-talk-to-model"),
  );
}
