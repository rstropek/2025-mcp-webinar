using Microsoft.AspNetCore.Http;

namespace McpStreamableAuth;

/// <summary>
/// Helpers for reading authentication state out of the current HTTP request.
/// In ASP.NET Core, <see cref="HttpContext.User"/> is the canonical place to
/// find the validated <see cref="System.Security.Claims.ClaimsPrincipal"/>
/// — no AsyncLocal plumbing required.
/// </summary>
public static class AuthContextAccessor
{
    /// <summary>
    /// Returns the JWT claims from the current request as a flat list of
    /// (type, value) pairs, or <c>null</c> if the request is unauthenticated.
    /// </summary>
    public static List<KeyValuePair<string, object>>? GetTokenClaimsFromHttpContext(HttpContext? httpContext)
    {
        if (httpContext?.User?.Identity?.IsAuthenticated != true) return null;
        return [.. httpContext.User.Claims.Select(c => new KeyValuePair<string, object>(c.Type, c.Value))];
    }
}
