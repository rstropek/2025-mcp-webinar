# Demo Server

## Overview

This demo MCP server is used to demonstrate fundamentals of the MCP Streamable protocol.

## Storyboard

### Develop Code

1. Develop empty _express_ server with basic routing for people who are new to TypeScript web development.
2. Add simple MCP tool (`echoTool`)
   * In step 1, without logging
   * Speak about _zod_ for schema validation
   * Implement just HTTP POST
   * Add HTTP GET later

### Show Protocol

1. With [_requests.http_](./requests.http) file, show how to interact with the server using raw HTTP requests.
2. With `npm run debug` (MCP Inspector)
3. In inspector, show communication via proxy and direct

### Add Logging

Add logging and `thinkHard` parameter to demonstrate streaming behavior.

## Running the Server

1. Manual:
   * Start `npm run debug`
   * Initialize using [_requests.http_](./requests.http)
   * Run curl for GET request with [_curl.sh_](./curl.sh)
3. Using Inspector:
   * Start `npm run debug`
   * Demonstrate in inspector (with direct mode, not proxy)
