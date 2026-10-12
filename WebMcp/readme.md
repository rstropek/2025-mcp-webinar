# WebMCP — Pony Password Vault

A web page that offers **tools to AI agents running in the browser**, using the [WebMCP](https://webmachinelearning.github.io/webmcp/) API (`document.modelContext`). It reuses the pony-password generator from [`../day2`](../day2/readme.md), so you can compare the same tool as an MCP server (day 2/3) and as a WebMCP tool (here).

## What is WebMCP?

WebMCP is a proposed web standard from the W3C **Web Machine Learning Community Group** (editors from Microsoft and Google). A page registers tools in JavaScript, and an agent built into the browser (or a browser extension) can discover and call them while the user is looking at the page.

| | MCP server (day 2–4) | WebMCP (this sample) |
|---|---|---|
| Where tools run | Separate process (stdio) or HTTP service | JavaScript inside the open web page |
| Host / client | Claude, VS Code, MCP Inspector … | The browser's agent (or an extension) |
| Transport | JSON-RPC over stdio / Streamable HTTP | None, the browser calls the function directly |
| Auth | OAuth 2.1 (day 4) | The user's existing session in the page |
| UI | None (or MCP Apps in an iframe) | The tools update the page the user sees |
| Human in the loop | Up to the host | Built in: the user watches the page, declarative forms wait for the user |
| Discovery | Configured in the host | Only while the page is open in a tab |

WebMCP borrows MCP's tool concept (name, description, JSON Schema input, annotations) but is **not** the MCP protocol. Resources and prompts don't exist in WebMCP.

### Status (October 2026)

- The spec is a **Draft Community Group Report**. It is not on the W3C standards track and is still changing.
- **Chrome**: origin trial from Chrome 149, reported to run through Chrome 156. For local development, use `chrome://flags/#enable-webmcp-testing`. See [Chrome for Developers: WebMCP](https://developer.chrome.com/docs/ai/webmcp).
- **Chrome 154 lags the spec** in two places that matter for this sample: it fires `toolactivated` / `toolcancel` on `window` instead of `document.modelContext`, and `executeTool()` expects the input as a JSON string instead of an object. [`src/main.ts`](src/main.ts) handles both. Also, calling `reset()` on a declarative form cancels the agent's tool call even after `respondWith()`, so the sample clears the fields by hand.
- **API location**: the API is `document.modelContext`. Older drafts and articles use `navigator.modelContext` and `provideContext()`; those are outdated.
- WebMCP requires a **secure context** (`https://` or `localhost`) and is controlled by the `tools` Permissions Policy. It is blocked in cross-origin iframes unless the iframe has `allow="tools"`.
- **Other browsers**: no official announcements yet. Microsoft co-edits the spec, but there is no Edge documentation for WebMCP (only third-party reports of a flag). Firefox and Safari haven't announced implementations.

## What the sample shows

Four tools, each teaching one WebMCP concept:

| Tool | Kind | Annotation | Teaches |
|------|------|------------|---------|
| `pony_password` | imperative ([`src/main.ts`](src/main.ts)) | `readOnlyHint` | **Registering a tool.** `document.modelContext.registerTool({ name, description, inputSchema, execute })`. The tool generates a password and **shows it on the page**. |
| `list_vault_entries` | imperative | `readOnlyHint` | **The page decides what an agent sees.** Returns only the *labels* of saved passwords, never the passwords themselves. |
| `clear_vault` | imperative | `consequentialHint` | **Human in the loop for irreversible actions.** The annotation tells the agent host to ask first, and the page itself asks again with `confirm()`. |
| `save_password` | declarative ([`index.html`](index.html)) | – | **Forms as tools.** A plain `<form toolname="…" tooldescription="…">`; the browser derives the input schema from the named controls and their `toolparamdescription`. Without `toolautosubmit` the agent can only *fill* the form, and the call completes when the **user** clicks *Save* (`event.agentInvoked`, `event.respondWith(...)`). |

Two more pieces make the sample usable today:

- **Agent simulator.** Real agents live in the browser, and most browsers don't ship one yet. The purple panel plays the agent's role. It uses `document.modelContext.getTools()` and `executeTool()`, which the spec defines for exactly that purpose.
- **Polyfill.** [`@mcp-b/webmcp-polyfill`](https://www.npmjs.com/package/@mcp-b/webmcp-polyfill) installs the standard API (including declarative forms) when the browser has no native implementation. It leaves a native implementation untouched. The badge at the top shows which one is active. Two differences to native Chrome: the polyfill does not provide the `:tool-form-active` / `:tool-submit-active` pseudo-classes, and it fires `toolactivated` only for declarative forms, while Chrome fires it for every tool call.

## Project layout

```
WebMcp/
├── package.json        # single npm project (Vite, TypeScript, Biome)
├── index.html          # page markup, incl. the declarative <form toolname="save_password">
├── src/
│   ├── main.ts         # polyfill install, imperative tools, form handler, agent simulator
│   ├── password.ts     # browser port of the pony-password logic from ../day2/src/lib
│   └── style.css       # incl. the :tool-form-active / :tool-submit-active pseudo-classes
└── dist/               # build output (gitignored)
```

`webmcp-types` is listed as an explicit dev dependency on purpose: the polyfill pins an older version without typings for the `toolactivated` / `toolcancel` events.

`npm run build` prints two `lightningcss` warnings saying that `tool-form-active` and `tool-submit-active` are not valid pseudo-classes. The minifier doesn't know them yet; the rules are kept in the output and work in Chrome.

## Install, build, run

Prerequisites: Node.js 22+ and npm. No server and no API key are needed; everything runs in the browser.

```bash
npm install
npm run dev          # Vite dev server, http://localhost:5173
```

```bash
npm run build        # typecheck + production build into dist/
npm run preview      # serve the production build
npm run typecheck    # tsc only
```

WebMCP needs a secure context, so open the page via `http://localhost`, not via the LAN IP address.

Things to try in the agent simulator:

- `pony_password` with `{"minLength": 24, "special": true}`: the password appears in the page and in the activity log.
- `save_password` with `{"label": "Netflix", "password": "RarityDashSpike"}`: the form gets filled and the call waits. Click **Save**, and the simulator receives `{"saved":"Netflix"}`.
- `pony_password` with `{"minLength": 1000000000}`: the browser does **not** validate tool input against `inputSchema`, so the page clamps the value to 64 itself.
- `list_vault_entries`, then `clear_vault`. The page asks you for confirmation, and if you decline, the tool returns `{"cleared":false,"reason":"…"}`. It deliberately does not throw: the browser replaces error messages with a generic *Tool execution failed*, so the agent would never learn that the user said no.

## Try it with a real browser agent (Chrome)

The agent simulator only shows the mechanics. To let a real LLM drive the tools, use Google's **Example Agentic Chrome Extension** ([GoogleChromeLabs/webmcp-extension](https://github.com/GoogleChromeLabs/webmcp-extension)). It works with OpenAI, Gemini, Anthropic or a local Ollama model. (The alternative, the *Model Context Tool Inspector* from the Chrome Web Store, only supports Gemini.)

### Who talks to whom

```
Chrome tab: this page (localhost:5173)        <- provides the tools (document.modelContext)
      ^
      | list and call tools
Extension side panel in Chrome                <- the agent's chat window
      |
      v  your chat messages
Extension's helper server (localhost:3100)    <- holds your API key
      |
      v
OpenAI (or another provider)
```

The helper server is part of the extension repo, not of this sample. It exists so that the API key does not have to be bundled into the extension.

### Step by step

The commands work in PowerShell as well as in a macOS/Linux shell. All paths are relative to the root of this repository.

**1. Prepare Chrome**

- Check `chrome://version`: you need **Chrome 150 or newer**.
- Set `chrome://flags/#enable-webmcp-testing` to **Enabled** and restart Chrome.

**2. Get the extension.** Clone it next to this repo, not inside it. From the root of this repository:

```bash
cd ..
git clone https://github.com/GoogleChromeLabs/webmcp-extension.git
cd webmcp-extension
cp .env.example .env
```

**3. Edit `webmcp-extension/.env`.** Change only these three lines:

```
OPENAI_API_KEY=sk-...your-key...
MODEL=openai:gpt-5-mini
PORT=3100
```

- Every setting must have the form `NAME=value`. A line that only says `openai:gpt-5-mini` is ignored, and the server silently falls back to its default model (`gpt-4o` for OpenAI).
- Remove the `#` in front of `PORT`, otherwise the line is a comment and the server stays on port **3000**. Port 3000 collides with the day 3 and day 4 servers of this repo, which is why this guide uses 3100.
- Comments must be on their own line. Don't put a comment after a value.
- `MODEL` is written as `provider:model`. The provider prefix (`openai:`) is required.

**4. Install and start the helper server** (terminal 1, keep it running). The extension needs **Node.js 22.18 or newer**, because it runs `.ts` files directly:

```bash
npm install
npm run server
```

Check the first lines of the output. They must say `Answering with openai:gpt-5-mini` and `listening on http://127.0.0.1:3100`. If they don't, the `.env` lines from step 3 are not being read.
On first start the server generates a `WEBMCP_AUTH_TOKEN` and appends it to `.env`. The extension uses this token to authenticate to its server.

**5. Build the extension** (terminal 2, also in the `webmcp-extension` folder):

```bash
npm run build
```

The extension is written to `dist/`. The build bakes `PORT` and `WEBMCP_AUTH_TOKEN` into the extension. **Whenever you change `.env`, restart the server, run `npm run build` again, and reload the extension** in `chrome://extensions`.

**6. Load the extension in Chrome**

- Open `chrome://extensions` and switch on **Developer mode** (top right).
- Click **Load unpacked** and select the `dist` folder inside `webmcp-extension`.

**7. Start this sample** (terminal 3, from the root of this repository):

```bash
cd WebMcp
npm run dev
```

- Open `http://localhost:5173` in Chrome. The badge must say **Native WebMCP ✔**. If it says *polyfill*, the flag from step 1 is not active.
- Open the extension's **side panel** from the toolbar icon, and click **Got it** the first time.
- Try: *"Generate a 20-character pony password with special characters and save it as Netflix."* The password appears on the page and the form gets filled in. `save_password` has no `readOnlyHint`, so the extension asks first (**Allow** / **Don't allow**, while *Sensitive action alerts* is on). Then you confirm with **Save**.
- Try: *"Clear my vault."* `clear_vault` is annotated `consequentialHint: true`, so the extension shows a *This action may be irreversible* card (**Cancel** / **Allow**), and then the page itself asks again.

So during the demo **three things run at the same time**: the helper server (terminal 1), this page (terminal 3), and Chrome with the extension. Terminal 2 is only needed for building.

**Without an API key:** in the side panel, **Settings → Model → On-device model** uses Chrome's built-in model. This also needs `chrome://flags/#prompt-api-tool-use`, and the on-device model is noticeably weaker at tool calling.

## Formatting and linting

```bash
npm run check     # biome check --write . (fix)
npm run lint      # biome check . (check only)
npm run format    # biome format --write .
npm run ci        # CI-mode check, fails on any finding, no writes
```

## Important Links

- [WebMCP specification (W3C Community Group draft)](https://webmachinelearning.github.io/webmcp/)
- [Chrome for Developers: WebMCP](https://developer.chrome.com/docs/ai/webmcp)
- [Chrome: Imperative API](https://developer.chrome.com/docs/ai/webmcp/imperative-api)
- [Chrome: Declarative API](https://developer.chrome.com/docs/ai/webmcp/declarative-api)
- [Example Agentic Chrome Extension](https://github.com/GoogleChromeLabs/webmcp-extension)
- [WebMCP demos by the Chrome team](https://github.com/GoogleChromeLabs/webmcp-tools/tree/main/demos)
- [`@mcp-b/webmcp-polyfill`](https://www.npmjs.com/package/@mcp-b/webmcp-polyfill)
