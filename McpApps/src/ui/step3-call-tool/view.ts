/**
 * Step 3 View — calling server tools from the View.
 *
 * MCP-Apps concepts on display:
 *  • `app.callServerTool({ name, arguments })` lets the iframe trigger any
 *    tool the server exposes — including *app-only* tools the model can't
 *    see (`_meta.ui.visibility = ["app"]` on the server).
 *  • The result of a View-initiated call resolves the returned promise
 *    directly, NOT through `ontoolresult`. `ontoolresult` is reserved for
 *    tool calls the model initiated.
 *  • This is how MCP Apps stay interactive: refresh buttons, pagination,
 *    "expand row" actions never pollute the model's turn list or consume a
 *    conversational turn.
 */
import { App } from "@modelcontextprotocol/ext-apps";
import { z } from "zod";
import { requireElement } from "../shared/dom.js";
import "./style.css";

const QuoteSchema = z.object({
  quote: z.string(),
  author: z.string(),
});
type Quote = z.infer<typeof QuoteSchema>;

const quoteEl = requireElement("quote");
const authorEl = requireElement("author");
const refreshBtn = requireElement<HTMLButtonElement>("refresh");
const errorEl = requireElement("error");

function render(q: Quote) {
  quoteEl.textContent = `"${q.quote}"`;
  authorEl.textContent = `— ${q.author}`;
  errorEl.hidden = true;
}

function showError(message: string) {
  errorEl.textContent = message;
  errorEl.hidden = false;
}

function handleResult(structuredContent: unknown) {
  const parsed = QuoteSchema.safeParse(structuredContent);
  if (!parsed.success) {
    showError(`Unexpected structuredContent shape: ${parsed.error.message}`);
    return;
  }
  render(parsed.data);
}

const app = new App({ name: "Step 3 — Call tool", version: "1.0.0" });

// Initial result, model-initiated → comes through ontoolresult.
app.ontoolresult = (result) => {
  if (result.isError) {
    showError("The tool call failed — see the conversation for details.");
    return;
  }
  handleResult(result.structuredContent);
};

// View-initiated tool call → result comes back as a promise. The model never
// sees this call because the tool is registered with visibility: ["app"].
refreshBtn.addEventListener("click", async () => {
  refreshBtn.disabled = true;
  try {
    const result = await app.callServerTool({ name: "step3-next-quote", arguments: {} });
    if (result.isError) {
      showError("The app-only tool call failed.");
    } else {
      handleResult(result.structuredContent);
    }
  } catch (err) {
    // A host call can reject (transport error, host declines). Don't leave it
    // as an unhandled rejection — surface it and re-enable the button below.
    showError(`Host call failed: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    refreshBtn.disabled = false;
  }
});

app.connect().catch((err: unknown) => console.error("[step3] connect failed", err));
