using System.Collections.Concurrent;
using System.Text.Json.Nodes;
using ModelContextProtocol;
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
    /// <summary>The MCP Apps profile MIME type that marks a resource as an embeddable UI.</summary>
    public const string AppMime = "text/html;profile=mcp-app";

    private static readonly string ViewsDir = Path.Combine(AppContext.BaseDirectory, "views");

    private readonly ConcurrentDictionary<string, string> _cache = new();

    /// <summary>Returns the bundled HTML for <paramref name="fileName"/> (e.g. <c>step1.html</c>).</summary>
    public string Html(string fileName) => _cache.GetOrAdd(fileName, Load);

    /// <summary>
    /// Builds the <c>resources/read</c> result for a UI resource: a single
    /// <see cref="TextResourceContents"/> carrying the HTML, the MCP Apps MIME
    /// type, and optional content-level <c>_meta</c> (used by step 6 for CSP).
    /// </summary>
    public ReadResourceResult Read(string uri, string fileName, JsonObject? meta = null) => new()
    {
        Contents =
        [
            new TextResourceContents
            {
                Uri = uri,
                MimeType = AppMime,
                Text = Html(fileName),
                Meta = meta,
            },
        ],
    };

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
