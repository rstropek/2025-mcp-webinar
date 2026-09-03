using System.ComponentModel;
using ModelContextProtocol;
using ModelContextProtocol.AspNetCore;
using ModelContextProtocol.Protocol;
using ModelContextProtocol.Server;

var builder = WebApplication.CreateBuilder(args);

builder.AddServiceDefaults();

// CORS so that browser-based hosts (e.g. the MCP Inspector in "direct" mode) can
// reach the endpoint. Note what is NOT here any more: `Mcp-Session-Id`. The
// 2026-07-28 revision removed sessions altogether, so there is no session header
// left to expose. The three headers a modern client sends are
// `MCP-Protocol-Version`, `Mcp-Method` and `Mcp-Name` - all covered by
// `AllowAnyHeader()`.
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy => policy
        .AllowAnyOrigin()
        .AllowAnyMethod()
        .AllowAnyHeader());
});

// Add MCP server services.
//
// There is no `Capabilities.Logging` any more: SEP-2577 deprecated the logging
// notifications (and sampling and roots) in the 2026-07-28 revision. Progress
// notifications took over the "tell the user what is happening while a tool
// runs" job - see `EchoTools.EchoTool` below.
builder.Services.AddMcpServer(options =>
{
    options.ServerInfo = new Implementation { Name = "demo-mcp-server", Version = "1.0.0" };
})
    .WithHttpTransport(options =>
    {
        // `Stateless` is the default as of the 2026-07-28 revision and is spelled
        // out here to make the teaching point visible:
        //
        // - no `initialize` handshake, no `Mcp-Session-Id`, no state between two
        //   requests. Every POST carries everything the server needs in its
        //   `params._meta` envelope, so any replica behind a load balancer can
        //   answer any request.
        // - GET and DELETE (the 2025-era standalone SSE stream and session
        //   teardown) are answered with 405.
        // - 2025-era clients that still send `initialize` are served too, each
        //   request from a fresh server instance.
        //
        // The price: server->client requests (`elicitation/create`, sampling) are
        // impossible here, because the server holds no channel to push on. See
        // `McpStreamableServer` for how to ask the user something anyway (MRTR).
        options.SessionMode = HttpServerSessionMode.Stateless;
    })
    .WithToolsFromAssembly();

var app = builder.Build();

// Use CORS
app.UseCors();

// Health check endpoint - a plain ASP.NET Core route, nothing MCP about it.
app.MapGet("/ping", () => Results.Json(new { message = "pong" }));

// Map the MCP endpoint. Giving it an explicit path keeps the URL stable and
// obvious in the clients' config files: http://localhost:5147/mcp
app.MapMcp("/mcp");

app.Run();

[McpServerToolType]
public static class EchoTools
{
    /// <summary>Number of "thinking" steps the echo tool reports when <c>thinkHard</c> is true.</summary>
    private const int ThinkSteps = 3;

    [McpServerTool(Name = "echo-tool", ReadOnly = true, Title = "Echo Tool"), Description("A tool that echoes back the input it receives.")]
    public static async Task<string> EchoTool(
        [Description("The message to echo back.")] string message,
        [Description("If true, the tool will simulate thinking hard before responding. When in doubt, always set this to false.")] bool thinkHard,
        // Both parameters below are injected by the SDK, not filled in by the model
        // - they do not show up in the tool's input schema.
        //
        // `IProgress<ProgressNotificationValue>` forwards `notifications/progress`
        // to the caller, tagged with the `progressToken` the client put into the
        // request's `_meta`. If the client did NOT send a token, every `Report`
        // call is a no-op: without a token there would be nothing to correlate
        // the notifications with, so the server must stay silent.
        IProgress<ProgressNotificationValue> progress,
        // Cancellation over Streamable HTTP means "the client closed the response
        // stream". Long-running tools must honour it instead of burning CPU for
        // an answer nobody will read.
        CancellationToken cancellationToken = default)
    {
        if (thinkHard)
        {
            for (var step = 1; step <= ThinkSteps; step++)
            {
                try
                {
                    await Task.Delay(1000, cancellationToken);
                }
                catch (OperationCanceledException)
                {
                    // The client hung up. Stop working and return what we have.
                    break;
                }

                // THIS is what makes Streamable HTTP interesting: as soon as the
                // handler emits a message before its result, the response can no
                // longer be a single JSON object, so the SDK upgrades it to an SSE
                // stream. The progress events arrive while the tool is still
                // running; the result is the last event on the stream.
                // `Progress` must strictly increase from notification to notification.
                progress.Report(new ProgressNotificationValue
                {
                    Progress = step,
                    Total = ThinkSteps,
                    Message = $"Thinking hard... ({step}/{ThinkSteps})",
                });
            }
        }

        return $"Echo: {message}";
    }
}
