#!/usr/bin/env bash
#
# Calls `echo-tool` with `thinkHard: true` and a progress token, and prints the
# raw HTTP response as it arrives.
#
# Because the tool emits `notifications/progress` before its result, the server
# answers with an SSE stream. `curl -N` disables curl's output buffering, so the
# three progress events appear one per second and the result arrives last - the
# point of Streamable HTTP, live in the terminal.
#
# Usage: ./curl.sh            (defaults to port 5147, the launchSettings port)
#        PORT=5000 ./curl.sh

set -euo pipefail

PORT="${PORT:-5147}"

# -N: no output buffering (that is what makes the events appear one by one)
# -s: no progress meter (it would interleave with the streamed events)
# -i: show the response headers, so `content-type: text/event-stream` is visible
curl -N -s -i -X POST "http://localhost:${PORT}/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "MCP-Protocol-Version: 2026-07-28" \
  -H "Mcp-Method: tools/call" \
  -H "Mcp-Name: echo-tool" \
  -d '{
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/call",
        "params": {
          "name": "echo-tool",
          "arguments": { "message": "Hello World!", "thinkHard": true },
          "_meta": {
            "progressToken": "echo-1",
            "io.modelcontextprotocol/protocolVersion": "2026-07-28",
            "io.modelcontextprotocol/clientInfo": { "name": "curl.sh", "version": "1.0.0" },
            "io.modelcontextprotocol/clientCapabilities": {}
          }
        }
      }'
