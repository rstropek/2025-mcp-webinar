# MCP Server with Scalekit OAuth Authentication

A production-ready Model Context Protocol (MCP) server with OAuth 2.1 authentication using Scalekit.

## Quick Start

```bash
# Install dependencies
npm install

# Configure environment
cp config.env.template .env
# Edit .env with your Scalekit credentials

# Get access token
npm run get-token

# Start server
npm start

# Run tests
npm test
```

## Project Structure

- `src/` - Source code and server implementation
- `tests/` - Comprehensive tests
- `examples/` - Example OAuth client implementations
- `scripts/` - Utility scripts for token management

## Available Commands

### Server Commands
- `npm start` - Start the MCP server
- `npm run build` - Build TypeScript to JavaScript

### Authentication Commands
- `npm run get-token` - Get OAuth access token from Scalekit

### Testing Commands
- `npm run test-token` - Test token validation
- `npm run test-mcp-client` - Run comprehensive MCP client tests

### Example Commands
- `npm run example` - Run example OAuth client
