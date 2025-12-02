# Introduction to Model Context Protocol (MCP) - C#/.NET

## Overview

This repository contains samples for an introduction to the Model Context Protocol (MCP) using C#/.NET.

Before you can get started with these samples, install the dependencies with `dotnet restore`. Next, build the samples with `dotnet build`. You can start the different samples with `dotnet run --project <ProjectName>` or use the npm scripts (see the `scripts` section in `package.json` for all available samples).

## Samples

### Sample 1: MCP Server Without SDK

This sample demonstrates how to set up an MCP server without using the MCP SDK. It communicates with the MCP client using raw JSON-RPC messages. **Do not write MCP server like this in production!** This is just for educational purposes to show how the protocol works under the hood.

The MCP server can generate passwords by concatenating winter-themed words.

### Sample 2: MCP Server With SDK

The second sample implements the same functionality as the first sample, but this time it uses the MCP SDK. This makes the implementation much simpler and more robust.

The sample contains two tools (`winter_password` for single password generation and `winter_password_batch` for generating multiple passwords), a prompt, and a resource.

### Sample 3: MCP Server With Sampling

This example introduces the concept of sampling in MCP. The server can generate passwords by sampling winter-related words from an LLM at runtime.

### Sample 4: MCP Server With Sampling and Image Processing

This example shows how to work with content that is not text. It implements an MCP server that uses sampling to verify images. If you want to try this MCP server, perform the following steps:

1. Run the sample web server with `npm run start:server` (from the `day2-dotnet` folder).
2. Enable the `Verify Image` tool in the [MCP configuration](./.vscode/mcp.json) (if using VS Code).
3. Try the following prompt:

   ```
   Can you please check if #file:image.png contains the phrase ".NET Stammtisch Linz"
   ```

### Sample 5: Simple MCP Client

This sample shows how to create an MCP client with _stdio_ transport. It queries the server for the list of tools and tests both the `winter_password` and `winter_password_batch` tools.
