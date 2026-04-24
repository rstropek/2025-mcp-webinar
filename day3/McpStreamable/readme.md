# MCP with Streamable HTTP Transport

## Overview

This project contains the MCP pony-password samples from day2, reimplemented over the **Streamable HTTP** transport. Each server runs as a long-lived HTTP process instead of a stdio child.

Install once with `npm install`, then start whichever sample you want. There is no build step required — `tsx` runs the TypeScript sources directly.

## Samples

### Sample 1: MCP Server Without SDK (streamable)

`src/server-no-sdk-streamable.ts` — implements just enough of the MCP wire format (initialize / tools/list / tools/call) to serve a single tool over plain HTTP POST. No session management, no SSE. Intentionally bare; for a spec-compliant server see Sample 2.

Start with:

```bash
npm run start:no-sdk-streamable   # listens on http://127.0.0.1:3002/mcp
npm run inspect:no-sdk            # in another terminal
```

### Sample 2: MCP Server With SDK (streamable)

`src/server-sdk-streamable.ts` — same feature set as the day2 SDK server (tools, prompt, resource) plus an elicitation tool (`pony_password_with_preferences`) that asks the client which ponies to exclude. Uses the shared harness in `src/lib/streamable-http.ts` for session management and CORS.

Start with:

```bash
npm run start:sdk-streamable      # listens on http://127.0.0.1:3000/mcp
npm run inspect:sdk               # in another terminal
```

### Sample 3: Streamable MCP Client

`src/client-streamable.ts` — connects to the SDK server on port 3000, lists tools/prompts/resources, and exercises each one.

```bash
npm run start:sdk-streamable      # server must be running first
npm run client:streamable
```

## Scripts

| Script | Description |
| --- | --- |
| `start:sdk-streamable` | SDK-based server (port 3000) |
| `start:no-sdk-streamable` | Raw JSON-RPC server (port 3002) |
| `inspect:sdk` | MCP Inspector against port 3000 |
| `inspect:no-sdk` | MCP Inspector against port 3002 |
| `client:streamable` | Example client against port 3000 |
| `build` | Type-check and copy `src/data` into `dist/` |
| `check` | Run Biome (lint + format) with autofix |
