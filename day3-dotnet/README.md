# Advanced MCP with .NET Aspire - C#/.NET

## Overview

This repository contains samples demonstrating advanced Model Context Protocol (MCP) concepts using C#/.NET with .NET Aspire orchestration. These samples build upon the foundational MCP concepts from day2-dotnet, showcasing HTTP transport, streamable responses, and modern cloud-native application patterns.

Before you can get started with these samples, install the dependencies with `dotnet restore`. Next, build the samples with `dotnet build`. You can start the Aspire app host with `dotnet run --project AppHost` or run individual projects with `dotnet run --project <ProjectName>`.

## Architecture

This solution uses .NET Aspire for orchestration and service management, providing:

- **AppHost**: The Aspire orchestrator that manages the lifecycle of all services
- **ServiceDefaults**: Shared configuration for OpenTelemetry, health checks, and service discovery
- **DemoServer**: A simple HTTP API demonstrating basic MCP tool capabilities
- **McpStreamableServer**: An advanced MCP server showcasing elicitation and streamable responses

## Samples

### Sample 1: Aspire App Host

The `AppHost` project serves as the orchestrator for all services in this solution. It uses .NET Aspire to manage service discovery, health checks, and telemetry across the distributed application.

Run the entire solution with:

```bash
dotnet run --project AppHost
```

This will start both the DemoServer and McpStreamableServer, along with the Aspire dashboard for monitoring.

### Sample 2: Demo Server

A simple HTTP-based MCP server that demonstrates basic MCP tool capabilities with HTTP transport. This server provides an `echo-tool` that echoes back messages and optionally simulates processing time.

**Key Features:**
- HTTP transport with CORS support
- Simple echo tool with optional "think hard" mode
- Health check endpoint at `/ping`

**Endpoints:**
- `/ping` - Health check
- `/mcp` - MCP endpoint (mapped via `app.MapMcp()`)

### Sample 3: MCP Streamable Server

An advanced MCP server that showcases sophisticated features including:

**Tools:**
- `winter_password` - Generates a single winter-themed password
- `winter_password_batch` - Generates multiple passwords with the same options
- `winter_password_with_custom_words` - Uses MCP elicitation to ask the user if they want to provide custom winter words instead of the built-in ones

**Prompts:**
- `make_winter_password` - A pre-built prompt template for generating winter passwords

**Resources:**
- `winter-characters-text` - Exposes the built-in winter words as a resource

**Key Features:**
- HTTP transport with CORS support
- MCP elicitation for interactive user input
- Integration with WinterPasswordLib from day2-dotnet
- Tools, prompts, and resources registered via assembly scanning
- Health check endpoint at `/health`

**Endpoints:**
- `/health` - Health check with detailed status information
- `/mcp` - MCP endpoint

### Sample 4: Service Defaults

A shared library providing common Aspire services including:

- **OpenTelemetry**: Logging, metrics, and distributed tracing
- **Health Checks**: Liveness and readiness probes
- **Service Discovery**: Automatic service resolution
- **HTTP Resilience**: Standard resilience patterns for HTTP clients

This project demonstrates best practices for building observable, resilient cloud-native applications with .NET.

## Running the Samples

### Run the entire Aspire solution:

```bash
dotnet run --project AppHost
```

This will:
1. Start the Aspire dashboard (typically at https://localhost:17239)
2. Launch DemoServer
3. Launch McpStreamableServer
4. Provide centralized logging and telemetry

### Run individual services:

```bash
# Run DemoServer
dotnet run --project DemoServer

# Run McpStreamableServer
dotnet run --project McpStreamableServer
```

## Testing with MCP Client

If using VS Code with the MCP extension, you can configure the servers in `.vscode/mcp.json`. The McpStreamableServer provides advanced capabilities including:

1. **Basic Password Generation**: 
   ```
   Generate a winter password with minimum length 20
   ```

2. **Batch Password Generation**:
   ```
   Generate 10 winter passwords with special characters enabled
   ```

3. **Custom Words (Elicitation)**:
   ```
   Generate a winter password using custom words
   ```
   
   The server will prompt you to:
   - Confirm if you want to use custom words
   - Provide your comma-separated list of custom words

## Dependencies

This solution depends on:

- **.NET 10.0**: The target framework for all projects
- **WinterPasswordLib**: Shared library from day2-dotnet for password generation
- **ModelContextProtocol.AspNetCore**: MCP SDK for ASP.NET Core (v0.4.1-preview.1)
- **Microsoft.Extensions.AI**: AI abstractions for .NET (v10.0.1)
- **.NET Aspire**: Orchestration and observability framework

## Key Concepts Demonstrated

1. **HTTP Transport**: Moving beyond stdio to HTTP-based MCP communication
2. **Elicitation**: Interactive user input during tool execution
3. **.NET Aspire**: Modern cloud-native orchestration and observability
4. **Service Defaults**: Shared configuration for distributed applications
5. **CORS Configuration**: Enabling cross-origin requests for web clients
6. **Health Checks**: Implementing liveness and readiness probes
7. **Assembly Scanning**: Automatic discovery of MCP tools, prompts, and resources
