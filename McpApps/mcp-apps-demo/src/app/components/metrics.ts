/**
 * Live-metrics card.
 *
 * Calls `poll-metrics` (an APP-ONLY tool) on a 4-second timer. The model never
 * sees these polls or their results — exactly the use-case the MCP Apps spec
 * recommends `visibility: ["app"]` for. Without app-only tools, every poll
 * would fill the LLM context with metric points the user already sees.
 */
import type { App } from "@modelcontextprotocol/ext-apps";
import type { MetricsTimePoint } from "../../shared/types.js";
import { getState, setState, subscribe } from "../state.js";

const POLL_INTERVAL_MS = 4000;
const POLL_LIMIT = 60;

interface MetricsResult {
  points: MetricsTimePoint[];
}

function fmtNumber(value: number, digits = 1): string {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function renderSparkline(svg: SVGSVGElement, history: MetricsTimePoint[]): void {
  const w = 320;
  const h = 60;
  svg.innerHTML = "";
  if (history.length < 2) return;

  const errors = history.map((p) => p.errorRate);
  const max = Math.max(...errors, 1);
  const min = Math.min(...errors, 0);
  const points = errors
    .map((v, i) => {
      const x = (i / (errors.length - 1)) * w;
      const y = h - ((v - min) / Math.max(max - min, 0.01)) * (h - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const path = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
  path.setAttribute("points", points);
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "1.5");
  svg.appendChild(path);
}

export function mountMetrics(app: App): void {
  const errorEl = document.getElementById("m-error")!;
  const latencyEl = document.getElementById("m-latency")!;
  const convEl = document.getElementById("m-conv")!;
  const ticketsEl = document.getElementById("m-tickets")!;
  const sparkSvg = document.getElementById(
    "metrics-spark",
  ) as unknown as SVGSVGElement;

  subscribe(() => {
    const m = getState().latestMetrics;
    errorEl.textContent = m ? `${fmtNumber(m.errorRate)}/min` : "–";
    latencyEl.textContent = m ? `${Math.round(m.latencyP95)} ms` : "–";
    convEl.textContent = m ? `${(m.checkoutConversion * 100).toFixed(1)}%` : "–";
    ticketsEl.textContent = m ? String(m.supportTickets) : "–";
    renderSparkline(sparkSvg, getState().metricsHistory);
  });

  const tick = async (): Promise<void> => {
    try {
      const result = await app.callServerTool({
        name: "poll-metrics",
        arguments: { limit: POLL_LIMIT },
      });
      const data = result.structuredContent as MetricsResult | undefined;
      if (!data?.points?.length) return;
      const latest = data.points[data.points.length - 1] ?? null;
      setState({ latestMetrics: latest, metricsHistory: data.points });
    } catch (err) {
      // Polling can transiently fail; log only at debug level so the host's
      // warning channel stays quiet during normal operation.
      app.sendLog({
        level: "debug",
        logger: "release-cockpit",
        data: `poll-metrics failed: ${(err as Error).message}`,
      });
    }
  };

  void tick();
  setInterval(tick, POLL_INTERVAL_MS);
}
