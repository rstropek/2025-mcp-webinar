/**
 * MCP App entry point — runs INSIDE the host's sandboxed iframe.
 *
 * This iteration is intentionally simple for a live demo:
 *
 *   Screen 1 ("plan"):     phases timeline + risks + APPROVE button
 *   Screen 2 ("monitor"):  success banner + live metrics + recent logs
 *
 * Both screens live in the same iframe and we switch between them locally
 * after the user clicks Approve — there is NO second model turn or second
 * tool call required for the transition. After the switch we also send a
 * short follow-up chat message so the model can continue the conversation
 * if the user wants it to.
 */
import { App, applyDocumentTheme } from "@modelcontextprotocol/ext-apps";

import "./styles.css";
import type { RolloutPlan } from "../shared/types.js";
import { setState, subscribe } from "./state.js";
import { applyHostTheme, toggleDisplayMode } from "./theme.js";
import { mountTimeline } from "./components/timeline.js";
import { mountMetrics } from "./components/metrics.js";
import { mountRisks } from "./components/risks.js";
import { mountLogs } from "./components/logs.js";
import { mountApproval } from "./components/approval.js";

// ---------------------------------------------------------------------------
// 1) Create the App. The capabilities tell the host this UI plays nicely with
//    fullscreen/inline display mode toggles and that we expose tool list
//    changes if we ever start/stop UI-side tools.
// ---------------------------------------------------------------------------

const app = new App(
  { name: "Release Cockpit", version: "1.0.0" },
  {
    tools: { listChanged: true },
    availableDisplayModes: ["inline", "fullscreen"],
  },
  { autoResize: true, strict: false },
);

// ---------------------------------------------------------------------------
// 2) Tiny helpers shared by all components.
// ---------------------------------------------------------------------------

const titleEl = document.getElementById("cockpit-title")!;
const subtitleEl = document.getElementById("cockpit-subtitle")!;
const phaseBadge = document.getElementById("phase-badge")!;
const connectionPill = document.getElementById("connection-pill")!;
const lastAction = document.getElementById("last-action")!;
const approvedHeadline = document.getElementById("approved-headline")!;
const approvedDetail = document.getElementById("approved-detail")!;
const VIEW_STORAGE_KEY = "release-cockpit:view";
const TICKET_STORAGE_KEY = "release-cockpit:ticket";

function setLastAction(msg: string, kind?: "ok" | "err"): void {
  lastAction.textContent = msg;
  lastAction.classList.remove("ok", "err");
  if (kind) lastAction.classList.add(kind);
}

function setConnection(state: "connecting" | "ok" | "err", text?: string): void {
  connectionPill.textContent = text ?? state;
  connectionPill.classList.remove("pill-warn", "pill-ok", "pill-danger");
  connectionPill.classList.add(
    state === "ok" ? "pill-ok" : state === "err" ? "pill-danger" : "pill-warn",
  );
}

function setView(view: "plan" | "monitor"): void {
  document.body.dataset.view = view;
  document.getElementById("view-plan")!.hidden = view !== "plan";
  document.getElementById("view-monitor")!.hidden = view !== "monitor";
  try {
    sessionStorage.setItem(VIEW_STORAGE_KEY, view);
  } catch {
    // Ignore storage failures in constrained hosts.
  }
}

function setApprovedHeadline(ticket: string): void {
  approvedHeadline.textContent = `Released ✓ · ticket ${ticket}`;
  approvedDetail.textContent = "Monitoring the rollout for the next 60 minutes.";
  try {
    sessionStorage.setItem(TICKET_STORAGE_KEY, ticket);
  } catch {
    // Ignore storage failures in constrained hosts.
  }
}

// ---------------------------------------------------------------------------
// 3) Wire host -> UI notifications BEFORE app.connect().
// ---------------------------------------------------------------------------

app.ontoolinputpartial = (params) => {
  const args = params.arguments as { feature?: string; audience?: string };
  if (args.feature) titleEl.textContent = `Release Cockpit · ${args.feature}`;
  if (args.audience) subtitleEl.textContent = `for ${args.audience}…`;
};

app.ontoolinput = (params) => {
  const args = params.arguments as { feature?: string; audience?: string };
  if (args.feature) titleEl.textContent = `Release Cockpit · ${args.feature}`;
  if (args.audience) subtitleEl.textContent = `for ${args.audience}`;
};

// Important: VS Code (and likely other hosts) re-fire `tool-result` for EVERY
// tool the iframe calls itself (poll-metrics, get-log-chunk, ...). We only
// want to update the plan when the result's shape actually IS a rollout plan,
// otherwise app-only tool results would overwrite the plan with {points:[...]}
// and crash subsequent renders.
function isRolloutPlan(value: unknown): value is RolloutPlan {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<RolloutPlan>;
  return Array.isArray(v.phases) && Array.isArray(v.risks) && typeof v.feature === "string";
}

app.ontoolresult = (result) => {
  const candidate = result.structuredContent;
  if (!isRolloutPlan(candidate)) {
    // Not the originating tool's payload — silently ignore.
    return;
  }
  const plan = candidate;
  setState({ plan, phaseOverrides: {}, selectedRiskIds: [], selection: {} });
  titleEl.textContent = `Release Cockpit · ${plan.feature}`;
  subtitleEl.textContent = `for ${plan.audience} · scheduled ${new Date(plan.scheduledFor).toLocaleString()}`;
  phaseBadge.textContent = `${plan.phases.length} phases`;
  phaseBadge.hidden = false;
};

app.onhostcontextchanged = (params) => {
  if (params.theme) applyDocumentTheme(params.theme);
  if (params.displayMode) {
    document.body.classList.toggle("fullscreen", params.displayMode === "fullscreen");
  }
  applyHostTheme(app);
};

app.onteardown = async () => {
  setLastAction("Tearing down…", "err");
  return {};
};

// ---------------------------------------------------------------------------
// 4) Connect, then mount the small set of components we actually use.
// ---------------------------------------------------------------------------

void (async () => {
  try {
    await app.connect();
    setConnection("ok", "connected");
    applyHostTheme(app);

    // Plan screen
    mountTimeline(document.getElementById("timeline-list")!);
    mountRisks(app);
    mountApproval(app, { setView, setLastAction, setApprovedHeadline });

    // Monitor screen — these components are bound now but only render when
    // the monitor view is visible (their data sources poll regardless).
    mountMetrics(app);
    mountLogs(app);

    // Topbar: display mode toggle (fullscreen vs inline)
    const dmBtn = document.getElementById("display-mode-btn") as HTMLButtonElement;
    dmBtn.addEventListener("click", async () => {
      try {
        await toggleDisplayMode(app);
        const cur = app.getHostContext()?.displayMode ?? "inline";
        dmBtn.textContent = cur === "fullscreen" ? "↙ Inline" : "⤢ Fullscreen";
      } catch (err) {
        setLastAction(`requestDisplayMode failed: ${(err as Error).message}`, "err");
      }
    });

    // Monitor screen: "Hand back to AI" button posts a chat message so the
    // model can produce an executive summary. This is `ui/message`.
    const askSummary = document.getElementById("ask-summary-btn") as HTMLButtonElement;
    askSummary.addEventListener("click", async () => {
      try {
        const result = await app.sendMessage({
          role: "user",
          content: [
            {
              type: "text",
              text: "Write an executive summary of this rollout: status, current metrics, top risks, and what to watch in the next hour.",
            },
          ],
        });
        if (result.isError) {
          setLastAction("Host rejected summary message", "err");
          return;
        }
        setLastAction("Asked AI for executive summary", "ok");
      } catch (err) {
        setLastAction(`sendMessage failed: ${(err as Error).message}`, "err");
      }
    });

    // Restore last view after host remounts the iframe (e.g. virtualization).
    let restoredView: "plan" | "monitor" = "plan";
    let restoredTicket: string | null = null;
    try {
      restoredView = (sessionStorage.getItem(VIEW_STORAGE_KEY) as "plan" | "monitor" | null) ?? "plan";
      restoredTicket = sessionStorage.getItem(TICKET_STORAGE_KEY);
    } catch {
      // Ignore storage failures in constrained hosts.
    }
    setView(restoredView === "monitor" ? "monitor" : "plan");
    if (restoredView === "monitor" && restoredTicket) {
      setApprovedHeadline(restoredTicket);
    }
    subscribe((s) => {
      if (s.plan) setLastAction("ready", "ok");
    });
  } catch (err) {
    setConnection("err", "no host");
    subtitleEl.textContent = `Could not connect to MCP host: ${(err as Error).message}`;
  }
})();
