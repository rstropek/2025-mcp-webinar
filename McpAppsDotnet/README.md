# MCP Apps Demo — .NET

This project is a minimal MCP server that demonstrates **MCP Apps** — the ability for an MCP tool to ship its own HTML UI that the host (e.g. VS Code Copilot Chat) renders inline alongside the AI conversation.

## What Are MCP Apps?

Standard MCP tools return plain text or structured data. The AI formats it and presents it to the user. **MCP Apps** extend this by letting a tool declare: *"I have an HTML view — render it when this tool is called."*

The key building blocks:

1. **A tool with `_meta` pointing to a UI resource.** When the host calls `tools/list`, each tool's `_meta` object contains a `ui.resourceUri` field referencing an HTML resource served by the same MCP server.
2. **An HTML resource served via `resources/read`.** The resource uses the custom `ui://` URI scheme and the MIME type `text/html;profile=mcp-app`, which tells the host this is an embeddable MCP App rather than a regular HTML file.
3. **A postMessage-based protocol between the HTML and the host.** The HTML is loaded in a sandboxed iframe. It communicates with the host (VS Code) via `window.parent.postMessage` using a JSON-RPC-like protocol for initialization, receiving tool inputs/results, reporting size changes, and more.

```
┌─────────────────────────────────────────────────┐
│  Host (VS Code Copilot Chat)                    │
│                                                 │
│  1. tools/list → sees _meta.ui.resourceUri      │
│  2. tools/call → gets text result               │
│  3. resources/read(ui://...) → gets HTML        │
│  4. Renders HTML in iframe, sends tool input    │
│     via postMessage                             │
│                                                 │
│  ┌───────────────────────────────────────────┐  │
│  │  iframe (MCP App)                         │  │
│  │  - Receives tool-input / tool-result      │  │
│  │  - Renders visual UI                      │  │
│  │  - Reports size via size-changed          │  │
│  └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
         ▲                          │
         │  stdio (JSON-RPC)        │
         ▼                          ▼
┌─────────────────────────────────────────────────┐
│  MCP Server (this project)                      │
│  - Serves tools with _meta                      │
│  - Serves HTML resources via ui:// URIs         │
└─────────────────────────────────────────────────┘
```

## How the HTML UIs Work

Both UIs are single-file HTML pages embedded as assembly resources. They communicate with the host via `window.parent.postMessage` using a JSON-RPC-like protocol.

### `view.html` — Read-Only Display

A passive view that displays the equation (e.g. `3 + 4 = 7`). It:

1. Sends `ui/initialize` to the host on load.
2. Listens for `ui/notifications/tool-input` (the arguments the AI passed to the tool) and `ui/notifications/tool-result` (the tool's text output).
3. Parses the numbers and renders a styled equation.
4. Reports its rendered size via `ui/notifications/size-changed` so the host can adjust the iframe.

### `interactive.html` — Interactive Form

A form where the user can enter numbers and compute the sum themselves. It:

1. Sends `ui/initialize` to the host on load.
2. Listens for `ui/notifications/tool-input` to pre-fill the form fields with AI-provided values.
3. Has a `=` button that computes the sum client-side and displays it.
4. Reports size changes back to the host.
