# Demo Server

## Overview

A deliberately tiny MCP server with a single tool (`echo-tool`), used to explain the fundamentals of **Streamable HTTP** step by step. It implements MCP spec revision **2026-07-28** with the MCP TypeScript SDK v2 (`@modelcontextprotocol/server`, `@modelcontextprotocol/express`, `@modelcontextprotocol/node`).

Three files, one concern each:

| File                | Contains                                                              |
| ------------------- | --------------------------------------------------------------------- |
| `src/app.ts`        | The Express wiring: routes, CORS, listening, shutdown                 |
| `src/mcp-handler.ts`| `createMcpHandler(factory)` — the bridge between HTTP and MCP          |
| `src/mcp-server.ts` | The `McpServer` factory with the one tool                             |

## Storyboard

### Develop Code

1. Develop an empty _Express_ server with a basic route (`/ping`) for people who are new to TypeScript web development.
2. Add the MCP endpoint. Three things are worth stopping at:
   - `createMcpExpressApp()` is a normal Express app plus `express.json()` plus `Host`/`Origin` validation. Explain **DNS rebinding**: a website can make the browser resolve some domain to `127.0.0.1` and then talk to a local server. Same-origin policy does not help, checking `Host`/`Origin` does.
   - `createMcpHandler(factory)` takes a **factory**, not a server. The 2026-07-28 revision is stateless, so a fresh `McpServer` is built for every single HTTP request.
   - `app.all("/mcp", ...)` — one endpoint, POST only. The SDK answers GET and DELETE with `405`.
3. Add the `echo-tool` — first without `thinkHard`. Talk about _zod_ for schema validation, and about tool annotations (`readOnlyHint`).

### Show Protocol

1. With [`requests.http`](./requests.http), walk through the raw HTTP requests: `server/discover`, `tools/list`, `tools/call`, the two error cases, a legacy `initialize`, and `GET /mcp`.
2. With `npm run debug` (MCP Inspector).
3. In the Inspector, show both connection types: via the proxy (the default) and **direct** from the browser.

### Add Streaming

Add the `thinkHard` parameter and the progress notifications, then run the same `tools/call` twice — once with `thinkHard: false`, once with `true` — and compare the two responses.

## Running the Server

```bash
npm install
npm start                 # http://127.0.0.1:3000/mcp
PORT=3100 npm start       # any other port
```

`npm run debug` starts the server **and** the MCP Inspector in parallel.

## What to Observe

### JSON vs. SSE — the same endpoint, two response shapes

`tools/call` with `thinkHard: false` produces nothing before the result, so the answer is a single JSON object:

```
HTTP/1.1 200 OK
content-type: application/json

{"result":{"content":[{"type":"text","text":"Echo: Hello World!"}],"resultType":"complete",
 "_meta":{"io.modelcontextprotocol/serverInfo":{"name":"demo-mcp-server","version":"1.0.0"}}},
 "jsonrpc":"2.0","id":3}
```

The same call with `thinkHard: true` and a `_meta.progressToken` emits three `notifications/progress` before the result. A single JSON body cannot express that, so the SDK upgrades the very same response to an SSE stream. Run [`curl.sh`](./curl.sh) to watch it arrive live, one event per second:

```
HTTP/1.1 200 OK
content-type: text/event-stream
x-accel-buffering: no

event: message
data: {"jsonrpc":"2.0","method":"notifications/progress","params":{"progressToken":"echo-1","progress":1,"total":3,"message":"Thinking hard... (1/3)"}}

event: message
data: {"jsonrpc":"2.0","method":"notifications/progress","params":{"progressToken":"echo-1","progress":2,"total":3,"message":"Thinking hard... (2/3)"}}

event: message
data: {"jsonrpc":"2.0","method":"notifications/progress","params":{"progressToken":"echo-1","progress":3,"total":3,"message":"Thinking hard... (3/3)"}}

event: message
data: {"result":{"content":[{"type":"text","text":"Echo: Hello World!"}],"resultType":"complete","_meta":{"io.modelcontextprotocol/serverInfo":{"name":"demo-mcp-server","version":"1.0.0"}}},"jsonrpc":"2.0","id":1}
```

The result is simply the last event on the stream. `x-accel-buffering: no` asks reverse proxies not to buffer the response, which would defeat the whole exercise.

The `responseMode` option in `src/mcp-handler.ts` is a good live experiment: set it to `"json"` and the progress notifications are silently dropped; set it to `"sse"` and even the trivial call streams.

### No sessions

There is no `initialize`, no `Mcp-Session-Id`, no state on the server between two requests. Every request carries everything the server needs in its `_meta` envelope:

```json
"_meta": {
  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
  "io.modelcontextprotocol/clientInfo": { "name": "REST Client", "version": "1.0.0" },
  "io.modelcontextprotocol/clientCapabilities": {}
}
```

Consequences worth pointing out:

- `server/discover` replaces the handshake. Its result names `supportedVersions` and carries cache hints so a client may remember the answer.
- `tools/list` results carry `ttlMs` and `cacheScope` for the same reason.
- Every result carries `resultType: "complete"` and `_meta["io.modelcontextprotocol/serverInfo"]`.
- The server can be restarted mid-demo without any client noticing.

### 405 on GET and DELETE

```bash
curl -i http://127.0.0.1:3000/mcp
```

```
HTTP/1.1 405 Method Not Allowed

{"jsonrpc":"2.0","error":{"code":-32000,"message":"Method not allowed."},"id":null}
```

`GET` used to open the standalone SSE stream and `DELETE` used to terminate a session. Both concepts are gone; only `POST` remains.

### Headers must agree with the body

`Mcp-Method` is required on every request, `Mcp-Name` additionally on `tools/call`, `resources/read` and `prompts/get`. They exist so that gateways can route and authorize a request without parsing the JSON body — which only works if header and body cannot disagree:

```
HTTP/1.1 400 Bad Request

{"jsonrpc":"2.0","error":{"code":-32020,"message":"Bad Request: the request headers and body disagree:
 the body names method tools/call but the Mcp-Method header names tools/list", ...},"id":6}
```

An unsupported protocol version gets its own error, including the list of versions the server does speak:

```
HTTP/1.1 400 Bad Request

{"jsonrpc":"2.0","error":{"code":-32022,"message":"Unsupported protocol version: 2025-06-18",
 "data":{"supported":["2026-07-28"],"requested":"2025-06-18"}},"id":5}
```

### Legacy clients still work

A 2025-era client sends `initialize` and no `_meta` envelope. The SDK recognizes that and serves it from a fresh instance per request (`legacy: "stateless"` in `src/mcp-handler.ts`):

```
{"result":{"protocolVersion":"2025-06-18","capabilities":{"tools":{"listChanged":true}},
 "serverInfo":{"name":"demo-mcp-server","version":"1.0.0"}},"jsonrpc":"2.0","id":1}
```

Note that `initialize` never negotiates `2026-07-28` — that revision has no handshake. Set `legacy: "reject"` to make the server modern-only.

## Testing with pi.dev

[pi](https://pi.dev) is a terminal coding agent. With the [`pi-mcp-adapter`](https://pi.dev/packages/pi-mcp-adapter) extension (`pi install npm:pi-mcp-adapter`) it can use MCP servers, and it reads them from the standard project file `.mcp.json`.

`DemoServer/.mcp.json` already defines this server, `"disabled": true` so nothing connects by default:

```json
{
  "settings": {
    "directTools": true
  },
  "mcpServers": {
    "demo-echo": {
      "url": "http://127.0.0.1:3000/mcp",
      "protocolVersion": "auto",
      "disabled": true
    }
  }
}
```

- `directTools: true` registers MCP tools as first-class pi tools with their real schemas instead of routing every call through the generic `mcp` proxy tool. On the very first run the adapter has no metadata cache yet, so the model may still use the `mcp` proxy tool once to discover tool names.
- `protocolVersion: "auto"` makes the adapter probe with `server/discover` and talk 2026-07-28. Its default is `legacy`, which would exercise the `initialize` path instead — also a worthwhile thing to show.

HTTP servers are **not** spawned by pi, so start this one first (`npm start`) and leave it running in another terminal.

### Enabling the server

pi's project override file `.pi/mcp.json` has the highest precedence and only carries the `disabled` flag. It is gitignored. Interactively you would toggle with `/mcp enable demo-echo` + `/reload`; for a non-interactive run, write it directly:

```bash
mkdir -p .pi && echo '{ "mcpServers": { "demo-echo": { "disabled": false } } }' > .pi/mcp.json
```

### Running a prompt

```bash
pi -p --approve --provider openrouter --model z-ai/glm-5.3-flash --thinking off \
  "Use the echo-tool to echo 'Hello MCP' with thinkHard false. Print only the echoed text."
```

`--approve` (trust project-local files such as `.mcp.json` for this run) is **required** in print mode — without it pi silently waits for the interactive trust prompt and never answers. Add `--mode json` to see the tool call and the raw MCP result (`details.mcpResult`), which shows the `_meta["io.modelcontextprotocol/serverInfo"]` envelope that proves the 2026-07-28 era was negotiated.
