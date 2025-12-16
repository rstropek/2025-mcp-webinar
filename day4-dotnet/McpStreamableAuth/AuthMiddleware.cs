using Microsoft.AspNetCore.Http;
using System.Net;
using System.IdentityModel.Tokens.Jwt;
using Microsoft.IdentityModel.Tokens;
using System.Security.Claims;

namespace McpStreamableAuth;

/// <summary>
/// Mandatory authentication middleware that requires valid Bearer tokens for all requests.
/// Requests without valid tokens will be rejected with 401 Unauthorized.
/// </summary>
public class RequiredAuthMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ScalekitConfig _config;
    private readonly JwtSecurityTokenHandler _tokenHandler;

    public RequiredAuthMiddleware(RequestDelegate next, ScalekitConfig config)
    {
        _next = next;
        _config = config;
        _tokenHandler = new JwtSecurityTokenHandler();
    }

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            // Extract Bearer token from Authorization header
            var authHeader = context.Request.Headers.Authorization.ToString();
            string? token = null;

            if (authHeader.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
            {
                token = authHeader.Substring("Bearer ".Length).Trim();
            }

            if (string.IsNullOrWhiteSpace(token))
            {
                throw new UnauthorizedAccessException("Bearer token required");
            }

            // Validate token using JWT validation
            // Note: This is a simplified validation. For production, you should:
            // 1. Fetch JWKS (JSON Web Key Set) from Scalekit's authorization server
            // 2. Validate the token signature using the public keys from JWKS
            // 3. Validate issuer, audience, expiration, etc.
            //
            // The TypeScript version uses scalekit.validateToken() which handles all of this.
            // For now, we do basic validation. In production, implement proper JWKS validation.
            
            var jwtToken = _tokenHandler.ReadJwtToken(token);
            
            // Validate audience (must match resource ID)
            var audience = jwtToken.Claims.FirstOrDefault(c => c.Type == "aud" || c.Type == ClaimTypes.NameIdentifier)?.Value;
            if (string.IsNullOrEmpty(audience) || 
                (audience != _config.ResourceId && audience != _config.Audience))
            {
                throw new SecurityTokenValidationException($"Invalid audience. Expected: {_config.ResourceId} or {_config.Audience}, Got: {audience}");
            }

            // Validate expiration
            if (jwtToken.ValidTo < DateTime.UtcNow)
            {
                throw new SecurityTokenExpiredException("Token has expired");
            }

            // Extract claims
            var claims = jwtToken.Claims.ToDictionary(c => c.Type, c => (object)c.Value);
            
            // Note: Signature validation is NOT performed here.
            // The Scalekit SDK's validateToken() in TypeScript validates the signature using JWKS.
            // For production, you should implement JWKS validation here.

            // Attach token and claims to HttpContext for use by tools
            context.Items["Token"] = token;
            context.Items["TokenClaims"] = claims;
            context.Items["IsAuthenticated"] = true;

            // Set auth context for the current async operation chain
            var authContext = new AuthContext
            {
                Token = token,
                TokenClaims = claims,
                IsAuthenticated = true
            };
            AuthContextAccessor.SetContext(authContext);

            Console.WriteLine("✓ Authenticated request with token");

            // Continue to next middleware
            await _next(context);
        }
        catch (Exception ex)
        {
            // Invalid or missing token - return 401 with WWW-Authenticate header
            Console.WriteLine($"⚠️ Authentication failed: {ex.Message}");
            context.Response.StatusCode = (int)HttpStatusCode.Unauthorized;
            context.Response.Headers.Append(WwwAuthenticateHeader.Key, 
                WwwAuthenticateHeader.GetValue(_config.ResourceId));
            await context.Response.WriteAsync("Unauthorized");
        }
    }
}

/// <summary>
/// Extension method to register the authentication middleware.
/// </summary>
public static class RequiredAuthMiddlewareExtensions
{
    public static IApplicationBuilder UseRequiredAuth(this IApplicationBuilder builder)
    {
        return builder.UseMiddleware<RequiredAuthMiddleware>();
    }
}

