using System.Text.Json;
using ModelContextProtocol.Extensions.Apps;
using ModelContextProtocol.Protocol;
using ModelContextProtocol.Server;

namespace McpAppsDotnet.Steps;

/// <summary>
/// Step 1 — Tool ↔ UI link.
///
/// The smallest possible MCP App: one tool, one UI resource, joined by
/// <c>_meta.ui.resourceUri</c>. When the host calls the tool it sees that link,
/// fetches the resource via <c>resources/read</c>, and mounts the returned HTML
/// in a sandboxed iframe — that iframe is the View in <c>ui/src/step1-hello/view.ts</c>.
///
/// <c>structuredContent</c> is the typed payload routed to the View next to the
/// plain <c>content</c> the model sees.
/// </summary>
public static class Step1Hello
{
    private const string ResourceUri = "ui://step1-hello/app.html";

    public static IEnumerable<McpServerTool> Tools() =>
    [
        // McpApps.SetAppUi writes _meta.ui on the finished tool and returns it, so it
        // can wrap the McpServerTool.Create call. That one line is what turns a plain
        // tool into an MCP App tool.
        McpApps.SetAppUi(
            McpServerTool.Create(Hello, new McpServerToolCreateOptions
            {
                Name = "step1-hello",
                Title = "Step 1 — Hello",
                Description = "Returns a greeting and the current server time. Renders an MCP App UI.",
            }),
            new McpUiToolMeta { ResourceUri = ResourceUri }),
    ];

    public static McpServerResource Resource(ViewStore views) =>
        McpServerResource.Create(() => views.Read(ResourceUri, "step1.html"), new McpServerResourceCreateOptions
        {
            UriTemplate = ResourceUri,
            Name = "step1-hello-ui",
            MimeType = McpApps.HtmlMimeType,
            Description = "Step 1 — Hello view",
        });

    private static CallToolResult Hello()
    {
        var time = DateTimeOffset.UtcNow.ToString("O");
        const string greeting = "Hello, MCP Apps!";
        return new CallToolResult
        {
            // `content`: shown to the model (and to humans in fallback hosts).
            Content = [new TextContentBlock { Text = $"{greeting} (server time {time})" }],
            // `structuredContent`: shipped verbatim to the View — same fields, no text round-trip.
            StructuredContent = JsonSerializer.SerializeToElement(new { time, greeting }),
        };
    }
}
