using ModelContextProtocol.Protocol;
using ModelContextProtocol.Server;

namespace McpAppsDotnet.Steps;

/// <summary>
/// Step 4 — Talk to model.
///
/// The tool side is intentionally boring (a placeholder result). The lesson is
/// what the View (<c>ui/src/step4-talk-to-model/view.ts</c>) can do <em>after</em>
/// it mounts: push messages (<c>app.sendMessage</c>), pin context silently
/// (<c>app.updateModelContext</c>), and open external links (<c>app.openLink</c>) —
/// all through the host, never via DOM tricks in the sandboxed iframe.
/// </summary>
public static class Step4TalkToModel
{
    private const string ResourceUri = "ui://step4-talk-to-model/app.html";

    public static IEnumerable<McpServerTool> Tools() =>
    [
        McpServerTool.Create(Open, new McpServerToolCreateOptions
        {
            Name = "step4-talk-to-model",
            Title = "Step 4 — Talk to model",
            Description = "Opens a panel with buttons that push messages, pin context, and open links via the host.",
            Meta = UiMeta.ResourceUri(ResourceUri),
        }),
    ];

    public static McpServerResource Resource(ViewStore views) =>
        McpServerResource.Create(() => views.Read(ResourceUri, "step4.html"), new McpServerResourceCreateOptions
        {
            UriTemplate = ResourceUri,
            Name = "step4-talk-to-model-ui",
            MimeType = ViewStore.AppMime,
            Description = "Step 4 — Talk to model view",
        });

    private static CallToolResult Open() => new()
    {
        Content = [new TextContentBlock { Text = "Panel opened. Use the buttons to interact with the model." }],
    };
}
