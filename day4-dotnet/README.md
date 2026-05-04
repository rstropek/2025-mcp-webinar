# MCP with OAuth Authentication - C#/.NET

## Overview

This sample builds on [`day3-dotnet`](../day3-dotnet) and adds **OAuth 2.0 / JWT bearer authentication** to the streamable MCP server. The functionality is otherwise identical to day3's `McpStreamableServer` — the same `winter_password`, `winter_password_batch`, `winter_password_with_custom_words` tools, the same `make_winter_password` prompt, and the same `winter-characters-text` resource — but every call to `/mcp` now requires a valid bearer token.

The sample uses [Scalekit](https://scalekit.com/) as the OAuth authorization server, but the setup is standard ASP.NET Core JWT bearer + OIDC discovery and works with any OAuth 2.1 / OIDC-compliant issuer.

## What's Different from day3

| Concern | day3-dotnet | day4-dotnet |
|---|---|---|
| Transport | HTTP (streamable) | HTTP (streamable) |
| Authentication | None | OAuth 2.0 bearer tokens (JWT) |
| Authorization | None | `RequireAuthorization()` on `/mcp` |
| Discovery | n/a | OIDC discovery via JWT bearer `Authority` + MCP `ResourceMetadata` |
| Aspire orchestration | Yes | No (single-project sample to keep auth wiring focused) |
| New tool | n/a | `get_token_claims` — returns the JWT claims of the current request |

## Authentication Flow

1. Client makes a request to `/mcp` without a token.
2. ASP.NET Core challenges with `401 Unauthorized` and a `WWW-Authenticate: Bearer ... resource_metadata="..."` header pointing the client at `/.well-known/oauth-protected-resource` ([RFC 9728](https://datatracker.ietf.org/doc/rfc9728/)).
3. Client fetches that metadata, learns the authorization server, and runs the standard OAuth 2.0 authorization-code flow against Scalekit.
4. Client retries the request with `Authorization: Bearer <jwt>`.
5. The JWT bearer middleware validates the token (issuer, audience, signature, lifetime) using OIDC-discovered keys.
6. The MCP request is dispatched as in day3, but `HttpContext.User` now carries the validated `ClaimsPrincipal`.

## Key Code

### `Program.cs` — auth wiring

```csharp
builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = McpAuthenticationDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
})
.AddJwtBearer(options =>
{
    options.Authority = builder.Configuration["Scalekit:Issuer"];
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidIssuer = builder.Configuration["Scalekit:Issuer"],
        ValidAudience = $"{builder.Configuration["ASPNETCORE_URLS"]}/mcp",
        ValidateIssuerSigningKey = true,
        ValidateIssuer = true,
        ValidateAudience = true,
        ValidateLifetime = true,
    };
    // ... event hooks: OnTokenValidated, OnAuthenticationFailed, OnChallenge ...
}).AddMcp(options =>
{
    options.ResourceMetadata = new()
    {
        ResourceDocumentation = "https://docs.example.com/api/weather",
        AuthorizationServers = { builder.Configuration["Scalekit:EnvironmentUrl"]! },
        ScopesSupported = ["ponypwd:generate"],
    };
});

app.MapMcp("/mcp").RequireAuthorization();
```

The two important pieces:

- **`AddJwtBearer`** — standard ASP.NET Core JWT validation. `Authority` triggers OIDC discovery so signing keys are fetched and rotated automatically.
- **`AddMcp` with `ResourceMetadata`** — the MCP-specific extension that publishes `/.well-known/oauth-protected-resource` so MCP clients can discover the authorization server.

### `AuthContext.cs` — reading claims inside a tool

ASP.NET Core's `HttpContext.User.Claims` is the canonical place to read the validated `ClaimsPrincipal` — no AsyncLocal plumbing required. The `get_token_claims` tool injects `IHttpContextAccessor` to grab the claims of the current request.

## Configuration

Copy `config.env.template` and fill in your Scalekit values, or set them in `appsettings.Development.json`:

```json
{
  "Scalekit": {
    "Issuer": "https://<your-tenant>.scalekit.dev",
    "EnvironmentUrl": "https://<your-tenant>.scalekit.dev/resources/<your-resource-id>"
  }
}
```

- **`Scalekit:Issuer`** — the OIDC issuer URL. Used as the JWT `Authority` (for OIDC discovery) and as the expected `iss` claim.
- **`Scalekit:EnvironmentUrl`** — published in `ResourceMetadata.AuthorizationServers` so MCP clients can discover where to obtain tokens.

The sample also expects `ASPNETCORE_URLS` to be set (e.g. `http://localhost:3000`) — the audience claim is computed as `{ASPNETCORE_URLS}/mcp`.

## Running

```bash
dotnet run
```

The server listens on whatever `ASPNETCORE_URLS` (or the default `launchSettings.json` profile) specifies, and exposes `/mcp` as the protected MCP endpoint.

To exercise it from VS Code or another MCP client, point the client at `http://localhost:3000/mcp` (or your configured URL) and let the client handle the OAuth dance via the `WWW-Authenticate` challenge.

## Key Concepts Demonstrated

1. **OAuth 2.0 / JWT bearer for MCP** — protecting an MCP server with industry-standard auth.
2. **OIDC discovery** — letting the framework fetch signing keys and metadata at runtime.
3. **MCP `ResourceMetadata`** — publishing the protected-resource document so MCP clients can discover the authorization server (RFC 9728).
4. **`WWW-Authenticate` with `resource_metadata`** — the link that ties an unauthenticated MCP request to the discovery document.
5. **Reading JWT claims from a tool** — using `IHttpContextAccessor` and `HttpContext.User.Claims`.
