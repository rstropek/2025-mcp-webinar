using System.Text.Json;
using ModelContextProtocol.Extensions.Apps;
using ModelContextProtocol.Protocol;
using ModelContextProtocol.Server;

namespace McpAppsDotnet.Steps;

/// <summary>
/// Step 3 — View → Server tool calls + app-only visibility.
///
/// Two tools, one shared UI resource:
/// <list type="bullet">
///   <item><c>step3-quote</c> — visibility model + app (default). The model calls
///   this to <em>open</em> the quote panel.</item>
///   <item><c>step3-next-quote</c> — visibility <c>["app"]</c>. Only the View can
///   call it (via <c>app.callServerTool</c>); the model never sees it, so it never
///   invokes it directly and no conversation turn is consumed.</item>
/// </list>
/// The shared <c>resourceUri</c> binds both tools to the same iframe.
/// </summary>
public static class Step3CallTool
{
    private const string ResourceUri = "ui://step3-call-tool/app.html";

    private static readonly (string Quote, string Author)[] Quotes =
    [
        ("The only way to do great work is to love what you do.", "Steve Jobs"),
        ("Simplicity is the ultimate sophistication.", "Leonardo da Vinci"),
        ("Make it work, make it right, make it fast.", "Kent Beck"),
        ("Premature optimization is the root of all evil.", "Donald Knuth"),
        ("Talk is cheap. Show me the code.", "Linus Torvalds"),
        ("There are only two hard things in computer science: cache invalidation and naming things.", "Phil Karlton"),
    ];

    public static IEnumerable<McpServerTool> Tools() =>
    [
        // Model-facing tool: this is the one shown in the model's tool list.
        // Leaving Visibility unset = visible to both model and app (the default).
        McpApps.SetAppUi(
            McpServerTool.Create(Pick, new McpServerToolCreateOptions
            {
                Name = "step3-quote",
                Title = "Step 3 — Random Quote",
                Description = "Shows a random programming quote and an interactive UI to fetch more.",
            }),
            new McpUiToolMeta { ResourceUri = ResourceUri }),
        // App-only tool: invisible to the model. The View calls it when the user
        // clicks "Another one" — no conversation turn is consumed. Note there is no
        // ResourceUri here: the tool renders nothing itself, it only feeds the iframe
        // that step3-quote already opened.
        McpApps.SetAppUi(
            McpServerTool.Create(Pick, new McpServerToolCreateOptions
            {
                Name = "step3-next-quote",
                Title = "Step 3 — Next Quote (app-only)",
                Description = "Returns another random quote. Hidden from the model.",
            }),
            new McpUiToolMeta { Visibility = [McpUiToolVisibility.App] }),
    ];

    public static McpServerResource Resource(ViewStore views) =>
        McpServerResource.Create(() => views.Read(ResourceUri, "step3.html"), new McpServerResourceCreateOptions
        {
            UriTemplate = ResourceUri,
            Name = "step3-call-tool-ui",
            MimeType = McpApps.HtmlMimeType,
            Description = "Step 3 — Random quote view",
        });

    private static CallToolResult Pick()
    {
        var (quote, author) = Quotes[Random.Shared.Next(Quotes.Length)];
        return new CallToolResult
        {
            Content = [new TextContentBlock { Text = $"\"{quote}\" — {author}" }],
            StructuredContent = JsonSerializer.SerializeToElement(new { quote, author }),
        };
    }
}
