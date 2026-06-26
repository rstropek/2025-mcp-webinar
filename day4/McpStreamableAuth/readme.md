# MCP with Streamable HTTP Transport + OAuth 2.0

## Overview

This project takes the day3 Streamable-HTTP pony-password server and adds **OAuth 2.0 authentication** on top. Every request to `/mcp` must carry a valid Bearer token; one tool additionally requires a specific scope. [Scalekit](https://scalekit.com) is the authorization server in this sample, but the patterns (RFC 6750 bearer tokens, RFC 9728 protected resource metadata) are provider-agnostic.

Install once with `npm install`, create a `.env` from the template (see below), then `npm run start:sdk-streamable`. There is no build step required — `tsx` runs the TypeScript sources directly.

## Setup

1. Copy `config.env.template` to `.env` and fill in the values from your Scalekit workspace (environment URL, client ID/secret, resource ID, scopes).
2. In Scalekit, define at least the `ponypwd:generate` custom permission and grant it to a test user/role.
3. `npm install`
4. `npm run start:sdk-streamable`

## Samples

### Sample 1: Authenticated MCP Server (streamable)

`src/server-sdk-streamable.ts` — same tools/prompt/resource as the day3 SDK server, plus:

- `pony_password_advanced` — hybrid generator (ponies + digits + symbols + case variation). Gated by the `ponypwd:generate` OAuth scope via `checkScopes()` in the tool handler (which returns a readable tool-level error instead of a generic JSON-RPC `-32603`).
- `get_token_claims` — diagnostic tool that returns the caller's JWT claims; handy while debugging OAuth integration.

All routes under `/mcp` go through `requiredAuthMiddleware` (Scalekit `validateToken`). `/health` and the OAuth discovery endpoints are public by design.

Start with:

```bash
npm run start:sdk-streamable   # listens on http://127.0.0.1:3000/mcp
npm run inspect:sdk            # in another terminal
```

The Inspector will hit a 401 with a `WWW-Authenticate: Bearer … resource_metadata=…` header on first try; it follows the `resource_metadata` URL to discover Scalekit and walks you through the OAuth flow.

## Architecture

- `src/lib/streamable-http.ts` — Express harness with CORS, session management, OAuth discovery endpoint (`/.well-known/oauth-protected-resource`), and the `requiredAuthMiddleware` hook-up.
- `src/lib/auth-middleware.ts` — validates the `Authorization: Bearer …` header against Scalekit. Attaches `req.token` / `req.tokenClaims` for downstream use.
- `src/lib/auth-context.ts` — `AsyncLocalStorage`-backed per-request context so tool handlers can call `isAuthenticated()`, `getTokenClaims()`, `getScopes()`, `checkScopes(...)`, and `requireScopes(...)` without parameter drilling.
- `src/lib/scalekit-config.ts` — env-var loading and the `WWW-Authenticate` header builder.

## Scripts

| Script | Description |
| --- | --- |
| `start:sdk-streamable` | SDK-based server with auth (port 3000) |
| `inspect:sdk` | MCP Inspector against port 3000 |
| `build` | Type-check and copy `src/data` into `dist/` |
| `check` | Run Biome (lint + format) with autofix |
| `docker:build-push` | Build and push a Docker image (see `build/build.sh`) |
