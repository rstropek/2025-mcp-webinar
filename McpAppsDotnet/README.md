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
│       ├── Step1Hello.cs … Step6FullscreenCsp.cs
│       └── StepRegistry.cs
└── ui/                         # HTML/TS/CSS views (no framework)
    ├── stepN.html              # entry per step
    ├── src/<step>/view.ts      # view logic using the ext-apps App client
    └── dist/stepN.html         # Vite single-file build output (served by the server)
```

The server registers tools and resources **programmatically** (mirroring the
TypeScript reference's per-step `register` functions), and the `_meta.ui` payloads
come from the official
[`ModelContextProtocol.Extensions.Apps`](https://www.nuget.org/packages/ModelContextProtocol.Extensions.Apps)
package rather than hand-built JSON:

```csharp
McpApps.SetAppUi(
    McpServerTool.Create(Hello, new McpServerToolCreateOptions { Name = "step1-hello", … }),
    new McpUiToolMeta { ResourceUri = "ui://step1-hello/app.html" });
```

`SetAppUi` writes the `ui` key into the tool's `_meta` and returns the same tool,
so it wraps the `Create` call. The resource side uses `McpApps.HtmlMimeType` for
the MIME type and, for step 6, publishes the same `McpUiResourceMeta` on every
level a host might look at.

> **Gotcha (verified against 2.2.0):** `McpApps.SetResourceUi` writes
> `ResourceTemplate.Meta`, i.e. what `resources/templates/list` returns. A resource
> whose URI has *no* parameters — like every `ui://stepN/app.html` here — is
> exposed by the SDK as a concrete `Resource` only, so `resources/templates/list`
> is empty and `SetResourceUi` alone never reaches the wire. To get listing-level
> metadata into `resources/list`, also set
> `McpServerResourceCreateOptions.Meta` (which seeds `Resource.Meta`). Step 6 does
> both; see `Step6FullscreenCsp.Resource`.

There is **no content-level helper** in the package: `ResourceContents.Meta` is a
raw `JsonObject`, so `ViewStore.Read` serializes the typed meta itself with the
package's own serializer options:

```csharp
Meta = new JsonObject { ["ui"] = JsonSerializer.SerializeToNode(ui, McpApps.SerializerOptions) }
```

An attribute-based alternative exists for `[McpServerTool]`-decorated methods:
`[McpAppUi(ResourceUri = "ui://…", Visibility = [McpUiToolVisibility.App])]` on the
method plus `.WithMcpApps()` on the server builder. This sample uses the explicit
calls so every step file shows the metadata it produces.

> **MCPEXP003** — MCP Apps is an *extension* (SEP-1865), not part of the base
> spec, so every type in the package is `[Experimental("MCPEXP003")]`. The project
> opts out once via `<NoWarn>$(NoWarn);MCPEXP003</NoWarn>` in
> `McpAppsDotnet.csproj`; expect the API to move before it graduates.

The HTTP transport runs in **stateless** mode
(`SessionMode = HttpServerSessionMode.Stateless`): each request is independent,
with no persisted server session, no `Mcp-Session-Id`, no GET SSE stream, and
`DELETE` answers 405. That is not just a convenience here — it is the only shape
Streamable HTTP has in spec revision **2026-07-28**. MCP Apps fit it perfectly:
everything a view does (calling tools, changing display mode, opening links) goes
through the *host* over `postMessage`, never through a server→client MCP request,
so nothing here needs a session. The other modes (`Stateful`,
`StatefulForInitializeClients`) exist only to keep serving pre-2026-07-28 clients
that need elicitation or sampling — see `day3-dotnet`.

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

[MCPJam](https://www.mcpjam.com/) is an MCP host that supports MCP Apps. The
hosted `app.mcpjam.com` only reaches `https://` servers, so for a `localhost`
server run the local npm package instead — same UI, and it accepts plain HTTP:

```bash
# from anywhere; downloads and starts the inspector
npx @mcpjam/inspector@latest       # opens http://127.0.0.1:6274
```

Open the printed URL in **Chrome**, **Connect → Add Server**: connection type
`HTTP`, URL `http://localhost:3001/mcp`, Authentication `No Authentication`,
protocol version `Latest`. Toggling the server on connects immediately (no
token needed) and MCPJam shows the server version (`v0.1.0`) once connected.

**Inspect → Tools** confirms the `tools/list` shape without needing a model:
all 8 tools are listed (nothing is filtered out of the raw list), and the
metadata panel for each shows the actual `_meta.ui` — `step3-quote` carries
`{"resourceUri": "ui://step3-call-tool/app.html"}`, while `step3-next-quote`
and `step5-stats` carry `{"visibility": ["app"]}` and no `resourceUri`. That
`visibility` flag is what a chat client is expected to read to hide them from
the model — MCPJam's own **Playground** tool list shows this directly as
`visibility: ["model", "app"]` vs. `visibility: ["app"]` under each tool name.

Rendering the views needs the **Playground** (chat) with a model configured
(top-right model picker — a small local/free model such as Claude Haiku is
enough since the prompts are trivial: *"Please call the `<tool-name>` tool."*).
Widget iframes are cross-origin, so verifying their content means reading the
rendered page, not the DOM. What was actually observed, one step at a time:

- **Step 1** — the view renders "Hello from an MCP App" with the greeting and
  the server timestamp from `structuredContent`; matches the `tools/call`
  result exactly.
- **Step 2** — the "Host context" panel shows `Theme: dark` (MCPJam's default)
  plus display mode, locale, timezone and safe-area insets. Setting the
  **Client Context** override (toolbar button, JSON editor) to
  `{"theme":"light"}` and saving re-renders the *already open* panel to
  `Theme: light` immediately — no new tool call, confirming
  `onhostcontextchanged` fires as designed. (The JSON editor auto-closes
  brackets, so typing the literal text once produces a duplicate `}`; delete
  the extra character or omit the trailing `}` while typing.)
- **Step 3** — the "Random quote" view shows a quote and author with an
  "Another one" button. Clicking it calls `step3-next-quote` — logged in the
  Playground as a tool-call card *without* a preceding user message, i.e. the
  model never sees it and no conversation turn is spent. The result is
  structured `{quote, author}`, same shape as `step3-quote`.
- **Step 4** — the "Talk to model" panel has three independent controls, all
  confirmed working: *Pin to model context* shows "Pinned to model context (no
  turn triggered)" and produces no reply; *Send as user message* shows "Sent —
  model is responding." and the model actually replies to the injected text;
  *Open external link* shows "Asked host to open `<url>`" and — MCPJam **does**
  implement `openLink`, opening the URL in a new browser tab. (This corrects
  an earlier assumption that MCPJam does not support `openLink`; at least the
  local npm inspector does.)
- **Step 5** — the "Live host stats" view updates CPU/Memory/Uptime/"Polls
  observed" roughly every 2 s, and each tick is a separate `step5-stats`
  tool-call card with no user turn, exactly like step 3. Clearing the chat
  (which unmounts the view) stops the polling: the server's `tools/call` count
  stayed flat for several seconds afterwards where it would otherwise have
  grown by ~1 call/2 s, confirming the view's `onteardown` handler runs.
- **Step 6** — calling the tool with `code: "at"` renders the Austrian flag
  image served from `flagcdn.com`; without the resource's
  `_meta.ui.csp.resourceDomains` entry the sandbox's default-deny CSP would
  block that image, so a successful load is the CSP working as intended. A
  "Go fullscreen" button is present, but clicking it left "Current display
  mode: inline" unchanged — the local MCPJam inspector does not implement the
  `requestDisplayMode("fullscreen")` host call, so the button is a no-op there
  (this is a client limitation, not a bug in the sample).

## Key `_meta.ui` reference

Wire key ↔ the C# type that produces it:

| Where | Wire key | C# | Purpose |
|-------|----------|-----|---------|
| Tool (`tools/list`) | `ui.resourceUri` | `McpUiToolMeta.ResourceUri` | Link the tool to its `ui://` view. |
| Tool (`tools/list`) | `ui.visibility: ["app"]` | `McpUiToolMeta.Visibility = [McpUiToolVisibility.App]` | Hide from the model; still callable from the view. |
| Resource content (`resources/read`) | `ui.csp.resourceDomains` | `McpUiResourceCsp.ResourceDomains` | Whitelist origins for `<img>`/`<script>`/`<link>`/fonts (`img-src`/`script-src`/`style-src`/`font-src`). |
| Resource content (`resources/read`) | `ui.csp.connectDomains` | `McpUiResourceCsp.ConnectDomains` | Whitelist `fetch`/XHR/WebSocket/EventSource targets (`connect-src`). |
| Resource content (`resources/read`) | `ui.csp.frameDomains` / `ui.csp.baseUris` | `McpUiResourceCsp.FrameDomains` / `.BaseUris` | Whitelist nested frames (`frame-src`) / `<base>` URIs (`base-uri`). |
| Resource content (`resources/read`) | `ui.permissions.allow` | `McpUiResourcePermissions.Allow` | Request sandbox permissions (`camera`, `microphone`, …). |
| Resource content (`resources/read`) | `ui.domain` | `McpUiResourceMeta.Domain` | Dedicated origin for the iframe (OAuth/CORS without wildcards). |
| Resource content (`resources/read`) | `ui.prefersBorder` | `McpUiResourceMeta.PrefersBorder` | Cosmetic hint — a **direct** field of `ui`, **not** under a `preferences` wrapper. |

Writers: `McpApps.SetAppUi(tool, McpUiToolMeta)` for tools,
`McpServerResourceCreateOptions.Meta` (+ `McpApps.SetResourceUi`) for the resource
*listing*, and manual serialization into `ResourceContents.Meta` for the resource
*content* — content-level `_meta` wins over listing-level `_meta`, so that is where
anything that must definitely reach the host belongs.

MIME type for every view resource: `McpApps.HtmlMimeType` = `text/html;profile=mcp-app`.

## Dependencies

- Server: `ModelContextProtocol.AspNetCore` 2.2.0 (spec revision 2026-07-28) and
  `ModelContextProtocol.Extensions.Apps` 2.2.0, target `net10.0`.
- UI: `@modelcontextprotocol/ext-apps` ^1.7.5; dev: `vite` ^8, `vite-plugin-singlefile`,
  `typescript` ^7, `cross-env`.
