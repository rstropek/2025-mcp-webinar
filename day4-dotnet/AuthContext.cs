using Microsoft.AspNetCore.Http;

namespace McpStreamableAuth;

/// <summary>
/// Helpers for reading authentication state out of the current HTTP request.
/// In ASP.NET Core, <see cref="HttpContext.User"/> is the canonical place to
/// find the validated <see cref="System.Security.Claims.ClaimsPrincipal"/>
/// — no AsyncLocal plumbing required.
/// </summary>
/// <remarks>
/// There is a second, transport-independent way to reach the same principal:
/// <c>RequestContext&lt;CallToolRequestParams&gt;.JsonRpcRequest.Context.User</c>,
/// which the HTTP transport populates for every incoming message. See
/// <c>winter_password_advanced</c> in <c>Program.cs</c> for that variant.
/// </remarks>
public static class AuthContextAccessor
{
    /// <summary>
    /// Returns the JWT claims of the current request as a JSON-friendly
    /// dictionary, or <c>null</c> if the request is unauthenticated.
    /// </summary>
    /// <remarks>
    /// Claim types may repeat (<c>aud</c> and <c>roles</c> routinely do), so
    /// repeated types are collapsed into an array while single ones stay scalar
    /// — which is how they looked in the JWT payload before ASP.NET Core
    /// flattened them into a claim list.
    /// </remarks>
    public static Dictionary<string, object>? GetTokenClaimsFromHttpContext(HttpContext? httpContext)
    {
        if (httpContext?.User?.Identity?.IsAuthenticated != true) return null;

        return httpContext.User.Claims
            .GroupBy(c => c.Type)
            .ToDictionary(
                g => g.Key,
                g => g.Count() == 1 ? g.First().Value : (object)g.Select(c => c.Value).ToArray());
    }
}
