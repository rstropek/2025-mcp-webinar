/**
 * Tiny in-memory store for the cockpit UI.
 *
 * We intentionally avoid pulling in a state-management framework — the goal of
 * the demo is to make every MCP-Apps interaction explicit and easy to read.
 * Subscribers are notified after every mutation, which lets the components
 * stay decoupled from each other.
 */
import type {
  LogEntry,
  MetricsSnapshot,
  RolloutPlan,
  SavedSelection,
} from "../shared/types.js";

export interface CockpitState {
  /** The plan as returned by `open-release-cockpit` (or null until received). */
  plan: RolloutPlan | null;
  /** Local mutations to phase percentages (id → percent). */
  phaseOverrides: Record<string, number>;
  /** Risk ids the user has flagged as relevant. */
  selectedRiskIds: string[];
  /** Latest metric snapshot (rendered in the cards). */
  latestMetrics: MetricsSnapshot | null;
  /** History the sparkline draws. */
  metricsHistory: MetricsSnapshot[];
  /** Currently displayed log slice (paginated). */
  logs: LogEntry[];
  /** Filter parameters for the next get-log-chunk call. */
  logFilter: { filter?: string; level?: "info" | "warn" | "error" };
  /** Pagination cursor for logs. */
  logsOffset: number;
  /** Total count of matching log entries. */
  logsTotal: number;
  /** Active "scenario" the user can save to the server. */
  selection: SavedSelection;
  /** Whether the simulation is currently running. */
  simulationInFlight: boolean;
}

type Listener = (state: CockpitState) => void;

const state: CockpitState = {
  plan: null,
  phaseOverrides: {},
  selectedRiskIds: [],
  latestMetrics: null,
  metricsHistory: [],
  logs: [],
  logFilter: {},
  logsOffset: 0,
  logsTotal: 0,
  selection: {},
  simulationInFlight: false,
};

const listeners = new Set<Listener>();

export function getState(): CockpitState {
  return state;
}

export function setState(patch: Partial<CockpitState>): void {
  Object.assign(state, patch);
  for (const l of listeners) l(state);
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  // Notify immediately so subscribers can render the current state.
  listener(state);
  return () => listeners.delete(listener);
}

/** Build a markdown snapshot the model can use for follow-up turns. */
export function buildSelectionMarkdown(): string {
  const plan = state.plan;
  if (!plan) return "No rollout plan loaded.";

  const selectedRisks = plan.risks.filter((r) =>
    state.selectedRiskIds.includes(r.id),
  );
  const phasesFmt = plan.phases.map((p) => {
    const override = state.phaseOverrides[p.id];
    const pct = override ?? p.percent;
    const changed = override !== undefined && override !== p.percent;
    return `- ${p.label} → ${pct}%${changed ? " (changed in cockpit)" : ""}`;
  });

  const lines = [
    `# Cockpit selection for ${plan.feature}`,
    "",
    `**Audience**: ${plan.audience}`,
    `**Scheduled for**: ${plan.scheduledFor}`,
    "",
    "## Phases",
    ...phasesFmt,
    "",
    "## Selected risks",
    ...(selectedRisks.length === 0
      ? ["_No risks marked yet._"]
      : selectedRisks.map((r) => `- **[${r.severity}] ${r.title}** — ${r.detail}`)),
    "",
    "## Active log filter",
    `- substring: \`${state.logFilter.filter ?? ""}\``,
    `- level    : \`${state.logFilter.level ?? "any"}\``,
  ];

  if (state.selection.note) {
    lines.push("", "## Note", state.selection.note);
  }

  return lines.join("\n");
}
