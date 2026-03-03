using System.Reflection;
using System.Text.Json;
using System.Text.Json.Serialization;

JsonSerializerOptions options = new()
{
    PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    WriteIndented = false,
    DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
};

// Load embedded HTML resources
var assembly = Assembly.GetExecutingAssembly();

string viewHtml;
using (var stream = assembly.GetManifestResourceStream("McpAppsDotnet.ui.view.html")!)
using (var reader = new StreamReader(stream))
{
    viewHtml = reader.ReadToEnd();
}

string interactiveHtml;
using (var stream = assembly.GetManifestResourceStream("McpAppsDotnet.ui.interactive.html")!)
using (var reader = new StreamReader(stream))
{
    interactiveHtml = reader.ReadToEnd();
}

// Main loop — read JSON-RPC messages from stdin, dispatch to handlers
string? line;
while ((line = Console.ReadLine()) != null)
{
    if (string.IsNullOrWhiteSpace(line)) { continue; }

    try
    {
        var msg = JsonSerializer.Deserialize<JsonRpcMessage>(line, options);
        if (msg == null) { continue; }

        switch (msg.Method)
        {
            case "initialize":
                HandleInitialize(msg.Id);
                break;
            case "notifications/initialized":
                // Acknowledgement — no response needed for notifications
                break;
            case "tools/list":
                HandleToolsList(msg.Id);
                break;
            case "tools/call":
                HandleToolsCall(msg.Id, msg.Params);
                break;
            case "resources/list":
                HandleResourcesList(msg.Id);
                break;
            case "resources/read":
                HandleResourcesRead(msg.Id, msg.Params);
                break;
            default:
                if (msg.Id != null)
                {
                    Send(new JsonRpcMessage(
                        Id: msg.Id,
                        Error: new JsonRpcError(-32601, $"Unsupported method: {msg.Method}")
                    ));
                }
                break;
        }
    }
    catch (JsonException)
    {
        Send(new JsonRpcMessage(
            Id: null,
            Error: new JsonRpcError(-32700, "Parse error")
        ));
    }
}

void Send(JsonRpcMessage message)
{
    var json = JsonSerializer.Serialize(message, options);
    Console.Out.WriteLine(json);
    Console.Out.Flush();
}

void HandleInitialize(object? id)
{
    var result = new InitializeResult(
        ProtocolVersion: "2024-11-05",
        ServerInfo: new ServerInfo("adder", "1.0.0"),
        Capabilities: new Capabilities(
            Tools: new ToolsCapability(ListChanged: true),
            Resources: new ResourcesCapability(ListChanged: true)
        )
    );
    Send(new JsonRpcMessage(Id: id, Result: result));
}

void HandleToolsList(object? id)
{
    var tool = new Dictionary<string, object?>
    {
        ["name"] = "add_numbers",
        ["description"] = "Adds two numbers and displays the result in a visual UI",
        ["inputSchema"] = new Dictionary<string, object>
        {
            ["type"] = "object",
            ["properties"] = new Dictionary<string, object>
            {
                ["number1"] = new Dictionary<string, object> { ["type"] = "number", ["description"] = "First number", ["default"] = 3 },
                ["number2"] = new Dictionary<string, object> { ["type"] = "number", ["description"] = "Second number", ["default"] = 4 }
            }
        },
        ["_meta"] = new Dictionary<string, object>
        {
            ["ui/resourceUri"] = "ui://adder/view.html",
            ["ui"] = new Dictionary<string, object>
            {
                ["resourceUri"] = "ui://adder/view.html"
            }
        }
    };

    var interactiveTool = new Dictionary<string, object?>
    {
        ["name"] = "add_numbers_interactive",
        ["description"] = "Opens an interactive form where the user can enter two numbers and compute their sum",
        ["inputSchema"] = new Dictionary<string, object>
        {
            ["type"] = "object",
            ["properties"] = new Dictionary<string, object>
            {
                ["number1"] = new Dictionary<string, object> { ["type"] = "number", ["description"] = "First number (pre-filled in form)", ["default"] = 3 },
                ["number2"] = new Dictionary<string, object> { ["type"] = "number", ["description"] = "Second number (pre-filled in form)", ["default"] = 4 }
            }
        },
        ["_meta"] = new Dictionary<string, object>
        {
            ["ui/resourceUri"] = "ui://adder/interactive.html",
            ["ui"] = new Dictionary<string, object>
            {
                ["resourceUri"] = "ui://adder/interactive.html"
            }
        }
    };

    var result = new Dictionary<string, object>
    {
        ["tools"] = new List<object> { tool, interactiveTool }
    };
    Send(new JsonRpcMessage(Id: id, Result: result));
}

void HandleToolsCall(object? id, JsonElement? @params)
{
    if (@params == null)
    {
        Send(new JsonRpcMessage(Id: id, Error: new JsonRpcError(-32602, "Invalid params")));
        return;
    }

    var name = @params.Value.GetProperty("name").GetString();
    if (name != "add_numbers" && name != "add_numbers_interactive")
    {
        Send(new JsonRpcMessage(Id: id, Error: new JsonRpcError(-32601, "Unknown tool")));
        return;
    }

    var arguments = @params.Value.GetProperty("arguments");
    var number1 = arguments.TryGetProperty("number1", out var n1) ? n1.GetDouble() : 3.0;
    var number2 = arguments.TryGetProperty("number2", out var n2) ? n2.GetDouble() : 4.0;
    var sum = number1 + number2;

    var result = new ToolCallResult(
        Content: [new ContentItem("text", $"{number1} + {number2} = {sum}")]
    );
    Send(new JsonRpcMessage(Id: id, Result: result));
}

void HandleResourcesList(object? id)
{
    var result = new Dictionary<string, object>
    {
        ["resources"] = new List<object>
        {
            new Dictionary<string, object>
            {
                ["uri"] = "ui://adder/view.html",
                ["name"] = "Adder UI",
                ["mimeType"] = "text/html;profile=mcp-app"
            },
            new Dictionary<string, object>
            {
                ["uri"] = "ui://adder/interactive.html",
                ["name"] = "Interactive Adder",
                ["mimeType"] = "text/html;profile=mcp-app"
            }
        }
    };
    Send(new JsonRpcMessage(Id: id, Result: result));
}

void HandleResourcesRead(object? id, JsonElement? @params)
{
    if (@params == null)
    {
        Send(new JsonRpcMessage(Id: id, Error: new JsonRpcError(-32602, "Invalid params")));
        return;
    }

    var uri = @params.Value.GetProperty("uri").GetString();

    string? html = uri switch
    {
        "ui://adder/view.html" => viewHtml,
        "ui://adder/interactive.html" => interactiveHtml,
        _ => null
    };

    if (html == null)
    {
        Send(new JsonRpcMessage(Id: id, Error: new JsonRpcError(-32002, "Unknown resource")));
        return;
    }

    var result = new Dictionary<string, object>
    {
        ["contents"] = new List<object>
        {
            new Dictionary<string, object>
            {
                ["uri"] = uri!,
                ["mimeType"] = "text/html;profile=mcp-app",
                ["text"] = html
            }
        }
    };
    Send(new JsonRpcMessage(Id: id, Result: result));
}

// JSON-RPC types

record JsonRpcMessage(
    [property: JsonPropertyName("jsonrpc")] string JsonRpc = "2.0",
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] object? Id = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? Method = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] JsonElement? Params = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] object? Result = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] JsonRpcError? Error = null
);

record JsonRpcError(int Code, string Message);

record InitializeResult(
    string ProtocolVersion,
    ServerInfo ServerInfo,
    Capabilities Capabilities
);

record ServerInfo(string Name, string Version);

record Capabilities(
    ToolsCapability Tools,
    ResourcesCapability Resources
);

record ToolsCapability(bool ListChanged);
record ResourcesCapability(bool ListChanged);

record ToolCallResult(List<ContentItem> Content);
record ContentItem(string Type, string Text);
