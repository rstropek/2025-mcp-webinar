# Introduction to Model Context Protocol (MCP)

## Overview

This repository contains samples for an introduction to the Model Context Protocol (MCP) using TypeScript and streamable HTTP transports.

Before you can get started with these samples, install the dependencies with `npm install`. Next, compile the samples with `npm run build`. You can start the different samples with the `npm run start:<sample-name>` commands (see the `scripts` section in `package.json` for all available samples).

## Samples

### Sample 1: MCP Server Without SDK

This sample demonstrates how to set up an MCP server without using the MCP SDK. It communicates with the MCP client using raw jsonRPC messages. **Do not write MCP server like this in production!** This is just for educational purposes to show how the protocol works under the hood.

The MCP server can generate passwords by concatenating character names from the TV show _My Little Pony_.

### Sample 2: MCP Server With SDK

The second sample implements the same functionality as the first sample, but this time it uses the MCP SDK. This makes the implementation much simpler and more robust.

The sample contains tools, a prompt, and a resource.

### Sample 3: MCP Server With Sampling

This example introduces the concept of sampling in MCP. The server can generate passwords by sampling characters from _My Little Pony_.

### Sample 4: MCP Server With Sampling and Image Processing

This example shows how to work with content that is not text. It implements an MCP server that uses sampling to verify images. If you want to try this MCP server, perform the following steps:

1. Run the sample web server with `npm run start:server`.
2. Enable the `Verify Image` tool in the [MCP configuration](./.vscode/mcp.json).
3. Try the following prompt:

   ```
   Use the playwright mcp server to open http://localhost:3000/ and create a screenshot. Then use the verify-image MCP server to check if the screenshot claims that C# is "awesome".
   ```

### Sample 5: Streamable HTTP Servers

All servers now have streamable HTTP versions that can be deployed as web services instead of local processes. These implementations provide session management, automatic transport cleanup, and health monitoring capabilities.

**Available Streamable Servers:**
- `npm run start:sdk-streamable` (Port 3000)
- `npm run start:sampling-streamable` (Port 3001)  
- `npm run start:no-sdk-streamable` (Port 3002)
- `npm run start:verify-image-streamable` (Port 3003)

**Test with MCP Inspector:**
- `npm run inspect:sdk-streamable`
- `npm run inspect:sampling-streamable`
- `npm run inspect:no-sdk-streamable`
- `npm run inspect:verify-image-streamable`

**Test with Streamable Client (configured for sdk-streamable):**
- `npm run client:streamable`
