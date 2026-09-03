import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { APP_MIME, appOnly, uiResource } from "../lib/ui-meta.js";
import type { ViewStore } from "../lib/view-store.js";

/**
 * Step 3 — View → Server tool calls + app-only visibility.
 *
 * Two tools, one shared UI resource:
 *   - `step3-quote` — default visibility (model + app). The model calls this
 *     to *open* the quote panel.
 *   - `step3-next-quote` — `visibility: ["app"]`. Only the View can call it
 *     (via `app.callServerTool`); the model never sees it in its tool list,
 *     so clicking "Another one" in the panel never consumes a conversation
 *     turn or shows up as a model-initiated tool call.
 *
 * The shared `resourceUri` binds both tools to the same iframe.
 */
const RESOURCE_URI = "ui://step3-call-tool/app.html";

const QUOTES: readonly [quote: string, author: string][] = [
  ["The only way to do great work is to love what you do.", "Steve Jobs"],
  ["Simplicity is the ultimate sophistication.", "Leonardo da Vinci"],
  ["Make it work, make it right, make it fast.", "Kent Beck"],
  ["Premature optimization is the root of all evil.", "Donald Knuth"],
  ["Talk is cheap. Show me the code.", "Linus Torvalds"],
  ["There are only two hard things in computer science: cache invalidation and naming things.", "Phil Karlton"],
];

const outputSchema = z.object({
  quote: z.string(),
  author: z.string(),
});

async function pick() {
  const entry = QUOTES[Math.floor(Math.random() * QUOTES.length)];
  const [quote, author] = entry as [string, string];
  return {
    content: [{ type: "text" as const, text: `"${quote}" — ${author}` }],
    structuredContent: { quote, author },
  };
}

export function register(server: McpServer, views: ViewStore): void {
  // Model-facing tool: this is the one shown in the model's tool list.
  server.registerTool(
    "step3-quote",
    {
      title: "Step 3 — Random Quote",
      description: "Shows a random programming quote and an interactive UI to fetch more.",
      inputSchema: z.object({}),
      outputSchema,
      _meta: uiResource(RESOURCE_URI),
    },
    pick,
  );

  // App-only tool: invisible to the model. The View calls it when the user
  // clicks "Another one" — no conversation turn is consumed.
  server.registerTool(
    "step3-next-quote",
    {
      title: "Step 3 — Next Quote (app-only)",
      description: "Returns another random quote. Hidden from the model.",
      inputSchema: z.object({}),
      outputSchema,
      _meta: appOnly(),
    },
    pick,
  );

  server.registerResource(
    "step3-call-tool-ui",
    RESOURCE_URI,
    {
      title: "Step 3 — Random quote view",
      description: "Step 3 — Random quote view",
      mimeType: APP_MIME,
    },
    async (uri) => views.read(uri.href, "step3-call-tool"),
  );
}
