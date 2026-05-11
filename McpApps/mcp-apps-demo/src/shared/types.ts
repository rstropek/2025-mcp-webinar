/**
 * Shared TypeScript types used by BOTH the MCP server and the App UI.
 *
 * Keeping a single source of truth for the wire types is one of the strengths
 * of MCP Apps: structuredContent is typed end-to-end, no runtime translation.
 */

export type Severity = "ok" | "warn" | "danger";

export interface RolloutPhase {
  /** Stable identifier (used as key for drag/edit operations from the UI). */
  id: string;
  /** Human readable label, e.g. "Internal", "1%", "5%". */
  label: string;
  /** Traffic percentage rolled out at this phase (0..100). */
  percent: number;
  /** ISO timestamp when this phase is scheduled to start. */
  startsAt: string;
  /** Phase duration in minutes. */
  durationMinutes: number;
  /** Per-region overrides, e.g. { "EU-DE": 10, "EU-FR": 25 }. */
  regionOverrides?: Record<string, number>;
}

export interface FeatureFlag {
  key: string;
  description: string;
  /** Whether the flag is currently enabled in production. */
  enabled: boolean;
  /** Comma separated owner team names. */
  owners: string;
}

export interface RiskCheck {
  id: string;
  title: string;
  severity: Severity;
  detail: string;
}

export interface MetricsSnapshot {
  /** ISO timestamp of when the snapshot was taken. */
  takenAt: string;
  /** Errors per minute across all services. */
  errorRate: number;
  /** p95 latency in ms. */
  latencyP95: number;
  /** Checkout conversion rate (0..1). */
  checkoutConversion: number;
  /** Open support tickets in the last 15 minutes. */
  supportTickets: number;
}

export interface MetricsTimePoint extends MetricsSnapshot {}

export interface LogEntry {
  /** Sequence id, monotonically increasing. */
  id: number;
  /** ISO timestamp. */
  ts: string;
  level: "info" | "warn" | "error";
  service: string;
  message: string;
}

export interface RolloutPlan {
  feature: string;
  audience: string;
  /** ISO date the rollout starts. */
  scheduledFor: string;
  phases: RolloutPhase[];
  flags: FeatureFlag[];
  risks: RiskCheck[];
  rollback: string[];
  runbookResourceUri: string;
}

export interface SimulationResult {
  scenarioId: string;
  durationMs: number;
  /** Predicted checkout abort delta in percentage points (e.g. 2.3 → +2.3pp). */
  checkoutAbortDeltaPp: number;
  /** Predicted error budget burn percentage (0..100). */
  errorBudgetBurnPct: number;
  /** Plain-text recommendation. */
  recommendation: string;
}

export interface SavedSelection {
  /** Selected log time range, ISO timestamps. */
  rangeStart?: string;
  rangeEnd?: string;
  /** Active filter on log messages (substring). */
  filter?: string;
  /** Phases the user has marked as risky. */
  riskyPhaseIds?: string[];
  /** Free-form note attached to the selection. */
  note?: string;
}
