using System.Collections.Concurrent;
using System.Text.Json;
using System.Text.Json.Nodes;
using ModelContextProtocol;
using ModelContextProtocol.Extensions.Apps;
using ModelContextProtocol.Protocol;

namespace McpAppsDotnet;

/// <summary>
/// Loads the Vite-bundled single-file HTML views and wraps them in the
/// <c>resources/read</c> result an MCP App host expects.
///
/// The build (see the <c>BuildUiViews</c> and <c>CopyUiViews</c> targets in the
/// .csproj) builds the Vite bundles and copies <c>ui/dist/stepN.html</c> into the
/// output <c>views/</c> folder, so the files sit next to the executable at
/// <see cref="AppContext.BaseDirectory"/>. Files are read once and cached — they
/// never change while the server runs.
/// </summary>
public sealed class ViewStore
{
    private static readonly string ViewsDir = Path.Combine(AppContext.BaseDirectory, "views");

    private readonly ConcurrentDictionary<string, string> _cache = new();

    /// <summary>Returns the bundled HTML for <paramref name="fileName"/> (e.g. <c>step1.html</c>).</summary>
    public string Html(string fileName) => _cache.GetOrAdd(fileName, Load);

    /// <summary>
    /// Builds the <c>resources/read</c> result for a UI resource: a single
    /// <see cref="TextResourceContents"/> carrying the HTML, the MCP Apps MIME
    /// type (<see cref="McpApps.HtmlMimeType"/>), and optional content-level
    /// <c>_meta.ui</c> (used by step 6 for CSP).
    /// </summary>
    /// <remarks>
    /// The Apps package ships helpers for the tool and the resource *listing*
    /// (<c>McpApps.SetAppUi</c> / <c>McpApps.SetResourceUi</c>) but none for the
    /// <em>content</em> level, because <see cref="ResourceContents.Meta"/> is a raw
    /// <see cref="JsonObject"/>. So we serialize the typed
    /// <see cref="McpUiResourceMeta"/> ourselves with
    /// <see cref="McpApps.SerializerOptions"/> — those options carry the
    /// source-generated contracts (and the camelCase/ignore-null naming) for the
    /// Apps types, so the result is exactly the JSON the host expects — and hang it
    /// under the <c>ui</c> key.
    /// </remarks>
    public ReadResourceResult Read(string uri, string fileName, McpUiResourceMeta? ui = null) => new()
    {
        Contents =
        [
            new TextResourceContents
            {
                Uri = uri,
                MimeType = McpApps.HtmlMimeType,
                Text = Html(fileName),
                Meta = ui is null ? null : MetaObject(ui),
            },
        ],
    };

    /// <summary>
    /// Serializes a <see cref="McpUiResourceMeta"/> into the raw <c>{ "ui": … }</c>
    /// <see cref="JsonObject"/> that the SDK's untyped <c>Meta</c> properties take.
    /// </summary>
    public static JsonObject MetaObject(McpUiResourceMeta ui) =>
        new() { ["ui"] = JsonSerializer.SerializeToNode(ui, McpApps.SerializerOptions) };

    private static string Load(string fileName)
    {
        var path = Path.Combine(ViewsDir, fileName);
        if (!File.Exists(path))
        {
            throw new McpException(
                $"View '{fileName}' not found at '{path}'. Build the UI first " +
                "(cd ../ui && npm install && npm run build), or run dotnet build without -p:SkipUiBuild=true.");
        }

        return File.ReadAllText(path);
    }
}
