# MCP Apps Demo — TypeScript

A step-by-step training demo for **MCP Apps** — the MCP extension that lets a tool ship an interactive HTML UI that the host renders, sandboxed, right next to the conversation. The server is TypeScript on the MCP TypeScript SDK v2 (`@modelcontextprotocol/server`, Streamable HTTP, spec revision **2026-07-28**); the views are plain **HTML/TypeScript/CSS** built into single-file bundles with Vite and driven by the official [`@modelcontextprotocol/ext-apps`](https://www.npmjs.com/package/@modelcontextprotocol/ext-apps) client.

This is a TypeScript port of [`../McpAppsDotnet`](../McpAppsDotnet/README.md), with one extra step (7) and a few improvements — see [Differences to McpAppsDotnet](#differences-to-mcpappsdotnet).

Seven steps, one tool (or two) paired with one view each, every step teaching one MCP Apps concept:

| # | Tool(s) | Resource URI | View folder | Teaches |
|---|---------|---------------|-------------|---------|
| 1 | `step1-hello` | `ui://step1-hello/app.html` | `src/ui/step1-hello` | **Tool ↔ UI link.** `_meta.ui.resourceUri` joins a tool to a `ui://` resource; `structuredContent` is the typed payload routed to the view. |
| 2 | `step2-host-context` | `ui://step2-host-context/app.html` | `src/ui/step2-host-context` | **Host context & theming.** The view reads theme/locale/dimensions via `getHostContext()` and re-renders on `onhostcontextchanged`. |
| 3 | `step3-quote`, `step3-next-quote` (app-only) | `ui://step3-call-tool/app.html` | `src/ui/step3-call-tool` | **View → server calls & app-only tools.** A button calls `step3-next-quote` (`visibility: ["app"]`) — invisible to the model, no conversation turn consumed. |
| 4 | `step4-talk-to-model` | `ui://step4-talk-to-model/app.html` | `src/ui/step4-talk-to-model` | **Driving the conversation.** `updateModelContext` (silent), `sendMessage` (a user turn), `openLink` (host-mediated navigation). |
| 5 | `step5-monitor`, `step5-stats` (app-only) | `ui://step5-live-polling/app.html` | `src/ui/step5-live-polling` | **Live polling & lifecycle.** The view polls the app-only `step5-stats` every 2 s and stops on `onteardown`. |
| 6 | `step6-flag` | `ui://step6-fullscreen-csp/app.html` | `src/ui/step6-fullscreen-csp` | **Display modes & CSP.** `requestDisplayMode("fullscreen")`, and a content-level `_meta.ui.csp.resourceDomains` that lets the sandbox load an external flag image. |
| 7 | `step7-recipe` | `ui://step7-tool-input/app.html` | `src/ui/step7-tool-input` | **Tool-input timeline & plain resources.** `ontoolinputpartial` → `ontoolinput` → `ontoolresult`, plus `app.readServerResource` reading the plain-text resource `docs://step7/cooking-notes.md`. New in this port, no .NET equivalent. |

"What you should see" per step, once the tool is called from a host that renders MCP Apps:

| # | What you should see |
|---|---|
| 1 | The panel shows a greeting and the current server time, taken straight from `structuredContent`. |
| 2 | The panel prints theme, display mode, locale, time zone, container dimensions, and safe-area insets, and updates live if you toggle the host's theme. |
| 3 | The panel shows a quote; clicking "Another one" swaps it for a new one without adding a turn to the conversation. |
| 4 | Three buttons: "Pin to context" (silent), "Send message" (adds a user turn), "Open via host" (host opens the URL). A status line reports success/failure. |
| 5 | CPU/memory/uptime update every 2 seconds; closing the panel (or the host tearing it down) stops the polling — check the server log or DevTools, nothing keeps firing after teardown. |
| 6 | A flag image loads from `flagcdn.com` inside the sandbox; a "Go fullscreen" button appears if the host supports it and toggles the display mode. |
| 7 | Three panels fill in as the tool call progresses (partial input, if the host streams it; final input; result), and "Show cooking notes" fetches and renders a markdown resource on demand. |

## What are MCP Apps?

Two MCP primitives combine into one feature:

1. A **tool** declares `_meta.ui.resourceUri` pointing at a `ui://…` resource.
2. A **resource** serves the UI as HTML with the MIME type `text/html;profile=mcp-app`.

When the model calls the tool, the host reads the resource, mounts the HTML in a **sandboxed iframe**, and pushes the tool result into it. The view talks back over a `postMessage` JSON-RPC dialect (handled by the `App` client) to call more tools, update the model's context, open links, or change display mode.

```
  model ──tools/call──▶ server ──result──▶ host
                                            │ reads ui:// resource
                                            ▼
                                   ┌──────────────────┐
                                   │ sandboxed iframe  │  ◀── postMessage ──▶ host
                                   │  (the MCP App)    │      (ui/* methods)
                                   └──────────────────┘
```

## Server: SDK v2 on the outside, SDK v1 peer dep on the inside

The server runs on the **MCP TypeScript SDK v2** (`@modelcontextprotocol/server` and `@modelcontextprotocol/node`, both `2.0.0`, spec revision **2026-07-28**), the same generation as [`../day3/DemoServer`](../day3/DemoServer/readme.md) and [`../day4/McpStreamableAuth`](../day4/McpStreamableAuth/readme.md). It runs `createMcpHandler` in `legacy: "stateless"` mode: the 2026-07-28 revision has no `initialize` handshake and no session, so a fresh `McpServer` is built for every HTTP request — but today's MCP Apps hosts (MCPJam, Claude, VS Code) still send `initialize` first, and `"stateless"` answers that too, from a fresh instance, so nothing breaks.

The views, on the other hand, are built against `@modelcontextprotocol/ext-apps` **1.7.5**, whose `App` client is still on the SDK v1 generation — `@modelcontextprotocol/sdk` `1.30.0` is listed in `package.json` only because it is an explicit peer dependency of `ext-apps`. It never runs on the server; it is bundled straight into the browser HTML produced by `scripts/build-ui.ts` and used only inside the sandboxed iframe.

One consequence: the `@modelcontextprotocol/ext-apps/server` helpers (`registerAppTool`, `registerAppResource`) are written against SDK v1 and do not work against an SDK v2 `McpServer` (tracked upstream: [ext-apps#702](https://github.com/modelcontextprotocol/ext-apps/issues/702)). So this server does **not** use them — `src/server/lib/ui-meta.ts` builds the `_meta.ui` objects by hand instead, three tiny functions (`uiResource`, `appOnly`, `contentUiMeta`) that every step imports. It is the TypeScript equivalent of the .NET sample's `UiMeta.cs`.

## Why one single-file bundle per view

A sandboxed MCP App view runs under a default-deny CSP (`default-src 'none'` unless the resource opts specific origins in — see the `_meta.ui` table below). It cannot fetch a separate `.js` or `.css` file from anywhere, including from this very server. So every view is bundled into one self-contained HTML document — markup, styles, and script all inlined — using `vite-plugin-singlefile`, and the resource handler ships that HTML verbatim.

`scripts/build-ui.ts` builds each step in its **own** Vite invocation rather than one multi-entry build, because a single multi-entry Rollup build can let several entries share a common chunk that gets emitted as a separate file and *imported* — an external `<script type="module" src="...">` — which defeats the single-file property for exactly the code that CSP would then block. Building each view in isolation sidesteps chunk-sharing entirely, at the cost of running Vite seven times instead of once.

Views are re-read from `dist/ui/<step>/index.html` on every `resources/read` unless `NODE_ENV=production` — see [Differences to McpAppsDotnet](#differences-to-mcpappsdotnet) for why.

## Project layout

```
McpApps/
├── package.json                 # single npm project
├── scripts/build-ui.ts          # loops steps -> Vite build(); --watch flag
├── src/server/
│   ├── app.ts                   # Express 5 harness, port 3001, CORS, /health
│   ├── mcp-handler.ts           # createMcpHandler(buildServer, { legacy: "stateless" })
│   ├── mcp-server.ts            # buildServer(): new McpServer + register all steps
│   ├── lib/ui-meta.ts           # APP_MIME, uiResource(), appOnly(), contentUiMeta()
│   ├── lib/view-store.ts        # reads dist/ui/<step>/index.html
│   └── steps/step1-hello.ts … step7-tool-input.ts
├── src/ui/
│   ├── shared/host-theme.ts     # applyDocumentTheme/applyHostStyleVariables/applyHostFonts wrapper
│   ├── shared/dom.ts            # requireElement() helper
│   └── step1-hello/ … step7-tool-input/{index.html,view.ts,style.css}
└── dist/ui/<step>/index.html    # build output (gitignored)
```

## Install, build, run

```bash
npm install
npm start            # build:ui + serve, http://localhost:3001/mcp
```

```bash
npm run dev          # watch:ui + tsx watch server — edit a view or a step and reload the host
npm run build:ui     # just the Vite builds
npm run serve        # just the server (needs a prior build:ui)
npm run typecheck    # tsc --noEmit for server+scripts and, separately, for the views
```

The endpoint is `http://localhost:3001/mcp`; `http://localhost:3001/health` is a plain liveness route, not part of MCP.

## `_meta.ui` reference

| Where | Key | Purpose |
|-------|-----|---------|
| Tool (`tools/list`) | `ui.resourceUri` | Link the tool to its `ui://` view. |
| Tool (`tools/list`) | `ui.visibility: ["app"]` | Hide from the model; still callable from the view via `app.callServerTool`. |
| Resource content (`resources/read`) | `ui.csp.resourceDomains` | Whitelist origins for `<img>`/`<script>`/`<link>`/fonts/media (`img-src`/`script-src`/…). |
| Resource content (`resources/read`) | `ui.csp.connectDomains` | Whitelist `fetch`/XHR/WebSocket targets (`connect-src`). |
| Resource content (`resources/read`) | `ui.csp.frameDomains` / `ui.csp.baseUriDomains` | Whitelist nested frames / `<base>` URIs. |
| Resource content (`resources/read`) | `ui.permissions` | Request sandbox permissions (`camera`, `microphone`, …). |
| Resource content (`resources/read`) | `ui.prefersBorder` | Cosmetic hint — a **direct** field of `ui`, **not** under a `preferences` wrapper. Nesting it under a made-up wrapper would not error; the host would just silently drop it. |

MIME type for every view resource: `text/html;profile=mcp-app`.

Tool-level `_meta` (`resourceUri`, `visibility`) is set through `registerTool`'s `_meta` option; content-level `_meta` (`csp`, `prefersBorder`, `permissions`, `domain`) is attached per `resources/read` call — only step 6 uses it, for the flag CDN allow-list. Content-level `_meta` wins over listing-level `_meta` when both are present.

## Testing hosts

### MCPJam (local)

```bash
npm run inspect:mcpjam
```

Opens the local [MCPJam](https://www.mcpjam.com/) package. Add `http://localhost:3001/mcp` as an HTTP server there (default settings, no auth). Use the **local** package, not the hosted `app.mcpjam.com` — the hosted app only accepts HTTPS servers and cannot reach a plain-HTTP `localhost` server.

MCPJam renders the widgets only in its **Chat/Playground** view, not in the Tools tab (which just notes that the tool "renders UI with MCP Apps extension"). Ask the chat to call a step's tool by name (e.g. "call step6-flag with code jp") and the widget appears inline. The Tools tab is still useful to see `_meta.ui` on each tool, including `visibility: ["app"]` on `step3-next-quote` and `step5-stats`. Verified with MCPJam 3.3.5: steps 1–3 and 5–7 work end-to-end, step 2 re-renders live when you change the client-context theme override, but `openLink` (step 4) and the fullscreen toggle (step 6) are not implemented by MCPJam's host — use Claude for those.

### MCP Inspector 2.x

```bash
npm run inspector    # web UI at the printed URL; renders MCP App widgets
npm run app-info     # CLI: --app-info for step1-hello
```

`app-info` prints whether the tool carries `hasApp: true` and its resolved `_meta.ui`. Useful CLI examples:

```bash
mcp-inspector --cli --transport http --server-url http://127.0.0.1:3001/mcp --method tools/list
mcp-inspector --cli --transport http --server-url http://127.0.0.1:3001/mcp \
  --method tools/call --tool-name step6-flag --tool-arg code=jp
```

### VS Code

`.vscode/mcp.json` is included and points at `http://127.0.0.1:3001/mcp`. VS Code needs the MCP Apps setting enabled (`chat.mcp.apps.enabled`); check the current VS Code docs for the exact setting name and rollout status rather than relying on this readme.

### Claude (web/desktop)

Claude reaches this server only through a public tunnel, since it cannot call `localhost`:

```bash
npx cloudflared tunnel --url http://localhost:3001
```

Add the printed `https://…trycloudflare.com/mcp` URL as a custom connector (paid Claude plans). Claude streams tool-call arguments while the model produces them (as of this writing; MCPJam and the Inspector do not), so it is the host to use for step 7's `ontoolinputpartial` panel.

### pi.dev

`.mcp.json` already defines a `mcp-apps` entry (`disabled: true`). pi can call every tool, but it renders no widget UI — useful for scripted smoke tests of the tool layer, not for seeing the views.

## Differences to McpAppsDotnet

- **`outputSchema` everywhere** a tool returns `structuredContent` (the .NET sample omits it to keep `content` clean) — the model gets a typed contract for every payload the views read.
- **zod validation in the views.** Each `view.ts` parses `structuredContent` with a local zod schema and renders a readable error instead of trusting `unknown` blindly.
- **`step6-flag`'s country code is a zod enum**, not a free string — the .NET original accepts any string and silently serves a broken image for an unknown code; here an unknown code is a schema-level rejection before the tool even runs.
- **No forever-cache of views outside production.** `ViewStore` only caches when `NODE_ENV=production`; the .NET `ViewStore.cs` caches unconditionally, which is fine for a published binary but meant a live demo with `watch:ui` running kept serving stale HTML until the server was restarted.
- **Step 7 is new**: the tool-input timeline (`ontoolinputpartial` → `ontoolinput` → `ontoolresult`) and `app.readServerResource` reading a plain (non-`ui://`) markdown resource — nothing in the six-step .NET original demonstrates either.

## Security note

This server has **no authentication and no Host/DNS-rebinding check**, deliberately: MCP App hosts reach it from other origins by design (MCPJam/Inspector run in a browser tab, Claude reaches it through a public tunnel whose `Host` header is never `localhost`), and the usual guard would reject all of them. That trade-off is only acceptable for training — never point this server at anything with real data or run it anywhere but a throwaway environment. For a server that does add MCP OAuth, see [`../day4/McpStreamableAuth`](../day4/McpStreamableAuth/readme.md).

## Formatting and linting

```bash
npm run check     # biome check --write . (fix)
npm run lint      # biome check . (check only)
npm run format    # biome format --write .
npm run ci        # CI-mode check, fails on any finding, no writes
```

## Important Links

- [MCP Apps overview](https://modelcontextprotocol.io/extensions/apps/overview)
- [MCP Apps build guide](https://modelcontextprotocol.io/extensions/apps/build)
- [MCP Apps specification](https://github.com/modelcontextprotocol/ext-apps/tree/main/specification)
- [MCP Apps API docs](https://apps.extensions.modelcontextprotocol.io/api/)
- [ext-apps examples](https://github.com/modelcontextprotocol/ext-apps/tree/main/examples)
- [MCP Inspector — MCP Apps recipe](https://modelcontextprotocol.io/docs/tools/inspector/recipes)
