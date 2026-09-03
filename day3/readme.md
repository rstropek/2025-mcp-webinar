# MCP Webinar - Day 3

Day 3 is about the **Streamable HTTP** transport of the Model Context Protocol (MCP): what changes when an MCP server is a long-running HTTP process instead of a stdio child process. The samples build on `../day2` (same pony-password servers, same protocol revision 2026-07-28, same tooling), so it pays off to know day 2 first.

## Important Links

* News: [Claude Code Skills](https://www.anthropic.com/news/skills)
  * [MCP Builder Skill](https://github.com/anthropics/skills/tree/main/mcp-builder)
  * Skills are _Standard Operating Procedures_ (SOPs) for AI models
* [VSCode MCP Developer Guide](https://code.visualstudio.com/api/extension-guides/ai/mcp)
  * Compare to [Claude Desktop Remote MCP Server Guide](https://support.claude.com/en/articles/11503834-building-custom-connectors-via-remote-mcp-servers)
  * Compare to [ChatGPT Developer Mode](https://platform.openai.com/docs/guides/developer-mode) for full MCP client capabilities ([change developer mode](https://chatgpt.com/#settings/Connectors))
* [MCP specification 2026-07-28: Streamable HTTP](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http)
* [MCP TypeScript SDK v2: serving over HTTP](https://ts.sdk.modelcontextprotocol.io/v2/serving/http)

## Samples

The samples are meant to be shown in this order:

| Folder | What it teaches |
| --- | --- |
| [`SSE`](./SSE/readme.md) | The HTTP basics under Streamable HTTP: long-running requests, chunked streaming responses, and Server-Sent Events (SSE) with data-only events, custom events, and event IDs. No MCP involved. |
| [`DemoServer`](./DemoServer/readme.md) | A minimal MCP server with a single `echo-tool`, built live in trainings. Shows the raw HTTP requests of the protocol, when a response upgrades from JSON to an SSE stream, and how MCP Inspector talks to the server. |
| [`McpStreamable`](./McpStreamable/readme.md) | The day 2 pony-password samples over Streamable HTTP: a raw JSON-RPC server without SDK, an SDK server (tools, prompt, resource, multi round-trip elicitation), an SDK client, and a chat client that lets a language model use the tools. |

Every folder is a separate npm project: run `npm install` there first. The readme in each folder describes how to start and test its samples, including non-interactive test runs with [pi.dev](https://pi.dev).

## Formatting and linting

All day 3 samples share one [Biome](https://biomejs.dev/) configuration in `biome.json` (2-space indentation, double quotes, line width 128, same settings as day 1 and day 2). Install once in this folder with `npm install`, then:

- `npm run lint` — check only
- `npm run lint:fix` — check and auto-fix (`npm run check` does the same)
- `npm run format` — format only
- `npm run ci` — CI-mode check (fails on any finding, no writes)

## LLM access

The chat client in `McpStreamable` and the pi.dev test runs use [OpenRouter](https://openrouter.ai/). Put the API key into `day3/.env` (gitignored):

```
OPENROUTER_API_KEY=sk-or-v1-...
```

## Skills

Prompt used to generate an MCP server with the MCP Builder skill:

```
Use the mcp-builder skill to generate the MCP Server as specified in @AGENTS.md
```
