/**
 * Step 5 View — live polling with lifecycle cleanup.
 *
 * MCP-Apps concepts on display:
 *  • The polling pattern: a `setInterval` calls an *app-only* tool
 *    (`_meta.ui.visibility = ["app"]`) on a cadence — the model never sees
 *    the storm of refresh calls or the tokens they'd otherwise cost.
 *  • `app.onteardown` is the host's signal that the iframe is about to be
 *    discarded. This is where timers get stopped, fetches aborted, state
 *    flushed — otherwise the timer keeps firing into a dead postMessage
 *    channel and the host's console fills with warnings.
 *  • A `beforeunload` listener mirrors `onteardown` for the plain unload
 *    path (host reload, navigation), since not every host is guaranteed to
 *    always send `ui/resource-teardown` before the frame disappears.
 */
import { App } from "@modelcontextprotocol/ext-apps";
import { z } from "zod";
import { requireElement } from "../shared/dom.js";
import "./style.css";

const StatsSchema = z.object({
  cpu: z.number(),
  memory: z.number(),
  uptime: z.number(),
  timestamp: z.string(),
});
type Stats = z.infer<typeof StatsSchema>;

const cpuEl = requireElement("cpu");
const memEl = requireElement("memory");
const uptimeEl = requireElement("uptime");
const timestampEl = requireElement("timestamp");
const ticksEl = requireElement("ticks");
const errorEl = requireElement("error");

let ticks = 0;
let intervalId: number | undefined;

function stopPolling() {
  if (intervalId !== undefined) {
    window.clearInterval(intervalId);
    intervalId = undefined;
  }
}

function showError(message: string) {
  errorEl.textContent = message;
  errorEl.hidden = false;
}

function render(s: Stats) {
  cpuEl.textContent = `${s.cpu.toFixed(1)}%`;
  memEl.textContent = `${s.memory.toFixed(1)}%`;
  uptimeEl.textContent = `${s.uptime} s`;
  timestampEl.textContent = s.timestamp;
  ticksEl.textContent = String(++ticks);
  errorEl.hidden = true;
}

const app = new App({ name: "Step 5 — Live polling", version: "1.0.0" });

// Cleanup contract: when the host tears the iframe down it sends
// `ui/resource-teardown` and waits (briefly) for this handler to resolve.
// Use the time to stop timers and flush state.
app.onteardown = async () => {
  console.info("[step5] teardown requested by host");
  stopPolling();
  return {};
};

// Belt-and-braces: stop the timer on the plain unload path too.
window.addEventListener("beforeunload", stopPolling);

const tick = async () => {
  // Call the app-only tool. The model is unaware of this stream of calls.
  // Swallow per-poll errors so one transient failure doesn't become an
  // unhandled-rejection storm — the interval keeps polling and recovers.
  try {
    const result = await app.callServerTool({ name: "step5-stats", arguments: {} });
    if (result.isError) {
      showError("Poll failed — the app-only tool returned an error.");
      return;
    }
    const parsed = StatsSchema.safeParse(result.structuredContent);
    if (!parsed.success) {
      showError(`Unexpected structuredContent shape: ${parsed.error.message}`);
      return;
    }
    render(parsed.data);
  } catch (err) {
    console.error("[step5] poll failed (will retry on next tick)", err);
    showError(`Poll failed (will retry): ${err instanceof Error ? err.message : String(err)}`);
  }
};

app.connect().then(
  () => {
    // Start the timer regardless of the first tick's outcome (tick() never
    // rejects, but this keeps the two concerns independent).
    void tick();
    intervalId = window.setInterval(tick, 2000);
  },
  (err: unknown) => console.error("[step5] connect failed", err),
);
