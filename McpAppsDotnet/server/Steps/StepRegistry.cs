using ModelContextProtocol.Server;

namespace McpAppsDotnet.Steps;

/// <summary>
/// Collects the tools and UI resources of every training step so
/// <c>Program.cs</c> can register them with one <c>WithTools</c> /
/// <c>WithResources</c> call each.
/// </summary>
public static class StepRegistry
{
    public static IEnumerable<McpServerTool> Tools() =>
    [
        .. Step1Hello.Tools(),
        .. Step2HostContext.Tools(),
        .. Step3CallTool.Tools(),
        .. Step4TalkToModel.Tools(),
        .. Step5LivePolling.Tools(),
        .. Step6FullscreenCsp.Tools(),
    ];

    public static IEnumerable<McpServerResource> Resources(ViewStore views) =>
    [
        Step1Hello.Resource(views),
        Step2HostContext.Resource(views),
        Step3CallTool.Resource(views),
        Step4TalkToModel.Resource(views),
        Step5LivePolling.Resource(views),
        Step6FullscreenCsp.Resource(views),
    ];
}
