using McpAppsDotnet;
using McpAppsDotnet.Steps;
using ModelContextProtocol.AspNetCore;
using ModelContextProtocol.Protocol;

var builder = WebApplication.CreateBuilder(args);

// Bind to a fixed port (3001) so MCPJam (and any other host) always knows where
// to find us, whether started via `dotnet run` or as a published binary. Honour
// ASPNETCORE_URLS when it is set, so the port can be changed without editing code
// (e.g. `ASPNETCORE_URLS=http://localhost:3005 dotnet run` to dodge a clash).
builder.WebHost.UseUrls(
    Environment.GetEnvironmentVariable("ASPNETCORE_URLS") ?? "http://localhost:3001");

// MCP App hosts run in a different origin (MCPJam in the browser, Claude, …), so
// the Streamable HTTP endpoint needs permissive CORS. Note what is *not* here any
// more: `WithExposedHeaders("Mcp-Session-Id")`. Sessions are gone in 2026-07-28 —
// there is no session id header left to expose. What a 2026-07-28 client does send
// is `MCP-Protocol-Version`, `Mcp-Method` and `Mcp-Name`, all covered by
// AllowAnyHeader().
builder.Services.AddCors(options => options.AddDefaultPolicy(policy => policy
    .AllowAnyOrigin()
    .AllowAnyMethod()
    .AllowAnyHeader()));

// The views are read from disk once and cached; share one instance.
var views = new ViewStore();

builder.Services.AddMcpServer(options =>
    {
        options.ServerInfo = new Implementation { Name = "MCP Apps Training Demo (.NET)", Version = "0.1.0" };
    })
    // SessionMode.Stateless: every HTTP request gets a fresh, independent server
    // with no persisted session — no `Mcp-Session-Id`, no GET SSE stream, DELETE
    // answers 405. That is the *default and only* shape of Streamable HTTP in spec
    // revision 2026-07-28, and it is a perfect fit here because no step keeps
    // per-session state (the step 5 dashboard re-polls a self-contained tool;
    // "uptime" is process-wide, not per-view).
    //
    // The other modes exist for older clients: `Stateful` keeps a session but
    // *rejects* 2026-07-28 (-32022), `StatefulForInitializeClients` is the hybrid
    // you need when legacy clients must be served server→client requests
    // (elicitation/sampling) — see day3-dotnet. Not needed for MCP Apps: everything
    // a View does goes through the *host*, never through a server→client request.
    .WithHttpTransport(options => options.SessionMode = HttpServerSessionMode.Stateless)
    // Tools and resources are built by hand (McpServerTool.Create + McpApps.SetAppUi)
    // so every step file shows the _meta.ui it produces. The attribute-driven
    // alternative is `[McpServerTool] [McpAppUi(ResourceUri = "ui://…")]` on a method
    // plus `.WithMcpApps()` on the builder, which copies the attribute into _meta.ui
    // for you.
    .WithTools(StepRegistry.Tools())
    .WithResources(StepRegistry.Resources(views));

var app = builder.Build();

app.UseCors();
app.MapMcp("/mcp");

app.Run();
