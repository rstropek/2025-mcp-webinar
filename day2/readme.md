# Introduction to Model Context Protocol (MCP)

## Overview

This repository contains samples for an introduction to the Model Context Protocol (MCP) using TypeScript.

Before you can get started with these samples, install the dependencies with `npm install`. Next, compile the samples with `npm run build`. You can start the different samples with the `npm run start:<sample-name>` commands (see the `scripts` section in `package.json` for all available samples).

## Samples

### Sample 1: MCP Server Without SDK

This sample demonstrates how to set up an MCP server without using the MCP SDK. It communicates with the MCP client using raw JSON-RPC messages. **Do not write an MCP server like this in production!** This is just for educational purposes to show how the protocol works under the hood.

The MCP server can generate passwords by concatenating character names from the TV show _My Little Pony_.

### Sample 2: MCP Server With SDK

The second sample implements the same functionality as the first sample, but this time it uses the MCP SDK. This makes the implementation much simpler and more robust.

The sample contains tools, a prompt, and a resource.

### Sample 3: MCP Server With Sampling

This example introduces the concept of sampling in MCP. The server can generate passwords by sampling characters from _My Little Pony_.

### Sample 4: MCP Server With Sampling and Image Processing

This example shows how to work with content that is not text. It implements an MCP server that uses sampling to verify images. If you want to try this MCP server, perform the following steps:

1. Run the sample web server with `npm run start:testpage`.
2. Enable the `Verify Image` tool in the [MCP configuration](./.vscode/mcp.json).
3. Try the following prompt:

   ```
   Use the playwright mcp server to open http://localhost:3000/ and create a screenshot. Then use the verify-image MCP server to check if the screenshot claims that C# is "awesome".
   ```

### Sample 5: Simple MCP Client

This sample shows how to create an MCP client with _stdio_ transport. It queries the server for the list of tools.

### Sample 6: Mastra Client (Chat Bot)

This sample builds a tiny console chat bot with the [Mastra](https://mastra.ai/) agent framework. A Mastra agent connects to the **Sample 2** MCP server (`server-sdk`) over _stdio_, picks up its tools, and lets a language model call them to fulfil the user's request.

The prompt is passed on the command line and the answer is streamed back token by token:

```bash
npm run start:mastra-client -- "Create one 20 character password with special characters"
```

The agent uses a local [Ollama](https://ollama.com/) server (model `gpt-oss:20b`) through Ollama's OpenAI-compatible endpoint, so no cloud API key is required. Prerequisites:

- Ollama running locally with the model pulled: `ollama pull gpt-oss:20b`
- Override the endpoint with the `OLLAMA_BASE_URL` environment variable if your server does not run on `http://localhost:11434/v1`.
