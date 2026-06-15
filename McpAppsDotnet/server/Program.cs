using McpAppsDotnet;
using McpAppsDotnet.Steps;
using ModelContextProtocol.Protocol;

var builder = WebApplication.CreateBuilder(args);

// Bind to a fixed port (3001) so MCPJam (and any other host) always knows where
// to find us, whether started via `dotnet run` or as a published binary. Honour
// ASPNETCORE_URLS when it is set, so the port can be changed without editing code
// (e.g. `ASPNETCORE_URLS=http://localhost:3005 dotnet run` to dodge a clash).
builder.WebHost.UseUrls(
    Environment.GetEnvironmentVariable("ASPNETCORE_URLS") ?? "http://localhost:3001");

// MCP App hosts run in a different origin (MCPJam in the browser, Claude, …), so
// the Streamable HTTP endpoint needs permissive CORS that exposes the session id.
builder.Services.AddCors(options => options.AddDefaultPolicy(policy => policy
    .AllowAnyOrigin()
    .AllowAnyMethod()
    .AllowAnyHeader()
    .WithExposedHeaders("Mcp-Session-Id")));

// The views are read from disk once and cached; share one instance.
var views = new ViewStore();

builder.Services.AddMcpServer(options =>
    {
        options.ServerInfo = new Implementation { Name = "MCP Apps Training Demo (.NET)", Version = "0.1.0" };
    })
    // Stateless = true: every HTTP request gets a fresh, independent server with no
    // persisted session. That is fine here because no step keeps per-session state
    // (the step 5 dashboard re-polls a self-contained tool; "uptime" is process-wide,
    // not per-view). If you add features that need server→client calls (sampling,
    // elicitation) or per-session memory, drop stateless mode.
    .WithHttpTransport(options => options.Stateless = true)
    .WithTools(StepRegistry.Tools())
    .WithResources(StepRegistry.Resources(views));

var app = builder.Build();

app.UseCors();
app.MapMcp("/mcp");

app.Run();
