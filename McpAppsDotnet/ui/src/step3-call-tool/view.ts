/**
 * Step 3 View — calling server tools from the View.
 *
 * MCP-Apps concepts on display:
 *  • `app.callServerTool({ name, arguments })` lets the iframe trigger any
 *    tool the server exposes — including app-only tools the model can't see.
 *  • The result returns to the *caller* (the View), NOT through `ontoolresult`.
 *    `ontoolresult` is reserved for tool calls the model initiated.
 *  • This is how MCP Apps stay interactive: refresh buttons, pagination,
 *    "expand row" actions never pollute the model's turn list.
 */
import { App } from "@modelcontextprotocol/ext-apps";

type Quote = { quote: string; author: string };

const quoteEl = document.getElementById("quote")!;
const authorEl = document.getElementById("author")!;
const refreshBtn = document.getElementById("refresh") as HTMLButtonElement;

function render(q: Quote) {
  quoteEl.textContent = `"${q.quote}"`;
  authorEl.textContent = `— ${q.author}`;
}

const app = new App({ name: "Step 3 — Call tool", version: "1.0.0" });

// Initial result, model-initiated → comes through ontoolresult.
app.ontoolresult = (result) => {
  const q = result.structuredContent as Quote | undefined;
  if (q) render(q);
};

// View-initiated tool call → result comes back as a promise. The model never
// sees this call because the tool is registered with visibility: ["app"].
refreshBtn.addEventListener("click", async () => {
  refreshBtn.disabled = true;
  try {
    const result = await app.callServerTool({ name: "step3-next-quote", arguments: {} });
    const q = result.structuredContent as Quote | undefined;
    if (q) render(q);
  } catch (err) {
    // A host call can reject (transport error, host declines). Don't leave it
    // as an unhandled rejection — log it; the button is re-enabled below.
    console.error("[step3] next-quote call failed", err);
  } finally {
    refreshBtn.disabled = false;
  }
});

app.connect().catch((err: unknown) => console.error("[step3] connect failed", err));
