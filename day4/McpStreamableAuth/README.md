# MCP Server with Scalekit OAuth Authentication

A production-ready Model Context Protocol (MCP) server with public tools and optional OAuth 2.1 authentication using Scalekit for advanced features.

## Features

- **Public Tools**: Most tools are available without authentication
- **Authenticated Tools**: Advanced features require authentication and specific permissions
- **Optional Authentication**: Authentication is optional for basic tools but required for advanced features

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

## Available Tools

### Public Tools (No Authentication Required)
- `pony_password` - Generate a single password from My Little Pony character names
- `pony_password_with_preferences` - Generate a password with pony exclusion preferences
- `pony_password_batch` - Generate multiple passwords at once
- `make-pony-password` - Prompt-based password generation
- `pony-characters-text` - Access the pony character list

### Authenticated Tool (Requires Authentication + Permissions)
- `pony_password_advanced` - Advanced hybrid password generation with:
  - Exact length control
  - Mix of ponies, numbers, symbols, and case variations
  - Custom pony selection
  - Toggle numbers, symbols, and uppercase separately
  - Requires `pony:password:write` permission

## Available Commands

### Server Commands
- `npm start` - Start the MCP server
- `npm run build` - Build TypeScript to JavaScript

### Authentication Commands
- `npm run get-token` - Get OAuth access token from Scalekit

### Testing Commands
- `npm run test-token` - Test token validation
- `npm run test-mcp-client` - Run comprehensive MCP client tests
