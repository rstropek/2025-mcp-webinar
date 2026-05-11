/**
 * Phase timeline — direct manipulation of rollout phases.
 *
 * Demonstrates the "user and model collaborate on the same data" pattern: the
 * AI fills the initial percentages via the open-release-cockpit tool, the user
 * tweaks them with sliders, and the changes flow back into shared state which
 * other components (Simulator, ChatActions) read for follow-up actions.
 */
import { getState, setState, subscribe } from "../state.js";

function getStageName(index: number): string {
  const names = ["Internal", "Canary", "Validation", "Ramp-up", "Scale", "Full rollout"];
  return names[index] ?? `Stage ${index + 1}`;
}

export function mountTimeline(root: HTMLElement): void {
  const render = () => {
    const plan = getState().plan;
    if (!plan || !Array.isArray(plan.phases)) {
      root.innerHTML = '<p class="status">Waiting for plan…</p>';
      return;
    }
    root.innerHTML = "";
    for (const [index, phase] of plan.phases.entries()) {
      const overrides = getState().phaseOverrides;
      const current = overrides[phase.id] ?? phase.percent;
      const stageName = getStageName(index);

      const el = document.createElement("div");
      el.className = "phase";
      el.innerHTML = `
        <header class="phase-header">
          <div class="phase-title-wrap">
            <strong>Phase ${index + 1} · ${stageName}</strong>
            <small>${new Date(phase.startsAt).toLocaleString()} · ${phase.durationMinutes} min</small>
          </div>
          <span class="phase-chip">Original target: ${phase.label}</span>
        </header>
        <div class="controls">
          <label class="phase-target-label">Target exposure</label>
          <input type="range" min="0" max="100" step="1" value="${current}" />
          <output>${current}%</output>
        </div>
      `;
      const range = el.querySelector('input[type="range"]') as HTMLInputElement;
      const output = el.querySelector("output") as HTMLOutputElement;
      range.addEventListener("input", () => {
        const value = Number(range.value);
        output.textContent = `${value}%`;
        // Defer state commit until "change" so we don't thrash subscribers.
      });
      range.addEventListener("change", () => {
        const value = Number(range.value);
        setState({
          phaseOverrides: { ...getState().phaseOverrides, [phase.id]: value },
        });
      });
      root.appendChild(el);
    }
  };

  subscribe(render);
}
