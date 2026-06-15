/**
 * Step 5 View — live polling with lifecycle cleanup.
 *
 * MCP-Apps concepts on display:
 *  • The polling pattern: a setInterval that calls an *app-only* tool
 *    (visibility: ["app"]) on a cadence — the model never sees the storm
 *    of refresh calls.
 *  • `app.onteardown` is the host's signal that the iframe is about to be
 *    discarded. This is where you stop intervals, abort fetches, flush
 *    state — otherwise the timer keeps firing into a dead postMessage
 *    channel and the host logs leak.
 *  • A `beforeunload` listener mirrors `onteardown` for the plain unload path.
 */
import { App } from "@modelcontextprotocol/ext-apps";

type Stats = { cpu: number; memory: number; uptime: number; timestamp: string };

const cpuEl = document.getElementById("cpu")!;
const memEl = document.getElementById("memory")!;
const uptimeEl = document.getElementById("uptime")!;
const timestampEl = document.getElementById("timestamp")!;
const ticksEl = document.getElementById("ticks")!;

let ticks = 0;
let intervalId: number | undefined;

function stopPolling() {
  if (intervalId !== undefined) {
    window.clearInterval(intervalId);
    intervalId = undefined;
  }
}

function render(s: Stats) {
  cpuEl.textContent = `${s.cpu.toFixed(1)}%`;
  memEl.textContent = `${s.memory.toFixed(1)}%`;
  uptimeEl.textContent = `${s.uptime} s`;
  timestampEl.textContent = s.timestamp;
  ticksEl.textContent = String(++ticks);
}

const app = new App({ name: "Step 5 — Live polling", version: "1.0.0" });

// Cleanup contract: when the host tears the iframe down it sends
// `ui/resource-teardown` and waits (briefly) for this handler. Use the time
// to stop timers and flush state.
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
    const s = result.structuredContent as Stats | undefined;
    if (s) render(s);
  } catch (err) {
    console.error("[step5] poll failed (will retry on next tick)", err);
  }
};

app.connect().then(
  () => {
    // Start the timer regardless of the first tick's outcome (tick() never
    // rejects now, but this keeps the two concerns independent).
    void tick();
    intervalId = window.setInterval(tick, 2000);
  },
  (err: unknown) => console.error("[step5] connect failed", err),
);
