# SSE Basics

A plain Express app (no MCP) that demonstrates HTTP streaming techniques, culminating in Server-Sent Events (SSE). It has no relation to MCP — it is here purely to build intuition for the streaming primitives MCP's Streamable HTTP transport builds on.

## Run it

```bash
npm install
npm start
```

Then open http://localhost:3000 in a browser and click through the demos.

**Tip:** open Chrome DevTools, go to the "Network" tab, select a request, and watch the "EventStream" tab to see the raw messages as they arrive.

## What it demonstrates

- **Long-Running Request (regular)** — `POST /long-running/regular` blocks until the whole result is ready, then sends it in one response. The client can only show a spinner until everything is done.
- **Long-Running Request (streaming)** — `POST /long-running/streaming` writes chunks of plain text to the response as they become available, so the client can render partial output while the request is still open.
- **SSE (Data Only)** — `GET /sse/data-only` sends the `text/event-stream` MIME type and a series of `data: ...` lines, consumed on the client with the `EventSource` API. An empty `data` message signals the end of the stream (needed so `EventSource`'s automatic reconnect logic doesn't kick in).
- **SSE (Custom Events)** — `GET /sse/custom-events` adds an `event: <name>` line before each `data:` line, so the client can register separate listeners per event type (`even`, `odd`, `eom`) instead of a single `onmessage` handler.
- **SSE (Custom Events With ID)** — `GET /sse/custom-events-with-id` adds an `id: <n>` line to each event and reads the `Last-Event-Id` request header, so a client that reconnects after a dropped connection can resume from where it left off instead of restarting the whole stream.

## Formatting and linting

This folder is formatted and linted from the `day3` root with [Biome](https://biomejs.dev/) (config in `../biome.json`): `npx biome check --write SSE` / `npx biome ci SSE`, run from `day3/`.
