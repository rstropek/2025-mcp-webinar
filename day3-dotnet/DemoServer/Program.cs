using System.ComponentModel;
using ModelContextProtocol;
using ModelContextProtocol.Protocol;
using ModelContextProtocol.Server;

var builder = WebApplication.CreateBuilder(args);

builder.AddServiceDefaults();

// Add CORS services
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy => policy
        .AllowAnyOrigin()
        .AllowAnyMethod()
        .AllowAnyHeader()
        .WithExposedHeaders("Mcp-Session-Id"));
});

// Add MCP server services
builder.Services.AddMcpServer(options =>
{
    options.ServerInfo = new Implementation { Name = "demo-mcp-server", Version = "1.0.0" };
    options.Capabilities ??= new ServerCapabilities();
    options.Capabilities.Logging ??= new LoggingCapability();
})
    .WithHttpTransport()
    .WithToolsFromAssembly();

var app = builder.Build();

// Use CORS
app.UseCors();

// Health check endpoint
app.MapGet("/ping", () => Results.Json(new { message = "pong" }));

// Map MCP endpoints
app.MapMcp();

app.Run();

[McpServerToolType]
public static class EchoTools
{
    [McpServerTool(Name = "echo-tool"), Description("A tool that echoes back the input it receives.")]
    public static async Task<string> EchoTool(
        McpServer server,
        [Description("The message to echo back.")] string message,
        [Description("If true, the tool will simulate thinking hard before responding. When in doubt, always set this to false.")] bool thinkHard = false)
    {
        // Stream progress back to the client over the open Streamable HTTP
        // connection — this is the core benefit over plain request/response.
        await SendLog(server, LoggingLevel.Debug, "Echo tool invoked");

        if (thinkHard)
        {
            const int steps = 3;
            for (int i = 0; i < steps; i++)
            {
                await Task.Delay(1000);
                await SendLog(server, LoggingLevel.Info, $"Thinking hard... ({i + 1}/{steps})");
            }
        }

        return $"Echo: {message}";
    }

    private static Task SendLog(McpServer server, LoggingLevel level, string data) =>
        server.SendNotificationAsync(
            NotificationMethods.LoggingMessageNotification,
            new LoggingMessageNotificationParams { Level = level, Data = System.Text.Json.JsonSerializer.SerializeToElement(data) });
}
