/**
 * Deterministic mock data for the Release Cockpit demo.
 *
 * In a real MCP server this would come from incident management, feature flag
 * platforms (LaunchDarkly, Unleash, ...), observability backends (Datadog,
 * Prometheus), and ticketing systems. Here we generate believable data with a
 * seeded PRNG so simulations and metric polls are reproducible.
 */
import type {
  FeatureFlag,
  LogEntry,
  MetricsTimePoint,
  RiskCheck,
  RolloutPhase,
  RolloutPlan,
} from "../shared/types.js";

// ---------------------------------------------------------------------------
// Tiny deterministic PRNG (Mulberry32) so the demo is reproducible across runs
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Static config: phases, flags, risks, rollback steps
// ---------------------------------------------------------------------------

function buildPhases(scheduledFor: Date): RolloutPhase[] {
  const base = scheduledFor.getTime();
  const minute = 60_000;
  const phaseTemplates: Array<Omit<RolloutPhase, "id" | "startsAt">> = [
    { label: "Internal", percent: 0, durationMinutes: 30 },
    { label: "1%", percent: 1, durationMinutes: 60 },
    { label: "5%", percent: 5, durationMinutes: 90 },
    { label: "25%", percent: 25, durationMinutes: 120 },
    { label: "50%", percent: 50, durationMinutes: 120 },
    { label: "100%", percent: 100, durationMinutes: 0 },
  ];

  let cursor = base;
  return phaseTemplates.map((tpl, i) => {
    const phase: RolloutPhase = {
      id: `phase-${i}`,
      label: tpl.label,
      percent: tpl.percent,
      startsAt: new Date(cursor).toISOString(),
      durationMinutes: tpl.durationMinutes,
      regionOverrides:
        tpl.percent === 50
          ? { "EU-DE": 50, "EU-FR": 50, "EU-IT": 25 }
          : undefined,
    };
    cursor += tpl.durationMinutes * minute;
    return phase;
  });
}

const DEFAULT_FLAGS: FeatureFlag[] = [
  {
    key: "checkout.express_pay",
    description: "Enable one-click express payment on checkout",
    enabled: false,
    owners: "@payments-team",
  },
  {
    key: "checkout.address_v2",
    description: "Use new address validation API (EU-only)",
    enabled: true,
    owners: "@growth-eu",
  },
  {
    key: "ui.cart_drawer",
    description: "Slide-in cart drawer instead of full cart page",
    enabled: false,
    owners: "@frontend-platform",
  },
];

const DEFAULT_RISKS: RiskCheck[] = [
  {
    id: "error-budget",
    title: "Error budget at 78% (last 30d)",
    severity: "warn",
    detail:
      "Checkout SLO has burned 78% of its monthly error budget. A 25% rollout on a Friday is risky.",
  },
  {
    id: "payment-spike",
    title: "Payment timeout spike at 10:32–10:41",
    severity: "danger",
    detail:
      "Stripe-EU returned 4xx for ~12% of requests in this window. Root cause not yet identified.",
  },
  {
    id: "support-coverage",
    title: "Support coverage thin in EU-EAST",
    severity: "warn",
    detail:
      "Only one on-call engineer in EU-EAST during the planned 25% phase window.",
  },
  {
    id: "rollback-tested",
    title: "Rollback path tested in staging",
    severity: "ok",
    detail: "Last rollback drill passed in 4m12s on 2026-04-29.",
  },
];

const DEFAULT_ROLLBACK: string[] = [
  "Set checkout.express_pay = false via flag-cli",
  "Drain edge cache for /checkout (CloudFront purge)",
  "Page payments-team via #incidents-checkout",
  "Open postmortem doc in Confluence (template: 'rollout-failure')",
];

// ---------------------------------------------------------------------------
// Public factory: a complete rollout plan for a given feature
// ---------------------------------------------------------------------------

export function buildRolloutPlan(
  feature: string,
  audience: string,
  scheduledFor: Date = new Date(Date.now() + 24 * 3600 * 1000),
): RolloutPlan {
  return {
    feature,
    audience,
    scheduledFor: scheduledFor.toISOString(),
    phases: buildPhases(scheduledFor),
    flags: DEFAULT_FLAGS,
    risks: DEFAULT_RISKS,
    rollback: DEFAULT_ROLLBACK,
    runbookResourceUri: "doc://release-cockpit/runbook.md",
  };
}

// ---------------------------------------------------------------------------
// Simulated live metrics
//
// We pre-generate 60 minutes of metric history with a deliberate "payment
// spike" between minutes 32 and 41 so the demo always has something to find.
// ---------------------------------------------------------------------------

let cachedHistory: MetricsTimePoint[] | null = null;

export function getMetricsHistory(): MetricsTimePoint[] {
  if (cachedHistory) return cachedHistory;
  const rand = mulberry32(7);
  const now = Date.now();
  const points: MetricsTimePoint[] = [];

  for (let i = 60; i >= 0; i--) {
    const ts = new Date(now - i * 60_000);
    const minuteOfHour = ts.getMinutes();
    const inSpike = minuteOfHour >= 32 && minuteOfHour <= 41;

    points.push({
      takenAt: ts.toISOString(),
      errorRate: inSpike ? 18 + rand() * 6 : 1.5 + rand() * 2.5,
      latencyP95: inSpike ? 820 + rand() * 200 : 240 + rand() * 80,
      checkoutConversion: inSpike ? 0.41 + rand() * 0.05 : 0.62 + rand() * 0.04,
      supportTickets: inSpike
        ? Math.round(8 + rand() * 4)
        : Math.round(rand() * 3),
    });
  }
  cachedHistory = points;
  return points;
}

// ---------------------------------------------------------------------------
// Synthetic logs (with payment-timeout entries inside the spike window)
// ---------------------------------------------------------------------------

let cachedLogs: LogEntry[] | null = null;

export function getLogs(): LogEntry[] {
  if (cachedLogs) return cachedLogs;
  const rand = mulberry32(42);
  const services = [
    "checkout-api",
    "payments-gateway",
    "auth-service",
    "cart-service",
    "edge-cdn",
  ];
  const innocuous = [
    "request handled",
    "health check ok",
    "cache hit",
    "session refreshed",
    "feature flag evaluated",
  ];
  const warns = [
    "slow query detected",
    "retry triggered",
    "circuit breaker half-open",
  ];
  const errors = [
    "payment timeout: stripe-eu",
    "payment timeout: stripe-eu (idempotency replay)",
    "checkout 502 from upstream",
    "auth token expired during checkout",
  ];

  const out: LogEntry[] = [];
  const start = Date.now() - 60 * 60_000;
  for (let i = 0; i < 600; i++) {
    const ts = new Date(start + i * 6_000);
    const minute = ts.getMinutes();
    const inSpike = minute >= 32 && minute <= 41;
    const r = rand();
    let level: LogEntry["level"];
    let pool: string[];
    if (inSpike && r < 0.55) {
      level = "error";
      pool = errors;
    } else if (r < 0.1) {
      level = "warn";
      pool = warns;
    } else if (r < 0.18) {
      level = "error";
      pool = errors;
    } else {
      level = "info";
      pool = innocuous;
    }
    out.push({
      id: i,
      ts: ts.toISOString(),
      level,
      service: services[Math.floor(rand() * services.length)] ?? "unknown",
      message: pool[Math.floor(rand() * pool.length)] ?? "no message",
    });
  }
  cachedLogs = out;
  return out;
}

// ---------------------------------------------------------------------------
// Simulation: deterministically derive a "what-if" outcome from inputs.
// ---------------------------------------------------------------------------

export interface SimulateInput {
  /** Highest rollout percentage included in the simulation. */
  highestPercent: number;
  /** True if the user marked the payment-spike window as a risk. */
  includesPaymentSpike: boolean;
}

export function simulate(input: SimulateInput) {
  // Heavy/slow on purpose to make cancellation observable in the UI.
  const baseAbort = 0.4 + (input.highestPercent / 100) * 1.5; // 0.4..1.9 pp
  const spikeBonus = input.includesPaymentSpike ? 0.9 : 0;
  const checkoutAbortDeltaPp =
    Math.round((baseAbort + spikeBonus) * 100) / 100;

  const errorBudgetBurnPct = Math.min(
    100,
    Math.round(35 + input.highestPercent * 0.4 + spikeBonus * 12),
  );

  let recommendation: string;
  if (checkoutAbortDeltaPp > 2.0) {
    recommendation =
      "HOLD. Predicted checkout-abort delta exceeds 2pp. Reduce 25% phase to 10% in EU and re-run.";
  } else if (errorBudgetBurnPct > 80) {
    recommendation =
      "HOLD. Error budget would burn past 80%. Postpone to next week.";
  } else {
    recommendation =
      "PROCEED with caution. Keep the 25% phase shorter than 60 minutes and watch checkout-conversion.";
  }

  return { checkoutAbortDeltaPp, errorBudgetBurnPct, recommendation };
}

// ---------------------------------------------------------------------------
// Runbook resource (markdown). Demonstrates how an MCP App can read regular
// (non-UI) resources via app.readServerResource(...).
// ---------------------------------------------------------------------------

export const RUNBOOK_MARKDOWN = `# Checkout Rollout Runbook

## Pre-flight (T-30m)
- Verify on-call rotation (#oncall-checkout)
- Freeze unrelated deploys via deploy-bot
- Open release ticket and link this runbook

## Phase guards
| Phase | Auto-rollback trigger |
| ----- | --------------------- |
| 1%    | error rate > 5/min    |
| 5%    | p95 latency > 600ms   |
| 25%   | checkout conv. < 55%  |

## Rollback
1. Disable feature flag \`checkout.express_pay\`
2. Purge edge cache for \`/checkout\`
3. Page #incidents-checkout
4. Start postmortem doc

_Last updated by @payments-team on 2026-04-29._
`;
