# Advanced MCP with .NET Aspire - C#/.NET

## Overview

This folder contains samples demonstrating advanced Model Context Protocol (MCP) concepts using C#/.NET with .NET Aspire orchestration. They build upon the foundational MCP concepts from `day2-dotnet` and move from stdio to **Streamable HTTP**.

The samples use the MCP C# SDK **2.2.0** (`ModelContextProtocol.AspNetCore`), which implements MCP spec revision **2026-07-28** ([changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog)) while still serving legacy 2025-era clients (VS Code, MCP Inspector in its default mode) from the very same server code.

Before you can get started, install the dependencies with `dotnet restore` and build with `dotnet build`. You can start the Aspire app host with `dotnet run --project AppHost` or run individual projects with `dotnet run --project <ProjectName>`.

## Architecture

- **AppHost**: the Aspire orchestrator that manages the lifecycle of all services
- **ServiceDefaults**: shared configuration for OpenTelemetry, health checks, and service discovery
- **DemoServer**: a minimal MCP server (one tool) used to explain Streamable HTTP step by step
- **McpStreamableServer**: the winter-password server, showing MRTR (asking the user something), prompts and resources

## What changed in 2026-07-28 for Streamable HTTP

Both stdio and HTTP carry exactly the same JSON-RPC messages. What differs is the plumbing around them - and 2026-07-28 removed a lot of that plumbing:

|                            | stdio                                        | Streamable HTTP (2026-07-28)                                                                                            |
| -------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Connection                 | one long-lived pipe per client               | **one POST per JSON-RPC message** to a single endpoint (`/mcp`)                                                           |
| Who starts the server      | the client spawns it as a child process      | the server runs on its own; clients just connect                                                                          |
| Handshake                  | `initialize`                                 | **gone** - `server/discover` lets a client *probe* what a server supports, and every request carries its own `_meta` envelope |
| Sessions                   | connection *is* the session                  | **removed** - no `Mcp-Session-Id`, no standalone `GET` SSE stream, no `DELETE`, no `Last-Event-ID` resumability            |
| Request routing            | implicit - the pipe belongs to one client    | duplicated into headers: `MCP-Protocol-Version`, `Mcp-Method`, and `Mcp-Name` on `tools/call` / `prompts/get` / `resources/read` |
| Asking the user something  | the server pushes `elicitation/create`       | **Multi Round-Trip Request (MRTR)**: the tool answers `resultType: "input_required"` and the client *retries* the call with `inputResponses` |
| Progress / logging         | `notifications/message` (logging)            | logging, sampling and roots are deprecated (SEP-2577); `notifications/progress` gated on the caller's `progressToken` took over |

The header duplication is the interesting part: a proxy or cache can route and authorize an MCP request without parsing the JSON body. That only works if header and body agree, so a mismatch is a hard error (`-32020`), never a best guess.

## Session modes in the C# SDK

`.WithHttpTransport(o => o.SessionMode = ...)` picks how the server handles state. This is the single most important decision when porting a 2025-era .NET MCP server:

| Mode                                          | 2026-07-28 clients             | Legacy `initialize` clients                                   | Server → client requests                                  |
| --------------------------------------------- | ------------------------------ | -------------------------------------------------------------- | ---------------------------------------------------------- |
| `Stateless` (**the default** since 2026-07-28) | native, no session             | served, but statelessly - no `Mcp-Session-Id` is minted         | impossible (nothing to push on); MRTR only                  |
| `Stateful`                                     | **refused** with `-32022`      | full session with `Mcp-Session-Id`, GET SSE stream, DELETE      | `ElicitAsync` / `SampleAsync` work                          |
| `StatefulForInitializeClients` (hybrid)        | native, no session             | full session with `Mcp-Session-Id`                              | for legacy sessions only                                    |

The two servers here deliberately pick different modes:

- **DemoServer → `Stateless`.** It only needs to answer requests and report progress, and progress works in every mode. Statelessness is what makes such a server horizontally scalable: any replica behind a load balancer can answer any request.
- **McpStreamableServer → `StatefulForInitializeClients`.** It wants to ask the *user* something. Modern clients are served with native MRTR (stateless), but the SDK's bridge that turns the same code into a pushed `elicitation/create` for a 2025-era host such as VS Code only exists for stateful legacy sessions. The hybrid mode gives both without a downgrade.

Note that the stateful-only transport options (`Stateless = false` and friends) are marked `[Obsolete]` and produce the **MCP9006** warning; `SendNotificationAsync` for logging and the sampling APIs produce **MCP9005**. Both servers here build without any of those.

## Samples

### Sample 1: Aspire App Host

The `AppHost` project orchestrates all services. Run the whole solution with:

```bash
dotnet run --project AppHost
```

This starts the Aspire dashboard (typically at <https://localhost:17055>), DemoServer and McpStreamableServer, with centralized logging and telemetry.

### Sample 2: Demo Server

A deliberately tiny MCP server with a single tool (`echo-tool`), used to explain the fundamentals of Streamable HTTP step by step.

```bash
dotnet run --project DemoServer     # http://localhost:5147/mcp
```

**Endpoints:** `/ping` (a plain ASP.NET Core route, nothing MCP about it) and `/mcp`.

Walk through the raw HTTP requests with [`DemoServer/requests.http`](./DemoServer/requests.http) (VS Code REST Client) or [`DemoServer/curl.sh`](./DemoServer/curl.sh).

#### What to Observe

##### Progress notifications turn one response into a stream

`echo-tool` takes an `IProgress<ProgressNotificationValue>` parameter. The SDK injects it, so it does **not** appear in the tool's input schema, and it forwards `notifications/progress` tagged with the `progressToken` the client put into the request's `_meta`. Without a token every `Report` call is a silent no-op - there would be nothing to correlate the notifications with.

`./DemoServer/curl.sh` calls the tool with `thinkHard: true` and a progress token. `curl -N` disables buffering, so the events arrive one per second and the result last:

```
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache,no-store
X-Accel-Buffering: no

event: message
data: {"method":"notifications/progress","params":{"progressToken":"echo-1","progress":1,"total":3,"message":"Thinking hard... (1/3)"},"jsonrpc":"2.0"}

event: message
data: {"method":"notifications/progress","params":{"progressToken":"echo-1","progress":2,"total":3,"message":"Thinking hard... (2/3)"},"jsonrpc":"2.0"}

event: message
data: {"method":"notifications/progress","params":{"progressToken":"echo-1","progress":3,"total":3,"message":"Thinking hard... (3/3)"},"jsonrpc":"2.0"}

event: message
data: {"result":{"content":[{"type":"text","text":"Echo: Hello World!"}],"resultType":"complete","_meta":{"io.modelcontextprotocol/serverInfo":{"name":"demo-mcp-server","version":"1.0.0"}}},"id":1,"jsonrpc":"2.0"}
```

The result is simply the last event on the stream. `X-Accel-Buffering: no` asks reverse proxies not to buffer the response, which would defeat the whole exercise.

##### JSON vs. SSE

The TypeScript SDK answers a call that emits nothing before its result with a plain `application/json` body and only *upgrades* to SSE when a notification appears. **The C# SDK does not**: it answers every POST with `Content-Type: text/event-stream`, even `server/discover` and a `tools/call` with `thinkHard: false`. Those responses are simply a stream with exactly one event:

```
HTTP/1.1 200 OK
Content-Type: text/event-stream

event: message
data: {"result":{"content":[{"type":"text","text":"Echo: Hello World!"}],"resultType":"complete","_meta":{"io.modelcontextprotocol/serverInfo":{"name":"demo-mcp-server","version":"1.0.0"}}},"id":3,"jsonrpc":"2.0"}
```

Worth pointing out in a training: the wire format of a *response* is a transport detail, the JSON-RPC message inside it is not. A client must handle both shapes.

##### No sessions

There is no `initialize`, no `Mcp-Session-Id`, no state on the server between two requests. Every request carries everything the server needs in its `_meta` envelope:

```json
"_meta": {
  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
  "io.modelcontextprotocol/clientInfo": { "name": "REST Client", "version": "1.0.0" },
  "io.modelcontextprotocol/clientCapabilities": {}
}
```

`server/discover` replaces the handshake and names the versions the server speaks:

```json
{"result":{"supportedVersions":["2026-07-28"],"capabilities":{"logging":{},"tools":{}},"ttlMs":0,"cacheScope":"private","resultType":"complete","_meta":{"io.modelcontextprotocol/serverInfo":{"name":"demo-mcp-server","version":"1.0.0"}}},"id":1,"jsonrpc":"2.0"}
```

Consequences worth pointing out:

- Every result carries `resultType: "complete"` and `_meta["io.modelcontextprotocol/serverInfo"]`.
- List results carry the cache hints `ttlMs` and `cacheScope`. The C# SDK defaults to `ttlMs: 0` / `cacheScope: "private"`, i.e. "do not cache" - set them explicitly if a server's tool list is stable.
- The server can be restarted mid-demo without any client noticing.

##### 405 on GET and DELETE

```bash
curl -i http://localhost:5147/mcp
```

```
HTTP/1.1 405 Method Not Allowed
Content-Length: 0
Allow: POST
```

`GET` used to open the standalone SSE stream and `DELETE` used to terminate a session. Both concepts are gone; only `POST` remains.

##### Headers must agree with the body

`Mcp-Method` is required on every request, `Mcp-Name` additionally on `tools/call`, `resources/read` and `prompts/get`. They exist so that gateways can route and authorize a request without parsing the JSON body - which only works if header and body cannot disagree:

```
HTTP/1.1 400 Bad Request
Content-Type: application/json; charset=utf-8

{"error":{"code":-32020,"message":"Header mismatch: Mcp-Method header value 'tools/list' does not match body value 'tools/call'."},"id":6,"jsonrpc":"2.0"}
```

An unsupported protocol version gets its own error, including the list of versions the server does speak. Note that this one comes back with HTTP **200** and the error inside the SSE stream - the request was well-formed enough to reach the JSON-RPC layer:

```
HTTP/1.1 200 OK
Content-Type: text/event-stream

event: message
data: {"error":{"code":-32022,"message":"Protocol version '2025-06-18' requires the initialize handshake and cannot be selected through per-request metadata.","data":{"supported":["2026-07-28"],"requested":"2025-06-18"}},"id":5,"jsonrpc":"2.0"}
```

##### Legacy clients still work

A 2025-era client sends `initialize` and no `_meta` envelope. The SDK recognizes that and serves it from a fresh instance per request (because this server is `Stateless`, no `Mcp-Session-Id` is minted at all):

```json
{"result":{"protocolVersion":"2025-06-18","capabilities":{"logging":{},"tools":{}},"serverInfo":{"name":"demo-mcp-server","version":"1.0.0"}},"id":1,"jsonrpc":"2.0"}
```

Note that `initialize` never negotiates `2026-07-28` - that revision has no handshake. Set `SessionMode = Stateful` to see the opposite: legacy clients get a real session, modern ones are refused with `-32022`.

### Sample 3: MCP Streamable Server

The winter-password server from day 2, now over HTTP.

```bash
dotnet run --project McpStreamableServer     # http://localhost:5186/mcp
```

**Tools:** `winter_password`, `winter_password_batch`, `winter_password_with_custom_words`
**Prompts:** `make_winter_password`
**Resources:** `winter-characters-text`
**Endpoints:** `/health`, `/mcp`

It also demonstrates OpenTelemetry tracing: every tool wraps its work in an `ActivitySource` span, visible in the Aspire dashboard when started via the AppHost.

#### Asking the user something: MRTR instead of server-initiated elicitation

`winter_password_with_custom_words` wants to know which words the user prefers. On stdio the server would simply push an `elicitation/create` request down the pipe. Over Streamable HTTP on 2026-07-28 there is no channel to push on - the server holds nothing but the HTTP response it is about to write. So the tool throws `InputRequiredException`, which the SDK turns into `resultType: "input_required"` plus the questions it wants answered:

```bash
curl -s -X POST http://localhost:5186/mcp \
  -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  -H 'MCP-Protocol-Version: 2026-07-28' -H 'Mcp-Method: tools/call' -H 'Mcp-Name: winter_password_with_custom_words' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"winter_password_with_custom_words","arguments":{"minLength":24},"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientCapabilities":{"elicitation":{"form":{}}},"io.modelcontextprotocol/clientInfo":{"name":"curl","version":"1.0"}}}}'
```

```json
{"result":{"inputRequests":{"customWords":{"method":"elicitation/create","params":{"mode":"form","message":"Enter your custom winter words (comma-separated), or leave empty to use the built-in ones:","requestedSchema":{"type":"object","properties":{"customWords":{"type":"string","title":"Custom Words","description":"List your custom winter words, separated by commas (e.g., Snowflake, Icicle, Frost, Winter)"}}}}}},"requestState":"awaiting-custom-words","resultType":"input_required","_meta":{"io.modelcontextprotocol/serverInfo":{"name":"McpStreamableServer","version":"1.0.0.0"}}},"id":2,"jsonrpc":"2.0"}
```

The client collects the answer and **retries the same call**, now with `inputResponses` (and the `requestState` echoed back verbatim, plus a fresh request id):

```bash
curl -s -X POST http://localhost:5186/mcp \
  -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  -H 'MCP-Protocol-Version: 2026-07-28' -H 'Mcp-Method: tools/call' -H 'Mcp-Name: winter_password_with_custom_words' \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"winter_password_with_custom_words","arguments":{"minLength":24},"requestState":"awaiting-custom-words","inputResponses":{"customWords":{"action":"accept","content":{"customWords":"Snowflake, Icicle, Frost, Blizzard"}}},"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientCapabilities":{"elicitation":{"form":{}}},"io.modelcontextprotocol/clientInfo":{"name":"curl","version":"1.0"}}}}'
```

```json
{"result":{"content":[{"type":"text","text":"IcicleSnowflakeIcicleFrost"}],"resultType":"complete","_meta":{"io.modelcontextprotocol/serverInfo":{"name":"McpStreamableServer","version":"1.0.0.0"}}},"id":3,"jsonrpc":"2.0"}
```

In the tool handler that is a single, **synchronous** method that simply runs twice:

1. Round 1: `context.Params.InputResponses` is empty, so - guarded by `server.IsMrtrSupported` - it throws `InputRequiredException(inputRequests, requestState)` with one `InputRequest.ForElicitation(...)` under the key `customWords`.
2. Round 2: the answer sits under the same key. `response.Deserialize(InputResponse.ElicitResultJsonTypeInfo)` yields an `ElicitResult`; the content is client-supplied and therefore untrusted, so a declined, cancelled or empty answer simply falls back to the built-in words instead of failing the call.
3. If `IsMrtrSupported` is false, the tool degrades gracefully and returns a password from the built-in words. Throwing would be wrong here: a client that cannot be asked anything still deserves a useful answer.

`requestState` is an opaque blob the client must echo back untouched. A real stateless server puts everything it needs to resume in there; one round trip needs nothing more than a marker.

The same handler serves 2025-era clients: because this server runs in `StatefulForInitializeClients` mode, the SDK converts the very same `InputRequiredException` into a pushed `elicitation/create` request on the open connection, waits for the answer and re-runs the handler in-process. One handler, both eras. A legacy `initialize` therefore does get a session id here, unlike on the DemoServer:

```bash
curl -s -i -X POST http://localhost:5186/mcp -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{"elicitation":{}},"clientInfo":{"name":"curl","version":"1.0"}}}'
```

```
HTTP/1.1 200 OK
Mcp-Session-Id: IZjNJG9g-XVTW6y6pRUvYA

event: message
data: {"result":{"protocolVersion":"2025-11-25","capabilities":{"logging":{},"prompts":{"listChanged":true},"resources":{"listChanged":true},"tools":{"listChanged":true}},"serverInfo":{"name":"McpStreamableServer","version":"1.0.0.0"}},"id":1,"jsonrpc":"2.0"}
```

A modern request to the same endpoint gets **no** `Mcp-Session-Id` back - that is the "hybrid" in hybrid mode.

The old `server.ElicitAsync(...)` still exists for legacy-only servers, but it throws on a stateless request. Prefer `InputRequiredException`: it is the only variant that works in both eras.

### Sample 4: Service Defaults

A shared library providing the common Aspire services: OpenTelemetry (logging, metrics, tracing), health checks, service discovery and HTTP resilience.

## Testing with VS Code

[`.vscode/mcp.json`](./.vscode/mcp.json) registers both servers as `http` servers. Note the `/mcp` suffix on the URLs - `MapMcp("/mcp")` puts the endpoint on an explicit path.

Start a server first (`dotnet run --project McpStreamableServer`); VS Code does **not** spawn HTTP servers, it only connects to them.

VS Code is still a 2025-era host, so it opens with `initialize`. On McpStreamableServer that gives it a real session, and the elicitation dialog for `winter_password_with_custom_words` still appears - the SDK bridges the MRTR code to a pushed `elicitation/create` for it. Prompts to try:

- `Generate a winter password with minimum length 20`
- `Generate 10 winter passwords with special characters enabled`
- `Generate a winter password using custom words` → the elicitation dialog appears; enter e.g. `Snowflake, Icicle, Frost`

## Testing the MCP servers with pi.dev

[pi](https://pi.dev) is a terminal coding agent. With the [`pi-mcp-adapter`](https://pi.dev/packages/pi-mcp-adapter) extension (`pi install npm:pi-mcp-adapter`) it can use MCP servers, and - like most MCP hosts - it reads them from the standard project file `.mcp.json`.

Both server folders ship one, with the server `"disabled": true` so nothing connects by default:

```json
{
  "settings": { "directTools": true },
  "mcpServers": {
    "winter-sdk-streamable": {
      "url": "http://localhost:5186/mcp",
      "protocolVersion": "auto",
      "disabled": true
    }
  }
}
```

Notes on the settings:

- HTTP servers are configured with a `url`, not a `command` - pi does **not** start them. Run `dotnet run --project DemoServer` / `--project McpStreamableServer` in another terminal first.
- `directTools: true` registers MCP tools as first-class pi tools with their real schemas instead of routing every call through the generic `mcp` proxy tool. On the very first run the adapter has no metadata cache yet, so the model still uses the `mcp` proxy/search tool once to discover tool names.
- `"protocolVersion": "auto"` makes the adapter probe with `server/discover` and talk 2026-07-28. Its default is `legacy`, which would exercise the `initialize` path instead - also a worthwhile thing to show.

### Enabling a server

pi's project override file `.pi/mcp.json` has the highest precedence and only carries the `disabled` flag. It is gitignored. Interactively you would toggle with `/mcp enable <name>` + `/reload`; for a non-interactive run, write it directly (from the folder that holds the `.mcp.json`):

```bash
mkdir -p .pi && echo '{ "mcpServers": { "demo-echo": { "disabled": false } } }' > .pi/mcp.json
```

### Running a prompt

```bash
pi -p --approve --provider openrouter --model z-ai/glm-5.3-flash --thinking off \
  "Use the echo-tool to echo 'Hello MCP' with thinkHard false. Print only the echoed text."
```

`--approve` (trust project-local files such as `.mcp.json` for this run) is **required** in print mode - without it pi silently waits for the interactive trust prompt and never answers. Add `--mode json` to see the tool call and the raw MCP result (`details.mcpResult`), which shows the `_meta["io.modelcontextprotocol/serverInfo"]` envelope that proves the 2026-07-28 era was negotiated.

### Observed results

With `DemoServer` running (`dotnet run --project DemoServer`) and `demo-echo` enabled, `Call echo-tool with message 'hello' and thinkHard true.` returned successfully after ~6 seconds wall time (consistent with the tool's three simulated 1-second progress steps plus request overhead):

```json
{"type":"tool_execution_end","toolName":"mcp","result":{"content":[{"type":"text","text":"Echo: hello"}],"details":{"mode":"call","mcpResult":{"_meta":{"io.modelcontextprotocol/serverInfo":{"name":"demo-mcp-server","version":"1.0.0"}},"content":[{"type":"text","text":"Echo: hello"}]},"server":"demo-echo","tool":"echo-tool"}}}
```

The `_meta["io.modelcontextprotocol/serverInfo"]` envelope is present, confirming the 2026-07-28 era. **Progress was not visible**, though: `notifications/progress` events do not show up anywhere in pi's `--mode json` event stream (no `progress`-typed event exists in it) - the caller simply waits and the result arrives once all three server-side progress steps have run. This is a pi-mcp-adapter/CLI limitation, not a DemoServer bug; the `curl.sh` script below is the way to actually observe the SSE progress events.

With `McpStreamableServer` running (`dotnet run --project McpStreamableServer`) and `winter-sdk-streamable` enabled, `Generate 3 winter passwords with winter_password_batch.` worked the same way, envelope included:

```json
{"type":"tool_execution_end","toolName":"mcp","result":{"content":[{"type":"text","text":"[\"WintermorgenKälte\",\"SchneeflockeSchal\",\"WintermärchenWinterabend\"]"}],"details":{"mode":"call","mcpResult":{"_meta":{"io.modelcontextprotocol/serverInfo":{"name":"McpStreamableServer","version":"1.0.0.0"}}},"server":"winter-sdk-streamable","tool":"winter_password_batch"}}}
```

`winter_password_with_custom_words` (the MRTR tool) is a different story: the prompt `Use winter_password_with_custom_words; when asked for custom words, answer 'Snowflake, Icicle, Frost'.` **failed** in this non-interactive `pi -p` session. The model tried calling the tool with `customWords` supplied directly, then via the low-level `mcpScript` escape hatch, then with no arguments at all - every attempt got the same error back from pi-mcp-adapter itself (not a JSON-RPC error code from the server):

```
MCP server "winter-sdk-streamable" requested input to call tool "winter_password_with_custom_words",
but this session has no handler for "elicitation/create" (input "customWords").
Run this call in an interactive Pi session with elicitation enabled, then retry.
```

The model then gave up gracefully and told the user to either run it interactively or fall back to plain `winter_password`. So: **pi-mcp-adapter does not auto-fulfil MRTR `input_required` requests in `-p`/print mode** - it needs an interactive session with an elicitation handler wired up (`pi --approve` + normal chat). The `McpStreamableServer` log for this run confirms the server side worked correctly throughout (`tools/call` handler completed in 0.7-12 ms for every attempt, no exceptions) - the `InputRequiredException` was thrown and turned into a normal `input_required` tool result each time; the limitation is entirely on the non-interactive pi CLI side. The MRTR round trip (`input_required` → retry with `inputResponses`) is demonstrated instead with the two `curl` calls in the "Asking the user something" section above, and interactively via VS Code (see below).

## Testing with curl

Both servers can be exercised with plain `curl` - see [`DemoServer/requests.http`](./DemoServer/requests.http) for all eight cases and [`DemoServer/curl.sh`](./DemoServer/curl.sh) for the live progress stream. Every modern request needs three things:

1. the `MCP-Protocol-Version: 2026-07-28` header,
2. the `Mcp-Method` header (plus `Mcp-Name` on `tools/call`, `prompts/get`, `resources/read`),
3. the full `params._meta` envelope, including `io.modelcontextprotocol/clientCapabilities`.

## MCP Inspector

The [MCP Inspector](https://github.com/modelcontextprotocol/inspector) can be pointed at a running server to browse tools, prompts and resources interactively:

```bash
dotnet run --project McpStreamableServer
npx @modelcontextprotocol/inspector@latest
```

Then connect to `http://localhost:5186/mcp` with transport type "Streamable HTTP".

## Dependencies

- **.NET 10.0** - the target framework for all projects
- **ModelContextProtocol.AspNetCore 2.2.0** - the MCP C# SDK for ASP.NET Core (spec revision 2026-07-28)
- **Microsoft.Extensions.AI 10.9.0** - AI abstractions for .NET (used by the prompt sample)
- **WinterPasswordLib** - shared library from `day2-dotnet` for password generation
- **.NET Aspire 13.5.3** - orchestration and observability

## Key Concepts Demonstrated

1. **Streamable HTTP**: moving beyond stdio to HTTP-based MCP communication
2. **Statelessness**: no handshake, no session id, `server/discover` instead of `initialize`
3. **Progress notifications**: `IProgress<ProgressNotificationValue>` and the caller's `progressToken` (logging is deprecated by SEP-2577)
4. **MRTR**: asking the user something without a channel to push on
5. **Session modes**: `Stateless` vs. `Stateful` vs. the hybrid `StatefulForInitializeClients`
6. **Protocol headers**: `MCP-Protocol-Version`, `Mcp-Method`, `Mcp-Name`, and the `-32020` / `-32022` errors
7. **.NET Aspire**: orchestration, OpenTelemetry tracing and health checks
8. **Assembly scanning**: automatic discovery of MCP tools, prompts and resources
