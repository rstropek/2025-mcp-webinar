# MCP over Streamable HTTP

## Overview

This folder contains the pony-password samples as **HTTP** servers. They use MCP TypeScript SDK **v2** (`@modelcontextprotocol/server`, `@modelcontextprotocol/client`, `@modelcontextprotocol/express` and `@modelcontextprotocol/node`, all `2.0.0`). SDK v2 implements MCP spec revision **2026-07-28** ([changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog)) while still serving legacy 2025-era clients (VS Code, pi-mcp-adapter in its default mode) from the very same server code. SDK docs: https://ts.sdk.modelcontextprotocol.io/v2/. Sample 1 has no SDK dependency and speaks both eras of the wire protocol by hand — it is the best place to see what changed under the hood.

Prerequisites: Node.js 22+ (the SDK itself only requires 20+) and npm.

Install the dependencies with `npm install` and compile with `npm run build`. The servers can be started directly from the TypeScript sources with `npm run start:sdk` / `npm run start:no-sdk`; the clients run from `dist/` and build themselves (see the `scripts` section in `package.json`).

### What Streamable HTTP changes compared to stdio

Both transports carry exactly the same JSON-RPC messages. What differs is the plumbing around them — and 2026-07-28 removed a lot of that plumbing:

| | stdio | Streamable HTTP (2026-07-28) |
| --- | --- | --- |
| Connection | one long-lived pipe per client | **one POST per JSON-RPC message** to a single endpoint (`/mcp`) |
| Who starts the server | the client spawns it as a child process | the server runs on its own; clients just connect |
| Response shape | one line of JSON per message | `application/json` (one object) or `text/event-stream` when the server emits notifications before the result |
| Request routing | implicit — the pipe belongs to one client | duplicated into headers: `MCP-Protocol-Version`, `Mcp-Method`, and `Mcp-Name` on `tools/call` / `prompts/get` / `resources/read` |
| Sessions | connection *is* the session | **removed** — no `Mcp-Session-Id`, no standalone `GET` SSE stream, no `DELETE`, no `Last-Event-ID` resumability. `GET`/`DELETE` answer `405` |
| Asking the user something | the server pushes an `elicitation/create` request down the pipe | **Multi Round-Trip Request (MRTR)**: the tool answers `resultType: "input_required"` and the client *retries* the call with `inputResponses` |
| Security | the client owns the process | the server MUST validate the `Origin` header and SHOULD bind to `127.0.0.1` |

The header duplication is the interesting part: a proxy or cache can route and cache an MCP request without parsing the JSON body. That only works if header and body agree, so a mismatch is a hard error (`-32020`), never a best guess.

## Formatting and linting

Formatting and linting are configured once for all of `day3` in `day3/biome.json` ([Biome](https://biomejs.dev/): 2-space indentation, double quotes, line width 128). Run it from the `day3` folder:

```bash
npx biome check --write .   # format + lint with autofix
npx biome ci .              # CI mode, fails on any finding
```

## Samples

### Sample 1: MCP Server Without SDK

`src/server-no-sdk-streamable.ts` implements the MCP wire protocol over Streamable HTTP with nothing but Express — raw JSON-RPC, by hand. **Do not write an MCP server like this in production!** This is just for educational purposes to show how the protocol works under the hood — including the JSON-RPC rules MCP is built on:

- Requests carry an `id` and get a response; notifications carry no `id` and must **never** be answered, not even with an error. Over HTTP "no response" is `202 Accepted` with an empty body.
- Error codes matter: `-32601` method not found, and the MCP-specific `-32020` header mismatch and `-32022` unsupported protocol version.

The server speaks **both** MCP eras from the same code:

- **Legacy (2025-11-25 and older), stateful.** The client opens with an `initialize` request, the server answers with a negotiated protocol version, and the client confirms with the `notifications/initialized` notification. This is what VS Code and many other MCP hosts still speak today. The server answers `initialize` statelessly and deliberately never mints an `Mcp-Session-Id` — sessions are optional even on the legacy revision.
- **Modern (2026-07-28), stateless.** No handshake at all. Every request carries its own protocol version and the client's capabilities in `params._meta["io.modelcontextprotocol/protocolVersion"]`. A new `server/discover` request lets a client probe what the server supports before sending real requests. Results carry `resultType: "complete"` and the server's identity in `result._meta["io.modelcontextprotocol/serverInfo"]`; `tools/list` additionally carries cache hints (`ttlMs`, `cacheScope`).

The server tells the two eras apart with one rule: if `params._meta` of an incoming request names a protocol version, it's a modern request; if not, it's legacy. That is exactly the rule the official SDK uses.

Start it (port 3002) and try it with `curl`:

```bash
npm run start:no-sdk
```

A modern `server/discover` — the stateless replacement for `initialize`:

```bash
curl -s -X POST http://127.0.0.1:3002/mcp \
  -H 'Content-Type: application/json' \
  -H 'MCP-Protocol-Version: 2026-07-28' -H 'Mcp-Method: server/discover' \
  -d '{"jsonrpc":"2.0","id":1,"method":"server/discover","params":{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28"}}}'
```

```json
{"jsonrpc":"2.0","id":1,"result":{"resultType":"complete","supportedVersions":["2026-07-28"],"capabilities":{"tools":{}},"instructions":"Generates passwords from My Little Pony character names.","ttlMs":3600000,"cacheScope":"public","_meta":{"io.modelcontextprotocol/serverInfo":{"name":"pony-no-sdk-streamable","version":"0.1.0"}}}}
```

A modern `tools/call` (note `Mcp-Name`, which names the tool for intermediaries):

```bash
curl -s -X POST http://127.0.0.1:3002/mcp \
  -H 'Content-Type: application/json' \
  -H 'MCP-Protocol-Version: 2026-07-28' -H 'Mcp-Method: tools/call' -H 'Mcp-Name: pony_password' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"pony_password","arguments":{"minLength":24,"special":true},"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28"}}}'
```

```json
{"jsonrpc":"2.0","id":2,"result":{"resultType":"complete","content":[{"type":"text","text":"Rar!tyB!gRa!nb0wDa$hAppl€jack"}],"_meta":{"io.modelcontextprotocol/serverInfo":{"name":"pony-no-sdk-streamable","version":"0.1.0"}}}}
```

The very same endpoint answers a legacy `initialize` — no envelope, no `resultType`, no `serverInfo` `_meta`:

```bash
curl -s -X POST http://127.0.0.1:3002/mcp -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"1.0"}}}'
```

```json
{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2025-06-18","serverInfo":{"name":"pony-no-sdk-streamable","version":"0.1.0"},"capabilities":{"tools":{}}}}
```

The error cases are where Streamable HTTP is most visible, because the HTTP status carries meaning next to the JSON-RPC error code:

| Situation | Response |
| --- | --- |
| `MCP-Protocol-Version` header ≠ `_meta` version | `400` + `{"code":-32020,"message":"MCP-Protocol-Version header (2025-11-25) does not match the _meta protocol version (2026-07-28)"}` |
| `Mcp-Method` header missing | `400` + `{"code":-32020,"message":"Mcp-Method header (absent) does not match the JSON-RPC method (tools/list)"}` |
| Protocol version we don't implement | `400` + `{"code":-32022,"message":"Unsupported protocol version: 2027-01-01","data":{"supported":["2026-07-28","2025-11-25","2025-06-18","2025-03-26","2024-11-05"],"requested":"2027-01-01"}}` |
| Unknown method | `404` + `{"code":-32601,"message":"Unsupported method: resources/list"}` |
| Notification (no `id`) | `202 Accepted`, empty body |
| `Origin: https://evil.example.com` | `403 Forbidden` (plain text) |
| `GET /mcp` or `DELETE /mcp` | `405 Method Not Allowed` (plain text) |

The server always answers with a single JSON object. A server that emits notifications while a call runs (progress, for instance) would instead answer `text/event-stream` and write the notifications followed by the final response as SSE events — which is exactly what Sample 2 does automatically.

### Sample 2: MCP Server With SDK

`src/server-sdk-streamable.ts` implements the same functionality plus a prompt, a resource and an elicitation tool, this time with the SDK. It also speaks both protocol eras automatically. A few things worth pointing out in the code:

- `createMcpHandler(factory)` is the HTTP counterpart of `serveStdio(factory)`. It returns a web-standard `{ fetch, close, … }` handler and calls the factory **once per HTTP request** — the modern era is stateless, so there is nothing to keep between requests (which is also what makes such a server horizontally scalable).
- `createMcpExpressApp()` from `@modelcontextprotocol/express` is a normal Express app with `express.json()` and DNS-rebinding protection (`Host` and `Origin` validation against localhost) already wired up. `toNodeHandler(handler)` from `@modelcontextprotocol/node` adapts the web-standard handler to Express's `(req, res)`.
- One route, `app.all("/mcp", …)`: the handler answers every HTTP method itself, including the `405` for `GET`/`DELETE`.
- `legacy: "stateless"` (the default) keeps serving 2025-era clients from the same factory; `legacy: "reject"` would make the endpoint 2026-07-28-only.
- `responseMode: "auto"` (the default) answers with a plain JSON body and upgrades to an SSE stream only when the handler emits something before its result (a progress notification, for example).
- Input/output schemas are plain Standard Schema objects, e.g. `inputSchema: z.object({...})`, and `completable` adds autocompletion to prompt arguments.
- Tools are registered in a fixed order, because the 2026-07-28 revision asks servers for a deterministic `tools/list` order.
- `process.on("SIGINT", …)` calls `handler.close()`, which aborts in-flight exchanges and closes their per-request instances.

```bash
npm run start:sdk   # http://127.0.0.1:3000/mcp
```

Note that the SDK enforces the full `_meta` envelope, so a hand-written modern request must carry `io.modelcontextprotocol/clientCapabilities` too — omitting it is answered with `-32602` and a precise complaint:

```json
{"jsonrpc":"2.0","error":{"code":-32602,"message":"Invalid _meta envelope for protocol revision 2026-07-28: io.modelcontextprotocol/clientCapabilities: missing","data":{"envelope":{"key":"io.modelcontextprotocol/clientCapabilities","problem":"missing"}}},"id":1}
```

#### Asking the user something: MRTR instead of server-initiated elicitation

`pony_password_with_preferences` wants to know which ponies the user dislikes. On stdio the server would simply push an `elicitation/create` request to the client. Over Streamable HTTP on 2026-07-28 there is no channel to push on — the server holds nothing but the HTTP response it is about to write. So the tool answers with `resultType: "input_required"` and the questions it wants answered:

```bash
curl -s -X POST http://127.0.0.1:3000/mcp \
  -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  -H 'MCP-Protocol-Version: 2026-07-28' -H 'Mcp-Method: tools/call' -H 'Mcp-Name: pony_password_with_preferences' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"pony_password_with_preferences","arguments":{"minLength":24},"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientCapabilities":{"elicitation":{"form":{}}},"io.modelcontextprotocol/clientInfo":{"name":"curl","version":"1.0"}}}}'
```

```json
{"result":{"resultType":"input_required","inputRequests":{"excludedPonies":{"method":"elicitation/create","params":{"message":"Which ponies to exclude?","requestedSchema":{"type":"object","properties":{"excludedPonies":{"type":"string","title":"Excluded Ponies","description":"List the names of ponies to exclude, separated by commas."}},"required":["excludedPonies"]},"mode":"form"}}},"_meta":{"io.modelcontextprotocol/serverInfo":{"name":"pony-sdk-streamable","version":"0.1.0"}}},"jsonrpc":"2.0","id":2}
```

The client collects the answer and **retries the same call**, now with `inputResponses` attached (and a fresh request id):

```bash
curl -s -X POST http://127.0.0.1:3000/mcp \
  -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  -H 'MCP-Protocol-Version: 2026-07-28' -H 'Mcp-Method: tools/call' -H 'Mcp-Name: pony_password_with_preferences' \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"pony_password_with_preferences","arguments":{"minLength":24},"inputResponses":{"excludedPonies":{"action":"accept","content":{"excludedPonies":"Rarity, Spike"}}},"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientCapabilities":{"elicitation":{"form":{}}},"io.modelcontextprotocol/clientInfo":{"name":"curl","version":"1.0"}}}}'
```

```json
{"result":{"resultType":"complete","content":[{"type":"text","text":"LunaFluttershyPinkiePrincess"}],"structuredContent":{"result":"LunaFluttershyPinkiePrincess"},"_meta":{"io.modelcontextprotocol/serverInfo":{"name":"pony-sdk-streamable","version":"0.1.0"}}},"jsonrpc":"2.0","id":3}
```

In the tool handler that is a single `async` function that runs twice: `inputResponse(ctx.mcpReq.inputResponses, "excludedPonies")` reports `missing` on the first round (so the handler returns `inputRequired({ inputRequests: { excludedPonies: inputRequired.elicit({...}) } })`), and on the second round `acceptedContent(..., z.object({ excludedPonies: z.string() }))` hands back the validated answer.

The same handler also serves 2025-era clients: for them the SDK's legacy shim converts the `inputRequired(...)` return into a push-based `elicitation/create` request on the open connection, waits for the answer, and re-enters the handler in-process. One handler, both eras.

### Sample 3: Streamable MCP Client

`src/client-streamable.ts` connects with `StreamableHTTPClientTransport` and `versionNegotiation: { mode: "auto" }`, which probes with `server/discover` and falls back to the legacy `initialize` handshake. It advertises `capabilities: { elicitation: { form: {} } }` and registers one `elicitation/create` request handler that answers with a fixed exclusion list — the same handler serves the modern MRTR input requests and legacy pushed elicitation. `inputRequired` auto-fulfilment is on by default, so `callTool()` returns the plain tool result even though two requests went over the wire.

The URL can be overridden on the command line, so the same client can be pointed at both servers.

```bash
npm run start:sdk        # server must already be running (HTTP servers are not spawned by their clients)
npm run start:client
```

```
>>> Connected to http://127.0.0.1:3000/mcp
>>> Negotiated protocol era: modern

>>> List of tools:
Tool: pony_password - Builds a password from My Little Pony character names.
Tool: pony_password_batch - Generates N passwords with the same options.
Tool: pony_password_with_preferences - Builds a password from My Little Pony character names. The user can exclude ponies they dislike.

>>> List of prompts:
Prompt: make-pony-password - Prompt for generating a password from MLP character names

>>> List of resources:
Resource: pony-characters-text (pony://characters.txt) - One name per line from data/ponies.txt (CamelCase, no spaces in last name).

>>> Calling pony_password:
Password generated: B!g$un$€tPr!nc€$$C€l€$t!a

>>> Calling pony_password_batch:
  1. TrixiePrincessLunaDash
  2. PrincessShiningArmor
  3. TrixieStarlightSunset

>>> Calling pony_password_with_preferences (multi round-trip):
>>> [elicitation handler] server asks: "Which ponies to exclude?"
>>> [elicitation handler] answering with: Rarity, Spike
Password generated: Appl€jack$tarl!ghtAppl€jack

>>> Getting the make-pony-password prompt:
  Message 1: Generate a secure password for me from My Little Pony character names.
- Minimum length: 16
- Special-character substitution enabled: true
Substitution rules (if enabled): o/O→0, i/I→!, e/E→€, s/S→$.

>>> Reading the pony://characters.txt resource:
  Pinkie Pie, Rainbow Dash, Twilight Sparkle, ...

>>> Disconnecting...
```

Pointed at the no-SDK server the same client shows what a *partial* server looks like from the client side. Sample 1 only implements `tools/list` and `tools/call` with one tool, so every other step fails — which is why each step in the client is wrapped in a small `try`/`catch`:

```bash
npm run start:no-sdk     # in another terminal
npm run start:client -- http://127.0.0.1:3002/mcp
```

```
>>> Connected to http://127.0.0.1:3002/mcp
>>> Negotiated protocol era: modern

>>> List of tools:
Tool: pony_password - Generates a password from My Little Pony character names.

>>> List of prompts:
Client.listPrompts() called but server does not advertise prompts capability - returning empty list

>>> List of resources:
Client.listResources() called but server does not advertise resources capability - returning empty list

>>> Calling pony_password:
Password generated: $h!n!ngArm0rRar!ty

>>> Calling pony_password_batch:
    not available on this server: Unknown tool

>>> Calling pony_password_with_preferences (multi round-trip):
    not available on this server: Unknown tool

>>> Getting the make-pony-password prompt:
    not available on this server: Error POSTing to endpoint: {"jsonrpc":"2.0","id":4,"error":{"code":-32601,"message":"Unsupported method: prompts/get"}}

>>> Reading the pony://characters.txt resource:
    not available on this server: Error POSTing to endpoint: {"jsonrpc":"2.0","id":5,"error":{"code":-32601,"message":"Unsupported method: resources/read"}}

>>> Disconnecting...
```

Note the two list calls: the client read the server's `capabilities` from the `server/discover` probe, saw that it advertises `tools` only, and returned an empty list instead of sending a request that would just fail.

### Sample 4: Chat Client With Runtime Tool Discovery

`src/chat-client.ts` is a tiny console chat bot that lets a language model use the tools of the **Sample 2** MCP server. Nothing about the tools is known at compile time:

1. The bot connects to the already-running HTTP server with `versionNegotiation: { mode: "auto" }` (just like Sample 3). Unlike a stdio server, an HTTP server is not spawned by its client — several chat clients can share one server process.
2. It calls `listTools()` at **runtime** and converts each MCP tool descriptor into a Responses API function tool (`{ type: "function", name, description, parameters: tool.inputSchema, strict: false }`). An MCP `inputSchema` already _is_ a JSON schema, so it can be passed straight through. `strict: false`, because MCP schemas use optional properties and defaults, which strict mode forbids.
3. Every `function_call` the model emits is forwarded to the server with `callTool({ name, arguments })`. The result is returned to the model as a `function_call_output` — the JSON of `structuredContent` if the tool declares an output schema, otherwise the concatenated text content blocks.
4. `client.close()` in a `finally` block tears down the transport and aborts any in-flight request. The server keeps running.

Add a tool to `server-sdk-streamable.ts` and restart the server — the chat client picks it up without a single line of change.

Two more things worth pointing out in the code:

- The model runs in a `do … while (requiresFurtherActions)` loop: as long as the model asks for tool calls, another round trip is made.
- OpenRouter's Responses API is **stateless** (no `store`, no `previous_response_id`), so the complete conversation history — messages, reasoning items, function calls and their outputs — is kept client-side and re-sent with every request.

**Prerequisite:** a `.env` file in `day3/` (one level above this folder) containing an [OpenRouter](https://openrouter.ai/) API key:

```
OPENROUTER_API_KEY=sk-or-v1-...
```

The file is gitignored. `npm run start:chat` loads it with node's built-in `--env-file=../.env`.

Start the server first, then pass the prompt on the command line; the answer is streamed back token by token, with the tool calls logged in light gray:

```bash
npm run start:sdk
npm run start:chat -- "Create 2 passwords with at least 20 characters and special characters. List them."
```

```
>>> Connected to MCP server (protocol era: modern)
>>> Discovered 3 MCP tool(s): pony_password, pony_password_batch, pony_password_with_preferences
>>> Calling MCP tool pony_password_batch({"count": 2, "minLength": 20, "special": true})...
>>> MCP tool completed: {"result":["Flutt€r$hyRar!tyArm0r","LunaRa!nb0wDa$hAppl€jack"]}
>>> Response completed {"input_tokens":541,"output_tokens":27,"total_tokens":568,"cost":0.000047325,...}

Here are your two passwords:

1. `Flutt€r$hyRar!tyArm0r`
2. `LunaRa!nb0wDa$hAppl€jack`

Both are 20+ characters and include special characters. 🦄
```

Passwords are random, so treat the output above as "shape", not literal output. One run costs a fraction of a US cent.

## Testing the MCP servers with pi.dev

[pi](https://pi.dev) is a terminal coding agent. With the [`pi-mcp-adapter`](https://pi.dev/packages/pi-mcp-adapter) extension (`pi install npm:pi-mcp-adapter`) it can use MCP servers, and — like most MCP hosts — it reads them from the standard project file `.mcp.json`. This is a quick, non-interactive way to demonstrate the two servers above end-to-end, live.

`McpStreamable/.mcp.json` already defines both servers, both `"disabled": true` so nothing starts by default:

```json
{
  "settings": {
    "directTools": true
  },
  "mcpServers": {
    "pony-sdk-streamable": {
      "url": "http://127.0.0.1:3000/mcp",
      "protocolVersion": "auto",
      "disabled": true
    },
    "pony-no-sdk-streamable": {
      "url": "http://127.0.0.1:3002/mcp",
      "protocolVersion": "auto",
      "disabled": true
    }
  }
}
```

Notes on the settings:

- HTTP servers are configured with a `url`, not a `command` — pi does **not** start them. Run `npm run start:sdk` / `npm run start:no-sdk` in another terminal first, otherwise the adapter finds nothing to connect to.
- `directTools: true` registers MCP tools as first-class pi tools with their real schemas, instead of routing every call through the generic `mcp` proxy tool. On the very first run the adapter has no metadata cache yet, so the model still uses the `mcp` proxy/search tool once to discover tool names; direct tools show up from the next run on.
- `"protocolVersion": "auto"` makes the adapter probe with `server/discover` and talk 2026-07-28. Without it the adapter defaults to `legacy`.

### Enabling a server

pi's project override file `.pi/mcp.json` has the highest precedence and only carries the `disabled` flag. It is gitignored. Interactively you'd toggle servers with `/mcp enable <name>` / `/mcp disable <name>` (which write the same file) followed by `/reload`; for a non-interactive run, write it directly:

```bash
mkdir -p .pi && echo '{ "mcpServers": { "pony-sdk-streamable": { "disabled": false } } }' > .pi/mcp.json
```

### Running a prompt non-interactively

pi needs an OpenRouter API key (set it up once with `pi auth` or the `OPENROUTER_API_KEY` environment variable):

```bash
pi -p --approve --provider openrouter --model z-ai/glm-5.3-flash --thinking off "<prompt>"
```

`--approve` (trust project-local files such as `.mcp.json` for this run) is **required** in print mode — without it pi silently waits for the interactive trust prompt and never answers. Add `--mode json` to see every event, including the tool call arguments and the raw MCP result (`details.mcpResult`) — a great way to show trainees the `_meta["io.modelcontextprotocol/serverInfo"]` envelope that proves the 2026-07-28 era was actually negotiated.

### Two test runs

Both were verified with `z-ai/glm-5.3-flash`; each run cost well under one US cent and took 10–20 seconds. Passwords are random, so treat the results below as "shape", not literal output.

1. **pony-no-sdk-streamable** — start the server, enable `pony-no-sdk-streamable`, then:

   > Use the pony_password tool to create one password with at least 24 characters. Print only the password.

   The model first tried the bare name `pony_password`, got `Tool "pony_password" not found. … Did you mean: pony-no-sdk-streamable_pony_password`, and retried with the qualified name:

   ```json
   {"toolName":"mcp","args":{"tool":"pony-no-sdk-streamable_pony_password","args":"{\"minLength\": 24}"}}
   {"mcpResult":{"_meta":{"io.modelcontextprotocol/serverInfo":{"name":"pony-no-sdk-streamable","version":"0.1.0"}},
                 "content":[{"type":"text","text":"ApplejackRainbowTrixieTwilight"}]}}
   ```

   The `serverInfo` `_meta` envelope is the proof that the hand-written server was talked to on the modern era.

2. **pony-sdk-streamable** — start the server, enable `pony-sdk-streamable`, then:

   > Use the pony_password_batch tool to create 3 passwords with at least 20 characters and special character substitution enabled. Print them as a list.

   The model called the generic `mcp({ search: "password" })` tool once to discover the three tools, then:

   ```json
   {"toolName":"mcp","args":{"tool":"pony-sdk-streamable_pony_password_batch","args":{"count":3,"minLength":20,"special":true}}}
   {"mcpResult":{"_meta":{"io.modelcontextprotocol/serverInfo":{"name":"pony-sdk-streamable","version":"0.1.0"}},
                 "content":[{"type":"text","text":"1. P!nk!€Gl!mm€r$parkl€\n2. Pr!nc€$$C€l€$t!aFlutt€r$hy\n3. $h!mm€rPr!nc€$$Pr!nc€$$"}],
                 "structuredContent":{"result":["P!nk!€Gl!mm€r$parkl€","Pr!nc€$$C€l€$t!aFlutt€r$hy","$h!mm€rPr!nc€$$Pr!nc€$$"]}}}
   ```

   Next to the `serverInfo` envelope this result also shows `structuredContent`, which the tool's `outputSchema` produces.

pi's interactive mode works the same way: run `pi --approve`, then `/mcp` shows server status, `/mcp enable pony-sdk-streamable` + `/reload` enables one, and you can chat normally from there.

## MCP Inspector

The [MCP Inspector](https://github.com/modelcontextprotocol/inspector) can be pointed at a running server to browse tools, prompts and resources interactively:

```bash
npm run start:sdk       # or npm run start:no-sdk
npm run inspect:sdk     # or npm run inspect:no-sdk
```
