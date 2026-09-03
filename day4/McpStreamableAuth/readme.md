# MCP over Streamable HTTP with OAuth 2.1

## Overview

This is the pony-password Streamable-HTTP server from day 3, protected with **OAuth 2.1**. It uses MCP TypeScript SDK **v2** (`@modelcontextprotocol/server`, `@modelcontextprotocol/express` and `@modelcontextprotocol/node`, all `2.0.0`), which implements MCP spec revision **2026-07-28** while still serving legacy 2025-era clients (VS Code and friends) from the very same server code.

Every request to `/mcp` must carry a valid bearer token; one tool additionally requires a specific scope. [Scalekit](https://scalekit.com) is the authorization server here, but nothing in the code is Scalekit-specific beyond one file — the patterns are the ones the spec prescribes.

Reference material:

- SDK authorization guide: https://ts.sdk.modelcontextprotocol.io/v2/serving/authorization
- MCP authorization specification (2026-07-28): https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization

Prerequisites: Node.js 22+ (the SDK requires 20+) and npm.

### What this adds on top of day 3

| | day 3 | day 4 |
| --- | --- | --- |
| Access | anyone who can reach the port | `Authorization: Bearer <token>` on every `/mcp` request (RFC 6750) |
| Bind address | `127.0.0.1` only | all interfaces — the token, not the network, is the boundary |
| Discovery | none | RFC 9728 Protected Resource Metadata + a `WWW-Authenticate` challenge that points at it |
| Per-tool rules | none | `pony_password_advanced` requires the `ponypwd:generate` scope |
| Request context | — | tools read the caller via `ctx.http?.authInfo` |

**Authentication vs. authorization** is the lesson of the sample. Authentication ("who is calling?") happens once, in middleware, for the whole endpoint. Authorization ("may this caller do *this*?") is per tool, because different tools need different permissions — gating everything centrally would either lock out the tools that need no permission at all, or force every caller to hold the union of all scopes.

### The discovery flow

A client that knows nothing but the URL bootstraps itself from the `401`:

1. `POST /mcp` without a token → `401` with
   `WWW-Authenticate: Bearer error="invalid_token", …, resource_metadata="http://localhost:3000/.well-known/oauth-protected-resource/mcp"`.
2. The client fetches that URL and reads `authorization_servers` (RFC 9728).
3. It fetches `<auth server>/.well-known/oauth-authorization-server` and finds the authorize, token and registration endpoints (RFC 8414).
4. It identifies itself as a client — see *Client registration with CIMD* below.
5. It runs the authorization-code flow with **PKCE** (`code_challenge_method=S256`), passing `resource=http://localhost:3000/mcp` so the issued token's `aud` claim is bound to this server (RFC 8707). That binding is what stops a token stolen from one MCP server being replayed against another.
6. It retries the original request with `Authorization: Bearer <token>`.

## Setup

1. `npm install`
2. Copy `config.env.template` to `.env` and fill in the values from your Scalekit workspace.
3. `npm run start:sdk`

### Scalekit configuration

In the Scalekit dashboard, under **MCP Servers**:

- **Resource identifier** — the audience of the tokens, and the value of `MCP_RESOURCE_ID`. For the deployed server that is `https://ponypwd.mcp.rstropek.com/mcp`. Locally the server ignores `MCP_RESOURCE_ID` and uses `http://localhost:3000/mcp` instead, so that tokens minted for a local run validate (see `NODE_ENV` below).
- **Permissions** — define the custom permission `ponypwd:generate` and grant it to the role/user you test with. It is the only scope this server understands, and it is what `scopes_supported` advertises.
- **Client ID Metadata Document (CIMD)** — a toggle per MCP server. Switch it on to let clients identify themselves by URL instead of registering.
- **Metadata JSON** — the dashboard shows the RFC 9728 document it expects at the resource. It is exactly what `GET /.well-known/oauth-protected-resource/mcp` returns here; the route is written by hand in `src/lib/streamable-http.ts` so every field is visible in the sample.

### Client registration with CIMD (SEP-991)

The 2026-07-28 revision **deprecates Dynamic Client Registration** (RFC 7591) in favour of **Client ID Metadata Documents**. Instead of POSTing a registration request and receiving a generated `client_id` (plus, often, a secret to store), the client's `client_id` simply *is* an HTTPS URL pointing at a JSON document that describes it — its name, its redirect URIs, and so on. The authorization server fetches that document when it first sees the `client_id`. No registration step, no shared secret, no per-server client record: one document serves every MCP server the client ever talks to.

The spec gives clients this priority order:

1. a pre-registered `client_id` (configured out of band), else
2. **CIMD**, if the authorization server advertises it, else
3. DCR, if a `registration_endpoint` is advertised, else
4. ask the user to supply credentials.

Scalekit advertises support in its authorization server metadata:

```bash
curl -s $SCALEKIT_AUTH_SERVER/.well-known/oauth-authorization-server | jq
```

```json
{
  "issuer": "https://<env>.scalekit.dev/resources/res_...",
  "authorization_endpoint": "https://<env>.scalekit.dev/resources/res_.../oauth/authorize",
  "token_endpoint": "https://<env>.scalekit.dev/resources/res_.../oauth/token",
  "registration_endpoint": "https://<env>.scalekit.dev/api/v1/resources/res_.../clients:register",
  "jwks_uri": "https://<env>.scalekit.dev/keys",
  "client_id_metadata_document_supported": true,
  "code_challenge_methods_supported": ["S256"],
  "grant_types_supported": ["authorization_code", "client_credentials", "refresh_token"],
  "scopes_supported": ["ponypwd:generate"],
  "response_types_supported": ["code"]
}
```

`client_id_metadata_document_supported: true` is the CIMD flag; `registration_endpoint` shows that DCR remains available as the fallback for clients that do not speak CIMD yet.

Note that **the resource server contains no CIMD-specific code**. Client identification is entirely a matter between the client and the authorization server; all this server ever sees is a signed token.

## Formatting and linting

Formatting and linting are configured in `biome.json` ([Biome](https://biomejs.dev/): tab indentation, double quotes).

```bash
npm run check   # format + lint with autofix
npm run lint    # report only
npm run ci      # CI mode, fails on any finding
```

## The sample

`src/server-sdk-streamable.ts` registers four tools, one prompt and one resource — the two password tools, the prompt and the resource from day 3, plus two that exist to show OAuth:

- **`pony_password_advanced`** — a hybrid generator (ponies + digits + symbols + case variation) that requires the `ponypwd:generate` scope. Reaching the handler proves the caller is authenticated; `checkScopes(ctx.http?.authInfo, "ponypwd:generate")` then decides whether they are authorized. A missing scope is returned as a tool-level `{ isError: true }` result naming the scope, not thrown — a thrown error would reach the client as a generic JSON-RPC `-32603 "Internal error"` and tell nobody what to ask for.
- **`get_token_claims`** — returns the caller's JWT claims. Invaluable when an `aud`, `iss` or scope mismatch makes every request 401 for no visible reason.

## Architecture

| File | Role |
| --- | --- |
| `src/server-sdk-streamable.ts` | `buildServer()` factory with all registrations, `createMcpHandler`, `toNodeHandler`, `SIGINT` shutdown |
| `src/lib/streamable-http.ts` | Express harness: CORS, the public metadata and health routes, `requireBearerAuth`, the single `/mcp` route |
| `src/lib/scalekit-verifier.ts` | `OAuthTokenVerifier` — validates the token via Scalekit and maps its claims to `AuthInfo` |
| `src/lib/scopes.ts` | `checkScopes(authInfo, ...required)` — the per-tool authorization check |
| `src/lib/scalekit-config.ts` | Environment variables, the resolved resource id, the Scalekit client |
| `src/lib/password.ts`, `src/lib/ponies.ts` | The pony-password logic (no MCP, no OAuth) |

How the caller reaches a tool handler:

```
Authorization header
  → requireBearerAuth (@modelcontextprotocol/express)
      → scalekitVerifier.verifyAccessToken(token) → AuthInfo
  → req.auth
  → toNodeHandler (@modelcontextprotocol/node)
  → ctx.http.authInfo   ← what a tool handler reads
```

`AuthInfo` is deliberately minimal (`token`, `clientId`, `scopes`, `expiresAt`, `resource`, `extra`), so the verifier parks the full claim set in `extra.claims` for `get_token_claims` to return. Two details of the contract matter:

- The verifier must throw `OAuthError(OAuthErrorCode.InvalidToken, …)` on failure. That is what the SDK maps to `401` plus the `WWW-Authenticate` challenge; any other exception becomes an opaque `500`.
- It must populate `expiresAt`. Bearer verification rejects a token without an expiry outright.

`resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(new URL(resourceId))` is what puts the `resource_metadata="…"` parameter into the challenge — the first link in the discovery chain.

Two deliberate departures from a plain local MCP server:

- **No `createMcpExpressApp()`.** Its DNS-rebinding protection validates `Host` and `Origin` against localhost, which is wrong for a publicly deployed server that browser-based MCP clients (MCPJam, the MCP Inspector) call from origins nobody can enumerate. It is also unnecessary here: DNS rebinding lets an attacker's page *reach* the server, but every `/mcp` request still needs a bearer token whose `aud` is bound to this resource, and rebinding yields no such token. A plain `express()` with permissive CORS is used instead — with `WWW-Authenticate` in `exposedHeaders`, without which a browser client never sees the challenge.
- **Bind to all interfaces**, on `process.env.PORT || 3000`, because the container platform reaches the process from outside.

## Scripts

| Script | Description |
| --- | --- |
| `start:sdk` | Run the server from the TypeScript sources (`tsx --env-file=.env`), port 3000 |
| `inspect:sdk` | MCP Inspector against `http://localhost:3000/mcp` |
| `inspect:mcpjam` | MCPJam Inspector (local, `http://127.0.0.1:6274`) — see *Testing with MCPJam* |
| `build` | `tsc` + copy `src/data` into `dist/` |
| `check` / `lint` / `ci` | Biome with autofix / report only / CI mode |
| `docker:build-push` | Build a multi-arch image and roll it out (see `build/build.sh`) |

## Testing

The passwords below are random — treat every one of them as "shape", not literal output.

### Unauthenticated: the 401 challenge

```bash
curl -si -X POST http://localhost:3000/mcp \
  -H 'Content-Type: application/json' \
  -H 'MCP-Protocol-Version: 2026-07-28' -H 'Mcp-Method: server/discover' \
  -d '{"jsonrpc":"2.0","id":1,"method":"server/discover","params":{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28"}}}'
```

```http
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer error="invalid_token", error_description="Missing Authorization header", resource_metadata="http://localhost:3000/.well-known/oauth-protected-resource/mcp"
Access-Control-Expose-Headers: WWW-Authenticate

{"error":"invalid_token","error_description":"Missing Authorization header"}
```

A token the server cannot validate fails the same way, with the reason spelled out:

```bash
curl -si -X POST http://localhost:3000/mcp -H 'Authorization: Bearer garbage' \
  -H 'Content-Type: application/json' \
  -H 'MCP-Protocol-Version: 2026-07-28' -H 'Mcp-Method: server/discover' \
  -d '{"jsonrpc":"2.0","id":1,"method":"server/discover","params":{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28"}}}'
```

```http
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer error="invalid_token", error_description="Token validation failed: Invalid Compact JWS", resource_metadata="http://localhost:3000/.well-known/oauth-protected-resource/mcp"
```

### The metadata the challenge points at

```bash
curl -s http://localhost:3000/.well-known/oauth-protected-resource/mcp | jq
```

```json
{
  "authorization_servers": ["https://<env>.scalekit.dev/resources/res_..."],
  "bearer_methods_supported": ["header"],
  "resource": "http://localhost:3000/mcp",
  "resource_documentation": "http://localhost:3000/mcp/docs",
  "scopes_supported": ["ponypwd:generate"]
}
```

`/health` is public too, so a load balancer can probe it without a token:

```bash
curl -s http://localhost:3000/health | jq
```

```json
{
  "status": "healthy",
  "timestamp": "2026-09-03T10:29:48.869Z",
  "serverName": "pony-sdk-streamable",
  "serverVersion": "0.1.0",
  "resourceId": "http://localhost:3000/mcp",
  "authServer": "https://<env>.scalekit.dev/resources/res_..."
}
```

### Getting a token

Interactively, an MCP client walks the authorization-code + PKCE flow described above. For scripted `curl` testing you need the access token such a client obtained. The easiest source is the **OAuth Debugger** of MCPJam (see *Testing with MCPJam* below): run the flow against `http://localhost:3000/mcp`, expand step 12 *Tokens Received*, and copy `access_token` from the response body:

```bash
export TOKEN=eyJhbGciOiJSUzI1NiIs...
```

The token is bound to this server: its `aud` claim contains `http://localhost:3000/mcp` because the client sent `resource=http://localhost:3000/mcp` in the token request (RFC 8707). A token minted for another resource — the Scalekit environment itself, or the deployed server — is rejected by `validateToken` with `401 invalid_token`, which is exactly the audience binding doing its job.

The `client_credentials` grant advertised in `grant_types_supported` is not a shortcut here: the resource-scoped token endpoint expects an MCP client identity (a CIMD URL or a registered MCP client), not the environment's API credentials from `.env`.

### Authenticated calls

`server/discover` — the stateless replacement for `initialize`:

```bash
curl -s -X POST http://localhost:3000/mcp -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'MCP-Protocol-Version: 2026-07-28' -H 'Mcp-Method: server/discover' \
  -d '{"jsonrpc":"2.0","id":1,"method":"server/discover","params":{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientCapabilities":{},"io.modelcontextprotocol/clientInfo":{"name":"curl","version":"1.0"}}}}'
```

```json
{"result":{"supportedVersions":["2026-07-28"],"capabilities":{"tools":{"listChanged":true},"completions":{},"prompts":{"listChanged":true},"resources":{"listChanged":true}},"resultType":"complete","ttlMs":0,"cacheScope":"private","_meta":{"io.modelcontextprotocol/serverInfo":{"name":"pony-sdk-streamable","version":"0.1.0"}}},"jsonrpc":"2.0","id":1}
```

The SDK enforces the full `_meta` envelope, so `io.modelcontextprotocol/clientCapabilities` is mandatory even here — omitting it is answered with `-32602` and a precise complaint.

`tools/list` returns the four tools in registration order:

```bash
curl -s -X POST http://localhost:3000/mcp -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'MCP-Protocol-Version: 2026-07-28' -H 'Mcp-Method: tools/list' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientCapabilities":{},"io.modelcontextprotocol/clientInfo":{"name":"curl","version":"1.0"}}}}' \
  | jq '[.result.tools[].name]'
```

```json
["pony_password", "pony_password_batch", "pony_password_advanced", "get_token_claims"]
```

A plain `tools/call` (note `Mcp-Name`, which names the tool for intermediaries):

```bash
curl -s -X POST http://localhost:3000/mcp -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'MCP-Protocol-Version: 2026-07-28' -H 'Mcp-Method: tools/call' -H 'Mcp-Name: pony_password' \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"pony_password","arguments":{"minLength":24,"special":true},"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientCapabilities":{},"io.modelcontextprotocol/clientInfo":{"name":"curl","version":"1.0"}}}}'
```

```json
{"result":{"content":[{"type":"text","text":"Flutt€r$hyAppl€jackDa$hAppl€jack"}],"structuredContent":{"result":"Flutt€r$hyAppl€jackDa$hAppl€jack"},"resultType":"complete","_meta":{"io.modelcontextprotocol/serverInfo":{"name":"pony-sdk-streamable","version":"0.1.0"}}},"jsonrpc":"2.0","id":3}
```

`get_token_claims` shows what the authorization server actually put into the token — including the `aud` that had to match this resource:

```bash
curl -s -X POST http://localhost:3000/mcp -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'MCP-Protocol-Version: 2026-07-28' -H 'Mcp-Method: tools/call' -H 'Mcp-Name: get_token_claims' \
  -d '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"get_token_claims","arguments":{},"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientCapabilities":{},"io.modelcontextprotocol/clientInfo":{"name":"curl","version":"1.0"}}}}' \
  | jq '.result.structuredContent'
```

```json
{
  "claims": {
    "aud": ["http://localhost:3000/mcp", "res_..."],
    "client_id": "https://www.mcpjam.com/.well-known/oauth/client-metadata.json",
    "iss": "https://<env>.scalekit.dev",
    "sub": "usr_...",
    "oid": "org_...",
    "resid": "res_...",
    "roles": ["admin"],
    "scope": "openid offline_access ponypwd:generate email profile",
    "scopes": ["openid", "offline_access", "ponypwd:generate", "email", "profile"],
    "sid": "ses_...",
    "exp": 1788437220,
    "iat": 1788433620,
    "nbf": 1788433620,
    "jti": "tkn_..."
  },
  "isAuthenticated": true
}
```

Three claims are worth a second look: `aud` names this resource (that is what `validateToken` checked), `client_id` is the CIMD **URL** of the client (MCPJam here) rather than an opaque registered id, and `scope` carries the `ponypwd:generate` permission the user was granted in Scalekit.

### Per-tool scope enforcement

`pony_password_advanced` is where authorization bites. With the token from above, which carries `ponypwd:generate`, it behaves like any other tool:

```bash
curl -s -X POST http://localhost:3000/mcp -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'MCP-Protocol-Version: 2026-07-28' -H 'Mcp-Method: tools/call' -H 'Mcp-Name: pony_password_advanced' \
  -d '{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"pony_password_advanced","arguments":{"length":20},"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientCapabilities":{},"io.modelcontextprotocol/clientInfo":{"name":"curl","version":"1.0"}}}}'
```

```json
{"result":{"content":[{"type":"text","text":"PiEPrINcESsLuNaCE82("}],"structuredContent":{"result":"PiEPrINcESsLuNaCE82(","metadata":{"length":20,"includedNumbers":true,"includedSymbols":true,"includedUppercase":true,"composition":["Pie","Princess Luna","numbers","symbol"]}},"resultType":"complete","_meta":{"io.modelcontextprotocol/serverInfo":{"name":"pony-sdk-streamable","version":"0.1.0"}}},"jsonrpc":"2.0","id":5}
```

With a token that does **not** carry the scope (for example a user without the `ponypwd:generate` permission in Scalekit), the request is still perfectly authenticated — and the tool refuses:

```json
{"result":{"content":[{"type":"text","text":"Missing required OAuth scope(s): ponypwd:generate"}],"isError":true,"resultType":"complete","_meta":{"io.modelcontextprotocol/serverInfo":{"name":"pony-sdk-streamable","version":"0.1.0"}}},"jsonrpc":"2.0","id":5}
```

Note the shape: HTTP `200`, a normal JSON-RPC *result*, `isError: true`. The transport did its job; the tool is the one saying no. Compare that with the `401` a missing or invalid token gets from the middleware.

### Legacy clients

`legacy: "stateless"` means the same endpoint still answers a 2025-era `initialize` — no `_meta`, no `resultType`, no `serverInfo` envelope — with the same bearer token requirement:

```bash
curl -s -X POST http://localhost:3000/mcp -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"1.0"}}}'
```

```
event: message
data: {"result":{"protocolVersion":"2025-06-18","capabilities":{"tools":{"listChanged":true},"completions":{},"prompts":{"listChanged":true},"resources":{"listChanged":true}},"serverInfo":{"name":"pony-sdk-streamable","version":"0.1.0"}},"jsonrpc":"2.0","id":1}
```

`GET /mcp` and `DELETE /mcp` answer `405` — the standalone SSE stream and session termination of the 2025 revision are gone.

### MCP Inspector

```bash
npm run start:sdk    # in one terminal
npm run inspect:sdk  # in another
```

The Inspector hits the `401` on its first request, follows `resource_metadata` to discover Scalekit, and walks you through the OAuth flow before showing tools, prompts and resources.

## Testing with MCPJam

[MCPJam](https://www.mcpjam.com/) is an MCP client and inspector with a guided OAuth debugger. The hosted app at `app.mcpjam.com` only connects to **HTTPS** servers, so for the local server run the npm package instead — same UI, and it accepts plain HTTP:

```bash
npm run start:sdk        # in one terminal
npm run inspect:mcpjam   # in another; opens http://127.0.0.1:6274
```

### Connecting with OAuth and CIMD

**Connect → Add Server → Add manually**, then:

- Server name, connection type `HTTP`, URL `http://localhost:3000/mcp`.
- Authentication: `OAuth`. Under *Advanced Settings* set **Registration Strategy** to *Client ID Metadata Documents (CIMD)*. MCPJam shows the document it will identify with: `https://www.mcpjam.com/.well-known/oauth/client-metadata.json`.
- Under *Connection overrides* set **Protocol version** to *Latest (2026-07-28)*.

The first connection attempt stops with "OAuth consent is required … Click Reconnect to continue"; switching the server on redirects the browser to the Scalekit login. Sign in with a user that holds the `ponypwd:generate` permission, approve the consent screen, and the server shows *Connected* with the version `v0.1.0` it read from `serverInfo`. The log panel on the right lists the whole flow, top to bottom:

1. *Initial MCP Request* — the unauthenticated probe, answered with the `401` and its `WWW-Authenticate` header.
2. *Request Resource Metadata* — `/.well-known/oauth-protected-resource/mcp`. The step is flagged *Resource identifier mismatch* because `http://localhost:3000/mcp` is not `https`, which RFC 9728 requires; a local-development artefact only.
3. *Request Authorization Server Metadata* — Scalekit's `oauth-authorization-server` document, and MCPJam derives *CIMD support* from `client_id_metadata_document_supported`.
4. *Authorization Server Fetches CIMD* and *Client Credentials Received* — the `Client ID` is the metadata URL. There is no registration call, and no secret.
5. *Generate PKCE Parameters*, *Authorization Request Ready*, *Authorization Code Received*, *Tokens Received*, *Authenticated MCP Request*.

Reconnecting later reuses the stored tokens; no second login.

### Tools

**Inspect → Tools** lists the four tools. `get_token_claims` returns the claims shown in the *Testing* section above — `client_id` is the CIMD URL, `scope` contains `ponypwd:generate` — and `pony_password_advanced` therefore succeeds. Every call is a fresh HTTP request that carries the `Authorization` header again; the server keeps no state between them.

### OAuth Debugger

**Verify → OAuth Debugger** is preconfigured with the server URL, protocol `2026-07-28` and *CIMD (URL-based)*. *Continue* advances one step at a time; each step has a *Guide* explanation, the raw HTTP exchange, and a *Show in diagram* link into the sequence diagram between client, MCP server and authorization server. Step 7 is the authorization server fetching the client metadata document, step 11 the token request with `code_verifier` and `resource=http://localhost:3000/mcp`, and step 12 *Tokens Received* expands to the raw token response — `access_token`, `refresh_token`, `id_token`, `expires_in` — which is where the `$TOKEN` for the `curl` examples comes from.

## Docker and Azure

```bash
npm run docker:build-push          # patch release
npm run docker:build-push minor    # or major/minor
```

`build/build.sh` bumps the package version, builds a multi-arch (amd64 + arm64) image from the `node:24-alpine` based `Dockerfile`, pushes it, and points the Azure App Service at the new tag.

The container gets its configuration from the App Service application settings, not from a `.env` file — there is no `--env-file` in the image's `CMD`. `NODE_ENV=production` is set in the `Dockerfile`, which is what switches the resource identifier from the local `http://localhost:3000/mcp` to `MCP_RESOURCE_ID`. The server listens on `process.env.PORT` when the platform sets one.
