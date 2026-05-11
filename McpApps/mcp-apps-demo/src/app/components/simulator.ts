/**
 * Simulator card.
 *
 * Calls the app-only `simulate-rollout` tool, but ALSO demonstrates host-side
 * cancellation. We pass an AbortSignal through `callServerTool`'s options so
 * clicking "Cancel" actually tells the host (and through it the server) to
 * abort the request — and the server's tool handler cooperates with the
 * AbortSignal to stop the simulated work.
 */
import type { App } from "@modelcontextprotocol/ext-apps";
import type { SimulationResult } from "../../shared/types.js";
import { getState, setState } from "../state.js";

export function mountSimulator(app: App): void {
  const percentSelect = document.getElementById(
    "sim-percent",
  ) as HTMLSelectElement;
  const includeSpike = document.getElementById(
    "sim-include-spike",
  ) as HTMLInputElement;
  const runBtn = document.getElementById("sim-run") as HTMLButtonElement;
  const cancelBtn = document.getElementById("sim-cancel") as HTMLButtonElement;
  const status = document.getElementById("sim-status")!;
  const output = document.getElementById("sim-output")!;

  let controller: AbortController | null = null;

  runBtn.addEventListener("click", async () => {
    if (controller) controller.abort();
    controller = new AbortController();
    setState({ simulationInFlight: true });
    runBtn.disabled = true;
    cancelBtn.disabled = false;
    status.textContent = "running…";
    output.textContent = "";

    try {
      const result = await app.callServerTool(
        {
          name: "simulate-rollout",
          arguments: {
            highestPercent: Number(percentSelect.value),
            includesPaymentSpike: includeSpike.checked,
          },
        },
        { signal: controller.signal },
      );
      if (result.isError) {
        status.textContent = "error";
        output.textContent = JSON.stringify(result.content, null, 2);
        return;
      }
      const sim = result.structuredContent as SimulationResult | undefined;
      if (!sim) return;
      status.textContent = `done in ${sim.durationMs}ms`;
      output.textContent = [
        `Scenario      : ${sim.scenarioId}`,
        `Checkout abort: +${sim.checkoutAbortDeltaPp} pp`,
        `Error budget  : ${sim.errorBudgetBurnPct}%`,
        `Recommendation: ${sim.recommendation}`,
      ].join("\n");
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        status.textContent = "cancelled";
      } else {
        status.textContent = "error";
        output.textContent = `Error: ${(err as Error).message}`;
      }
    } finally {
      controller = null;
      runBtn.disabled = false;
      cancelBtn.disabled = true;
      setState({ simulationInFlight: false });
    }
  });

  cancelBtn.addEventListener("click", () => {
    controller?.abort();
  });

  // Auto-cancel an in-flight simulation if the host cancels the parent tool
  // call. This is the lifecycle's `tool-cancelled` integration.
  app.ontoolcancelled = (params) => {
    if (controller) {
      controller.abort();
      status.textContent = `cancelled by host (${params.reason})`;
    }
  };

  // Persist the user's selection on the server when they kick off a sim.
  // This shows that an MCP App can keep its own server-side state (cf.
  // app-only `save-scenario`).
  runBtn.addEventListener("click", () => {
    void app.callServerTool({
      name: "save-scenario",
      arguments: {
        riskyPhaseIds: Object.entries(getState().phaseOverrides).map(([id]) => id),
        filter: getState().logFilter.filter,
        note: `Simulated ${percentSelect.value}% (spike=${includeSpike.checked})`,
      },
    });
  });
}
