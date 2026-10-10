import { installWebMCP } from "@mcp-b/webmcp-polyfill";
import { buildPassword } from "./password";

// ---------------------------------------------------------------------------
// WebMCP setup
// ---------------------------------------------------------------------------

// Native WebMCP lives at `document.modelContext` (Chrome 149+ origin trial or
// chrome://flags/#enable-webmcp-testing). The polyfill installs the very same
// API in browsers that do not have it yet - and leaves a native implementation
// untouched. Note: WebMCP requires a secure context (https or localhost).
const hasNativeWebMcp = "modelContext" in document;
installWebMCP();

const modelContext = document.modelContext ?? fail("WebMCP is unavailable (insecure context or very old browser)");

const support = $("support");
support.textContent = hasNativeWebMcp ? "Native WebMCP ✔" : "WebMCP polyfill (no native support in this browser)";
support.classList.add(hasNativeWebMcp ? "native" : "polyfill");

// ---------------------------------------------------------------------------
// Page state + UI for humans
// ---------------------------------------------------------------------------

type VaultEntry = { label: string; password: string };

function loadVault(): VaultEntry[] {
  try {
    return JSON.parse(localStorage.getItem("pony-vault") ?? "[]") as VaultEntry[];
  } catch {
    return [];
  }
}

let vault = loadVault();

function setVault(entries: VaultEntry[]) {
  vault = entries;
  try {
    localStorage.setItem("pony-vault", JSON.stringify(vault));
  } catch {
    // Storage blocked (e.g. private mode) - keep the vault in memory only
  }
  $("vault").replaceChildren(
    ...(vault.length
      ? vault.map((e) => li(`${e.label}: `, e.password))
      : [li("Vault is empty. Generate a password and save it.")]),
  );
}

function li(text: string, code?: string) {
  const item = document.createElement("li");
  item.textContent = text;
  if (code) {
    const c = document.createElement("code");
    c.textContent = code;
    item.append(c);
  }
  return item;
}

function log(message: string) {
  $("log").prepend(li(`${new Date().toLocaleTimeString()} - ${message}`));
}

function showGenerated(password: string) {
  $("generated").textContent = password;
  ($("save-form").querySelector("[name=password]") as HTMLInputElement).value = password;
}

setVault(vault);

$("generate").addEventListener("click", () => {
  const minLength = Number(($("min-length") as HTMLInputElement).value) || 16;
  const special = ($("special") as HTMLInputElement).checked;
  showGenerated(buildPassword({ minLength, special }));
  log("👤 User generated a password");
});

$("clear").addEventListener("click", () => {
  setVault([]);
  log("👤 User cleared the vault");
});

// ---------------------------------------------------------------------------
// Imperative WebMCP tools
// ---------------------------------------------------------------------------
//
// Unlike an MCP server, there is no separate process and no transport: the
// tools are JavaScript functions inside the page. They run with the user's
// session and can update the UI the user is looking at.

await modelContext.registerTool({
  name: "pony_password",
  title: "Generate a pony password",
  description: "Builds a password from My Little Pony character names and shows it on the page.",
  inputSchema: {
    type: "object",
    properties: {
      minLength: { type: "integer", minimum: 1, maximum: 64, description: "Minimum length of the password (default 16)" },
      special: { type: "boolean", description: "Replace o/i/e/s with 0/!/€/$ (default false)" },
    },
  },
  annotations: { readOnlyHint: true },
  execute: ({ minLength = 16, special = false }) => {
    const password = buildPassword({ minLength, special });
    showGenerated(password);
    log(`🤖 Agent called pony_password(minLength=${minLength}, special=${special})`);
    // Any JSON-serializable value can be returned; the browser hands it to the agent as JSON.
    return { password };
  },
});

await modelContext.registerTool({
  name: "list_vault_entries",
  title: "List vault entries",
  description: "Lists the labels of all passwords stored in the user's vault. Passwords themselves are never returned.",
  annotations: { readOnlyHint: true },
  execute: () => {
    log("🤖 Agent called list_vault_entries");
    // Deliberately only labels: the page decides what an agent may see.
    return { labels: vault.map((e) => e.label) };
  },
});

await modelContext.registerTool({
  name: "clear_vault",
  title: "Clear the vault",
  description: "Deletes all passwords from the user's vault. Asks the user for confirmation first.",
  // consequentialHint tells the agent host this action is irreversible.
  annotations: { consequentialHint: true },
  execute: () => {
    log("🤖 Agent called clear_vault");
    // Human in the loop: the page itself can ask the user before doing something destructive.
    if (!confirm(`An AI agent wants to delete ${vault.length} vault entries. Allow?`)) {
      log("👤 User declined clear_vault");
      throw new Error("The user declined to clear the vault.");
    }
    setVault([]);
    return { cleared: true };
  },
});

// ---------------------------------------------------------------------------
// Declarative WebMCP tool (see <form toolname="save_password"> in index.html)
// ---------------------------------------------------------------------------

const saveForm = $("save-form") as HTMLFormElement;

saveForm.addEventListener("submit", (e: SubmitEvent) => {
  e.preventDefault();
  const data = new FormData(saveForm);
  const entry = { label: String(data.get("label")), password: String(data.get("password")) };
  setVault([...vault, entry]);
  saveForm.reset();

  if (e.agentInvoked) {
    // The submit was triggered by an agent's tool call: send the tool result back.
    log(`🤖 Agent saved "${entry.label}" (submitted via save_password)`);
    e.respondWith?.(Promise.resolve({ saved: entry.label }));
  } else {
    log(`👤 User saved "${entry.label}"`);
  }
});

modelContext.addEventListener("toolactivated", (e) =>
  log(`🤖 Agent filled the form for ${e.toolName} - waiting for you to click Save`),
);
modelContext.addEventListener("toolcancel", (e) => log(`⛔ Tool call ${e.toolName} was canceled`));

// ---------------------------------------------------------------------------
// Agent simulator: plays the role of the browser's agent
// ---------------------------------------------------------------------------

const select = $("tool-select") as HTMLSelectElement;
let tools: WebMCP.RegisteredTool[] = [];

async function refreshTools() {
  tools = await modelContext.getTools();
  select.replaceChildren(...tools.map((t) => new Option(t.name, t.name)));
  showToolDetails();
}

function showToolDetails() {
  const tool = tools.find((t) => t.name === select.value);
  $("tool-description").textContent = tool ? `${tool.description}\nSchema: ${JSON.stringify(tool.inputSchema ?? {})}` : "";
}

select.addEventListener("change", showToolDetails);
modelContext.addEventListener("toolchange", refreshTools);

$("run-tool").addEventListener("click", async () => {
  const tool = tools.find((t) => t.name === select.value);
  const result = $("tool-result");
  if (!tool) return;
  try {
    const args = JSON.parse(($("tool-args") as HTMLTextAreaElement).value || "{}");
    result.textContent = `Calling ${tool.name}…`;
    // executeTool resolves with the JSON-serialized tool result
    result.textContent = await modelContext.executeTool(tool, args);
  } catch (err) {
    result.textContent = `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
});

await refreshTools();

function fail(message: string): never {
  throw new Error(message);
}

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el;
}
