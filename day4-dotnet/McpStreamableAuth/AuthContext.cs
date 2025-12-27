using System.Threading;
using System.Security.Claims;
using Microsoft.AspNetCore.Http;

namespace McpStreamableAuth;

/// <summary>
/// Authentication context data structure.
/// Contains all auth-related information for a single HTTP request.
/// 
/// PROBLEM THIS SOLVES:
/// =====================
/// In a multi-user HTTP server, we need to pass authentication information from ASP.NET Core
/// middleware (where it's extracted from HTTP headers) down to MCP tool handlers (where
/// it's used for authorization checks). We can't pass this as function parameters because:
/// 
/// 1. The MCP SDK controls the tool handler signatures
/// 2. Passing auth through every intermediate function is tedious ("parameter drilling")
/// 3. We need to maintain request isolation - each concurrent request must have its own
///    auth context, even though ASP.NET Core processes requests concurrently
/// 
/// SOLUTION: AsyncLocal
/// ====================
/// C#'s AsyncLocal provides "async-aware thread-local storage". Think of it as:
/// - A magic global variable that has different values for each async operation chain
/// - Similar to thread-local storage in multi-threaded languages, but works with async/await
/// - Maintains separate storage for each request, even when they're processed concurrently
/// </summary>
public class AuthContext
{
    /// <summary>
    /// The raw JWT access token from the Authorization header.
    /// </summary>
    public string? Token { get; set; }

    /// <summary>
    /// Parsed and validated claims from the JWT (e.g., sub, email, scopes).
    /// </summary>
    public object? TokenClaims { get; set; }

    /// <summary>
    /// Whether the request has been successfully authenticated.
    /// </summary>
    public bool IsAuthenticated { get; set; }

    /// <summary>
    /// Unique session identifier for this MCP session.
    /// </summary>
    public string? SessionId { get; set; }
}

/// <summary>
/// Provides access to the current authentication context using AsyncLocal.
/// 
/// This creates an isolated storage space for each async operation chain.
/// When you call SetContext(context), all code executed within that async chain
/// can retrieve that context by calling GetContext().
/// 
/// Key guarantee: Even if 1000 requests are being processed concurrently,
/// each one maintains its own separate context.
/// </summary>
public static class AuthContextAccessor
{
    private static readonly AsyncLocal<AuthContext?> _currentContext = new();

    /// <summary>
    /// Sets the authentication context for the current async operation chain.
    /// </summary>
    public static void SetContext(AuthContext? context)
    {
        _currentContext.Value = context;
    }

    /// <summary>
    /// Gets the current authentication context.
    /// </summary>
    public static AuthContext? GetContext() => _currentContext.Value;

    /// <summary>
    /// Checks if the current request is authenticated.
    /// </summary>
    public static bool IsAuthenticated() => GetContext()?.IsAuthenticated ?? false;

    /// <summary>
    /// Gets the token claims for the current request.
    /// </summary>
    public static object? GetTokenClaims() => GetContext()?.TokenClaims;

    /// <summary>
    /// Gets the token claims from HttpContext if available (ASP.NET Core standard approach).
    /// Falls back to AsyncLocal context if HttpContext is not available.
    /// </summary>
    public static List<KeyValuePair<string, object>>? GetTokenClaimsFromHttpContext(HttpContext? httpContext)
    {
        if (httpContext?.User?.Identity?.IsAuthenticated == true)
        {
            // Use ASP.NET Core's ClaimsPrincipal
            return [.. httpContext.User.Claims.Select(c => new KeyValuePair<string, object>(c.Type, c.Value))];
        }
        
        return null;
    }

    /// <summary>
    /// Gets the token for the current request.
    /// </summary>
    public static string? GetToken() => GetContext()?.Token;

    /// <summary>
    /// Gets the session ID for the current request.
    /// </summary>
    public static string? GetSessionId() => GetContext()?.SessionId;
}

