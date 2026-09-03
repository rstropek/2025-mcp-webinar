/**
 * Step 1 View — the *iframe* side of an MCP App.
 *
 * MCP-Apps concepts on display:
 *  • `new App({ name, version }).connect()` opens the postMessage channel to
 *    the host. Nothing reaches this View before `connect()` resolves.
 *  • `app.ontoolresult` fires every time the *model-initiated* bound tool
 *    call returns. The host delivers BOTH `content` (the human-readable text
 *    the model sees) and `structuredContent` (the typed payload meant for
 *    us) in the same notification.
 *  • Handlers are attached BEFORE `await app.connect()` — the host may push
 *    the first `ontoolresult` immediately once the channel opens, and a
 *    handler registered after `connect()` resolves could miss it.
 *  • `structuredContent` is `unknown` on the wire. This step validates it
 *    with a local zod schema instead of blindly casting, and shows a
 *    readable error instead of silently rendering `undefined`.
 */
import { App } from "@modelcontextprotocol/ext-apps";
import { z } from "zod";
import { requireElement } from "../shared/dom.js";
import "./style.css";

const Step1ResultSchema = z.object({
  time: z.string(),
  greeting: z.string(),
});

const timeEl = requireElement("time");
const greetingEl = requireElement("greeting");
const errorEl = requireElement("error");

function showError(message: string) {
  errorEl.textContent = message;
  errorEl.hidden = false;
}

const app = new App({ name: "Step 1 — Hello", version: "1.0.0" });

app.ontoolresult = (result) => {
  if (result.isError) {
    showError("The tool call failed — see the conversation for details.");
    return;
  }

  const parsed = Step1ResultSchema.safeParse(result.structuredContent);
  if (!parsed.success) {
    showError(`Unexpected structuredContent shape: ${parsed.error.message}`);
    return;
  }

  timeEl.textContent = parsed.data.time;
  greetingEl.textContent = parsed.data.greeting;
};

app.connect().catch((err: unknown) => console.error("[step1] connect failed", err));
