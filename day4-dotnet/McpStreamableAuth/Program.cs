using ModelContextProtocol.Server;
using Microsoft.Extensions.AI;
using System.ComponentModel;
using WinterPasswordLib;
using System.Text.Json;
using ModelContextProtocol;
using ModelContextProtocol.Protocol;
using static ModelContextProtocol.Protocol.ElicitRequestParams;
using System.Diagnostics;
using Scalekit;
using McpStreamableAuth;
using DotNetEnv;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using System.Security.Claims;

// Load .env file if it exists (for development convenience)
// This allows using .env files like in Node.js projects
// Try multiple locations: project root, or next to the executable
var envPath = Path.Combine(Directory.GetCurrentDirectory(), ".env");
if (!File.Exists(envPath))
{
    envPath = Path.Combine(AppContext.BaseDirectory, ".env");
}
if (File.Exists(envPath))
{
    Env.Load(envPath);
    Console.WriteLine($"✓ Loaded .env file from: {envPath}");
}

var builder = WebApplication.CreateBuilder(args);

// Load Scalekit configuration
var scalekitSection = builder.Configuration.GetSection("Scalekit");
var scalekitConfig = new ScalekitConfig
{
    EnvironmentUrl = scalekitSection["EnvironmentUrl"] 
        ?? Environment.GetEnvironmentVariable("SCALEKIT_ENVIRONMENT_URL") 
        ?? throw new InvalidOperationException("SCALEKIT_ENVIRONMENT_URL is required"),
    AuthServer = scalekitSection["AuthServer"] 
        ?? Environment.GetEnvironmentVariable("SCALEKIT_AUTH_SERVER") 
        ?? throw new InvalidOperationException("SCALEKIT_AUTH_SERVER is required"),
    ClientId = scalekitSection["ClientId"] 
        ?? Environment.GetEnvironmentVariable("SCALEKIT_CLIENT_ID") 
        ?? throw new InvalidOperationException("SCALEKIT_CLIENT_ID is required"),
    ClientSecret = scalekitSection["ClientSecret"] 
        ?? Environment.GetEnvironmentVariable("SCALEKIT_CLIENT_SECRET") 
        ?? throw new InvalidOperationException("SCALEKIT_CLIENT_SECRET is required"),
    Audience = scalekitSection["Audience"] 
        ?? Environment.GetEnvironmentVariable("MCP_RESOURCE_ID") 
        ?? throw new InvalidOperationException("MCP_RESOURCE_ID is required"),
    ResourceMetadata = scalekitSection["ResourceMetadata"] 
        ?? Environment.GetEnvironmentVariable("MCP_RESOURCE_METADATA"),
    SupportedScopes = (scalekitSection["SupportedScopes"] 
        ?? Environment.GetEnvironmentVariable("MCP_SCOPES") 
        ?? "read:passwords write:passwords").Split(' ', StringSplitOptions.RemoveEmptyEntries)
};

// Determine resource ID (use localhost in development, configured value in production)
var port = builder.Configuration["ASPNETCORE_URLS"]?.Split(':').LastOrDefault()?.Split('/').FirstOrDefault() 
    ?? Environment.GetEnvironmentVariable("PORT") 
    ?? "3000";
var devResourceId = $"http://localhost:{port}/mcp";
scalekitConfig.ResourceId = builder.Environment.IsProduction() 
    ? scalekitConfig.Audience 
    : devResourceId;

// Register Scalekit configuration
builder.Services.AddSingleton(scalekitConfig);

// Configure ASP.NET Core Authentication with JWT Bearer tokens
// This replaces the manual JWT validation with proper JWKS support
builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
})
.AddJwtBearer(options =>
{
    // Extract the base URL from the authorization server
    // Scalekit auth server format: https://<env>.scalekit.dev/resources/<resource-id>
    // We need to get the base URL for JWKS discovery
    var authServerUri = new Uri(scalekitConfig.AuthServer);
    var baseUrl = $"{authServerUri.Scheme}://{authServerUri.Host}";
    
    // Configure JWT validation
    options.Authority = baseUrl;
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = true,
        ValidateAudience = true,
        ValidateLifetime = true,
        ValidateIssuerSigningKey = true,
        
        // Validate that the audience matches our resource ID
        // We use AudienceValidator to allow multiple valid audiences
        ValidIssuers = new[] { baseUrl, scalekitConfig.AuthServer },
        
        // Use standard claim types
        NameClaimType = ClaimTypes.Name,
        RoleClaimType = ClaimTypes.Role,
        
        // Allow audience to be either the resource ID or the configured audience
        AudienceValidator = (audiences, securityToken, validationParameters) =>
        {
            if (audiences == null || !audiences.Any())
                return false;
            
            return audiences.Any(aud => 
                aud == scalekitConfig.ResourceId || 
                aud == scalekitConfig.Audience ||
                aud == scalekitConfig.AuthServer);
        }
    };

    // Event handlers for logging and debugging
    options.Events = new JwtBearerEvents
    {
        OnTokenValidated = context =>
        {
            var name = context.Principal?.Identity?.Name ?? "unknown";
            var email = context.Principal?.FindFirstValue("preferred_username") 
                ?? context.Principal?.FindFirstValue(ClaimTypes.Email) 
                ?? "unknown";
            
            // Extract token for use in tools
            var token = context.Request.Headers["Authorization"].ToString()
                .Replace("Bearer ", "", StringComparison.OrdinalIgnoreCase);
            
            // Store token and claims in HttpContext for use by tools
            context.HttpContext.Items["Token"] = token;
            context.HttpContext.Items["TokenClaims"] = context.Principal?.Claims
                .ToDictionary(c => c.Type, c => (object)c.Value);
            context.HttpContext.Items["IsAuthenticated"] = true;
            
            // Set auth context for async operations
            var claimsDict = context.Principal?.Claims
                .ToDictionary(c => c.Type, c => (object)c.Value) ?? new Dictionary<string, object>();
            AuthContextAccessor.SetContext(new AuthContext
            {
                Token = token,
                TokenClaims = claimsDict,
                IsAuthenticated = true
            });
            
            Console.WriteLine($"✓ Token validated for: {name} ({email})");
            return Task.CompletedTask;
        },
        OnAuthenticationFailed = context =>
        {
            Console.WriteLine($"⚠️ Authentication failed: {context.Exception.Message}");
            return Task.CompletedTask;
        },
        OnChallenge = context =>
        {
            // Add WWW-Authenticate header with resource metadata
            context.Response.Headers.Append("WWW-Authenticate", 
                WwwAuthenticateHeader.GetValue(scalekitConfig.ResourceId));
            Console.WriteLine($"🔒 Challenging client to authenticate with Scalekit");
            return Task.CompletedTask;
        }
    };
});

// Add authorization services
builder.Services.AddAuthorization();

// Add HttpContextAccessor for accessing authentication context
builder.Services.AddHttpContextAccessor();

// Add CORS services
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy => policy
        .AllowAnyOrigin()
        .AllowAnyMethod()
        .AllowAnyHeader()
        .WithExposedHeaders("Mcp-Session-Id", "WWW-Authenticate"));
});

// Add MCP server services
builder.Services.AddMcpServer()
    .WithHttpTransport()
    .WithToolsFromAssembly()
    .WithPromptsFromAssembly()
    .WithResourcesFromAssembly();

builder.AddServiceDefaults();

var app = builder.Build();

// Use CORS
app.UseCors();

// Use ASP.NET Core authentication and authorization middleware
app.UseAuthentication();
app.UseAuthorization();

// OAuth 2.0 Protected Resource Metadata endpoint (RFC 9728)
// This is a standardized discovery endpoint that allows MCP clients to discover
// authorization requirements. The MCP C# SDK may handle this automatically in future versions.
app.MapGet("/.well-known/oauth-protected-resource/mcp", () => Results.Json(new
{
    resource = scalekitConfig.ResourceId,
    authorization_servers = new[] { scalekitConfig.AuthServer },
    bearer_methods_supported = new[] { "header" },
    resource_documentation = $"{scalekitConfig.ResourceId}/docs",
    scopes_supported = scalekitConfig.SupportedScopes,
    token_endpoint_auth_methods_supported = new[] { "client_secret_basic", "client_secret_post" }
})).AllowAnonymous();

app.MapGet("/mcp/.well-known/oauth-protected-resource", () => Results.Json(new
{
    resource = scalekitConfig.ResourceId,
    authorization_servers = new[] { scalekitConfig.AuthServer },
    bearer_methods_supported = new[] { "header" },
    resource_documentation = $"{scalekitConfig.ResourceId}/docs",
    scopes_supported = scalekitConfig.SupportedScopes,
    token_endpoint_auth_methods_supported = new[] { "client_secret_basic", "client_secret_post" }
})).AllowAnonymous();

// Health check endpoint (public, no auth required)
app.MapGet("/health", () => Results.Json(new
{
    status = "healthy",
    timestamp = DateTime.UtcNow.ToString("O"),
    serverName = "winter-password-streamable-auth",
    serverVersion = "0.1.0",
    resourceId = scalekitConfig.ResourceId,
    authServer = scalekitConfig.AuthServer
})).AllowAnonymous();

// Map MCP endpoints with authentication required
// Using ASP.NET Core's standard RequireAuthorization() instead of custom middleware
app.MapMcp().RequireAuthorization();

app.Run();

[McpServerToolType]
public static class WinterPasswordTools
{
    private static readonly ActivitySource source = new("McpStreamableAuthServer");

    [McpServerTool, Description("Builds a password from winter words.")]
    public static string WinterPassword(
        [Description("Minimum length of the password")] int minLength = 16,
        [Description("Enable special character replacement")] bool special = false)
    {
        using var activity = source.StartActivity("WinterPassword");
        activity?.SetTag("minLength", minLength);
        activity?.SetTag("special", special);
        
        var opts = new PasswordGenerationOptions { MinLength = minLength, Special = special };
        var output = PasswordGenerator.BuildPassword(opts);
        return output;
    }

    [McpServerTool(Name = "winter_password_batch"), Description("Generates N passwords with the same options.")]
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

    [McpServerTool(Name = "winter_password_with_custom_words"), Description("Builds a password from winter words. The user can override the built-in words with their own custom words.")]
    public static async Task<string> WinterPasswordWithCustomWords(
        McpServer server,
        [Description("Minimum length of the password")] int minLength = 16,
        [Description("Enable special character replacement")] bool special = false)
    {
        string[]? customWords = null;

        using (var activity = source.StartActivity("Elicitation for custom words"))
        {
            // Check if the client supports elicitation
            if (server.ClientCapabilities?.Elicitation == null)
            {
                throw new McpException("Client does not support elicitation");
            }

            // Ask the user if they want to use custom words
            var useCustomSchema = new RequestSchema
            {
                Properties =
            {
                ["UseCustomWords"] = new BooleanSchema
                {
                    Title = "Use Custom Words",
                    Description = "Do you want to provide your own winter words instead of using the built-in ones?"
                }
            }
            };

            var useCustomResponse = await server.ElicitAsync(new ElicitRequestParams
            {
                Message = "Do you want to use custom winter words?",
                RequestedSchema = useCustomSchema
            }, CancellationToken.None);


            // If user wants to provide custom words
            if (useCustomResponse.Action == "accept" && useCustomResponse.Content?["UseCustomWords"].ValueKind == JsonValueKind.True)
            {
                var wordsSchema = new RequestSchema
                {
                    Properties =
                {
                    ["CustomWords"] = new StringSchema
                    {
                        Title = "Custom Words",
                        Description = "List your custom winter words, separated by commas (e.g., Snowflake, Icicle, Frost, Winter)",
                        MinLength = 1
                    }
                }
                };

                var wordsResponse = await server.ElicitAsync(new ElicitRequestParams
                {
                    Message = "Enter your custom winter words (comma-separated):",
                    RequestedSchema = wordsSchema
                }, CancellationToken.None);

                if (wordsResponse.Action == "accept")
                {
                    var wordsString = wordsResponse.Content?["CustomWords"].GetString();
                    if (!string.IsNullOrWhiteSpace(wordsString))
                    {
                        customWords = [.. wordsString.Split(',')
                            .Select(w => w.Trim())
                            .Where(w => !string.IsNullOrWhiteSpace(w))];
                    }
                }
            }
            else
            {
                // User chose not to provide custom words
                customWords = PasswordGenerator.DefaultWords;
            }
        }

        using var activity2 = source.StartActivity("Generating password with custom words");
        var opts = new PasswordGenerationOptions { MinLength = minLength, Special = special };
        var output = PasswordGenerator.BuildPassword(opts, customWords);
        return output;
    }

    [McpServerTool(Name = "get_token_claims"), Description("Returns the claims from the JWT authentication token for the current request. Requires authentication.")]
    public static object GetTokenClaims(IHttpContextAccessor? httpContextAccessor = null)
    {
        // Try to get claims from HttpContext first (ASP.NET Core standard approach)
        Dictionary<string, object>? claims = null;
        if (httpContextAccessor?.HttpContext != null)
        {
            claims = AuthContextAccessor.GetTokenClaimsFromHttpContext(httpContextAccessor.HttpContext);
        }
        
        // Fallback to AsyncLocal context
        if (claims == null)
        {
            if (!AuthContextAccessor.IsAuthenticated())
            {
                return new
                {
                    isAuthenticated = false,
                    message = "Not authenticated. No token claims available."
                };
            }
            claims = AuthContextAccessor.GetTokenClaims() as Dictionary<string, object>;
        }

        return new
        {
            claims = claims ?? new Dictionary<string, object>(),
            isAuthenticated = true
        };
    }
}

[McpServerPromptType]
public static class WinterPasswordPrompts
{
    [McpServerPrompt, Description("Prompt to generate a password from winter words")]
    public static ChatMessage MakeWinterPassword(
        [Description("Minimum length of the password")] string minLength = "16",
        [Description("Enable special character replacement")] string special = "false")
    {
        var specialBool = special.ToLower() == "true";
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
    [McpServerResource(Name = "winter-characters-text"), Description("Winter words (text) - One word per line from data/winter-words.txt")]
    public static string WinterCharactersText() => JsonSerializer.Serialize(PasswordGenerator.DefaultWords);
}

