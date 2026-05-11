# Release Cockpit — an MCP Apps demo

A working **Release Cockpit** built as an MCP App according to the [MCP Apps specification](https://modelcontextprotocol.io/extensions/apps/overview).

The scenario: the user asks the model to roll out a feature. The model calls one tool, and the host renders an interactive cockpit inside the chat where the user reviews phases, marks risks, approves the rollout, and then watches live metrics.

The point of the demo is to exercise the MCP Apps primitives that distinguish this from "just embedding an iframe":

* the model sees one tool, but the UI quietly calls several more,
* the UI can push silent context to the model AND visible chat messages,
* the iframe transitions between screens locally, with no second model turn,
* every tool still returns a useful text fallback for hosts that don't render MCP Apps yet.

## MCP Apps principles covered

| Principle                                                              | Where in the code                                                 |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Tool with `_meta.ui.resourceUri` triggers UI render                    | `open-release-cockpit` in `src/server/factory.ts`                 |
| `structuredContent` prefills the UI in the same response               | `open-release-cockpit` handler + `ontoolresult` in `src/app/main.ts` |
| App-only tools (`visibility: ["app"]`) hidden from the model           | `poll-metrics`, `get-log-chunk` in `src/server/factory.ts`        |
| UI calls server tools (`app.callServerTool`)                           | `src/app/components/metrics.ts`, `logs.ts`, `approval.ts`         |
| UI sends a silent context update (`app.updateModelContext`)            | `src/app/components/risks.ts` (debounced on selection)            |
| UI sends a visible chat message (`app.sendMessage`)                    | `src/app/components/approval.ts`, `Hand back to AI` in `main.ts`  |
| UI logs to the host (`app.sendLog`)                                    | `src/app/components/metrics.ts` on poll failure                   |
| Tool input streaming (`ontoolinputpartial` / `ontoolinput`)            | `src/app/main.ts` (skeleton title before the tool finishes)       |
| Host context changes (`onhostcontextchanged`)                          | `src/app/main.ts` (theme + display-mode class)                    |
| Resource teardown (`onteardown`)                                       | `src/app/main.ts`                                                 |
| Display mode requests (`app.requestDisplayMode`, inline ⇄ fullscreen)  | `src/app/theme.ts` + topbar button in `main.ts`                   |
| Theming with host CSS variables (`applyDocumentTheme`)                 | `src/app/theme.ts`                                                |
| Auto-resize via `ResizeObserver` (`autoResize: true`)                  | `App` constructor in `src/app/main.ts`                            |
| Approval flow as a model+app tool (consent-gated)                      | `approve-rollout` in `factory.ts` (uses plain `server.registerTool`) |
| In-iframe screen transition without a second model turn                | `mountApproval` in `src/app/components/approval.ts`               |
| iframe state survives remount (sessionStorage)                         | `VIEW_STORAGE_KEY` / `TICKET_STORAGE_KEY` in `src/app/main.ts`    |
| Text-only fallback for hosts without MCP Apps                          | Every tool returns a meaningful `content` block                   |

## Folder structure

```
mcp-apps-demo/
├─ server.ts                   # Express + Streamable-HTTP entry point
├─ vite.config.ts              # Bundles UI to a single self-contained HTML
├─ src/
│  ├─ shared/types.ts          # Types shared between server and UI
│  ├─ server/
│  │   ├─ factory.ts           # Registers tools + UI/runbook resources
│  │   └─ mock-data.ts         # Deterministic plan / metrics / logs
│  └─ app/                     # MCP App UI (runs inside sandboxed iframe)
│      ├─ mcp-app.html
│      ├─ main.ts              # Lifecycle: connect, theme, mount, teardown
│      ├─ state.ts             # Tiny in-memory store with subscribers
│      ├─ theme.ts             # Host theming + display-mode toggle
│      ├─ styles.css           # Uses standardised CSS variables
│      └─ components/
│          ├─ timeline.ts      # Direct manipulation of phase percentages
│          ├─ metrics.ts       # Live polling via app-only tool
│          ├─ risks.ts         # Selection → updateModelContext (silent)
│          ├─ logs.ts          # Filtered log reader (app-only)
│          └─ approval.ts      # Approve → sendMessage + screen swap
└─ dist/mcp-app.html           # Built single-file UI (after `npm run build`)
```

> Two extra files (`components/simulator.ts` and `components/chat-actions.ts`) are present in the source tree from an earlier iteration. They are not imported by `main.ts` and the corresponding HTML elements are not in `mcp-app.html`, so they have no effect on the running demo. The same applies to the registered-but-unused `simulate-rollout`, `save-scenario` tools and the `doc://release-cockpit/runbook.md` resource. Treat them as "leftover scaffolding" until the UI catches up.

## Running it

```bash
npm install
npm run build
npm run serve
```

The MCP server listens at `http://localhost:3001/mcp`.

### Try it in a host

#### Option A — basic-host (recommended for development)

```bash
git clone https://github.com/modelcontextprotocol/ext-apps.git
cd ext-apps/examples/basic-host
npm install
SERVERS='["http://localhost:3001/mcp"]' npm start
```

Open <http://localhost:8080>, pick `open-release-cockpit`, and provide `feature` + `audience` arguments.

#### Option B — Claude / VS Code / Goose / ChatGPT Apps

Tunnel the local server with cloudflared:

```bash
npx cloudflared tunnel --url http://localhost:3001
```

Add the generated URL as a custom connector / MCP server in your host of choice. Then prompt the model with something like:

> "Open the release cockpit for `checkout.express_pay` for EU customers."

For VS Code specifically, see `.vscode/mcp.json` for a ready-to-use server entry; the chat experience requires `"chat.mcp.apps.enabled": true` in user settings.

## Notes for hosts that don't (yet) support MCP Apps

Every tool returns a sensible textual `content` block. A host without MCP Apps support still gets a usable summary back from `open-release-cockpit`, plus plain-text confirmations from `approve-rollout`. The UI is a *progressive enhancement* on top of the text protocol, never a replacement.

## Implementation notes

### Why a fresh `McpServer` per HTTP request

`server.ts` constructs a new `McpServer` and a new `StreamableHTTPServerTransport` for every `POST /mcp`. The official `McpServer` class binds 1:1 to a transport, so re-using a single instance across requests would corrupt the JSON-RPC bookkeeping. This pattern matches the official MCP Apps examples (e.g. `budget-allocator-server`).

### Session state is intentionally global

`factory.ts` keeps a small `sessionState` object at module scope. Because each HTTP request gets its own `McpServer` and `sessionIdGenerator` is `undefined` (stateless transport), there are no real per-session boundaries — the state is **process-wide** by design. That's fine for a single-user demo on `localhost`, but in production you would either:

* enable real session IDs on `StreamableHTTPServerTransport` and key the state by session, or
* persist the state in Postgres/Redis keyed by user / tenant.

The variable name is preserved (`sessionState`) for readability, but think of it as `serverState`.
