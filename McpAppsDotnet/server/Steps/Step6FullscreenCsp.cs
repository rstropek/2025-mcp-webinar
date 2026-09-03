using System.ComponentModel;
using System.Text.Json;
using ModelContextProtocol.Extensions.Apps;
using ModelContextProtocol.Protocol;
using ModelContextProtocol.Server;

namespace McpAppsDotnet.Steps;

/// <summary>
/// Step 6 — Display modes + external resources via CSP.
///
/// Two new pieces of <c>_meta.ui</c> show up here, expressed as a
/// <see cref="McpUiResourceMeta"/> and attached to the <em>content</em> of the
/// <c>resources/read</c> result (and, for completeness, to the resource listing —
/// see <see cref="Resource"/>):
/// <list type="bullet">
///   <item><see cref="McpUiResourceCsp.ResourceDomains"/> (<c>csp.resourceDomains</c>)
///   — origins the View may load <c>&lt;img&gt;</c>/<c>&lt;script&gt;</c>/font/media
///   from (the <c>img-src</c>/<c>script-src</c>/… buckets). Use
///   <see cref="McpUiResourceCsp.ConnectDomains"/> for <c>fetch</c>/XHR/WebSocket
///   targets. The host's default CSP is effectively <c>default-src 'none'</c>, so
///   without this whitelist the <c>flagcdn.com</c> image is blocked.</item>
///   <item><see cref="McpUiResourceMeta.PrefersBorder"/> (<c>prefersBorder</c>) — a
///   cosmetic hint; a <em>direct</em> field of <c>_meta.ui</c> (sibling of
///   <c>csp</c>/<c>permissions</c>), not nested under any wrapper.</item>
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
        McpApps.SetAppUi(
            McpServerTool.Create(Flag, new McpServerToolCreateOptions
            {
                Name = "step6-flag",
                Title = "Step 6 — Country Flag",
                Description = "Shows a country flag image from an external CDN inside a sandboxed iframe. " +
                              "The View can toggle fullscreen.",
            }),
            new McpUiToolMeta { ResourceUri = ResourceUri }),
    ];

    public static McpServerResource Resource(ViewStore views)
    {
        // The same McpUiResourceMeta is published on every level a host might look at.
        //
        // 1) Content level (`views.Read(..., UiMeta)`) — the _meta of the single
        //    TextResourceContents in the resources/read result. This is the one that
        //    matters: it takes precedence over listing metadata and is what a host
        //    evaluates right before it builds the sandboxed iframe.
        // 2) Listing level (`Meta` below) — shown in resources/list, so a host that
        //    pre-scans resources knows about the CSP before reading anything.
        var resource = McpServerResource.Create(
            () => views.Read(ResourceUri, "step6.html", UiMeta),
            new McpServerResourceCreateOptions
            {
                UriTemplate = ResourceUri,
                Name = "step6-fullscreen-csp-ui",
                MimeType = McpApps.HtmlMimeType,
                Description = "Step 6 — Fullscreen + CSP view",
                Meta = ViewStore.MetaObject(UiMeta),
            });

        // 3) Template level — McpApps.SetResourceUi writes ResourceTemplate.Meta,
        //    which surfaces in resources/templates/list. Careful: for a resource whose
        //    URI has no parameters (like this one) the SDK exposes only the concrete
        //    Resource, so templates/list is empty and SetResourceUi alone would never
        //    reach the wire — hence the explicit `Meta` in step 2. Verified against
        //    ModelContextProtocol 2.2.0 with curl.
        return McpApps.SetResourceUi(resource, UiMeta);
    }

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

    // The typed _meta.ui for this resource. Without the ResourceDomains entry the
    // View's <img> is blocked by the host's default-deny CSP.
    //
    // Using McpUiResourceMeta instead of a hand-built JsonObject also removes a whole
    // class of typos: PrefersBorder is a property of the meta object itself, so it
    // cannot accidentally end up nested under an invented `preferences` wrapper (a
    // host would silently ignore that). Other properties available here: Permissions
    // (iframe `allow` list) and Domain (dedicated origin); Csp additionally offers
    // ConnectDomains (fetch/XHR/WebSocket), FrameDomains and BaseUris.
    private static readonly McpUiResourceMeta UiMeta = new()
    {
        Csp = new McpUiResourceCsp { ResourceDomains = ["https://flagcdn.com"] },
        PrefersBorder = true,
    };
}
