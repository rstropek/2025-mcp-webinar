using System.ComponentModel;
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
builder.Services.AddMcpServer()
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
    public static async Task<object> EchoTool(
        McpServer server,
        [Description("The message to echo back.")] string message,
        [Description("If true, the tool will simulate thinking hard before responding. When in doubt, always set this to false.")] bool thinkHard = false)
    {
        // Note: Logging capabilities may need to be enabled in server configuration
        // For now, we'll use console logging as a fallback
        Console.WriteLine("Echo tool invoked");

        if (thinkHard)
        {
            for (int i = 0; i < 3; i++)
            {
                await Task.Delay(1000);
                Console.WriteLine($"Thinking hard... ({i + 1}/3)");
            }
        }

        return new
        {
            content = new[]
            {
                new { type = "text", text = $"Echo: {message}" }
            }
        };
    }
}
