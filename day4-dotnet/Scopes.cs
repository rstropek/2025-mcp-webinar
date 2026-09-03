using System.Security.Claims;
using ModelContextProtocol.Protocol;

namespace McpStreamableAuth;

/// <summary>
/// Per-tool authorization checks.
///
/// Every request that reaches a tool handler is already <em>authenticated</em>:
/// the JWT bearer middleware validated issuer, audience, signature and lifetime
/// before ASP.NET Core routed the request to the MCP endpoint. This class is the
/// <em>authorization</em> half — does the caller's token actually carry the
/// permission that this particular tool needs?
/// </summary>
public static class Scopes
{
    /// <summary>
    /// Claim types an OAuth 2.0 authorization server may use for granted scopes.
    /// The JWT profile (RFC 9068) prescribes <c>scope</c> with a space-separated
    /// value; Microsoft-flavoured issuers often use <c>scp</c> instead, and some
    /// issuers (Scalekit among them) additionally emit a repeated <c>scopes</c>
    /// claim. Read all of them so the sample works against more than one issuer.
    /// </summary>
    private static readonly string[] ScopeClaimTypes = ["scope", "scp", "scopes"];

    /// <summary>
    /// Checks that <paramref name="user"/> was granted every scope in
    /// <paramref name="required"/>.
    /// </summary>
    /// <returns>
    /// <see langword="null"/> when everything required is granted, otherwise a
    /// ready-to-return error result naming the missing scopes.
    /// </returns>
    /// <remarks>
    /// The failure is <em>returned as a tool result</em> with
    /// <see cref="CallToolResult.IsError"/>, not thrown. A thrown exception is
    /// turned by the SDK into a JSON-RPC <c>-32603 "An error occurred"</c>, which
    /// hides the reason from both the model and the user. A tool-level error names
    /// the missing scope, so the client can tell the user what to ask for — and
    /// the model can stop retrying a call that will never succeed.
    ///
    /// Note the difference in wire shape, too: a missing/invalid <em>token</em> is
    /// an HTTP <c>401</c> from the middleware (the transport says no), while a
    /// missing <em>scope</em> is an HTTP <c>200</c> carrying a normal JSON-RPC
    /// result with <c>isError: true</c> (the tool says no).
    /// </remarks>
    public static CallToolResult? Require(ClaimsPrincipal? user, params string[] required)
    {
        if (user?.Identity?.IsAuthenticated != true)
        {
            return Error("Authentication required.");
        }

        var granted = GrantedScopes(user);
        var missing = required.Where(scope => !granted.Contains(scope)).ToArray();

        return missing.Length == 0
            ? null
            : Error($"Missing required OAuth scope(s): {string.Join(", ", missing)}");
    }

    /// <summary>
    /// Flattens every scope-carrying claim of the principal into a set.
    /// </summary>
    public static HashSet<string> GrantedScopes(ClaimsPrincipal user)
        => [.. user.Claims
            .Where(c => ScopeClaimTypes.Contains(c.Type, StringComparer.OrdinalIgnoreCase))
            // A single claim may hold several space-separated scopes (RFC 9068),
            // and the same claim type may appear several times.
            .SelectMany(c => c.Value.Split(' ', StringSplitOptions.RemoveEmptyEntries))];

    private static CallToolResult Error(string message) => new()
    {
        IsError = true,
        Content = [new TextContentBlock { Text = message }],
    };
}
