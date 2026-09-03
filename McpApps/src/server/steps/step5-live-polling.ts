import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { APP_MIME, appOnly, uiResource } from "../lib/ui-meta.js";
import type { ViewStore } from "../lib/view-store.js";

/**
 * Step 5 — Live polling with lifecycle cleanup.
 *
 * Two tools, one resource:
 *   - `step5-monitor` — model-facing, opens the dashboard.
 *   - `step5-stats` — app-only (`visibility: ["app"]`), called every 2 s by
 *     the View. The model never sees the storm of poll calls.
 *
 * The View stops the timer on `app.onteardown` — see
 * `src/ui/step5-live-polling/view.ts`.
 */
const RESOURCE_URI = "ui://step5-live-polling/app.html";

// Module-level, not per-request: the 2026-07-28 revision is stateless
// (`createMcpHandler` builds a fresh `McpServer` per HTTP call, see
// `mcp-server.ts`), so anything that must survive across requests — like
// "how long has this process been running" — has to live outside the
// factory, at module scope. This timestamp is set once, the first time this
// module is imported, and then read by every subsequent call.
const startedAt = Date.now();

const outputSchema = z.object({
  cpu: z.number().describe("Synthetic CPU utilization percentage."),
  memory: z.number().describe("Synthetic memory utilization percentage."),
  uptime: z.number().int().describe("Seconds since the server process started."),
  timestamp: z.string().describe("Sample time, ISO 8601."),
});

async function sample() {
  // CPU and memory are intentionally synthetic: they animate the demo
  // without depending on platform-specific probes (which is the point — the
  // View just renders whatever the app-only tool streams it).
  const nowMs = Date.now();
  const cpu = 30 + Math.sin(nowMs / 1000) * 15 + Math.random() * 5;
  const memory = 55 + Math.cos(nowMs / 1700) * 12 + Math.random() * 4;
  const uptime = Math.round((Date.now() - startedAt) / 1000);
  const timestamp = new Date().toISOString();

  return {
    // `toFixed` always formats with a `.` decimal separator regardless of
    // the server's OS locale — unlike, say, `Intl.NumberFormat` with no
    // explicit locale. The .NET version needed an explicit
    // `CultureInfo.InvariantCulture` for the same reason: model-facing text
    // must read the same everywhere ("30.5%"), never "30,5%" under a
    // German/Austrian locale. `structuredContent` stays numeric JSON either
    // way, so the View is unaffected — this only matters for the text block.
    content: [{ type: "text" as const, text: `cpu ${cpu.toFixed(1)}% / mem ${memory.toFixed(1)}%` }],
    structuredContent: { cpu, memory, uptime, timestamp },
  };
}

export function register(server: McpServer, views: ViewStore): void {
  server.registerTool(
    "step5-monitor",
    {
      title: "Step 5 — Live host monitor",
      description: "Opens a dashboard that polls host stats every 2 s via an app-only tool.",
      inputSchema: z.object({}),
      outputSchema,
      _meta: uiResource(RESOURCE_URI),
    },
    sample,
  );

  // App-only polling tool. The model has no idea this exists, so it can't
  // accidentally start spamming it.
  server.registerTool(
    "step5-stats",
    {
      title: "Step 5 — Poll Stats (app-only)",
      description: "Returns the latest host stats sample. Hidden from the model.",
      inputSchema: z.object({}),
      outputSchema,
      _meta: appOnly(),
    },
    sample,
  );

  server.registerResource(
    "step5-live-polling-ui",
    RESOURCE_URI,
    {
      title: "Step 5 — Live polling view",
      description: "Step 5 — Live polling view",
      mimeType: APP_MIME,
    },
    async (uri) => views.read(uri.href, "step5-live-polling"),
  );
}
