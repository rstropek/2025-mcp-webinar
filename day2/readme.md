# Introduction to Model Context Protocol (MCP)

## Overview

This repository contains samples for an introduction to the Model Context Protocol (MCP) using TypeScript.

The samples use MCP TypeScript SDK **v2** (`@modelcontextprotocol/server` and `@modelcontextprotocol/client`, both `2.0.0`). SDK v2 implements MCP spec revision **2026-07-28** ([changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog)) while still serving legacy 2025-era clients (VS Code, pi-mcp-adapter in its default mode) from the very same server code. SDK docs: https://ts.sdk.modelcontextprotocol.io/v2/ (migration guide: https://ts.sdk.modelcontextprotocol.io/v2/migration/upgrade-to-v2). Sample 1 has no SDK dependency and speaks both eras of the wire protocol by hand — it is the best place to see what changed under the hood.

Prerequisites: Node.js 22+ (the SDK itself only requires 20+) and npm.

Before you can get started with these samples, install the dependencies with `npm install`. Next, compile the samples with `npm run build`. You can start the different samples with the `npm run start:<sample-name>` commands (see the `scripts` section in `package.json` for all available samples).

## Formatting and linting

The project uses [Biome](https://biomejs.dev/) for formatting and linting. The config in `biome.json` is the same one as in `day1` (2-space indentation, double quotes, line width 128):

- `npm run lint` — check only
- `npm run lint:fix` — check and auto-fix (`npm run check` does the same)
- `npm run format` — format only
- `npm run ci` — CI-mode check (fails on any finding, no writes)

## Samples

### Sample 1: MCP Server Without SDK

This sample demonstrates how to set up an MCP server without using the MCP SDK. It communicates with the MCP client using raw JSON-RPC messages. **Do not write an MCP server like this in production!** This is just for educational purposes to show how the protocol works under the hood — including the JSON-RPC rules MCP is built on:

- Requests carry an `id` and get a response; notifications carry no `id` and must **never** be answered, not even with an error (the classic example is `notifications/initialized`).
- Error codes matter: `-32700` parse error, `-32601` method not found, and the MCP-specific `-32022` unsupported protocol version.

The server actually speaks **both** MCP eras from the same code:

- **Legacy (2025-11-25 and older), stateful.** The client opens with an `initialize` request, the server answers with a negotiated protocol version, and the client confirms with the `notifications/initialized` notification. Everything after that is a plain request on an already-negotiated connection. This is what VS Code and many other MCP hosts still speak today.
- **Modern (2026-07-28), stateless.** No handshake at all. Every request carries its own protocol version and the client's capabilities in `params._meta["io.modelcontextprotocol/protocolVersion"]`. A new `server/discover` request lets a client probe what the server supports before sending real requests. Results carry `resultType: "complete"` and the server's identity in `result._meta["io.modelcontextprotocol/serverInfo"]`; `tools/list` additionally carries cache hints (`ttlMs`, `cacheScope`) so proxies and clients know how long they may cache the tool list.

The server tells the two eras apart with one rule: if `params._meta` of an incoming request names a protocol version, it's a modern request; if not, it's legacy. A request for a protocol version the server doesn't implement gets the dedicated `-32022` error, with the list of supported versions in `error.data`.

The MCP server can generate passwords by concatenating character names from the TV show _My Little Pony_.

### Sample 2: MCP Server With SDK

The second sample implements the same functionality as the first sample, but this time it uses the MCP SDK. This makes the implementation much simpler and more robust, and — because it uses the SDK — it also automatically speaks both protocol eras. A few things worth pointing out in the code:

- `serveStdio(factory)` is the stdio entry point. It owns the transport, negotiates the era per connection, and invokes the factory once per connection (plus once for a throw-away `server/discover` probe) to build a fresh server instance.
- Input/output schemas are plain Standard Schema objects, e.g. `inputSchema: z.object({...})`.
- `completable` (imported from `@modelcontextprotocol/server`) adds autocompletion to prompt arguments.
- Tools are registered in a fixed order in the source code, because the 2026-07-28 revision asks servers for a deterministic `tools/list` order.
- Tool handlers receive a second argument, the request context `ctx`. Per-request helpers such as sampling, elicitation, logging and the abort signal live on `ctx.mcpReq`.

The sample contains two tools (single and batch password generation), a prompt with argument completion, and a resource.

### Sample 3: Simple MCP Client

This sample shows how to create an MCP client with _stdio_ transport, using `@modelcontextprotocol/client`. It connects with `versionNegotiation: { mode: "auto" }`, which first probes the server with `server/discover` and falls back to the legacy `initialize` handshake if the probe fails. After connecting it prints `client.getProtocolEra()` (`"modern"` or `"legacy"`) and then queries the server for its list of tools — `listTools()` without a cursor auto-aggregates all pages. The client shuts down cleanly with `client.close()`.

Running `npm run start:client` builds and runs the client against Sample 2's server and prints:

```
>>> Negotiated protocol era: modern
>>> List of tools:
Tool: pony_password - Builds a password from My Little Pony character names.
Tool: pony_password_batch - Generates N passwords with the same options.
```

### Sample 4: Chat Client With Runtime Tool Discovery

This sample (`src/chat-client.ts`) is a tiny console chat bot that lets a language model use the tools of the **Sample 2** MCP server (`server-sdk`). It is deliberately written in the same style as the Othello bot in `day1` — same OpenAI SDK, same OpenRouter setup, same streaming tool loop — so that the two can be compared side by side.

**The one decisive difference — and the whole point of MCP:** in `day1` the tool definitions and their implementations were hard-coded in the bot (`functions.ts` plus a `switch` statement). Here nothing about the tools is known at compile time:

1. The bot spawns the MCP server over _stdio_ and connects with `versionNegotiation: { mode: "auto" }` (just like Sample 3).
2. It calls `listTools()` at **runtime** and converts each MCP tool descriptor into a Responses API function tool (`{ type: "function", name, description, parameters: tool.inputSchema, strict: false }`). An MCP `inputSchema` already _is_ a JSON schema, so it can be passed straight through. `strict: false`, because MCP schemas use optional properties and defaults, which strict mode forbids.
3. Every `function_call` the model emits is forwarded to the server with `callTool({ name, arguments })`. The result is returned to the model as a `function_call_output` — the JSON of `structuredContent` if the tool declares an output schema, otherwise the concatenated text content blocks.
4. `client.close()` in a `finally` block tears down the transport and terminates the child process.

Add a tool to `server-sdk.ts` and restart — the chat client picks it up without a single line of change.

Two more things worth pointing out in the code:

- The model runs in a `do … while (requiresFurtherActions)` loop: as long as the model asks for tool calls, another round trip is made.
- OpenRouter's Responses API is **stateless** (no `store`, no `previous_response_id`), so the complete conversation history — messages, reasoning items, function calls and their outputs — is kept client-side and re-sent with every request.

**Prerequisite:** a `.env` file in `day2/` containing an [OpenRouter](https://openrouter.ai/) API key (same as in `day1`):

```
OPENROUTER_API_KEY=sk-or-v1-...
```

The file is gitignored. `npm run start:chat` loads it with node's built-in `--env-file`.

The prompt is passed on the command line and the answer is streamed back token by token, with the tool calls logged in light gray:

```bash
npm run start:chat -- "Create 2 passwords with at least 20 characters and special characters. List them."
```

```
>>> Connected to MCP server (protocol era: modern)
>>> Discovered 2 MCP tool(s): pony_password, pony_password_batch
>>> Calling MCP tool pony_password_batch({"count": 2, "minLength": 20, "special": true})...
>>> MCP tool completed: {"result":["Appl€jackRar!ty$h!mm€r","Mc!nt0$hFlutt€r$hyTr!x!€"]}
>>> Response completed {"input_tokens":645,"output_tokens":121,...}

Here are 2 My Little Pony-style passwords meeting your requirements (≥20 characters with special characters):

1. `Appl€jackRar!ty$h!mm€r`
2. `Mc!nt0$hFlutt€r$hyTr!x!€`
```

Passwords are random, so treat the output above as "shape", not literal output. One run costs a fraction of a US cent.

### Sample 5: Mastra Client (Chat Bot)

This sample (`src/mastra-client.ts`) builds the same tiny console chat bot as Sample 4, but with the [Mastra](https://mastra.ai/) agent framework. Mastra's MCP client (`@mastra/mcp`) connects to the **Sample 2** MCP server (`server-sdk`) over _stdio_, discovers its tools, and hands them to a Mastra `Agent` that lets the language model call them.

The contrast with Sample 4 is the point of this sample: there we wrote the tool loop by hand — converting MCP descriptors into function tools, looping while the model asks for calls, executing each call and appending its result to the conversation. Here the framework does all of that; the entire application code is `tools: await mcp.listTools()` plus one `agent.stream(prompt, { maxSteps: 5 })`.

It uses the same [OpenRouter](https://openrouter.ai/) API key from the same `.env` file as Sample 4 (`OPENROUTER_API_KEY=sk-or-v1-...`, gitignored) and the same model, `z-ai/glm-5.3-flash` (the model used everywhere in day2, including the pi.dev tests below). Mastra's model router takes plain `"<gateway>/<provider>/<model>"` strings, so the model is configured as `"openrouter/z-ai/glm-5.3-flash"` and the key is read from the environment automatically. `npm run start:mastra-client` loads the `.env` file with node's built-in `--env-file`, exactly like `npm run start:chat`.

One protocol detail worth pointing out: Mastra's MCP client speaks the **legacy 2025-era** handshake (`initialize` + `notifications/initialized`), not the modern stateless 2026-07-28 flow used by Samples 3 and 4. It still works against the very same server, because `serveStdio` in `server-sdk.ts` serves both eras from one code base.

The prompt is passed on the command line and the answer is streamed back token by token:

```bash
npm run start:mastra-client -- "Create one 20 character password with special characters"
```

## Testing the MCP servers with pi.dev

[pi](https://pi.dev) is a terminal coding agent. With the [`pi-mcp-adapter`](https://pi.dev/packages/pi-mcp-adapter) extension (`pi install npm:pi-mcp-adapter`) it can use MCP servers, and — like most MCP hosts — it reads them from the standard project file `.mcp.json`. This is a quick, non-interactive way to demonstrate the two servers above end-to-end, live.

`day2/.mcp.json` already defines both servers, both `"disabled": true` so nothing starts by default:

```json
{
  "settings": {
    "directTools": true
  },
  "mcpServers": {
    "pony-no-sdk": {
      "command": "node",
      "args": ["dist/server-no-sdk.js"],
      "protocolVersion": "auto",
      "disabled": true
    },
    "pony-sdk": {
      "command": "node",
      "args": ["dist/server-sdk.js"],
      "protocolVersion": "auto",
      "disabled": true
    }
  }
}
```

Notes on the settings:

- `directTools: true` registers MCP tools as first-class pi tools with their real schemas, instead of routing every call through the generic `mcp` proxy tool. On the very first run the adapter has no metadata cache yet, so the model still uses the `mcp` proxy/search tool once to discover tool names; direct tools show up from the next run on.
- `pony-no-sdk` and `pony-sdk` set `"protocolVersion": "auto"`, so the adapter probes with `server/discover` and talks 2026-07-28 to them. Without it the adapter defaults to `legacy`.

Build the project first (`npm run build`) — the servers run from `dist/`, not from `src/`.

### Enabling a server

pi's project override file `.pi/mcp.json` has the highest precedence and only carries the `disabled` flag. It is gitignored. Interactively you'd toggle servers with `/mcp enable <name>` / `/mcp disable <name>` (which write the same file) followed by `/reload`; for a non-interactive run, write it directly:

```bash
mkdir -p .pi && echo '{ "mcpServers": { "pony-sdk": { "disabled": false } } }' > .pi/mcp.json
```

### Running a prompt non-interactively

pi needs an OpenRouter API key (set it up once with `pi auth` or the `OPENROUTER_API_KEY` environment variable):

```bash
pi -p --approve --provider openrouter --model z-ai/glm-5.3-flash --thinking off "<prompt>"
```

`--approve` (trust project-local files such as `.mcp.json` for this run) is **required** in print mode — without it pi silently waits for the interactive trust prompt and never answers. Add `--mode json` to see every event, including the tool call arguments and the raw MCP result (`details.mcpResult`) — a great way to show trainees the `_meta["io.modelcontextprotocol/serverInfo"]` envelope that proves the 2026-07-28 era was actually negotiated.

### Two test runs

Both were verified with `z-ai/glm-5.3-flash`; each run cost well under one US cent and took 8–20 seconds. Passwords are random, so treat the results below as "shape", not literal output.

1. **pony-no-sdk** — enable `pony-no-sdk`, then:

   > Use the pony_password tool to create one password with at least 24 characters. Print only the password.

   The model calls `pony_password {"minLength": 24}` and prints a password such as `PinkieFluttershyRarityPrincess`. The raw MCP result contains `"_meta":{"io.modelcontextprotocol/serverInfo":{"name":"pony-no-sdk","version":"0.1.0"}}` — proof of the modern era.

2. **pony-sdk** — enable `pony-sdk`, then:

   > Use the pony_password_batch tool to create 3 passwords with at least 20 characters and special character substitution enabled. Print them as a list.

   The model calls `pony_password_batch {"count":3,"minLength":20,"special":true}` and prints a numbered list of three passwords with `o/O→0, i/I→!, e/E→€, s/S→$` substitutions applied. On a first run the model may call the generic `mcp({ search: "pony_password" })` tool once first, before the direct-tool cache is populated. The raw result again carries `structuredContent.result` plus the `serverInfo` `_meta` envelope (modern era).

pi's interactive mode works the same way: run `pi --approve`, then `/mcp` shows server status, `/mcp enable pony-sdk` + `/reload` enables one, and you can chat normally from there.
