using ModelContextProtocol.Client;
using ModelContextProtocol.Protocol;

var transport = new StdioClientTransport(new StdioClientTransportOptions
{
    Name = "winter-password-server",
    Command = "dotnet",
    Arguments = ["run", "--project", "McpServerSdk", "--no-build"]
});

var client = await McpClient.CreateAsync(transport);

Console.WriteLine(">>> List of tools:");

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

Console.WriteLine("\n>>> Disconnecting...");
// Transport will be disposed automatically
Console.WriteLine(">>> Done!");
