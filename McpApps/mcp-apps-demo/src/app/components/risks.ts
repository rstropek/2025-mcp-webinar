/**
 * Risk panel — selecting risks here:
 *  1. updates local state (used by Simulator + ChatActions),
 *  2. is reflected silently into the model via `app.updateModelContext()`
 *     so future LLM turns can reason about exactly the things the user cares
 *     about, without flooding the chat history with raw data.
 */
import type { App } from "@modelcontextprotocol/ext-apps";
import { buildSelectionMarkdown, getState, setState, subscribe } from "../state.js";

export function mountRisks(app: App): void {
  const list = document.getElementById("risks-list")!;

  // Debounce context updates: the user may toggle several risks in quick
  // succession; we only want to push the LATEST selection to the host.
  let pending: number | undefined;
  const pushContext = () => {
    window.clearTimeout(pending);
    pending = window.setTimeout(async () => {
      try {
        await app.updateModelContext({
          content: [{ type: "text", text: buildSelectionMarkdown() }],
        });
      } catch (err) {
        app.sendLog({
          level: "warning",
          logger: "release-cockpit",
          data: `updateModelContext failed: ${(err as Error).message}`,
        });
      }
    }, 250);
  };

  const render = () => {
    const plan = getState().plan;
    list.innerHTML = "";
    if (!plan || !Array.isArray(plan.risks)) return;
    const selected = new Set(getState().selectedRiskIds);

    for (const risk of plan.risks) {
      const li = document.createElement("li");
      li.className = `sev-${risk.severity}${selected.has(risk.id) ? " selected" : ""}`;
      li.innerHTML = `<strong>${risk.title}</strong><small>${risk.detail}</small>`;
      li.addEventListener("click", () => {
        const next = new Set(getState().selectedRiskIds);
        if (next.has(risk.id)) next.delete(risk.id);
        else next.add(risk.id);
        setState({ selectedRiskIds: [...next] });
        pushContext();
      });
      list.appendChild(li);
    }
  };

  subscribe(render);
}
