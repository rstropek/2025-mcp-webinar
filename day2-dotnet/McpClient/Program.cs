using ModelContextProtocol.Client;
using ModelContextProtocol.Protocol;

// ---------------------------------------------------------------------------
// A minimal MCP client over stdio. It spawns the McpServerSdk sample as a
// child process and talks to it over the child's stdin/stdout.
//
// IMPORTANT: `--no-build` is intentional. Without it, MSBuild writes its own
// progress output to stdout - straight into the JSON-RPC stream, which
// corrupts the protocol. Run `dotnet build` once before starting this client.
// ---------------------------------------------------------------------------
static StdioClientTransport CreateTransport() => new(new StdioClientTransportOptions
{
    Name = "winter-password-server",
    Command = "dotnet",
    Arguments = ["run", "--project", "McpServerSdk", "--no-build"]
});

// No `McpClientOptions.ProtocolVersion` means: prefer the latest revision
// (2026-07-28, stateless). The client probes the server with `server/discover`
// and, if that fails, transparently falls back to the legacy `initialize`
// handshake. Passing a version instead pins it (see the second connection).
await using (var client = await McpClient.CreateAsync(CreateTransport()))
{
    Console.WriteLine($">>> Negotiated protocol version: {client.NegotiatedProtocolVersion}");
    Console.WriteLine($">>> Server: {client.ServerInfo?.Name} {client.ServerInfo?.Version}");

    Console.WriteLine("\n>>> List of tools:");

    var tools = await client.ListToolsAsync();
    foreach (var tool in tools)
    {
        Console.WriteLine($"Tool: {tool.Name} - {tool.Description}");
    }

    Console.WriteLine("\n>>> Testing winter_password tool:");

    try
    {
        var result = await client.CallToolAsync(
            "winter_password",
            new Dictionary<string, object?>
            {
                ["minLength"] = 16,
                ["special"] = true
            },
            cancellationToken: CancellationToken.None);

        var textContent = result.Content.OfType<TextContentBlock>().FirstOrDefault();
        if (textContent != null)
        {
            Console.WriteLine($"Password generated: {textContent.Text}");
        }
    }
    catch (Exception ex)
    {
        Console.Error.WriteLine($"Error calling tool: {ex.Message}");
    }

    Console.WriteLine("\n>>> Testing winter_password_batch tool:");

    try
    {
        var result = await client.CallToolAsync(
            "winter_password_batch",
            new Dictionary<string, object?>
            {
                ["count"] = 3,
                ["minLength"] = 20,
                ["special"] = false
            },
            cancellationToken: CancellationToken.None);

        var textContent = result.Content.OfType<TextContentBlock>().FirstOrDefault();
        if (textContent != null)
        {
            var passwords = System.Text.Json.JsonSerializer.Deserialize<string[]>(textContent.Text);
            if (passwords != null)
            {
                Console.WriteLine("Batch passwords generated:");
                for (int i = 0; i < passwords.Length; i++)
                {
                    Console.WriteLine($"  {i + 1}. {passwords[i]}");
                }
            }
        }
    }
    catch (Exception ex)
    {
        Console.Error.WriteLine($"Error calling batch tool: {ex.Message}");
    }
}

// Same server, second connection - this time pinned to the legacy era. The SDK
// serves both eras from the same server code, so the only visible difference is
// the negotiated version (and, on the wire, the `initialize` handshake).
// A pinned version is also a minimum: the client refuses to downgrade below it
// and throws instead of falling back.
Console.WriteLine("\n>>> Connecting again, pinned to the legacy protocol version:");

await using (var legacyClient = await McpClient.CreateAsync(
    CreateTransport(),
    new McpClientOptions { ProtocolVersion = "2025-11-25" }))
{
    Console.WriteLine($">>> Negotiated protocol version: {legacyClient.NegotiatedProtocolVersion}");
    var tools = await legacyClient.ListToolsAsync();
    Console.WriteLine($">>> {tools.Count} tool(s): {string.Join(", ", tools.Select(t => t.Name))}");
}

Console.WriteLine("\n>>> Done!");
