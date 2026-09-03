/**
 * Step 7 View — the tool-call lifecycle, from partial input to result.
 *
 * MCP-Apps concepts on display:
 *  • `app.ontoolinputpartial` fires zero or more times *before* the tool
 *    actually runs, with the arguments as the model is still streaming them.
 *    Only hosts that stream tool-call arguments token-by-token (e.g. Claude)
 *    send this — most hosts skip straight to `ontoolinput`, so a View must
 *    treat the partial panel as optional, not guaranteed.
 *  • `app.ontoolinput` fires once, with the complete arguments, right before
 *    the tool executes server-side. This is the same moment the model
 *    "commits" to the call.
 *  • `app.ontoolresult` fires once the tool has actually run, carrying both
 *    `content` (for the model) and `structuredContent` (for us).
 *  • `app.readServerResource({ uri })` reads a plain MCP resource on demand
 *    — unlike the `ui://` view resource, a host never pushes this
 *    automatically; the View must ask for it explicitly.
 */
import { App } from "@modelcontextprotocol/ext-apps";
import { z } from "zod";
import { requireElement } from "../shared/dom.js";
import "./style.css";

const RecipeResultSchema = z.object({
  dish: z.string(),
  servings: z.number(),
  ingredients: z.array(
    z.object({
      name: z.string(),
      amount: z.number(),
      unit: z.string(),
    }),
  ),
});
type RecipeResult = z.infer<typeof RecipeResultSchema>;

const partialInputEl = requireElement("partial-input");
const inputEl = requireElement("input");
const resultEl = requireElement("result");
const notesBtn = requireElement<HTMLButtonElement>("notes-btn");
const notesEl = requireElement("notes");
const errorEl = requireElement("error");

function showError(message: string) {
  errorEl.textContent = message;
  errorEl.hidden = false;
}

// Built with DOM APIs rather than innerHTML: `dish`/ingredient names ride in
// on model-supplied tool arguments, so treat them as untrusted text even
// though this View only ever runs inside its own sandboxed iframe.
function renderResult(data: RecipeResult) {
  const summary = document.createElement("p");
  const dishEl = document.createElement("strong");
  dishEl.textContent = data.dish;
  summary.append(dishEl, ` — serves ${data.servings}`);

  const table = document.createElement("table");
  table.innerHTML = "<thead><tr><th>Ingredient</th><th>Amount</th><th>Unit</th></tr></thead>";
  const tbody = document.createElement("tbody");
  for (const ingredient of data.ingredients) {
    const row = document.createElement("tr");
    for (const value of [ingredient.name, String(ingredient.amount), ingredient.unit]) {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.append(cell);
    }
    tbody.append(row);
  }
  table.append(tbody);

  resultEl.replaceChildren(summary, table);
}

const app = new App({ name: "Step 7 — Tool input", version: "1.0.0" });

// Zero or more calls, streamed and possibly incomplete — just show the raw
// JSON as it arrives so the "streaming" behaviour is visible.
app.ontoolinputpartial = (params) => {
  partialInputEl.textContent = JSON.stringify(params.arguments ?? {}, null, 2);
};

// Exactly one call, with the complete arguments, right before the tool runs.
app.ontoolinput = (params) => {
  inputEl.textContent = JSON.stringify(params.arguments ?? {}, null, 2);
};

app.ontoolresult = (result) => {
  if (result.isError) {
    resultEl.replaceChildren();
    showError("The tool call failed — see the conversation for details.");
    return;
  }
  const parsed = RecipeResultSchema.safeParse(result.structuredContent);
  if (!parsed.success) {
    showError(`Unexpected structuredContent shape: ${parsed.error.message}`);
    return;
  }
  renderResult(parsed.data);
};

notesBtn.addEventListener("click", async () => {
  notesBtn.disabled = true;
  try {
    const result = await app.readServerResource({ uri: "docs://step7/cooking-notes.md" });
    const textContent = result.contents.find((c): c is typeof c & { text: string } => "text" in c);
    notesEl.textContent = textContent?.text ?? "(resource returned no text content)";
    notesEl.hidden = false;
  } catch (err) {
    showError(`Failed to read cooking notes: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    notesBtn.disabled = false;
  }
});

app.connect().catch((err: unknown) => console.error("[step7] connect failed", err));
