# MCP over Streamable HTTP with OAuth 2.1 — C#/.NET

## Overview

This is the winter-password Streamable-HTTP server from [`day3-dotnet`](../day3-dotnet), protected with **OAuth 2.1**. It uses the MCP C# SDK **2.2.0** (`ModelContextProtocol.AspNetCore`), which implements MCP spec revision **2026-07-28** while still serving legacy 2025-era clients (VS Code and friends) from the very same endpoint.

Every request to `/mcp` must carry a valid bearer token; one tool additionally requires a specific scope. [Scalekit](https://scalekit.com) is the authorization server here, but nothing in the code is Scalekit-specific beyond two configuration values — the patterns are the ones the specification prescribes.

This is the .NET twin of [`day4/McpStreamableAuth`](../day4/McpStreamableAuth) (TypeScript). Same tools, same scope, same flow.

Reference material:

- MCP authorization specification (2026-07-28): https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization
- The SDK's own auth sample: [`samples/ProtectedMcpServer`](https://github.com/modelcontextprotocol/csharp-sdk/tree/main/samples/ProtectedMcpServer)

Prerequisites: .NET 10 SDK.

### What this adds on top of day 3

| | day 3 | day 4 |
| --- | --- | --- |
| Access | anyone who can reach the port | `Authorization: Bearer <token>` on every `/mcp` request (RFC 6750) |
| Discovery | none | RFC 9728 Protected Resource Metadata + a `WWW-Authenticate` challenge that points at it |
| Per-tool rules | none | `winter_password_advanced` requires the `ponypwd:generate` scope |
| Request context | — | tools read the caller as a `ClaimsPrincipal` |
| Aspire orchestration | yes | no (a single project, so the auth wiring is the only thing to look at) |
| Elicitation / MRTR | yes (`winter_password_with_custom_words`) | no — that lesson lives in day 3 |

**Authentication vs. authorization** is the lesson of this sample. Authentication ("who is calling?") happens once, in middleware, for the whole endpoint. Authorization ("may this caller do *this*?") is per tool, because different tools need different permissions — gating everything centrally would either lock out the tools that need no permission at all, or force every caller to hold the union of all scopes.

### The discovery flow

A client that knows nothing but the URL bootstraps itself from the `401`:

1. `POST /mcp` without a token → `401` with
   `WWW-Authenticate: Bearer resource_metadata="http://localhost:3000/.well-known/oauth-protected-resource/mcp"`.
2. The client fetches that URL and reads `authorization_servers` (RFC 9728).
3. It fetches `<auth server>/.well-known/oauth-authorization-server` and finds the authorize, token and registration endpoints (RFC 8414).
4. It identifies itself as a client — see *Client registration with CIMD* below.
5. It runs the authorization-code flow with **PKCE** (`code_challenge_method=S256`), passing `resource=http://localhost:3000/mcp` so the issued token's `aud` claim is bound to this server (RFC 8707). That binding is what stops a token stolen from one MCP server being replayed against another.
6. It retries the original request with `Authorization: Bearer <token>`.

## Running

```bash
dotnet run
```

The `http` launch profile sets `ASPNETCORE_URLS=http://localhost:3000`, so the server comes up on port 3000 and prints:

```
MCP server (resource http://localhost:3000/mcp) starting
Protected resource metadata: http://localhost:3000/.well-known/oauth-protected-resource/mcp
Health check: http://localhost:3000/health
```

## Configuration

Two values matter, and both are committed in `appsettings.json` for the webinar's demo tenant:

```json
{
  "Scalekit": {
    "Issuer": "https://<your-env>.scalekit.dev",
    "EnvironmentUrl": "https://<your-env>.scalekit.dev/resources/res_<your-value>"
  }
}
```

- **`Scalekit:Issuer`** — the OIDC issuer. Used as the JWT bearer `Authority` (which triggers OIDC discovery of the signing keys) and as the expected `iss` claim.
- **`Scalekit:EnvironmentUrl`** — the OAuth authorization server *for this MCP server*. Published in `authorization_servers` of the metadata document.

The third input is `ASPNETCORE_URLS`. The server derives its **resource identifier** from it (`<base URL>/mcp`), and that single string is the `resource` field of the metadata document, the `resource=` parameter clients send at token request time, and the `aud` claim every token must carry. Set them as environment variables in a deployment — see `config.env.template` (ASP.NET Core's `__` section separator, e.g. `Scalekit__Issuer`).

### Scalekit configuration

In the Scalekit dashboard, under **MCP Servers**:

- **Resource identifier** — the audience of the tokens. For a local run that is `http://localhost:3000/mcp`.
- **Permissions** — define the custom permission `ponypwd:generate` and grant it to the role/user you test with. It is the only scope this server understands, and it is what `scopes_supported` advertises.
- **Client ID Metadata Document (CIMD)** — a toggle per MCP server. Switch it on to let clients identify themselves by URL instead of registering.
- **Metadata JSON** — the dashboard shows the RFC 9728 document it expects at the resource. Here it is generated by the SDK from `options.ResourceMetadata`.

### Client registration with CIMD (SEP-991)

The 2026-07-28 revision **deprecates Dynamic Client Registration** (RFC 7591) in favour of **Client ID Metadata Documents**. Instead of POSTing a registration request and receiving a generated `client_id` (plus, often, a secret to store), the client's `client_id` simply *is* an HTTPS URL pointing at a JSON document that describes it — its name, its redirect URIs, and so on. The authorization server fetches that document when it first sees the `client_id`. No registration step, no shared secret, no per-server client record: one document serves every MCP server the client ever talks to.

The spec gives clients this priority order:

1. a pre-registered `client_id` (configured out of band), else
2. **CIMD**, if the authorization server advertises it, else
3. DCR, if a `registration_endpoint` is advertised, else
4. ask the user to supply credentials.

Scalekit advertises support in its authorization server metadata:

```bash
curl -s https://<your-env>.scalekit.dev/resources/res_<your-value>/.well-known/oauth-authorization-server | jq
```

```json
{
  "issuer": "https://<env>.scalekit.dev/resources/res_...",
  "authorization_endpoint": "...oauth/authorize",
  "token_endpoint": "...oauth/token",
  "registration_endpoint": "https://<env>.scalekit.dev/api/v1/resources/res_.../clients:register",
  "jwks_uri": "https://<env>.scalekit.dev/keys",
  "client_id_metadata_document_supported": true,
  "code_challenge_methods_supported": ["S256"],
  "scopes_supported": ["ponypwd:generate"]
}
```

`client_id_metadata_document_supported: true` is the CIMD flag; `registration_endpoint` shows that DCR remains available as the fallback for clients that do not speak CIMD yet.

Note that **the resource server contains no CIMD-specific code**. Client identification is entirely a matter between the client and the authorization server; all this server ever sees is a signed token.

## Key code

### The two authentication schemes

```csharp
builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = McpAuthenticationDefaults.AuthenticationScheme;
})
.AddJwtBearer(options => { /* Authority, TokenValidationParameters, logging events */ })
.AddMcp(options =>
{
    options.ResourceMetadata = new()
    {
        Resource = resourceId,                                   // http://localhost:3000/mcp
        AuthorizationServers = { config["Scalekit:EnvironmentUrl"]! },
        ScopesSupported = ["ponypwd:generate"],
        BearerMethodsSupported = ["header"],
        ResourceDocumentation = "https://github.com/.../day4-dotnet",
    };
});
```

The split of the two default schemes is the whole trick, and it is what the SDK's own `ProtectedMcpServer` sample does as well:

- **Authenticate = JwtBearer** — tokens are validated the standard ASP.NET Core way. `Authority` turns on OIDC discovery, so signing keys are fetched and rotated automatically. `ValidAudience = resourceId` is the RFC 8707 audience binding and the single most important line in the file.
- **Challenge = Mcp** — the 401 is written by `McpAuthenticationHandler`, which emits the `WWW-Authenticate` header *and* serves the RFC 9728 document. No hand-written `OnChallenge` is needed (earlier versions of this sample had one; it is gone).

`options.ResourceMetadataUri` is deliberately left unset. The handler then advertises the RFC 9728 path-mirrored default `/.well-known/oauth-protected-resource/mcp` — the resource path appended *after* the well-known segment. It happens to serve the path-less `/.well-known/oauth-protected-resource` as well, which helps clients that probe the origin root before parsing the challenge.

### Stateless transport

```csharp
builder.Services.AddMcpServer()
    .WithHttpTransport(options => options.SessionMode = HttpServerSessionMode.Stateless)
    .WithToolsFromAssembly()
    .WithPromptsFromAssembly()
    .WithResourcesFromAssembly();

app.MapMcp("/mcp").RequireAuthorization();
```

`Stateless` is the 2026-07-28 default and all this sample needs: there are no server-to-client requests (no sampling, no elicitation), so there is nothing to remember between requests. Every call re-presents its bearer token — which is also what makes the server horizontally scalable, since any replica can answer any request. `GET /mcp` and `DELETE /mcp` (the 2025-era SSE stream and session teardown) are answered with `405`.

Compare with day 3's `McpStreamableServer`, which runs in `StatefulForInitializeClients` mode *because* it needs the SDK's elicitation bridge for legacy clients.

### CORS

```csharp
builder.Services.AddCors(options => options.AddDefaultPolicy(policy => policy
    .AllowAnyOrigin()
    .WithMethods("GET", "POST", "OPTIONS")
    .WithHeaders("Content-Type", "Authorization", "MCP-Protocol-Version", "Mcp-Method", "Mcp-Name")
    .WithExposedHeaders("WWW-Authenticate")));
```

Browser-based MCP clients (MCPJam, the MCP Inspector) call this server from origins nobody can enumerate, so the policy is permissive — which is safe precisely because access is decided by a token, not by the network. Two details:

- `MCP-Protocol-Version`, `Mcp-Method` and `Mcp-Name` are the 2026-07-28 routing headers that duplicate part of the JSON-RPC body so proxies can route without parsing it. Without them in the allow-list the browser's preflight fails. `Mcp-Session-Id` is gone: 2026-07-28 has no sessions.
- `WWW-Authenticate` must be **exposed**, otherwise a browser client never gets to read the challenge that bootstraps discovery.

### Per-tool scope enforcement

`Scopes.cs` is the .NET twin of the TypeScript `src/lib/scopes.ts`:

```csharp
public static CallToolResult? Require(ClaimsPrincipal? user, params string[] required)
```

It reads the `scope` / `scp` / `scopes` claims (space-separated values are split), and returns either `null` or a ready-made error result:

```csharp
var user = context.JsonRpcRequest?.Context?.User;
if (Scopes.Require(user, "ponypwd:generate") is { } scopeError) return scopeError;
```

Two design points worth the comment they carry in the code:

- **The failure is returned, not thrown.** A thrown exception becomes a JSON-RPC `-32603 "An error occurred"` that hides the reason from both the model and the user. A tool-level `isError: true` result names the missing scope.
- **Two shapes for two different "no".** A missing or invalid *token* is an HTTP `401` from the middleware — the transport says no, and the client is expected to start the OAuth flow. A missing *scope* is an HTTP `200` carrying a normal JSON-RPC result with `isError: true` — the tool says no, and no amount of retrying will change that.

### Reading the caller inside a tool

There are two ways, and the sample shows both on purpose:

| Where | How |
| --- | --- |
| `winter_password_advanced` | `RequestContext<CallToolRequestParams>.JsonRpcRequest?.Context?.User` — the transport puts the validated `ClaimsPrincipal` on the JSON-RPC message itself, so the tool needs no HTTP-specific dependency. |
| `get_token_claims` | `IHttpContextAccessor.HttpContext.User` — the classic ASP.NET Core route. Works because the handler runs inside the original HTTP request (and in stateful mode the SDK flows the execution context along with the message). |

Injecting `RequestContext<…>` or `IHttpContextAccessor` as a tool parameter does **not** leak into the tool's input schema — the SDK binds those from the request/DI, and only the remaining parameters become JSON-schema properties. Verified against `tools/list`.

### An output schema for a tool that returns `CallToolResult`

`winter_password_advanced` returns `CallToolResult` directly (that is what makes the `isError` path possible), so the SDK cannot infer an output schema from the return type. The attribute says it explicitly:

```csharp
[McpServerTool(
    Name = "winter_password_advanced",
    UseStructuredContent = true,
    OutputSchemaType = typeof(AdvancedPasswordResult))]
```

`UseStructuredContent = true` is required for `OutputSchemaType` to take effect. The handler then fills `StructuredContent` itself with `JsonSerializer.SerializeToElement(result, new(JsonSerializerDefaults.Web))` — `JsonSerializerDefaults.Web` is what gives the camelCase names the advertised schema promises.

## The tools

| Tool | Scope required | Notes |
| --- | --- | --- |
| `winter_password` | — | Single password from the built-in winter words |
| `winter_password_batch` | — | N passwords with the same options |
| `winter_password_advanced` | `ponypwd:generate` | Hybrid generator: words + digits + symbol + case variation, with structured metadata |
| `get_token_claims` | — | The caller's JWT claims — the OAuth debugging tool |

Plus the `make_winter_password` prompt and the `winter-characters-text` resource, both unchanged from day 3.

`winter_password_advanced` is the authorization lesson: reaching the handler proves the caller presented a valid token *for this resource*; it does not prove the token was granted `ponypwd:generate`. A token minted without that permission sails through the middleware and is stopped inside the tool.

`AdvancedPasswordGenerator.cs` lives in this project rather than in `WinterPasswordLib`, because it only exists so there is a tool worth protecting with a dedicated scope.

## Testing

The passwords below are random — treat every one of them as "shape", not literal output. Responses come back as `text/event-stream` (`event: message` + one `data:` line), which is what the ASP.NET Core transport does even for a single JSON-RPC result; pipe through `sed -n 's/^data: //p' | jq` to read them.

### Unauthenticated: the 401 challenge

```bash
curl -i -X POST http://localhost:3000/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{}'
```

```http
HTTP/1.1 401 Unauthorized
Content-Length: 0
WWW-Authenticate: Bearer resource_metadata="http://localhost:3000/.well-known/oauth-protected-resource/mcp"
```

A token the server cannot validate fails identically (the C# handler does not add `error=` / `error_description=` parameters — the reason is written to the server console by the `OnAuthenticationFailed` event instead):

```bash
curl -i -X POST http://localhost:3000/mcp -H 'Authorization: Bearer garbage' \
  -H 'Content-Type: application/json' -d '{}'
```

With an `Origin` header you can also see the CORS side of it:

```http
Access-Control-Allow-Origin: *
Access-Control-Expose-Headers: WWW-Authenticate
WWW-Authenticate: Bearer resource_metadata="http://localhost:3000/.well-known/oauth-protected-resource/mcp"
```

### The metadata the challenge points at

```bash
curl -s http://localhost:3000/.well-known/oauth-protected-resource/mcp | jq
```

```json
{
  "resource": "http://localhost:3000/mcp",
  "authorization_servers": ["https://<env>.scalekit.dev/resources/res_..."],
  "bearer_methods_supported": ["header"],
  "scopes_supported": ["ponypwd:generate"],
  "resource_documentation": "https://github.com/rstropek/2025-mcp-webinar/tree/main/day4-dotnet"
}
```

The path-less `/.well-known/oauth-protected-resource` returns the same document.

`/health` is public too, so a load balancer can probe it without a token:

```bash
curl -s http://localhost:3000/health | jq
```

```json
{
  "status": "healthy",
  "timestamp": "2026-09-03T13:14:35.91942+00:00",
  "resource": "http://localhost:3000/mcp",
  "authorizationServer": "https://<env>.scalekit.dev/resources/res_..."
}
```

`GET /mcp` and `DELETE /mcp` answer `405 Method Not Allowed` with `Allow: POST` — before authentication even runs, because the 2025-era session operations simply do not exist here.

### Getting a token

Interactively, an MCP client walks the authorization-code + PKCE flow described above. For scripted `curl` testing you need the access token such a client obtained. The easiest source is the **OAuth Debugger** of MCPJam (see below): run the flow against `http://localhost:3000/mcp`, expand step 12 *Tokens Received*, and copy `access_token`:

```bash
export TOKEN=eyJhbGciOiJSUzI1NiIs...
```

The token is bound to this server: its `aud` claim contains `http://localhost:3000/mcp` because the client sent `resource=http://localhost:3000/mcp` in the token request. A token minted for another resource is rejected by the JWT middleware with `401`, which is the audience binding doing its job.

### Authenticated calls

Every call below needs `-H "Authorization: Bearer $TOKEN"`; it is omitted from the snippets for readability, together with the `_META` envelope:

```bash
META='"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientCapabilities":{},"io.modelcontextprotocol/clientInfo":{"name":"curl","version":"1.0"}}'
```

`server/discover` — the stateless replacement for `initialize`:

```bash
curl -s -X POST http://localhost:3000/mcp -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  -H 'MCP-Protocol-Version: 2026-07-28' -H 'Mcp-Method: server/discover' \
  -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"server/discover\",\"params\":{$META}}"
```

```
event: message
data: {"result":{"supportedVersions":["2026-07-28"],"capabilities":{"logging":{},"prompts":{},"resources":{},"tools":{}},"ttlMs":0,"cacheScope":"private","resultType":"complete","_meta":{"io.modelcontextprotocol/serverInfo":{"name":"McpStreamableAuth","version":"1.0.0.0"}}},"id":1,"jsonrpc":"2.0"}
```

`tools/list` returns the four tools (the C# SDK's ordering is not the source order):

```json
["winter_password_batch", "winter_password", "get_token_claims", "winter_password_advanced"]
```

A plain `tools/call` (note `Mcp-Name`, which names the tool for intermediaries):

```bash
curl -s -X POST http://localhost:3000/mcp -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  -H 'MCP-Protocol-Version: 2026-07-28' -H 'Mcp-Method: tools/call' -H 'Mcp-Name: winter_password' \
  -d "{\"jsonrpc\":\"2.0\",\"id\":8,\"method\":\"tools/call\",\"params\":{\"name\":\"winter_password\",\"arguments\":{\"minLength\":24,\"special\":true},$META}}"
```

```
data: {"result":{"content":[{"type":"text","text":"W!nt€r$0nn€W!nt€rm0rg€n$t!€f€l"}],"resultType":"complete","_meta":{...}},"id":8,"jsonrpc":"2.0"}
```

`get_token_claims` shows what the authorization server actually put into the token — including the `aud` that had to match this resource, the `client_id` (a CIMD **URL** when the client used CIMD) and the `scope`.

### Per-tool scope enforcement

`winter_password_advanced` is where authorization bites. With a token that carries `ponypwd:generate` it behaves like any other tool:

```
data: {"result":{"content":[{"type":"text","text":"eISregENWiNtErmaN50_"}],"structuredContent":{"result":"eISregENWiNtErmaN50_","metadata":{"length":20,"includedNumbers":true,"includedSymbols":true,"includedUppercase":true,"composition":["Eisregen","Wintermantel","numbers","symbol"]}},"resultType":"complete","_meta":{...}},"id":2,"jsonrpc":"2.0"}
```

With a token that does **not** carry the scope (for example a user without the `ponypwd:generate` permission in Scalekit), the request is still perfectly authenticated — and the tool refuses:

```
data: {"result":{"content":[{"type":"text","text":"Missing required OAuth scope(s): ponypwd:generate"}],"isError":true,"resultType":"complete","_meta":{...}},"id":5,"jsonrpc":"2.0"}
```

Note the shape: HTTP `200`, a normal JSON-RPC *result*, `isError: true`. The transport did its job; the tool is the one saying no. Compare that with the `401` a missing or invalid token gets from the middleware.

`customWords` narrows the built-in word pool; a list that matches nothing is refused the same way:

```
data: {"result":{"content":[{"type":"text","text":"No matching winter words found for the provided custom list."}],"isError":true,...}}
```

### Legacy clients

The same endpoint still answers a 2025-era `initialize` — no `_meta`, no `resultType`, no `serverInfo` envelope — with the same bearer token requirement:

```bash
curl -s -X POST http://localhost:3000/mcp -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"1.0"}}}'
```

```
data: {"result":{"protocolVersion":"2025-06-18","capabilities":{"logging":{},"prompts":{},"resources":{},"tools":{}},"serverInfo":{"name":"McpStreamableAuth","version":"1.0.0.0"}},"id":1,"jsonrpc":"2.0"}
```

Because the transport is `Stateless`, a legacy client gets no `Mcp-Session-Id` back and cannot open the standalone SSE stream — which is fine for this sample, since nothing here pushes to the client.

### VS Code

`.vscode/mcp.json` points VS Code at `http://localhost:3000/mcp` (type `http`). VS Code hits the `401`, follows `resource_metadata`, and runs the OAuth flow in a browser window before showing the tools.

### pi.dev

`.mcp.json` declares the server for [pi.dev](https://pi.dev) but leaves it `disabled: true`: pi does not start HTTP servers for you, and its OAuth support for MCP servers was not verified for this sample. **MCPJam is the tested path** — see below. To try it anyway, start `dotnet run` first and enable the server through a gitignored `.pi/mcp.json` override.

## Testing with MCPJam

[MCPJam](https://www.mcpjam.com/) is an MCP client and inspector with a guided OAuth debugger. The hosted app at `app.mcpjam.com` only connects to **HTTPS** servers, so for the local server run the npm package instead — same UI, and it accepts plain HTTP:

```bash
dotnet run                        # in one terminal
npx @mcpjam/inspector@latest      # in another; opens http://127.0.0.1:6274
```

### Connecting with OAuth and CIMD

**Connect → Add Server → Add manually**, then:

- Server name, connection type `HTTP`, URL `http://localhost:3000/mcp`.
- Authentication: `OAuth`. Under *Advanced Settings* set **Registration Strategy** to *Client ID Metadata Documents (CIMD)*. MCPJam shows the document it will identify with: `https://www.mcpjam.com/.well-known/oauth/client-metadata.json`.
- Under *Connection overrides* set **Protocol version** to *Latest (2026-07-28)*.

Also check *Advanced Settings → Scope Override*: it can default to a narrow value (e.g. just `openid`) left over from a previous connection. Clear it (or list every scope explicitly, e.g. `openid offline_access ponypwd:generate email profile`) before the *first* consent so the authorization request actually asks for `ponypwd:generate` — otherwise the granted token may not carry it and `winter_password_advanced` fails for a config reason that has nothing to do with the server code.

The first connection attempt stops with "OAuth consent is required … Click Reconnect to continue"; switching the server on redirects the browser to the Scalekit login. Sign in with a user that holds the `ponypwd:generate` permission and approve the consent screen. If you (or MCPJam) already hold a valid token for this resource from an earlier run, toggling the server on skips the browser redirect entirely and shows a "Connected successfully with OAuth!" toast instead — the stored token is reused as-is, scopes included. The log panel on the right lists the whole flow:

1. *Initial MCP Request* — the unauthenticated probe, answered with the `401` and its `WWW-Authenticate` header.
2. *Request Resource Metadata* — `/.well-known/oauth-protected-resource/mcp`. The step is flagged *Resource identifier mismatch* because `http://localhost:3000/mcp` is not `https`, which RFC 9728 requires; a local-development artefact only, harmless.
3. *Request Authorization Server Metadata* — Scalekit's `oauth-authorization-server` document; MCPJam derives *CIMD support* from `client_id_metadata_document_supported`.
4. *Authorization Server Fetches CIMD* and *Client Credentials Received* — the `Client ID` is the metadata URL. No registration call, no secret.
5. *Generate PKCE Parameters*, *Authorization Request Ready*, *Authorization Code Received*, *Tokens Received*, *Authenticated MCP Request*.

### Tools

**Inspect → Tools** lists the four tools (`winter_password_batch`, `winter_password`, `get_token_claims`, `winter_password_advanced`). `get_token_claims` shows the claims of the token — observed `client_id: "https://www.mcpjam.com/.well-known/oauth/client-metadata.json"`, `scope: "openid offline_access ponypwd:generate email profile"`, `aud` containing `http://localhost:3000/mcp` — and `winter_password_advanced` therefore succeeds, returning a `structuredContent.metadata` object (`length`, `includedNumbers`, `includedSymbols`, `includedUppercase`, `composition`). Every call is a fresh HTTP request that carries the `Authorization` header again; the server keeps no state between them.

### OAuth Debugger

**Verify → OAuth Debugger** is preconfigured with the server URL, protocol `2026-07-28` and *CIMD (URL-based)*; the *Advanced settings → Scopes* field there has the same narrow-default caveat as the Connect page. *Continue* advances one step at a time (12 steps total for the 2026-07-28 + CIMD path); each step has a *Guide* explanation, the raw HTTP exchange, and a *Show in diagram* link. Step 7 is the authorization server fetching the client metadata document, step 9 generates the PKCE parameters, step 11 is the token request with `code_verifier` and `resource=http://localhost:3000/mcp`, and step 12 *Tokens Received* expands to the raw token response — which is where the `$TOKEN` for the `curl` examples comes from. Verified end-to-end: the `access_token` copied from step 12 worked unmodified in both the `winter_password` and `winter_password_advanced` curl examples above, returning the same shapes shown there.

## Layout

| File | Role |
| --- | --- |
| `Program.cs` | Auth wiring, CORS, MCP server, the four tools, the prompt and the resource |
| `Scopes.cs` | `Scopes.Require(user, …)` — the per-tool authorization check |
| `AuthContext.cs` | Reading the `ClaimsPrincipal` out of `HttpContext` for `get_token_claims` |
| `AdvancedPasswordGenerator.cs` | The hybrid generator behind `winter_password_advanced` |
| `appsettings.json` | Scalekit issuer + authorization server (demo tenant) |
| `config.env.template` | The same values as environment variables, for deployments |
| `.vscode/mcp.json`, `.mcp.json` | Client configuration for VS Code and pi.dev |

## Key concepts demonstrated

1. **OAuth 2.1 bearer tokens for MCP** — validated with plain ASP.NET Core JWT bearer + OIDC discovery.
2. **RFC 8707 audience binding** — `ValidAudience = <resource id>` makes a token useless against any other server.
3. **RFC 9728 Protected Resource Metadata** — generated by `AddMcp`, served at the path-mirrored well-known URL, advertised through `WWW-Authenticate`.
4. **CIMD (SEP-991)** — clients identify by URL; the resource server needs no code for it.
5. **Authentication vs. authorization** — one 401 in middleware, per-tool scope checks returning `isError: true`.
6. **Stateless Streamable HTTP** — no sessions, no server-push, horizontally scalable.
