using System.ComponentModel;
using System.Diagnostics;
using System.Security.Claims;
using System.Text.Json;
using McpStreamableAuth;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.Extensions.AI;
using Microsoft.IdentityModel.Tokens;
using ModelContextProtocol.AspNetCore;
using ModelContextProtocol.AspNetCore.Authentication;
using ModelContextProtocol.Protocol;
using ModelContextProtocol.Server;
using WinterPasswordLib;

var builder = WebApplication.CreateBuilder(args);

// ---------------------------------------------------------------------------
// Resource identity
// ---------------------------------------------------------------------------
// An OAuth 2.0 protected resource has to know its own canonical URL: it is the
// `resource` field of the RFC 9728 metadata document, the value clients send as
// `resource=` when they request a token (RFC 8707), and therefore the `aud`
// claim we validate on every incoming token. Derive it from the URL the server
// actually listens on so a local run and a deployment agree with themselves.
var baseUrl = (builder.Configuration["ASPNETCORE_URLS"]
        ?? builder.Configuration["URLS"]
        ?? "http://localhost:3000")
    .Split(';', StringSplitOptions.RemoveEmptyEntries)[0]
    .TrimEnd('/');
var resourceId = $"{baseUrl}/mcp";

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------
// Browser-based MCP clients (MCPJam, the MCP Inspector) call this server from
// origins nobody can enumerate, so the policy is permissive — which is safe
// precisely because access is decided by a bearer token, not by the network.
//
// Two details matter:
//   * `MCP-Protocol-Version`, `Mcp-Method` and `Mcp-Name` are the 2026-07-28
//     routing headers that duplicate part of the JSON-RPC body so proxies can
//     route without parsing it. Without them in the allow-list the browser's
//     preflight fails. `Mcp-Session-Id` is gone: 2026-07-28 has no sessions.
//   * `WWW-Authenticate` must be *exposed*, otherwise a browser client never
//     gets to read the OAuth challenge that bootstraps the whole discovery flow.
builder.Services.AddCors(options => options.AddDefaultPolicy(policy => policy
    .AllowAnyOrigin()
    .WithMethods("GET", "POST", "OPTIONS")
    .WithHeaders("Content-Type", "Authorization", "MCP-Protocol-Version", "Mcp-Method", "Mcp-Name")
    .WithExposedHeaders("WWW-Authenticate")));

// ---------------------------------------------------------------------------
// Authentication: JWT bearer validates, the MCP scheme challenges
// ---------------------------------------------------------------------------
// The split of the two default schemes is the whole trick (and is what the
// official `ProtectedMcpServer` sample of the C# SDK does as well):
//   * Authenticate = JwtBearer   -> tokens are validated the standard ASP.NET way.
//   * Challenge    = Mcp         -> a 401 is written by the MCP handler, which
//                                   adds `WWW-Authenticate: Bearer …,
//                                   resource_metadata="…"` and serves the RFC 9728
//                                   document. No hand-written OnChallenge needed.
builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = McpAuthenticationDefaults.AuthenticationScheme;
})
.AddJwtBearer(options =>
{
    // `Authority` turns on OIDC discovery: the middleware fetches
    // `<Authority>/.well-known/openid-configuration`, then the JWKS, and rotates
    // signing keys on its own.
    options.Authority = builder.Configuration["Scalekit:Issuer"]
        ?? throw new InvalidOperationException("Scalekit:Issuer is not configured");

    // Local development runs over plain HTTP; production must not.
    options.RequireHttpsMetadata = !builder.Environment.IsDevelopment();

    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidIssuer = builder.Configuration["Scalekit:Issuer"],

        // RFC 8707 audience binding: the token must have been issued *for this
        // server*. A token stolen from another MCP server — or minted for the
        // Scalekit environment itself — fails right here. This is the single
        // most important line of the whole file.
        ValidAudience = resourceId,

        ValidateIssuerSigningKey = true,
        ValidateIssuer = true,
        ValidateAudience = true,
        ValidateLifetime = true,
    };

    // Logging only — none of these events change the outcome. They exist because
    // OAuth failures are otherwise invisible, and 90 % of them are a mismatched
    // `aud` or `iss`.
    options.Events = new JwtBearerEvents
    {
        OnTokenValidated = context =>
        {
            var name = context.Principal?.Identity?.Name ?? "unknown";
            var subject = context.Principal?.FindFirstValue("sub") ?? "unknown";
            var scopes = context.Principal is null
                ? ""
                : string.Join(" ", Scopes.GrantedScopes(context.Principal));
            Console.WriteLine($"Token validated for: {name} (sub={subject}); scopes: {scopes}");
            return Task.CompletedTask;
        },
        OnAuthenticationFailed = context =>
        {
            Console.WriteLine($"Authentication failed: {context.Exception.Message}");
            return Task.CompletedTask;
        },
    };
})
// The MCP authentication scheme contributes no token validation of its own. It
// only knows how to say "no" the way the MCP specification wants it said.
.AddMcp(options =>
{
    // RFC 9728 Protected Resource Metadata — the document a refused client
    // fetches to learn *where* to get a token. This is the same JSON the
    // Scalekit dashboard shows as "Metadata JSON" for the MCP server.
    options.ResourceMetadata = new()
    {
        // Who we are. Clients echo this as `resource=` at token request time.
        Resource = resourceId,

        // Where tokens come from. Scalekit creates one authorization server per
        // MCP server; its URL is the "resource" URL from the dashboard.
        AuthorizationServers = { builder.Configuration["Scalekit:EnvironmentUrl"]! },

        // The one permission this server understands. Clients should request
        // only what they need (least privilege).
        ScopesSupported = ["ponypwd:generate"],

        // RFC 6750 §2.1 only: no tokens in the query string or the body, because
        // those leak into logs and caches.
        BearerMethodsSupported = ["header"],

        ResourceDocumentation = "https://github.com/rstropek/2025-mcp-webinar/tree/main/day4-dotnet",
    };

    // `options.ResourceMetadataUri` is deliberately left unset. The handler then
    // serves — and advertises — the RFC 9728 path-mirrored default
    // `/.well-known/oauth-protected-resource/mcp` (the resource path `/mcp`
    // appended after the well-known segment).
});

builder.Services.AddAuthorization();

// ---------------------------------------------------------------------------
// MCP server
// ---------------------------------------------------------------------------
builder.Services.AddHttpContextAccessor();
builder.Services.AddMcpServer()
    .WithHttpTransport(options =>
    {
        // Stateless is the 2026-07-28 default and all this sample needs: there
        // are no server-to-client requests (no sampling, no elicitation), so
        // there is nothing to remember between requests. Every call re-presents
        // its bearer token, which is also what makes the server horizontally
        // scalable — any replica can answer any request.
        options.SessionMode = HttpServerSessionMode.Stateless;
    })
    .WithToolsFromAssembly()
    .WithPromptsFromAssembly()
    .WithResourcesFromAssembly();

var app = builder.Build();

app.UseCors();
app.UseAuthentication();
app.UseAuthorization();

// Liveness probe — public on purpose, so a load balancer or container platform
// can check the process without holding a token.
app.MapGet("/health", () => Results.Json(new
{
    status = "healthy",
    timestamp = DateTimeOffset.UtcNow,
    resource = resourceId,
    authorizationServer = builder.Configuration["Scalekit:EnvironmentUrl"],
})).AllowAnonymous();

// One protected endpoint. `RequireAuthorization()` is what turns an
// unauthenticated POST into the 401 challenge that starts OAuth discovery.
app.MapMcp("/mcp").RequireAuthorization();

Console.WriteLine($"MCP server (resource {resourceId}) starting");
Console.WriteLine($"Protected resource metadata: {baseUrl}/.well-known/oauth-protected-resource/mcp");
Console.WriteLine($"Health check: {baseUrl}/health");

app.Run();

/// <summary>
/// The password tools. Reaching any handler in here already proves
/// <em>authentication</em>; only <c>winter_password_advanced</c> additionally
/// checks <em>authorization</em>.
/// </summary>
[McpServerToolType]
public static class WinterPasswordTools
{
    private static readonly ActivitySource source = new("McpStreamableAuthServer");

    private static readonly JsonSerializerOptions structuredContentOptions =
        new(JsonSerializerDefaults.Web);

    [McpServerTool(Name = "winter_password", Title = "Generate a password", ReadOnly = true),
     Description("Builds a password from winter words.")]
    public static string WinterPassword(
        [Description("Minimum length of the password")] int minLength = 16,
        [Description("Enable special character replacement")] bool special = false)
    {
        using var activity = source.StartActivity("WinterPassword");
        activity?.SetTag("minLength", minLength);
        activity?.SetTag("special", special);

        var opts = new PasswordGenerationOptions { MinLength = minLength, Special = special };
        return PasswordGenerator.BuildPassword(opts);
    }

    [McpServerTool(Name = "winter_password_batch", Title = "Generate multiple passwords", ReadOnly = true),
     Description("Generates N passwords with the same options.")]
    public static string[] WinterPasswordBatch(
        [Description("Number of passwords to generate")] int count = 5,
        [Description("Minimum length of the password")] int minLength = 16,
        [Description("Enable special character replacement")] bool special = false)
    {
        using var activity = source.StartActivity("WinterPasswordBatch");
        activity?.SetTag("count", count);
        activity?.SetTag("minLength", minLength);
        activity?.SetTag("special", special);

        var opts = new PasswordGenerationOptions { MinLength = minLength, Special = special };
        return PasswordGenerator.BuildMany(count, opts);
    }

    /// <summary>
    /// The authorization lesson of this sample.
    ///
    /// Reaching this method proves the caller presented a valid token for this
    /// resource. What it does not prove is that the token was granted the
    /// <c>ponypwd:generate</c> permission — a token minted without it sails
    /// through the middleware and is stopped here. That is exactly the
    /// authentication/authorization distinction we want to show.
    ///
    /// Returning <see cref="CallToolResult"/> directly (instead of a plain
    /// object) is what makes the <c>isError</c> path possible; the
    /// <c>OutputSchemaType</c> + <c>UseStructuredContent</c> pair still
    /// advertises a proper output schema to clients.
    /// </summary>
    [McpServerTool(
        Name = "winter_password_advanced",
        Title = "Advanced hybrid password generator",
        ReadOnly = true,
        UseStructuredContent = true,
        OutputSchemaType = typeof(AdvancedPasswordResult)),
     Description("Generates strong passwords by mixing winter words with numbers, symbols and case variations. Requires the `ponypwd:generate` OAuth scope.")]
    public static CallToolResult WinterPasswordAdvanced(
        RequestContext<CallToolRequestParams> context,
        [Description("Total length of the password (8-128)")] int length = 20,
        [Description("Append random digits")] bool includeNumbers = true,
        [Description("Append a random symbol")] bool includeSymbols = true,
        [Description("Randomize the casing of the winter words")] bool includeUppercase = true,
        [Description("Restrict the word pool to built-in winter words containing these terms")] string[]? customWords = null)
    {
        using var activity = source.StartActivity("WinterPasswordAdvanced");

        // The validated principal travels with the JSON-RPC message itself
        // (`JsonRpcMessageContext.User`), which keeps tool code free of any
        // HTTP-specific dependency. `IHttpContextAccessor` (see
        // `get_token_claims`) is the alternative when you are already in
        // ASP.NET Core land anyway.
        var user = context.JsonRpcRequest?.Context?.User;

        if (Scopes.Require(user, "ponypwd:generate") is { } scopeError)
        {
            activity?.SetTag("authorized", false);
            return scopeError;
        }

        activity?.SetTag("authorized", true);

        var words = PasswordGenerator.DefaultWords;
        if (customWords is { Length: > 0 })
        {
            words = AdvancedPasswordGenerator.Filter(words, customWords);
            if (words.Length == 0)
            {
                return new CallToolResult
                {
                    IsError = true,
                    Content = [new TextContentBlock { Text = "No matching winter words found for the provided custom list." }],
                };
            }
        }

        var result = AdvancedPasswordGenerator.Build(
            new AdvancedPasswordOptions(Math.Clamp(length, 8, 128), includeNumbers, includeSymbols, includeUppercase),
            words);

        return new CallToolResult
        {
            Content = [new TextContentBlock { Text = result.Result }],
            StructuredContent = JsonSerializer.SerializeToElement(result, structuredContentOptions),
        };
    }

    /// <summary>
    /// Diagnostic tool: returns the claims of the caller's token. Invaluable
    /// while an <c>aud</c>, <c>iss</c> or scope mismatch makes every request 401
    /// for no visible reason — it shows exactly what the authorization server
    /// put into the token.
    /// </summary>
    [McpServerTool(Name = "get_token_claims", Title = "Get token claims", ReadOnly = true),
     Description("Returns the claims from the JWT authentication token for the current request. Useful for debugging OAuth integration.")]
    public static object GetTokenClaims(IHttpContextAccessor httpContextAccessor)
    {
        // In stateless mode the tool handler runs inside the original HTTP
        // request, so `IHttpContextAccessor` sees the right context. (In the
        // 2025-era stateful mode the SDK flows the execution context along with
        // the JSON-RPC message so that this keeps working there too.)
        var claims = AuthContextAccessor.GetTokenClaimsFromHttpContext(httpContextAccessor.HttpContext);

        return new
        {
            claims = claims ?? [],
            isAuthenticated = claims is not null,
        };
    }
}

[McpServerPromptType]
public static class WinterPasswordPrompts
{
    [McpServerPrompt(Name = "make_winter_password"), Description("Prompt to generate a password from winter words")]
    public static ChatMessage MakeWinterPassword(
        [Description("Minimum length of the password")] string minLength = "16",
        [Description("Enable special character replacement")] string special = "false")
    {
        var specialBool = bool.TryParse(special, out var s) && s;
        return new ChatMessage(
            ChatRole.User,
            $"""
            Generate a secure password from winter words.
            - Minimum length: {minLength}
            - Special character replacement active: {specialBool}
            Replacement rules (if active): o/O→0, i/I→!, e/E→€, s/S→$.
            """
        );
    }
}

[McpServerResourceType]
public static class WinterWordResources
{
    [McpServerResource(Name = "winter-characters-text"), Description("Winter words (text) - One word per line")]
    public static string WinterCharactersText() => string.Join('\n', PasswordGenerator.DefaultWords);
}
