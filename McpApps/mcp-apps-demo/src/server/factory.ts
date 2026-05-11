/**
 * MCP server factory for the Release Cockpit demo.
 *
 * Registers:
 *   - `open-release-cockpit` (model+app)  : entry tool, returns the prefilled
 *                                           rollout plan AND opens the UI.
 *   - `simulate-rollout`     (app-only)   : "what-if" simulation called by UI
 *                                           controls; long enough to be cancelled.
 *   - `poll-metrics`         (app-only)   : returns N latest metric points so
 *                                           the UI can poll without spamming
 *                                           the model with tool results.
 *   - `get-log-chunk`        (app-only)   : pages large log data without ever
 *                                           sending it through the LLM.
 *   - `save-scenario`        (app-only)   : persists a UI selection for later.
 *   - `approve-rollout`      (model+app)  : THE controlled external action;
 *                                           the host will typically gate this
 *                                           with explicit user consent.
 *
 * Plus one regular MCP resource:
 *   - `doc://release-cockpit/runbook.md`  : a markdown runbook that the UI
 *                                           pulls via app.readServerResource().
 *
 * And one MCP App UI resource:
 *   - `ui://release-cockpit/mcp-app.html` : the bundled single-file UI.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  RESOURCE_MIME_TYPE,
  registerAppResource,
  registerAppTool,
} from "@modelcontextprotocol/ext-apps/server";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

import {
  RUNBOOK_MARKDOWN,
  buildRolloutPlan,
  getLogs,
  getMetricsHistory,
  simulate,
} from "./mock-data.js";
import type { RolloutPlan, SavedSelection } from "../shared/types.js";

// ---------------------------------------------------------------------------
// Filesystem helpers — works for both `tsx server.ts` (source) and compiled.
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const UI_HTML_PATH = path.join(REPO_ROOT, "dist", "mcp-app.html");

// ---------------------------------------------------------------------------
// Stable URIs for the cockpit's UI and runbook resources.
// ---------------------------------------------------------------------------

export const COCKPIT_UI_URI = "ui://release-cockpit/mcp-app.html";
export const RUNBOOK_URI = "doc://release-cockpit/runbook.md";

// ---------------------------------------------------------------------------
// In-memory state
//
// Real servers would persist this in Postgres/Redis. For the demo we keep one
// last saved scenario per session so the UI can demonstrate a round-trip.
// ---------------------------------------------------------------------------

interface SessionState {
  lastSelection?: SavedSelection;
  lastApprovalAt?: string;
}
const sessionState: SessionState = {};

// ---------------------------------------------------------------------------
// Helpers to format text fallbacks. EVERY tool returns a meaningful textual
// `content` block so hosts that don't yet support MCP Apps still get a useful
// answer (graceful degradation).
// ---------------------------------------------------------------------------

function summarizePlanAsText(plan: RolloutPlan): string {
  const lines = [
    `Release Cockpit · ${plan.feature}`,
    "=".repeat(40),
    `Audience       : ${plan.audience}`,
    `Scheduled      : ${plan.scheduledFor}`,
    "",
    "Phases:",
    ...plan.phases.map(
      (p) =>
        `  - ${p.label.padEnd(8)} ${String(p.percent).padStart(3)}%  ` +
        `start=${p.startsAt}  for ${p.durationMinutes}m`,
    ),
    "",
    "Risks:",
    ...plan.risks.map(
      (r) => `  [${r.severity.toUpperCase().padEnd(6)}] ${r.title}`,
    ),
    "",
    "Rollback steps:",
    ...plan.rollback.map((s, i) => `  ${i + 1}. ${s}`),
  ];
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Server factory. A NEW server instance per HTTP session keeps tool/resource
// registrations isolated and avoids transport-binding issues with McpServer.
// ---------------------------------------------------------------------------

export function createServer(): McpServer {
  const server = new McpServer({
    name: "Release Cockpit MCP Server",
    version: "1.0.0",
  });

  // -------------------------------------------------------------------------
  // 1) Entry tool: visible to the model. Triggers the UI render and returns
  //    a prefilled rollout plan as both human-readable text AND structured
  //    data the UI can display immediately.
  // -------------------------------------------------------------------------
  registerAppTool(
    server,
    "open-release-cockpit",
    {
      title: "Open Release Cockpit",
      description:
        "Open an interactive Release Cockpit for a feature rollout. Returns a prefilled plan with phases, feature flags, risks, live metrics and a rollback procedure. The user collaborates with the AI inside the UI; the AI never has to read raw metric or log data unless the user asks for it.",
      inputSchema: {
        feature: z
          .string()
          .min(1)
          .describe("Feature being rolled out, e.g. 'checkout.express_pay'."),
        audience: z
          .string()
          .min(1)
          .describe("Target audience, e.g. 'EU customers'."),
        scheduledFor: z
          .string()
          .optional()
          .describe(
            "ISO datetime the rollout should start. Defaults to tomorrow.",
          ),
      },
      // Visibility defaults to ["model", "app"] which is exactly what we want
      // here: the model can call it, AND the app can refresh by re-calling it.
      _meta: { ui: { resourceUri: COCKPIT_UI_URI } },
    },
    async ({ feature, audience, scheduledFor }): Promise<CallToolResult> => {
      const plan = buildRolloutPlan(
        feature,
        audience,
        scheduledFor ? new Date(scheduledFor) : undefined,
      );
      return {
        content: [{ type: "text", text: summarizePlanAsText(plan) }],
        // structuredContent is consumed directly by the UI and is NOT injected
        // into the model context (kept lean for the LLM).
        structuredContent: plan as unknown as Record<string, unknown>,
      };
    },
  );

  // -------------------------------------------------------------------------
  // 2) App-only tool: simulate a rollout. Marked `visibility: ["app"]` so the
  //    LLM never sees it in tools/list; only the UI can call it.
  //
  //    We also add an artificial 1.5s delay so the user can cancel the call
  //    from the UI to demonstrate the lifecycle's `tool-cancelled` path.
  // -------------------------------------------------------------------------
  registerAppTool(
    server,
    "simulate-rollout",
    {
      title: "Simulate Rollout (app-only)",
      description: "Run a what-if simulation for a rollout configuration.",
      inputSchema: {
        highestPercent: z
          .number()
          .min(0)
          .max(100)
          .describe("Highest rollout percentage included in the simulation."),
        includesPaymentSpike: z
          .boolean()
          .describe(
            "Whether the user has marked the payment-timeout window as a relevant risk.",
          ),
      },
      _meta: {
        ui: { resourceUri: COCKPIT_UI_URI, visibility: ["app"] },
      },
    },
    async (
      { highestPercent, includesPaymentSpike },
      extra,
    ): Promise<CallToolResult> => {
      // Demonstrate cancellation: cooperate with the request's AbortSignal so
      // the host can cancel a long-running simulation. `extra.signal` is
      // provided by the SDK from the underlying transport.
      const start = Date.now();
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(resolve, 1500);
        extra.signal?.addEventListener(
          "abort",
          () => {
            clearTimeout(t);
            reject(new Error("Simulation cancelled by host"));
          },
          { once: true },
        );
      });

      const sim = simulate({ highestPercent, includesPaymentSpike });
      const result = {
        scenarioId: `sim-${Date.now()}`,
        durationMs: Date.now() - start,
        ...sim,
      };

      return {
        content: [
          {
            type: "text",
            text: `Simulation: +${result.checkoutAbortDeltaPp}pp checkout-abort, ${result.errorBudgetBurnPct}% error-budget burn → ${result.recommendation}`,
          },
        ],
        structuredContent: result,
      };
    },
  );

  // -------------------------------------------------------------------------
  // 3) App-only tool: poll the most recent N metric points. The UI calls this
  //    on a timer; if the LLM saw every poll result, the model context would
  //    be flooded — exactly the use-case for `visibility: ["app"]`.
  // -------------------------------------------------------------------------
  registerAppTool(
    server,
    "poll-metrics",
    {
      title: "Poll Metrics (app-only)",
      description:
        "Return the most recent N metric snapshots for the rollout target.",
      inputSchema: {
        limit: z
          .number()
          .int()
          .min(1)
          .max(120)
          .default(15)
          .describe("How many metric snapshots to return (most recent first)."),
      },
      _meta: { ui: { resourceUri: COCKPIT_UI_URI, visibility: ["app"] } },
    },
    async ({ limit }): Promise<CallToolResult> => {
      const all = getMetricsHistory();
      const points = all.slice(-limit);
      return {
        content: [
          {
            type: "text",
            text: `Returned ${points.length} metric points (latest at ${points.at(-1)?.takenAt}).`,
          },
        ],
        structuredContent: { points },
      };
    },
  );

  // -------------------------------------------------------------------------
  // 4) App-only tool: chunked log retrieval with a substring filter. Keeps
  //    huge log payloads OUT of the model context unless the user explicitly
  //    summarizes them via ui/update-model-context or ui/message.
  // -------------------------------------------------------------------------
  registerAppTool(
    server,
    "get-log-chunk",
    {
      title: "Get Log Chunk (app-only)",
      description:
        "Return a paginated chunk of logs, optionally filtered by a substring.",
      inputSchema: {
        offset: z.number().int().min(0).default(0),
        limit: z.number().int().min(1).max(200).default(50),
        filter: z
          .string()
          .optional()
          .describe("Case-insensitive substring filter for log messages."),
        levels: z
          .array(z.enum(["info", "warn", "error"]))
          .optional()
          .describe("If provided, only logs at these levels are returned."),
      },
      _meta: { ui: { resourceUri: COCKPIT_UI_URI, visibility: ["app"] } },
    },
    async ({ offset, limit, filter, levels }): Promise<CallToolResult> => {
      const needle = filter?.toLowerCase();
      const filtered = getLogs().filter((l) => {
        if (levels && !levels.includes(l.level)) return false;
        if (needle && !l.message.toLowerCase().includes(needle)) return false;
        return true;
      });
      const slice = filtered.slice(offset, offset + limit);
      return {
        content: [
          {
            type: "text",
            text: `Returned ${slice.length} of ${filtered.length} matching log entries.`,
          },
        ],
        structuredContent: {
          entries: slice,
          totalMatches: filtered.length,
          nextOffset: offset + slice.length,
        },
      };
    },
  );

  // -------------------------------------------------------------------------
  // 5) App-only tool: persist the user's current selection (filter, time
  //    range, marked phases). This shows that an MCP App can keep ITS OWN
  //    server-side state without bothering the model with it.
  // -------------------------------------------------------------------------
  registerAppTool(
    server,
    "save-scenario",
    {
      title: "Save Scenario (app-only)",
      description:
        "Persist the user's current selection so it can be referenced later.",
      inputSchema: {
        rangeStart: z.string().optional(),
        rangeEnd: z.string().optional(),
        filter: z.string().optional(),
        riskyPhaseIds: z.array(z.string()).optional(),
        note: z.string().optional(),
      },
      _meta: { ui: { resourceUri: COCKPIT_UI_URI, visibility: ["app"] } },
    },
    async (selection): Promise<CallToolResult> => {
      sessionState.lastSelection = selection as SavedSelection;
      return {
        content: [
          {
            type: "text",
            text: "Selection saved. The model will not see this until the user asks.",
          },
        ],
        structuredContent: { ok: true, savedAt: new Date().toISOString() },
      };
    },
  );

  // -------------------------------------------------------------------------
  // 6) Approval tool: VISIBLE to the model so it can mention/recommend it,
  //    but the user effectively triggers it through the UI's "Approve" button.
  //
  //    In a real host, this is exactly the kind of tool that should require
  //    explicit user consent before execution (annotations.destructiveHint).
  // -------------------------------------------------------------------------
  // NOTE: deliberately uses plain `server.registerTool` (NOT registerAppTool):
  // we do NOT want this tool to render the cockpit UI when the model calls it
  // standalone from the chat. The iframe (when running) still calls this tool
  // via `app.callServerTool` from its own Approve button.
  server.registerTool(
    "approve-rollout",
    {
      title: "Approve Rollout",
      description:
        "Approve and schedule the current rollout plan. This creates a release ticket and locks the feature flag schedule.",
      inputSchema: {
        feature: z.string(),
        approver: z.string(),
        comment: z.string().optional(),
      },
      annotations: {
        // Hosts use these to decide whether to require explicit confirmation.
        destructiveHint: false,
        idempotentHint: false,
        readOnlyHint: false,
        openWorldHint: true,
      },
    },
    async ({ feature, approver, comment }): Promise<CallToolResult> => {
      const ticket = `REL-${Math.floor(Math.random() * 9000 + 1000)}`;
      sessionState.lastApprovalAt = new Date().toISOString();
      return {
        content: [
          {
            type: "text",
            text: `Approved ${feature} for rollout. Created ticket ${ticket} (approver: ${approver}${comment ? `, note: "${comment}"` : ""}).`,
          },
        ],
        structuredContent: {
          ok: true,
          ticket,
          feature,
          approver,
          comment,
          approvedAt: sessionState.lastApprovalAt,
        },
      };
    },
  );

  // -------------------------------------------------------------------------
  // UI resource: the bundled single-file MCP App.
  //
  // We use registerAppResource which sets the correct mime type
  // (`text/html;profile=mcp-app`) by default and supports CSP / domain meta.
  // -------------------------------------------------------------------------
  registerAppResource(
    server,
    "Release Cockpit App",
    COCKPIT_UI_URI,
    {
      description: "Interactive Release Cockpit / Incident Commander UI",
      _meta: {
        ui: {
          // Keep CSP intentionally restrictive: no external connections or
          // resources are needed because vite-plugin-singlefile inlines
          // everything. Hosts will use the secure default CSP.
          prefersBorder: true,
        },
      },
    },
    async () => {
      // Read the bundled HTML at request time so a `npm run dev:ui` workflow
      // can rebuild without restarting the server.
      let html: string;
      try {
        html = await fs.readFile(UI_HTML_PATH, "utf-8");
      } catch {
        html = `<!doctype html><html><body style="font-family:sans-serif;padding:24px">
<h2>Release Cockpit UI not built</h2>
<p>Run <code>npm run build</code> to produce <code>dist/mcp-app.html</code>, then call this tool again.</p>
</body></html>`;
      }
      return {
        contents: [
          { uri: COCKPIT_UI_URI, mimeType: RESOURCE_MIME_TYPE, text: html },
        ],
      };
    },
  );

  // -------------------------------------------------------------------------
  // Regular (non-UI) resource: the runbook. The MCP App UI fetches this via
  // app.readServerResource() to demonstrate that an App can read arbitrary
  // server resources (and stream large content into the iframe).
  // -------------------------------------------------------------------------
  server.registerResource(
    "Rollout Runbook",
    RUNBOOK_URI,
    {
      mimeType: "text/markdown",
      description: "Markdown runbook for the checkout rollout",
    },
    async () => ({
      contents: [
        { uri: RUNBOOK_URI, mimeType: "text/markdown", text: RUNBOOK_MARKDOWN },
      ],
    }),
  );

  return server;
}
