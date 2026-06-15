/**
 * Step 1 View — the *iframe* side of an MCP App.
 *
 * MCP-Apps concepts on display:
 *  • `new App(...).connect()` opens the postMessage channel to the host.
 *  • `app.ontoolresult` fires every time the bound tool returns. The host
 *    delivers BOTH `content` (for the model) and `structuredContent` (for us).
 *    A View should prefer `structuredContent` — it stays typed and avoids
 *    re-parsing the human-readable text the model sees.
 *  • Setting handlers BEFORE `connect()` guarantees we don't miss the very
 *    first tool result, which the host may push immediately after init.
 */
import { App } from "@modelcontextprotocol/ext-apps";

type Step1Result = { time: string; greeting: string };

const timeEl = document.getElementById("time")!;
const greetingEl = document.getElementById("greeting")!;

const app = new App({ name: "Step 1 — Hello", version: "1.0.0" });

app.ontoolresult = (result) => {
  // structuredContent is the typed payload meant for the UI; `content` is the
  // human-readable text the model will see in its context window.
  const data = result.structuredContent as Step1Result | undefined;
  if (!data) return;
  timeEl.textContent = data.time;
  greetingEl.textContent = data.greeting;
};

app.connect().catch((err: unknown) => console.error("[step1] connect failed", err));
