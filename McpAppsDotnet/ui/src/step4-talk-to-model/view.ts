/**
 * Step 4 View — talking *back* to the model.
 *
 * MCP-Apps concepts on display:
 *  • `app.sendMessage(...)` injects a new user message into the conversation
 *    and triggers a model response — like the user typed it themselves.
 *  • `app.updateModelContext(...)` quietly appends to the model's context
 *    *without* triggering a turn. The model sees it on the *next* turn.
 *    Use this for state ("user changed the budget to 1200"), not requests.
 *  • `app.openLink(...)` asks the host to open a URL externally — the View
 *    must not call `window.open` itself (sandboxed).
 *
 * The reference demo wrote this step in React via `useApp`; here it is the
 * plain `App` instance: attach handlers, `await connect()`, wire the DOM.
 */
import { App } from "@modelcontextprotocol/ext-apps";

const noteEl = document.getElementById("note") as HTMLTextAreaElement;
const messageEl = document.getElementById("message") as HTMLTextAreaElement;
const linkEl = document.getElementById("link") as HTMLInputElement;
const statusEl = document.getElementById("status")!;
const pinBtn = document.getElementById("pin") as HTMLButtonElement;
const sendBtn = document.getElementById("send") as HTMLButtonElement;
const openBtn = document.getElementById("open") as HTMLButtonElement;

const buttons = [pinBtn, sendBtn, openBtn];
const setStatus = (text: string) => (statusEl.textContent = text);
const setEnabled = (enabled: boolean) => buttons.forEach((b) => (b.disabled = !enabled));

const app = new App({ name: "Step 4 — Talk to model", version: "1.0.0" });

// Each host call can fail two ways: it can resolve with `{ isError: true }`
// (the host handled it but declined), or the promise can reject outright
// (transport/host error). Handle both so the status line always reflects reality
// and nothing leaks as an unhandled rejection.
const reportError = (err: unknown) =>
  setStatus(`Host call failed: ${err instanceof Error ? err.message : String(err)}`);

// updateModelContext: silent, no immediate turn — the model sees this text
// attached to its next prompt.
pinBtn.addEventListener("click", async () => {
  try {
    await app.updateModelContext({ content: [{ type: "text", text: noteEl.value }] });
    setStatus("Pinned to model context (no turn triggered).");
  } catch (err) {
    reportError(err);
  }
});

// sendMessage: behaves like the user typed in the chat box — the model
// will produce a response immediately.
sendBtn.addEventListener("click", async () => {
  try {
    const { isError } = await app.sendMessage({
      role: "user",
      content: [{ type: "text", text: messageEl.value }],
    });
    setStatus(isError ? "Host rejected the message." : "Sent — model is responding.");
  } catch (err) {
    reportError(err);
  }
});

// openLink: navigation belongs to the host. The sandboxed iframe cannot
// open a top-level window itself.
openBtn.addEventListener("click", async () => {
  try {
    const { isError } = await app.openLink({ url: linkEl.value });
    setStatus(isError ? "Host rejected the link." : `Asked host to open ${linkEl.value}.`);
  } catch (err) {
    reportError(err);
  }
});

setEnabled(false);
setStatus("Connecting to host…");
app.connect().then(
  () => {
    setEnabled(true);
    setStatus("");
  },
  (err: unknown) => setStatus(`Error: ${err instanceof Error ? err.message : String(err)}`),
);
