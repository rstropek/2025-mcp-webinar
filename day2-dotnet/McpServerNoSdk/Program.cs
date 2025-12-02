using System.Text.Json;
using System.Text.Json.Serialization;
using McpServerNoSdk;
using WinterPasswordLib;

// JSON serialization options
JsonSerializerOptions options = new()
{
    PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    WriteIndented = false,
    DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
};

// Main loop - read from stdin, write to stdout
string? line;
while ((line = Console.ReadLine()) != null)
{
    if (string.IsNullOrWhiteSpace(line)) { continue; }

    try
    {
        var msg = JsonSerializer.Deserialize<JsonRpcMessage>(line, options);
        if (msg == null) { continue; }

        if (msg.Method == "initialize") { HandleInitialize(msg.Id); }
        else if (msg.Method == "tools/list") { HandleToolsList(msg.Id); }
        else if (msg.Method == "tools/call") { HandleToolsCall(msg.Id, msg.Params); }
        else
        {
            // See https://www.jsonrpc.org/specification#error_object
            // for more information on error codes.
            Send(new JsonRpcMessage(
                Id: msg.Id,
                Error: new JsonRpcError(-32601, $"Unsupported method: {msg.Method}")
            ));
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
        ProtocolVersion: "2024-11-05", // Current version of MCP
        ServerInfo: new ServerInfo("winter-no-sdk", "0.1.0"),
        Capabilities: new Capabilities(
            Tools: new ToolsCapability(ListChanged: true),
            Prompts: new PromptsCapability(ListChanged: true)
        )
    );
    Send(new JsonRpcMessage(Id: id, Result: result));
}

void HandleToolsList(object? id)
{
    var result = new ToolsListResult(
        Tools:
        [
            new(
                Name: "winter_password",
                Description: "Generates a password made of winter-themed words.",
                InputSchema: new ToolInputSchema(
                    Type: "object",
                    Properties: new()
                    {
                        ["minLength"] = new { Type = "number", Minimum = 1, Default = 16 },
                        ["special"] = new { Type = "boolean", Default = false }
                    },
                    AdditionalProperties: false
                )
            )
        ]
    );
    Send(new JsonRpcMessage(Id: id, Result: result));
}

void HandleToolsCall(object? id, JsonElement? @params)
{
    if (@params == null)
    {
        Send(new JsonRpcMessage(
            Id: id,
            Error: new JsonRpcError(-32602, "Invalid params")
        ));
        return;
    }

    var name = @params.Value.GetProperty("name").GetString();
    var arguments = @params.Value.GetProperty("arguments");

    if (name != "winter_password")
    {
        Send(new JsonRpcMessage(
            Id: id,
            Error: new JsonRpcError(-32601, "Unknown tool")
        ));
        return;
    }

    var minLength = arguments.TryGetProperty("minLength", out var minLengthProp)
        ? minLengthProp.GetInt32()
        : 16;
    var special = arguments.TryGetProperty("special", out var specialProp)
        && specialProp.GetBoolean();

    var opts = new PasswordGenerationOptions { MinLength = minLength, Special = special };
    var pwd = PasswordGenerator.BuildPassword(opts);

    var result = new ToolCallResult(
        Content: [new ContentItem("text", pwd)]
    );

    Send(new JsonRpcMessage(Id: id, Result: result));
}

record ToolInputSchema(
    string Type,
    Dictionary<string, object> Properties,
    bool AdditionalProperties
);

record Tool(
    string Name,
    string Description,
    ToolInputSchema InputSchema
);

record InitializeResult(
    string ProtocolVersion,
    ServerInfo ServerInfo,
    Capabilities Capabilities
);

record ServerInfo(
    string Name,
    string Version
);

record Capabilities(
    ToolsCapability Tools,
    PromptsCapability Prompts
);

record ToolsCapability(
    bool ListChanged
);

record PromptsCapability(
    bool ListChanged
);

record ToolsListResult(
    List<Tool> Tools
);

record ToolCallResult(
    List<ContentItem> Content
);

record ContentItem(
    string Type,
    string Text
);

