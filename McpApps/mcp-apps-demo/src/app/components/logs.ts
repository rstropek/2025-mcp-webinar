/**
 * Logs panel — paginated reader that calls `get-log-chunk` (app-only).
 *
 * Slim version for the Monitor screen: just a filter, a level dropdown, and
 * an auto-refreshing list. No manual "load more" — the list always shows the
 * latest 50 matches and is refreshed every time the filter or level changes.
 */
import type { App } from "@modelcontextprotocol/ext-apps";
import type { LogEntry } from "../../shared/types.js";
import { getState, setState, subscribe } from "../state.js";

interface LogResult {
  entries: LogEntry[];
  totalMatches: number;
  nextOffset: number;
}

export function mountLogs(app: App): void {
  const filterInput = document.getElementById("log-filter") as HTMLInputElement | null;
  const levelSelect = document.getElementById("log-level") as HTMLSelectElement | null;
  const list = document.getElementById("logs-list") as HTMLUListElement | null;

  if (!filterInput || !levelSelect || !list) return; // tolerate missing nodes

  const fetchPage = async () => {
    const filter = filterInput.value.trim() || undefined;
    const level = (levelSelect.value || undefined) as
      | "info"
      | "warn"
      | "error"
      | undefined;

    const args: Record<string, unknown> = { offset: 0, limit: 50 };
    if (filter) args.filter = filter;
    if (level) args.levels = [level];

    try {
      const result = await app.callServerTool({
        name: "get-log-chunk",
        arguments: args,
      });
      const data = result.structuredContent as LogResult | undefined;
      if (!data) return;
      setState({
        logs: data.entries,
        logFilter: { filter, level },
        logsOffset: data.nextOffset,
        logsTotal: data.totalMatches,
        selection: {
          ...getState().selection,
          filter,
        },
      });
    } catch {
      // ignore - this only runs in the monitor screen which is best-effort
    }
  };

  subscribe(() => {
    const { logs } = getState();
    list.innerHTML = "";
    for (const entry of logs.slice(-50)) {
      const li = document.createElement("li");
      li.innerHTML = `
        <span>${new Date(entry.ts).toLocaleTimeString()}</span>
        <span class="lvl ${entry.level}">${entry.level}</span>
        <span title="${entry.message}">[${entry.service}] ${entry.message}</span>
      `;
      list.appendChild(li);
    }
  });

  let typing: number | undefined;
  filterInput.addEventListener("input", () => {
    window.clearTimeout(typing);
    typing = window.setTimeout(() => void fetchPage(), 250);
  });
  levelSelect.addEventListener("change", () => void fetchPage());

  void fetchPage();
}
