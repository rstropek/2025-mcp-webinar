using System.Text.Json;
using System.Text.Json.Serialization;
using WinterPasswordLib;

namespace McpServerNoSdk;

// JSON-RPC message type
record JsonRpcMessage(
    [property: JsonPropertyName("jsonrpc")] string JsonRpc = "2.0",
    [property: JsonPropertyName("id"), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] object? Id = null,
    [property: JsonPropertyName("method"), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? Method = null,
    [property: JsonPropertyName("params"), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] object? Params = null,
    [property: JsonPropertyName("result"), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] object? Result = null,
    [property: JsonPropertyName("error"), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] object? Error = null
);

record ToolInputSchema(
    [property: JsonPropertyName("type")] string Type,
    [property: JsonPropertyName("properties")] Dictionary<string, object> Properties,
    [property: JsonPropertyName("additionalProperties")] bool AdditionalProperties
);

record Tool(
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("description")] string Description,
    [property: JsonPropertyName("inputSchema")] ToolInputSchema InputSchema
);

record InitializeResult(
    [property: JsonPropertyName("protocolVersion")] string ProtocolVersion,
    [property: JsonPropertyName("serverInfo")] ServerInfo ServerInfo,
    [property: JsonPropertyName("capabilities")] Capabilities Capabilities
);

record ServerInfo(
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("version")] string Version
);

record Capabilities(
    [property: JsonPropertyName("tools")] ToolsCapability Tools,
    [property: JsonPropertyName("prompts")] PromptsCapability Prompts
);

record ToolsCapability(
    [property: JsonPropertyName("listChanged")] bool ListChanged
);

record PromptsCapability(
    [property: JsonPropertyName("listChanged")] bool ListChanged
);

record ToolsListResult(
    [property: JsonPropertyName("tools")] List<Tool> Tools
);

record ToolCallResult(
    [property: JsonPropertyName("content")] List<ContentItem> Content
);

record ContentItem(
    [property: JsonPropertyName("type")] string Type,
    [property: JsonPropertyName("text")] string Text
);

record JsonRpcError(
    [property: JsonPropertyName("code")] int Code,
    [property: JsonPropertyName("message")] string Message
);

class Program
{
    private static readonly JsonSerializerOptions options = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = false,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    private static void Send(JsonRpcMessage message)
    {
        var json = JsonSerializer.Serialize(message, options);
        Console.Out.WriteLine(json);
        Console.Out.Flush();
    }

    private static void HandleInitialize(object? id)
    {
        var result = new InitializeResult(
            ProtocolVersion: "2024-11-05",
            ServerInfo: new ServerInfo("winter-no-sdk", "0.1.0"),
            Capabilities: new Capabilities(
                Tools: new ToolsCapability(ListChanged: true),
                Prompts: new PromptsCapability(ListChanged: true)
            )
        );
        Send(new JsonRpcMessage(Id: id, Result: result));
    }

    private static void HandleToolsList(object? id)
    {
        var result = new ToolsListResult(
            Tools: new List<Tool>
            {
                new Tool(
                    Name: "winter_password",
                    Description: "Generiert ein Passwort aus Winter-Wörtern.",
                    InputSchema: new ToolInputSchema(
                        Type: "object",
                        Properties: new Dictionary<string, object>
                        {
                            ["minLength"] = new { type = "number", minimum = 1, @default = 16 },
                            ["special"] = new { type = "boolean", @default = false }
                        },
                        AdditionalProperties: false
                    )
                )
            }
        );
        Send(new JsonRpcMessage(Id: id, Result: result));
    }

    private static void HandleToolsCall(object? id, JsonElement? @params)
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

        var words = WinterWordLoader.LoadWinterWordsFromFile();
        var opts = new PasswordGenerationOptions { MinLength = minLength, Special = special };
        var pwd = PasswordGenerator.BuildPassword(opts, words);

        var result = new ToolCallResult(
            Content: new List<ContentItem>
            {
                new ContentItem("text", pwd)
            }
        );

        Send(new JsonRpcMessage(Id: id, Result: result));
    }

    static void Main()
    {
        // Main loop - read from stdin, write to stdout
        string? line;
        while ((line = Console.ReadLine()) != null)
        {
            if (string.IsNullOrWhiteSpace(line)) continue;

            try
            {
                var msg = JsonSerializer.Deserialize<JsonRpcMessage>(line, options);
                if (msg == null) continue;

                if (msg.Method == "initialize")
                {
                    HandleInitialize(msg.Id);
                }
                else if (msg.Method == "tools/list")
                {
                    HandleToolsList(msg.Id);
                }
                else if (msg.Method == "tools/call")
                {
                    var paramsElement = msg.Params as JsonElement?;
                    HandleToolsCall(msg.Id, paramsElement);
                }
                else
                {
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
    }
}
