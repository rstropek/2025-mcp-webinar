var builder = DistributedApplication.CreateBuilder(args);

builder.AddProject<Projects.DemoServer>("demo-server");
builder.AddProject<Projects.McpStreamableServer>("mcp-streamable-server");

builder.Build().Run();
