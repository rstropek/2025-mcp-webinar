using System.Globalization;
using System.Text.Json;
using ModelContextProtocol.Protocol;
using ModelContextProtocol.Server;

namespace McpAppsDotnet.Steps;

/// <summary>
/// Step 5 — Live polling with lifecycle cleanup.
///
/// Two tools, one resource:
/// <list type="bullet">
///   <item><c>step5-monitor</c> — model-facing, opens the dashboard.</item>
///   <item><c>step5-stats</c> — app-only (<c>visibility: ["app"]</c>), called every
///   2&#160;s by the View. The model never sees the storm of poll calls.</item>
/// </list>
/// The View stops the timer on <c>app.onteardown</c> — see
/// <c>ui/src/step5-live-polling/view.ts</c>.
/// </summary>
public static class Step5LivePolling
{
    private const string ResourceUri = "ui://step5-live-polling/app.html";

    private static readonly DateTimeOffset StartedAt = DateTimeOffset.UtcNow;

    public static IEnumerable<McpServerTool> Tools() =>
    [
        McpServerTool.Create(Sample, new McpServerToolCreateOptions
        {
            Name = "step5-monitor",
            Title = "Step 5 — Live host monitor",
            Description = "Opens a dashboard that polls host stats every 2 s via an app-only tool.",
            Meta = UiMeta.ResourceUri(ResourceUri),
        }),
        // App-only polling tool. The model has no idea this exists, so it can't
        // accidentally start spamming it.
        McpServerTool.Create(Sample, new McpServerToolCreateOptions
        {
            Name = "step5-stats",
            Title = "Step 5 — Poll Stats (app-only)",
            Description = "Returns the latest host stats sample. Hidden from the model.",
            Meta = UiMeta.AppOnly(),
        }),
    ];

    public static McpServerResource Resource(ViewStore views) =>
        McpServerResource.Create(() => views.Read(ResourceUri, "step5.html"), new McpServerResourceCreateOptions
        {
            UriTemplate = ResourceUri,
            Name = "step5-live-polling-ui",
            MimeType = ViewStore.AppMime,
            Description = "Step 5 — Live polling view",
        });

    private static CallToolResult Sample()
    {
        // CPU and memory are intentionally synthetic: they animate the demo
        // without depending on platform-specific probes (which is the point —
        // the View just renders whatever the app-only tool streams it).
        var nowMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var cpu = 30 + Math.Sin(nowMs / 1000.0) * 15 + Random.Shared.NextDouble() * 5;
        var memory = 55 + Math.Cos(nowMs / 1700.0) * 12 + Random.Shared.NextDouble() * 4;
        var uptime = (int)Math.Round((DateTimeOffset.UtcNow - StartedAt).TotalSeconds);
        var timestamp = DateTimeOffset.UtcNow.ToString("O");

        return new CallToolResult
        {
            // Format the human-readable text with the invariant culture so it reads
            // "30.5%" everywhere — under a German/Austrian locale CurrentCulture would
            // otherwise produce "30,5%". (structuredContent stays numeric JSON, so the
            // View is unaffected; this only matters for the model-facing text.)
            Content =
            [
                new TextContentBlock
                {
                    Text = string.Create(CultureInfo.InvariantCulture, $"cpu {cpu:F1}% / mem {memory:F1}%"),
                },
            ],
            StructuredContent = JsonSerializer.SerializeToElement(new { cpu, memory, uptime, timestamp }),
        };
    }
}
