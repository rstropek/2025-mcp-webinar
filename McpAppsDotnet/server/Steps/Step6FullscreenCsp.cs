using System.ComponentModel;
using System.Text.Json;
using System.Text.Json.Nodes;
using ModelContextProtocol.Protocol;
using ModelContextProtocol.Server;

namespace McpAppsDotnet.Steps;

/// <summary>
/// Step 6 — Display modes + external resources via CSP.
///
/// Two new pieces of <c>_meta.ui</c> show up here, attached at the
/// <em>content</em> level of the <c>resources/read</c> result:
/// <list type="bullet">
///   <item><c>csp.resourceDomains</c> — origins the View may load
///   <c>&lt;img&gt;</c>/<c>&lt;script&gt;</c>/font/media from (the <c>img-src</c>/
///   <c>script-src</c>/… buckets). Use <c>csp.connectDomains</c> for
///   <c>fetch</c>/XHR/WebSocket targets. The host's default CSP is effectively
///   <c>default-src 'none'</c>, so without this whitelist the <c>flagcdn.com</c>
///   image is blocked.</item>
///   <item><c>prefersBorder</c> — a cosmetic hint; a <em>direct</em> field of
///   <c>_meta.ui</c> (sibling of <c>csp</c>/<c>permissions</c>), not nested under
///   any wrapper.</item>
/// </list>
/// The View asks for fullscreen via <c>app.requestDisplayMode</c> — see
/// <c>ui/src/step6-fullscreen-csp/view.ts</c>.
/// </summary>
public static class Step6FullscreenCsp
{
    private const string ResourceUri = "ui://step6-fullscreen-csp/app.html";

    private static readonly Dictionary<string, string> Countries = new()
    {
        ["at"] = "Austria",
        ["de"] = "Germany",
        ["fr"] = "France",
        ["jp"] = "Japan",
        ["us"] = "United States",
        ["br"] = "Brazil",
    };

    public static IEnumerable<McpServerTool> Tools() =>
    [
        McpServerTool.Create(Flag, new McpServerToolCreateOptions
        {
            Name = "step6-flag",
            Title = "Step 6 — Country Flag",
            Description = "Shows a country flag image from an external CDN inside a sandboxed iframe. " +
                          "The View can toggle fullscreen.",
            Meta = UiMeta.ResourceUri(ResourceUri),
        }),
    ];

    public static McpServerResource Resource(ViewStore views) =>
        McpServerResource.Create(() => views.Read(ResourceUri, "step6.html", ContentMeta()), new McpServerResourceCreateOptions
        {
            UriTemplate = ResourceUri,
            Name = "step6-fullscreen-csp-ui",
            MimeType = ViewStore.AppMime,
            Description = "Step 6 — Fullscreen + CSP view",
        });

    private static CallToolResult Flag(
        [Description("ISO 3166-1 alpha-2 code, e.g. 'at'")] string? code = "at")
    {
        code = (code ?? "at").ToLowerInvariant();
        var country = Countries.TryGetValue(code, out var name) ? name : code.ToUpperInvariant();
        return new CallToolResult
        {
            Content = [new TextContentBlock { Text = $"Showing flag of {country} ({code})." }],
            StructuredContent = JsonSerializer.SerializeToElement(new { country, code }),
        };
    }

    // Content-level _meta on the resource read result (takes precedence over any
    // listing-level _meta). Without the resourceDomains entry the View's <img> is
    // blocked by the host's default-deny CSP.
    //
    // Note the shape: `csp` and `prefersBorder` are BOTH direct children of `ui`.
    // `prefersBorder` is not wrapped in a `preferences` object (that key does not
    // exist in the MCP Apps schema — a host would silently ignore it).
    private static JsonObject ContentMeta() => new()
    {
        ["ui"] = new JsonObject
        {
            ["csp"] = new JsonObject
            {
                ["resourceDomains"] = new JsonArray("https://flagcdn.com"),
            },
            ["prefersBorder"] = true,
        },
    };
}
