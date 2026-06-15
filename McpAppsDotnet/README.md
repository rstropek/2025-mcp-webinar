# MCP Apps Demo — C#/.NET 10

## Overview

A step-by-step training demo for **MCP Apps** — the MCP extension that lets a tool
ship an interactive HTML UI that the host renders, sandboxed, right next to the
conversation. The server is C#/.NET 10 (`ModelContextProtocol.AspNetCore` over
Streamable HTTP); the views are plain **HTML/TypeScript/CSS** built into
single-file bundles with Vite and driven by the official
[`@modelcontextprotocol/ext-apps`](https://www.npmjs.com/package/@modelcontextprotocol/ext-apps)
client.

Six steps, each one tool (or two) paired with one view, every step teaching one
MCP-Apps concept:

| # | Tool(s) | Teaches |
|---|---------|---------|
| 1 | `step1-hello` | **Tool ↔ UI link.** `_meta.ui.resourceUri` joins a tool to a `ui://` resource; `structuredContent` is the typed payload routed to the view. |
| 2 | `step2-host-context` | **Host context & theming.** The view reads theme/locale/dimensions via `getHostContext()` and re-renders on `onhostcontextchanged`. |
| 3 | `step3-quote` + `step3-next-quote` | **View → server calls & app-only tools.** A button calls `step3-next-quote` (`visibility:["app"]`) — invisible to the model, no conversation turn consumed. |
| 4 | `step4-talk-to-model` | **Driving the conversation.** `updateModelContext` (silent), `sendMessage` (a user turn), `openLink` (host-mediated navigation). |
| 5 | `step5-monitor` + `step5-stats` | **Live polling & lifecycle.** The view polls the app-only `step5-stats` every 2 s and stops on `onteardown`. |
| 6 | `step6-flag` | **Display modes & CSP.** `requestDisplayMode("fullscreen")`, and a content-level `_meta.ui.csp.resourceDomains` that lets the sandbox load an external flag image. |

## What are MCP Apps?

Two MCP primitives combine into one feature:

1. A **tool** declares `_meta.ui.resourceUri` pointing at a `ui://…` resource.
2. A **resource** serves the UI as HTML with the MIME type
   `text/html;profile=mcp-app`.

When the model calls the tool, the host reads the resource, mounts the HTML in a
**sandboxed iframe**, and pushes the tool result into it. The view talks back over
a `postMessage` JSON-RPC dialect (handled by the `App` client) to call more tools,
update the model's context, open links, or change display mode.

```
  model ──tools/call──▶ server ──result──▶ host
                                            │ reads ui:// resource
                                            ▼
                                   ┌──────────────────┐
                                   │ sandboxed iframe  │  ◀── postMessage ──▶ host
                                   │  (the MCP App)    │      (ui/* methods)
                                   └──────────────────┘
```

## Project layout

```
McpAppsDotnet/
├── McpAppsDotnet.slnx          # solution
├── server/                     # C#/.NET 10 MCP server (Streamable HTTP, :3001/mcp)
│   ├── Program.cs              # CORS, AddMcpServer().WithHttpTransport(), MapMcp("/mcp")
│   ├── ViewStore.cs            # serves the bundled stepN.html as ui:// resources
│   └── Steps/                  # one class per step: tool(s) + resource + _meta.ui
│       ├── UiMeta.cs           # builds the _meta.ui objects
│       ├── Step1Hello.cs … Step6FullscreenCsp.cs
│       └── StepRegistry.cs
└── ui/                         # HTML/TS/CSS views (no framework)
    ├── stepN.html              # entry per step
    ├── src/<step>/view.ts      # view logic using the ext-apps App client
    └── dist/stepN.html         # Vite single-file build output (served by the server)
```

The server registers tools and resources **programmatically** (mirroring the
TypeScript reference's per-step `register` functions): `McpServerTool.Create(…, new
McpServerToolCreateOptions { Meta = … })` for the tool-level `_meta.ui`, and
`McpServerResource.Create(…)` returning `TextResourceContents` with a custom
`MimeType` and — for step 6 — content-level `Meta` (the CSP).

The HTTP transport runs in **stateless** mode (`Stateless = true`): each request
is independent, with no persisted server session. That suits this demo (no step
keeps per-session state), but if you add sampling, elicitation, or per-session
memory, turn it off — see the comment in `Program.cs`.

The tools return `structuredContent` (the typed payload the views read) **without**
declaring an `outputSchema`, which keeps the human-readable `content` text clean.
A production server should advertise a schema (`UseStructuredContent = true` +
`OutputSchemaType`) so the model gets a typed contract; it is omitted here only to
keep the sample focused.

### Why six single-file bundles?

A sandboxed MCP App view runs under a default-deny CSP, so it cannot fetch
external JS/CSS. Each view is therefore bundled into one self-contained HTML file
(JS + CSS inlined) via `vite-plugin-singlefile`. Because each Vite invocation
builds exactly one entry, `npm run build` runs the helper `scripts/build-ui.mjs`,
which calls Vite once per step (`INPUT=stepN.html vite build`) and writes
`dist/step1.html … dist/step6.html`. Running `npx vite build` directly fails with
"INPUT environment variable is not set" — always use `npm run build`.

## Build & run

Prerequisites: **.NET 10 SDK** and **Node.js 20+** (required by `@modelcontextprotocol/ext-apps`).

```bash
# 1. Build the views (produces ui/dist/step1..6.html)
cd ui
npm install
npm run build

# 2. Run the server (http://localhost:3001/mcp)
cd ../server
dotnet run
```

`dotnet run`, `dotnet build`, and `dotnet publish` automatically run the Vite build
first via an MSBuild target and copy the bundles next to the executable (into
`views/`). If you have already built the UI and want to skip that step, pass
`-p:SkipUiBuild=true` — but the bundles must already exist in `ui/dist/`, or the
build fails with a clear error. Override the port with
`ASPNETCORE_URLS=http://localhost:3005 dotnet run`.

## Testing with MCPJam

[MCPJam](https://www.mcpjam.com/) is an MCP host that supports MCP Apps. Run it
on demand with `npx` (no install needed):

```bash
# from anywhere; downloads and starts the inspector
npx @mcpjam/inspector@latest
```

Open the printed URL in **Chrome**, add a server connection to
`http://localhost:3001/mcp`, then call each step's tool and interact with the
rendered view:

- **Step 1** — greeting + server time appear in the panel.
- **Step 2** — toggle the host theme and watch the panel re-render.
- **Step 3** — "Another one" fetches a quote via the app-only tool (no new turn).
- **Step 4** — pin context, send a message, open a link via the host.
- **Step 5** — the dashboard updates every 2 s; closing it stops the polling.
- **Step 6** — the flag image loads (allowed by the resource CSP) and the
  fullscreen toggle appears when the host offers that display mode.

## Key `_meta.ui` reference

| Where | Key | Purpose |
|-------|-----|---------|
| Tool (`tools/list`) | `ui.resourceUri` | Link the tool to its `ui://` view. |
| Tool (`tools/list`) | `ui.visibility: ["app"]` | Hide from the model; still callable from the view. |
| Resource content (`resources/read`) | `ui.csp.resourceDomains` | Whitelist origins for `<img>`/`<script>`/`<link>`/fonts/media (`img-src`/`script-src`/…). |
| Resource content (`resources/read`) | `ui.csp.connectDomains` | Whitelist `fetch`/XHR/WebSocket targets (`connect-src`). |
| Resource content (`resources/read`) | `ui.csp.frameDomains` / `ui.csp.baseUriDomains` | Whitelist nested frames / `<base>` URIs. |
| Resource content (`resources/read`) | `ui.permissions` | Request sandbox permissions (`camera`, `microphone`, …). |
| Resource content (`resources/read`) | `ui.prefersBorder` | Cosmetic hint — a **direct** field of `ui`, **not** under a `preferences` wrapper. |

MIME type for every view resource: `text/html;profile=mcp-app`.

## Dependencies

- Server: `ModelContextProtocol.AspNetCore` (latest), target `net10.0`.
- UI: `@modelcontextprotocol/ext-apps` (latest); dev: `vite`, `vite-plugin-singlefile`, `typescript`.
