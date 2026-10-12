# MCP over Streamable HTTP with OAuth 2.1

## Overview

This is the pony-password Streamable-HTTP server from day 3, protected with **OAuth 2.1**. It uses MCP TypeScript SDK **v2** (`@modelcontextprotocol/server`, `@modelcontextprotocol/express` and `@modelcontextprotocol/node`), which implements MCP spec revision **2026-07-28** while still serving legacy 2025-era clients (VS Code and friends) from the very same server code.

Every request to `/mcp` must carry a valid bearer token; one tool additionally requires a specific scope. The authorization server is a local [Keycloak](https://www.keycloak.org/) in Docker (see [`../../keycloak`](../../keycloak/readme.md)), so no cloud account is needed. Nothing in the code is Keycloak-specific: the server validates standard JWT access tokens against whatever issuer it is configured with.

Reference material:

- SDK authorization guide: https://ts.sdk.modelcontextprotocol.io/v2/serving/authorization
- MCP authorization specification (2026-07-28): https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization

Prerequisites: Node.js 22+ (the SDK requires 20+), npm, and Docker for Keycloak.

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

1. Start Keycloak (from the root of the repository; see [`../../keycloak/readme.md`](../../keycloak/readme.md)):

   ```bash
   cd keycloak
   docker compose up -d --wait
   ```

2. Install and start the server:

   ```bash
   npm install
   npm run start:sdk
   ```

No configuration is needed: the defaults match the local Keycloak (issuer `http://localhost:8080/realms/mcp-webinar`, resource `http://localhost:3000/mcp`, scope `ponypwd:generate`). To override them, copy `config.env.template` to `.env`; `start:sdk` loads it if it exists.

### Keycloak configuration

The realm `mcp-webinar` contains everything this server relies on (details in [`../../keycloak/readme.md`](../../keycloak/readme.md)):

- **The MCP server as a resource.** A client with the attribute `resource_url` = `http://localhost:3000/mcp`. With Keycloak's `resource-indicators` feature, a token requested with `resource=http://localhost:3000/mcp` gets exactly that `aud`; an unknown `resource` is refused with `invalid_target`.
- **The scope `ponypwd:generate`.** Optional: a token carries it only when the client asks for it. It is the only scope this server understands, and it is what `scopes_supported` advertises.
- **CIMD client policies** for MCPJam, VS Code and Claude Code, a pre-registered client for the MCP Inspector, and a `client_credentials` client for `curl`.
- **A demo user**, `demo` / `demo`.

### Client registration with CIMD (SEP-991)

The 2026-07-28 revision **deprecates Dynamic Client Registration** (RFC 7591) in favour of **Client ID Metadata Documents**. Instead of POSTing a registration request and receiving a generated `client_id` (plus, often, a secret to store), the client's `client_id` simply *is* an HTTPS URL pointing at a JSON document that describes it — its name, its redirect URIs, and so on. The authorization server fetches that document when it first sees the `client_id`. No registration step, no shared secret, no per-server client record: one document serves every MCP server the client ever talks to.

The spec gives clients this priority order:

1. a pre-registered `client_id` (configured out of band), else
2. **CIMD**, if the authorization server advertises it, else
3. DCR, if a `registration_endpoint` is advertised, else
4. ask the user to supply credentials.

Keycloak advertises support in its authorization server metadata (excerpt):

```bash
curl -s http://localhost:8080/realms/mcp-webinar/.well-known/oauth-authorization-server | jq
```

```json
{
  "issuer": "http://localhost:8080/realms/mcp-webinar",
  "authorization_endpoint": "http://localhost:8080/realms/mcp-webinar/protocol/openid-connect/auth",
  "token_endpoint": "http://localhost:8080/realms/mcp-webinar/protocol/openid-connect/token",
  "registration_endpoint": "http://localhost:8080/realms/mcp-webinar/clients-registrations/openid-connect",
  "jwks_uri": "http://localhost:8080/realms/mcp-webinar/protocol/openid-connect/certs",
  "client_id_metadata_document_supported": true,
  "code_challenge_methods_supported": ["plain", "S256"],
  "authorization_response_iss_parameter_supported": true,
  "scopes_supported": ["openid", "ponypwd:generate", "offline_access", "basic"]
}
```

`client_id_metadata_document_supported: true` is the CIMD flag. Keycloak always lists a `registration_endpoint`, but anonymous DCR is not set up in this realm.

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
| `src/lib/token-verifier.ts` | `OAuthTokenVerifier` — validates the JWT with `jose` against the issuer's signing keys and maps its claims to `AuthInfo` |
| `src/lib/scopes.ts` | `checkScopes(authInfo, ...required)` — the per-tool authorization check |
| `src/lib/auth-config.ts` | Issuer, resource id and scopes (defaults for the local Keycloak, overridable via environment variables) |
| `src/lib/password.ts`, `src/lib/ponies.ts` | The pony-password logic (no MCP, no OAuth) |

How the caller reaches a tool handler:

```
Authorization header
  → requireBearerAuth (@modelcontextprotocol/express)
      → tokenVerifier.verifyAccessToken(token) → AuthInfo
  → req.auth
  → toNodeHandler (@modelcontextprotocol/node)
  → ctx.http.authInfo   ← what a tool handler reads
```

The verifier finds the issuer's signing keys the standard way: it reads `jwks_uri` from `<issuer>/.well-known/openid-configuration` on the first request, and `jose`'s `createRemoteJWKSet` caches the keys. `jwtVerify` then checks signature, expiry, `iss` and `aud`.

`AuthInfo` is deliberately minimal (`token`, `clientId`, `scopes`, `expiresAt`, `resource`, `extra`), so the verifier parks the full claim set in `extra.claims` for `get_token_claims` to return. Two details of the contract matter:

- The verifier must throw `OAuthError(OAuthErrorCode.InvalidToken, …)` on failure. That is what the SDK maps to `401` plus the `WWW-Authenticate` challenge; any other exception becomes an opaque `500`.
- It must populate `expiresAt`. Bearer verification rejects a token without an expiry outright.

`resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(new URL(resourceId))` is what puts the `resource_metadata="…"` parameter into the challenge — the first link in the discovery chain.

Two deliberate departures from a plain local MCP server:

- **No `createMcpExpressApp()`.** Its DNS-rebinding protection validates `Host` and `Origin` against localhost, which is wrong for a publicly deployed server that browser-based MCP clients (MCPJam, the MCP Inspector) call from origins nobody can enumerate. It is also unnecessary here: DNS rebinding lets an attacker's page *reach* the server, but every `/mcp` request still needs a bearer token whose `aud` is bound to this resource, and rebinding yields no such token. A plain `express()` with permissive CORS is used instead — with `WWW-Authenticate` in `exposedHeaders`, without which a browser client never sees the challenge.
- **Bind to all interfaces**, on `process.env.PORT || 3000`, as a deployed server would. That is safe here because the token, not the network, is the boundary.

## Scripts

| Script | Description |
| --- | --- |
| `start:sdk` | Run the server from the TypeScript sources (`tsx`, loads `.env` if it exists), port 3000 |
| `inspect:sdk` | MCP Inspector against `http://localhost:3000/mcp` |
| `inspect:mcpjam` | MCPJam Inspector (local, `http://127.0.0.1:6274`) — see *Testing with MCPJam* |
| `build` | `tsc` + copy `src/data` into `dist/` |
| `check` / `lint` / `ci` | Biome with autofix / report only / CI mode |

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
  "authorization_servers": ["http://localhost:8080/realms/mcp-webinar"],
  "bearer_methods_supported": ["header"],
  "resource": "http://localhost:3000/mcp",
  "resource_documentation": "http://localhost:3000/mcp/docs",
  "scopes_supported": ["ponypwd:generate"]
}
```

`/health` is public too, so a monitor can probe it without a token:

```bash
curl -s http://localhost:3000/health | jq
```

```json
{
  "status": "healthy",
  "timestamp": "2026-10-12T17:14:09.389Z",
  "serverName": "pony-sdk-streamable",
  "serverVersion": "0.1.0",
  "resourceId": "http://localhost:3000/mcp",
  "authServer": "http://localhost:8080/realms/mcp-webinar"
}
```

### Getting a token

Interactively, an MCP client walks the authorization-code + PKCE flow described above (see *MCP Inspector* and *Testing with MCPJam* below). For scripted `curl` testing the realm has a confidential client `mcp-cli` that may use the `client_credentials` grant, so a token is one request away:

```bash
export TOKEN=$(curl -s http://localhost:8080/realms/mcp-webinar/protocol/openid-connect/token \
  -d grant_type=client_credentials -d client_id=mcp-cli -d client_secret=mcp-cli-secret \
  -d scope=ponypwd:generate -d resource=http://localhost:3000/mcp | jq -r .access_token)
```

The token is bound to this server: its `aud` claim is `http://localhost:3000/mcp`, the value of `resource` (RFC 8707). A token minted for another resource is rejected by `jwtVerify` with `401 invalid_token`, which is exactly the audience binding doing its job. Keycloak itself refuses to mint a token for a resource it doesn't know:

```bash
curl -s http://localhost:8080/realms/mcp-webinar/protocol/openid-connect/token \
  -d grant_type=client_credentials -d client_id=mcp-cli -d client_secret=mcp-cli-secret \
  -d resource=http://localhost:9999/mcp
```

```json
{"error":"invalid_target","error_description":"The requested resource is invalid, missing, unknown, or malformed."}
```

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
    "exp": 1791824666,
    "iat": 1791824366,
    "jti": "trrtcc:e473aa44-e2c6-95ac-77c3-f1ea3a30f034",
    "iss": "http://localhost:8080/realms/mcp-webinar",
    "aud": "http://localhost:3000/mcp",
    "sub": "df214b01-9ea0-40f1-95be-b9b004807d0e",
    "typ": "Bearer",
    "azp": "mcp-cli",
    "scope": "ponypwd:generate"
  },
  "isAuthenticated": true
}
```

Three claims are worth a second look: `aud` names this resource (that is what `jwtVerify` checked), `azp` is the client the token was issued to, and `scope` carries the `ponypwd:generate` permission. With MCPJam (see below), `azp` is the CIMD **URL** `https://www.mcpjam.com/.well-known/oauth/client-metadata.json` rather than an opaque registered id, and `sub` is the `demo` user.

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

With a token that does **not** carry the scope (request one without `-d scope=ponypwd:generate`), the request is still perfectly authenticated — and the tool refuses:

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

The Inspector uses the pre-registered public client `mcp-inspector` from the Keycloak realm.

```bash
npm run start:sdk    # in one terminal
npm run inspect:sdk  # in another
```

In the Inspector, open the server's **Settings**:

- **Protocol Era**: *Modern (2026-07-28, sessionless)*. The default *Legacy* uses the 2025 `initialize` handshake.
- **OAuth Settings → Client ID**: `mcp-inspector`. **Scopes**: `ponypwd:generate`.

`inspect:sdk` starts the Inspector with an ad-hoc server, whose settings are read-only. If you can't edit them, run `npx @modelcontextprotocol/inspector` without a URL and add the server (`streamable-http`, `http://localhost:3000/mcp`) with **Add Servers → Add manually**.

Switch the server on. The Inspector hits the `401`, follows `resource_metadata` to discover Keycloak, and redirects to its login page. Sign in as `demo` / `demo`. Back in the Inspector, the server shows *Connected* with *MCP 2026-07-28*, and `get_token_claims` shows `azp` `mcp-inspector` and `scope` `ponypwd:generate offline_access` (the Inspector also asks for a refresh token).

If the Inspector still redirects to a different authorization server, it has cached discovery results for `http://localhost:3000/mcp` from earlier experiments in `~/.mcp-inspector/storage/oauth.json`. *Clear stored OAuth state* in the server settings does not remove that cache; stop the Inspector and delete the server's entry from that file.

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

**Add Server** redirects the browser to the Keycloak login page. Sign in as `demo` / `demo`, and the server shows *Connected* with the version `v0.1.0` it read from `serverInfo`. The log panel on the right lists the whole flow:

1. *Initial MCP Request* — the unauthenticated probe, answered with the `401` and its `WWW-Authenticate` header.
2. *Request Resource Metadata* — `/.well-known/oauth-protected-resource/mcp`. The step is flagged *Resource identifier mismatch* because `http://localhost:3000/mcp` is not `https`, which RFC 9728 requires; a local-development artefact only.
3. *Request Authorization Server Metadata* — Keycloak's metadata document, and MCPJam derives *CIMD support* from `client_id_metadata_document_supported`.
4. *Authorization Server Fetches CIMD* and *Client Credentials Received* — the `Client ID` is the metadata URL. There is no registration call, and no secret. Keycloak accepts it because the realm's `cimd-mcpjam` client policy trusts `www.mcpjam.com`.
5. *Generate PKCE Parameters*, *Authorization Request Ready*, *Authorization Code Received*, *Tokens Received*, *Authenticated MCP Request*.

Reconnecting later reuses the stored tokens; no second login.

### Tools

**Inspect → Tools** lists the four tools. `get_token_claims` returns claims like the ones in the *Testing* section above, except that `azp` is the CIMD URL and `sub` is the `demo` user. `scope` contains `ponypwd:generate` (MCPJam requests the scopes from `scopes_supported`), so `pony_password_advanced` succeeds. Every call is a fresh HTTP request that carries the `Authorization` header again; the server keeps no state between them.

### OAuth Debugger

**Verify → OAuth Debugger** is preconfigured with the server URL, protocol `2026-07-28` and *CIMD (URL-based)*. *Continue* advances one step at a time; each step has a *Guide* explanation, the raw HTTP exchange, and a *Show in diagram* link into the sequence diagram between client, MCP server and authorization server. Step 7 is the authorization server fetching the client metadata document, step 11 the token request with `code_verifier` and `resource=http://localhost:3000/mcp`, and step 12 *Tokens Received* expands to the raw token response with the `access_token` — a user token you can also use as `$TOKEN` for the `curl` examples.
