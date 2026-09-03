# Introduction to Model Context Protocol (MCP) - C#/.NET

## Overview

This repository contains samples for an introduction to the Model Context Protocol (MCP) using C#/.NET.

The samples use the MCP C# SDK **2.2.0** (`ModelContextProtocol` on NuGet). That version implements MCP spec revision **2026-07-28** ([changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog)) while still serving legacy 2025-era clients (VS Code, MCP Inspector) from the very same server code. Sample 1 has no SDK dependency and speaks both eras of the wire protocol by hand — it is the best place to see what changed under the hood.

Prerequisites: .NET 10 SDK. Node.js is only needed for the MCP Inspector.

Before you can get started with these samples, restore the dependencies with `dotnet restore`. Next, build the samples with `dotnet build`. You can start the different samples with `dotnet run --project <ProjectName>`.

> **Always build before running an MCP server from a host.** The stdio configurations in `.mcp.json` use `dotnet run --no-build`, because without it MSBuild writes its own progress output to _stdout_ — straight into the JSON-RPC stream, which corrupts the protocol.

## The two protocol eras (2026-07-28 vs. legacy)

MCP currently has two eras on the wire, and both are alive in the wild:

- **Legacy (2025-11-25 and older), stateful.** The client opens with an `initialize` request, the server answers with a negotiated protocol version, and the client confirms with the `notifications/initialized` notification. Everything after that is a plain request on an already-negotiated connection. This is what VS Code and many other MCP hosts still speak today.
- **Modern (2026-07-28), stateless.** No handshake at all. Every request carries its own protocol version and the client's capabilities in `params._meta["io.modelcontextprotocol/protocolVersion"]`, so the server never has to remember anything between requests. A new `server/discover` request lets a client probe what the server supports before sending real requests. Results carry `resultType: "complete"` and the server's identity in `result._meta["io.modelcontextprotocol/serverInfo"]`; `tools/list` additionally carries cache hints (`ttlMs`, `cacheScope`) so proxies and clients know how long they may cache the tool list.

The rule for telling them apart is simple: if `params._meta` of an incoming request names a protocol version, it's a modern request; if not, it's legacy. That is exactly what the SDK calls the "envelope claim". A request for a protocol version the server doesn't implement gets the dedicated error code `-32022` (`UnsupportedProtocolVersion`), with the list of supported versions in `error.data`.

Both servers in this folder answer both eras. Sample 1 does it by hand; Sample 2 gets it for free from the SDK.

## Why sampling is gone (SEP-2577)

Earlier versions of these samples contained two more servers that demonstrated **sampling** — the server asking the client's language model a question mid-tool-call. Sampling (together with `notifications/message` logging and roots) was **deprecated in the 2026-07-28 revision** ([SEP-2577](https://modelcontextprotocol.io/specification/2026-07-28/changelog)). The reasoning behind the deprecation:

- Server→client requests only work on a stateful connection. The modern era is stateless by design, so the whole mechanism no longer fits the transport model.
- In practice almost no host implemented sampling well, and those that did had no good way to show the user what the server was about to ask the model, or to bill it.
- Anything a server wanted to do with sampling can be done better by returning content and letting the host's own agent loop decide.

The C# SDK still contains the APIs, but they are marked `[Obsolete]` and produce the warnings **MCP9005** (sampling / logging / roots). The samples in this repository build with **zero** MCP9005 warnings — that is a deliberate check.

What replaces the interactive parts of it:

- **Progress instead of logging.** A tool that wants to report intermediate state sends `notifications/progress` with the caller's `progressToken` (see the day 3 samples).
- **MRTR instead of elicitation.** If a tool needs input from the user, it returns `resultType: "input_required"` and the client retries the same `tools/call` with `inputResponses` (see the day 3 samples).

## Samples

### Sample 1: MCP Server Without SDK (`McpServerNoSdk`)

This sample demonstrates how to set up an MCP server without using the MCP SDK. It communicates with the MCP client using raw JSON-RPC 2.0 messages over _stdio_. **Do not write an MCP server like this in production!** This is just for educational purposes to show how the protocol works under the hood — including the JSON-RPC rules MCP is built on:

- Requests carry an `id` and get a response; notifications carry no `id` and must **never** be answered, not even with an error (the classic example is `notifications/initialized`).
- Error codes matter: `-32700` parse error, `-32601` method not found, `-32602` invalid params, and the MCP-specific `-32022` unsupported protocol version.
- A response always has an `id` member. If the request could not even be parsed, the response carries `"id": null`.

The server implements both eras from a single code path (see "The two protocol eras" above): `server/discover` for the modern era, `initialize`/`ping` for the legacy era, and `tools/list`/`tools/call` for both — only the result envelope differs.

The MCP server can generate passwords by concatenating winter-themed words.

You can talk to it straight from the shell — this is the fastest way to show the wire format to an audience:

```bash
dotnet build
echo '{"jsonrpc":"2.0","id":1,"method":"server/discover","params":{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28"}}}' \
  | dotnet run --project McpServerNoSdk --no-build
```

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "resultType": "complete",
    "supportedVersions": ["2026-07-28"],
    "capabilities": { "tools": {} },
    "instructions": "Generates passwords made of winter-themed words.",
    "ttlMs": 3600000,
    "cacheScope": "public",
    "_meta": { "io.modelcontextprotocol/serverInfo": { "name": "winter-no-sdk", "version": "0.1.0" } }
  }
}
```

Claiming a version the server does not implement produces the dedicated error, including the list of versions it does support:

```bash
echo '{"jsonrpc":"2.0","id":4,"method":"tools/list","params":{"_meta":{"io.modelcontextprotocol/protocolVersion":"2025-06-18"}}}' \
  | dotnet run --project McpServerNoSdk --no-build
```

```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "error": {
    "code": -32022,
    "message": "Unsupported protocol version: 2025-06-18",
    "data": {
      "supported": ["2026-07-28", "2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"],
      "requested": "2025-06-18"
    }
  }
}
```

The same `tools/list` **without** the `_meta` envelope is a legacy request and comes back without `resultType`, without `_meta` and without the `ttlMs`/`cacheScope` cache hints.

### Sample 2: MCP Server With SDK (`McpServerSdk`)

The second sample implements the same functionality as the first sample, but this time it uses the MCP C# SDK. This makes the implementation much simpler and more robust, and — because it uses the SDK — it also automatically speaks both protocol eras. A few things worth pointing out in the code:

- `AddMcpServer().WithStdioServerTransport()` plus `WithToolsFromAssembly()` / `WithPromptsFromAssembly()` / `WithResourcesFromAssembly()` is all the wiring there is. Everything else is attribute-based: `[McpServerToolType]` + `[McpServerTool]`, `[McpServerPromptType]` + `[McpServerPrompt]`, `[McpServerResourceType]` + `[McpServerResource]`.
- Tools carry a `Title` (the human-readable label a host shows) and the `ReadOnly = true` annotation, which tells hosts that calling the tool has no side effects — useful for deciding whether a call needs a confirmation prompt.
- `winter_password_batch` returns a `string[]`. That is deliberately **not** declared as structured content: MCP's `structuredContent` must be a JSON object, not an array, so the array is returned as JSON text instead.

The sample contains two tools (`winter_password` for a single password and `winter_password_batch` for several), a prompt, and a resource.

### Sample 3: Simple MCP Client (`McpClient`)

This sample shows how to create an MCP client with _stdio_ transport. It spawns Sample 2's server as a child process and talks to it over the child's stdin/stdout.

The interesting part is protocol negotiation:

- `McpClient.CreateAsync(transport)` **without** `McpClientOptions` prefers the latest revision (2026-07-28). The client probes the server with `server/discover` and, if that fails, transparently falls back to the legacy `initialize` handshake.
- Passing `new McpClientOptions { ProtocolVersion = "2025-11-25" }` pins the version. A pinned version is also a _minimum_: the client refuses to downgrade below it and throws instead of falling back.

The client connects twice — once auto-negotiated, once pinned to the legacy era — to show that the same server code serves both:

```bash
dotnet build
dotnet run --project McpClient --no-build
```

```
>>> Negotiated protocol version: 2026-07-28
>>> Server: McpServerSdk 1.0.0.0

>>> List of tools:
Tool: winter_password_batch - Generates N passwords with the same options.
Tool: winter_password - Generates a password made of winter-themed words.

>>> Testing winter_password tool:
Password generated: W!nt€rh!mm€lFr0$tluft

>>> Testing winter_password_batch tool:
Batch passwords generated:
  1. GlatteisSchneetreiben
  2. WintersonneEisblumeWintertag
  3. EisdeckeMützeWintermantel

>>> Connecting again, pinned to the legacy protocol version:
>>> Negotiated protocol version: 2025-11-25
>>> 2 tool(s): winter_password_batch, winter_password

>>> Done!
```

Passwords are random, so treat the output above as "shape", not literal output.

## Testing the MCP servers with pi.dev

[pi](https://pi.dev) is a terminal coding agent. With the [`pi-mcp-adapter`](https://pi.dev/packages/pi-mcp-adapter) extension (`pi install npm:pi-mcp-adapter`) it can use MCP servers, and — like most MCP hosts — it reads them from the standard project file `.mcp.json`. This is a quick, non-interactive way to demonstrate both servers end-to-end, live.

`day2-dotnet/.mcp.json` already defines both servers, both `"disabled": true` so nothing starts by default:

```json
{
  "settings": {
    "directTools": true
  },
  "mcpServers": {
    "winter-no-sdk": {
      "command": "dotnet",
      "args": ["run", "--project", "McpServerNoSdk", "--no-build"],
      "protocolVersion": "auto",
      "disabled": true
    },
    "winter-sdk": {
      "command": "dotnet",
      "args": ["run", "--project", "McpServerSdk", "--no-build"],
      "protocolVersion": "auto",
      "disabled": true
    }
  }
}
```

Notes on the settings:

- `directTools: true` registers MCP tools as first-class pi tools with their real schemas, instead of routing every call through the generic `mcp` proxy tool. On the very first run the adapter has no metadata cache yet, so the model still uses the `mcp` proxy/search tool once to discover tool names; direct tools show up from the next run on.
- Both servers set `"protocolVersion": "auto"`, so the adapter probes with `server/discover` and talks 2026-07-28 to them. Without it the adapter defaults to `legacy`.
- `--no-build` keeps MSBuild output out of the JSON-RPC stream, so **run `dotnet build` first**.

### Enabling a server

pi's project override file `.pi/mcp.json` has the highest precedence and only carries the `disabled` flag. It is gitignored. Interactively you'd toggle servers with `/mcp enable <name>` / `/mcp disable <name>` (which write the same file) followed by `/reload`; for a non-interactive run, write it directly:

```bash
mkdir -p .pi && echo '{ "mcpServers": { "winter-sdk": { "disabled": false } } }' > .pi/mcp.json
```

### Running a prompt non-interactively

pi needs an OpenRouter API key (set it up once with `pi auth` or the `OPENROUTER_API_KEY` environment variable):

```bash
pi -p --approve --provider openrouter --model z-ai/glm-5.3-flash --thinking off "<prompt>"
```

`--approve` (trust project-local files such as `.mcp.json` for this run) is **required** in print mode — without it pi silently waits for the interactive trust prompt and never answers. Add `--mode json` to see every event, including the tool call arguments and the raw MCP result (`details.mcpResult`) — a great way to show trainees the `_meta["io.modelcontextprotocol/serverInfo"]` envelope that proves the 2026-07-28 era was actually negotiated.

Two prompts worth trying:

1. **winter-sdk** — enable `winter-sdk`, then:

   > Use the winter_password tool to generate a password with minLength 20 and special characters, then show it.

2. **winter-no-sdk** — disable `winter-sdk`, enable `winter-no-sdk`, then:

   > Use the winter_password tool to generate one password with minLength 22.

### Observed results

Both servers were exercised this way end to end (`dotnet build` first, then `.pi/mcp.json` toggling each server, then the two commands above). Sample trimmed output for **winter-sdk** with `--mode json`:

```json
{"type":"tool_execution_end","toolName":"mcp","result":{"content":[{"type":"text","text":"WinternachtSchneeglöckchen"}],"details":{"mode":"call","mcpResult":{"_meta":{"io.modelcontextprotocol/serverInfo":{"name":"McpServerSdk","version":"1.0.0.0"}},"content":[{"type":"text","text":"WinternachtSchneeglöckchen"}]},"server":"winter-sdk","tool":"winter_password"}}}
```

The `_meta["io.modelcontextprotocol/serverInfo"]` envelope is there, confirming the 2026-07-28 era was negotiated. `winter_password_batch` (3 passwords, e.g. `["SchalWinterwindEislandschaft","EislandschaftWintermantel","SchneemannWinterwind"]`) showed the same envelope.

One nuance not obvious up front: `details.mcpResult` (the raw MCP payload with `_meta`) only shows up when the model routes the call through the generic `mcp` proxy tool (`toolName":"mcp"`, args `{tool, args}`), as it did every time in this run — glm-5.3-flash consistently guessed the bare tool name first (`winter_password`), got a `tool_not_found` suggestion back, then retried via the proxy with the prefixed name (`winter-sdk_winter_password`). When the model instead calls a **direct** tool by its prefixed name directly (as it did for `winter-no-sdk_winter_password` in the second test), `details` only carries `{server, tool}` — no raw envelope — because pi already unwrapped it into `content` for the model. `--mode json` is still the right way to *prove* the envelope exists, just be aware it depends on which path the model happened to take that turn.

For **winter-no-sdk**, `pi`'s JSON stream does not surface the server's stderr, so the `<- method (id=…)` trace lines mentioned above weren't visible through pi itself; piping a raw `tools/list` JSON-RPC request into `dotnet run --project McpServerNoSdk --no-build` directly confirmed them:

```
[winter-no-sdk] listening on stdio
[winter-no-sdk] <- tools/list (id=1)
```

pi's interactive mode works the same way: run `pi --approve`, then `/mcp` shows server status, `/mcp enable winter-sdk` + `/reload` enables one, and you can chat normally from there.

## MCP Inspector

The [MCP Inspector](https://github.com/modelcontextprotocol/inspector) is the official debugging UI for MCP servers. The npm scripts start it against the **built** executables:

```bash
dotnet build
npm install
npm run inspector:no-sdk   # Sample 1
npm run inspector:sdk      # Sample 2
```

The Inspector's CLI parses its own arguments, so `dotnet run --project <X>` does not work with it (the `--project` flag is swallowed). Pointing it at the compiled binary avoids that and also keeps MSBuild output out of the JSON-RPC stream.

The same works headlessly, which is handy for scripting and for CI:

```bash
npx @modelcontextprotocol/inspector --cli ./McpServerSdk/bin/Debug/net10.0/McpServerSdk --method tools/list
npx @modelcontextprotocol/inspector --cli ./McpServerSdk/bin/Debug/net10.0/McpServerSdk \
  --method tools/call --tool-name winter_password --tool-arg minLength=24 --tool-arg special=true
```

Note that the Inspector connects with the **legacy** `initialize` handshake. Running it against Sample 1 shows that nicely, because the no-SDK server logs every incoming message to _stderr_:

```
[winter-no-sdk] listening on stdio
[winter-no-sdk] <- initialize (id=0)
[winter-no-sdk] <- notifications/initialized (id=none)
[winter-no-sdk] <- tools/list (id=1)
```

## VS Code

`.vscode/mcp.json` registers both servers for VS Code's own MCP client (Copilot Chat). VS Code speaks the legacy era, which both servers handle. Start them from the gutter icons in that file.
