using ModelContextProtocol.Protocol;
using ModelContextProtocol.Server;

namespace McpAppsDotnet.Steps;

/// <summary>
/// Step 2 — Host context &amp; theming.
///
/// The tool itself is trivial (an empty payload). The lesson is on the View side
/// (<c>ui/src/step2-host-context/view.ts</c>): how a View reads the host's theme,
/// locale, dimensions, and CSS variables, and re-renders when they change.
/// </summary>
public static class Step2HostContext
{
    private const string ResourceUri = "ui://step2-host-context/app.html";

    public static IEnumerable<McpServerTool> Tools() =>
    [
        McpServerTool.Create(Open, new McpServerToolCreateOptions
        {
            Name = "step2-host-context",
            Title = "Step 2 — Host Context",
            Description = "Renders an MCP App that displays the host context (theme, display mode, " +
                          "dimensions) and re-renders on changes.",
            Meta = UiMeta.ResourceUri(ResourceUri),
        }),
    ];

    public static McpServerResource Resource(ViewStore views) =>
        McpServerResource.Create(() => views.Read(ResourceUri, "step2.html"), new McpServerResourceCreateOptions
        {
            UriTemplate = ResourceUri,
            Name = "step2-host-context-ui",
            MimeType = ViewStore.AppMime,
            Description = "Step 2 — Host context view",
        });

    private static CallToolResult Open() => new()
    {
        Content = [new TextContentBlock { Text = "Open the panel to see host context details." }],
    };
}
