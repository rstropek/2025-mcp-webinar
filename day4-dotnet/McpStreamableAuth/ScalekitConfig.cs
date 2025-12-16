namespace McpStreamableAuth;

/// <summary>
/// Scalekit configuration loaded from environment variables or configuration.
/// </summary>
public class ScalekitConfig
{
    public string EnvironmentUrl { get; set; } = string.Empty;
    public string AuthServer { get; set; } = string.Empty;
    public string ClientId { get; set; } = string.Empty;
    public string ClientSecret { get; set; } = string.Empty;
    public string Audience { get; set; } = string.Empty;
    public string ResourceId { get; set; } = string.Empty;
    public string? ResourceMetadata { get; set; }
    public string[] SupportedScopes { get; set; } = [];
}

/// <summary>
/// WWW-Authenticate header configuration for OAuth 2.0 Bearer token authentication.
/// 
/// This header implements RFC 6750 (OAuth 2.0 Bearer Token Usage) and serves multiple purposes:
/// 
/// 1. **Authentication Challenge**: Informs clients that the resource requires OAuth 2.0 Bearer token
///    authentication when they attempt to access protected endpoints without valid credentials.
/// 
/// 2. **Discovery Mechanism**: The `resource_metadata` parameter provides a URI where clients can
///    discover OAuth protected resource metadata (RFC 8693), including:
///    - Authorization server endpoint
///    - Supported scopes
///    - Token endpoint
///    - Resource capabilities
/// 
/// 3. **MCP Protocol Compliance**: This header is part of the Model Context Protocol (MCP) 
///    authentication flow, enabling MCP clients to automatically discover authentication 
///    requirements and initiate the OAuth 2.0 flow.
/// 
/// Format: WWW-Authenticate: Bearer realm="OAuth", resource_metadata="<metadata-uri>"
/// </summary>
public static class WwwAuthenticateHeader
{
    public const string Key = "WWW-Authenticate";
    
    public static string GetValue(string resourceId) => 
        $"Bearer realm=\"OAuth\", resource_metadata=\"{resourceId}/.well-known/oauth-protected-resource\"";
}

