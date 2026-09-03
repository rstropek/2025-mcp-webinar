using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;
using McpServerNoSdk;
using WinterPasswordLib;

// ---------------------------------------------------------------------------
// A minimal MCP server without any SDK: plain JSON-RPC 2.0 over stdio.
//
// MCP currently has TWO eras on the wire, and this server speaks both:
//
//   LEGACY (2025-11-25 and older) -- stateful.
//     The client opens with an `initialize` request, we answer with the
//     negotiated protocol version, then the client sends the
//     `notifications/initialized` notification. Everything after that is a
//     plain request; the connection carries the negotiated state.
//     What most hosts (e.g. VS Code) speak today.
//
//   MODERN (2026-07-28) -- stateless.
//     No handshake at all. EVERY request repeats its protocol version and the
//     client capabilities in `params._meta`, so the server never has to
//     remember anything between requests. The new `server/discover` request
//     lets a client ask what we support up front. Results must carry a
//     `resultType` and should carry our identity in `result._meta`.
//
// How we tell them apart: we look at `params._meta` of each incoming request.
// If it names a protocol version, the request is modern; if not, it is legacy.
// That is exactly the rule the official SDK uses ("envelope claim").
//
// Do NOT write an MCP server like this in production - use the SDK
// (see the McpServerSdk sample). This one exists to make the wire format
// visible.
// ---------------------------------------------------------------------------

// JSON serialization options
JsonSerializerOptions options = new()
{
    PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    WriteIndented = false,
    DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
};

var serverInfo = new ServerInfo("winter-no-sdk", "0.1.0");

// Reserved `_meta` keys of the modern era. The `io.modelcontextprotocol/`
// prefix is reserved for the spec itself.
const string ProtocolVersionKey = "io.modelcontextprotocol/protocolVersion";
const string ServerInfoKey = "io.modelcontextprotocol/serverInfo";

// The one stateless revision we implement...
const string ModernProtocolVersion = "2026-07-28";
// ...and the handshake-based ones we answer `initialize` for.
string[] legacyProtocolVersions = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
string[] supportedProtocolVersions = [ModernProtocolVersion, .. legacyProtocolVersions];

Console.Error.WriteLine("[winter-no-sdk] listening on stdio");

// Main loop - read from stdin, write to stdout
string? line;
while ((line = Console.ReadLine()) != null)
{
    if (string.IsNullOrWhiteSpace(line)) { continue; }

    JsonRpcMessage? msg;
    try
    {
        msg = JsonSerializer.Deserialize<JsonRpcMessage>(line, options);
    }
    catch (JsonException)
    {
        Console.Error.WriteLine($"[winter-no-sdk] parse error: {line}");
        // Per JSON-RPC 2.0, parse errors carry id: null (not 0).
        Send(new JsonRpcMessage(Id: null, Error: new JsonRpcError(-32700, "Parse error")));
        continue;
    }

    if (msg == null) { continue; }

    Console.Error.WriteLine($"[winter-no-sdk] <- {msg.Method ?? "<response>"} (id={msg.Id?.ToString() ?? "none"})");

    // Notifications carry no `id`. Per JSON-RPC we MUST NOT respond to them --
    // not even with an error. The most common one is `notifications/initialized`.
    if (msg.Id is null) { continue; }

    // Era detection: does this request bring its own protocol version along?
    var requested = RequestedProtocolVersion(msg.Params);
    var modern = requested == ModernProtocolVersion;

    // A version we don't implement gets the spec's dedicated error, which tells
    // the client what we *do* support so it can retry with a matching version.
    if (requested is not null && !modern)
    {
        Send(new JsonRpcMessage(
            Id: msg.Id,
            Error: new JsonRpcError(
                -32022, // UnsupportedProtocolVersion
                $"Unsupported protocol version: {requested}",
                Data: new { supported = supportedProtocolVersions, requested })
        ));
        continue;
    }

    switch (msg.Method)
    {
        // server/discover is modern-only; initialize is legacy-only.
        case "server/discover": HandleDiscover(msg.Id); break;
        case "initialize": HandleInitialize(msg.Id, msg.Params); break;
        // `ping` is not part of 2026-07-28, but legacy clients send it.
        case "ping": SendResult(msg.Id, new { }, modern); break;
        // These two look identical on both eras -- only the envelope differs.
        case "tools/list": HandleToolsList(msg.Id, modern); break;
        case "tools/call": HandleToolsCall(msg.Id, msg.Params, modern); break;
        default:
            // See https://www.jsonrpc.org/specification#error_object
            // for more information on error codes.
            Send(new JsonRpcMessage(
                Id: msg.Id,
                Error: new JsonRpcError(-32601, $"Unsupported method: {msg.Method}")
            ));
            break;
    }
}

/// <summary>Reads <c>params._meta["io.modelcontextprotocol/protocolVersion"]</c>, if any.</summary>
string? RequestedProtocolVersion(JsonElement? @params)
{
    if (@params is not { ValueKind: JsonValueKind.Object } p) { return null; }
    if (!p.TryGetProperty("_meta", out var meta) || meta.ValueKind != JsonValueKind.Object) { return null; }
    if (!meta.TryGetProperty(ProtocolVersionKey, out var version) || version.ValueKind != JsonValueKind.String) { return null; }
    return version.GetString();
}

void Send(JsonRpcMessage message)
{
    var json = JsonSerializer.Serialize(message, options);
    Console.Out.WriteLine(json);
    Console.Out.Flush();
}

/// <summary>
/// Sends a JSON-RPC result. On the modern era we add the two envelope fields
/// the 2026-07-28 spec requires/recommends on every result; on the legacy era
/// we leave the result untouched (that is what the official SDK does too --
/// its legacy codec strips <c>resultType</c> and the serverInfo <c>_meta</c>).
/// </summary>
void SendResult(object? id, object result, bool modern)
{
    if (!modern)
    {
        Send(new JsonRpcMessage(Id: id, Result: result));
        return;
    }

    // Serialize the payload to a mutable JSON object, then wrap it. Doing it
    // this way keeps the result records free of era-specific properties.
    var payload = JsonSerializer.SerializeToNode(result, result.GetType(), options)!.AsObject();
    var envelope = new JsonObject
    {
        // "the request completed, this is the final content" (the alternative
        // is "input_required", used by the multi round-trip flow)
        ["resultType"] = "complete"
    };
    foreach (var property in payload)
    {
        envelope[property.Key] = property.Value?.DeepClone();
    }
    envelope["_meta"] = new JsonObject
    {
        [ServerInfoKey] = JsonSerializer.SerializeToNode(serverInfo, options)
    };

    Send(new JsonRpcMessage(Id: id, Result: envelope));
}

// --- modern: server/discover ------------------------------------------------
// The stateless replacement for `initialize`. A dual-era client sends this
// first as a probe: a proper result means "modern server", any other error
// means "fall back to the initialize handshake". It is a cacheable result, so
// it carries the ttlMs/cacheScope hints.
void HandleDiscover(object? id)
{
    SendResult(
        id,
        new DiscoverResult(
            SupportedVersions: [ModernProtocolVersion],
            Capabilities: new Capabilities(Tools: new ToolsCapability()),
            Instructions: "Generates passwords made of winter-themed words.",
            TtlMs: 3_600_000,
            CacheScope: "public"
        ),
        true);
}

// --- legacy: initialize -----------------------------------------------------
// The legacy handshake. We must answer with a version both sides support and
// should echo the client's request if we can. Note that 2026-07-28 is NOT a
// candidate here: a client that says `initialize` is a legacy client.
void HandleInitialize(object? id, JsonElement? @params)
{
    string? requested = null;
    if (@params is { ValueKind: JsonValueKind.Object } p
        && p.TryGetProperty("protocolVersion", out var v)
        && v.ValueKind == JsonValueKind.String)
    {
        requested = v.GetString();
    }

    var protocolVersion = requested is not null && legacyProtocolVersions.Contains(requested)
        ? requested
        : legacyProtocolVersions[0];

    SendResult(
        id,
        new InitializeResult(
            ProtocolVersion: protocolVersion,
            ServerInfo: serverInfo,
            // We don't actually emit list_changed notifications, so don't claim it.
            Capabilities: new Capabilities(Tools: new ToolsCapability())
        ),
        false);
}

void HandleToolsList(object? id, bool modern)
{
    SendResult(
        id,
        new ToolsListResult(
            // Tools should be listed in a stable order so clients can cache them.
            Tools:
            [
                new(
                    Name: "winter_password",
                    Description: "Generates a password made of winter-themed words.",
                    InputSchema: new ToolInputSchema(
                        Type: "object",
                        Properties: new()
                        {
                            ["minLength"] = new { type = "number", minimum = 1, @default = 16 },
                            ["special"] = new { type = "boolean", @default = false }
                        },
                        AdditionalProperties: false
                    )
                )
            ],
            // Modern era: tools/list is cacheable and MUST say for how long
            // ("public" = same answer for every user, so proxies may share it).
            TtlMs: modern ? 3_600_000 : null,
            CacheScope: modern ? "public" : null
        ),
        modern);
}

void HandleToolsCall(object? id, JsonElement? @params, bool modern)
{
    if (@params is not { ValueKind: JsonValueKind.Object } p)
    {
        Send(new JsonRpcMessage(Id: id, Error: new JsonRpcError(-32602, "Invalid params")));
        return;
    }

    var name = p.TryGetProperty("name", out var nameProp) ? nameProp.GetString() : null;
    if (name != "winter_password")
    {
        Send(new JsonRpcMessage(Id: id, Error: new JsonRpcError(-32601, "Unknown tool")));
        return;
    }

    var minLength = 16;
    var special = false;
    if (p.TryGetProperty("arguments", out var arguments) && arguments.ValueKind == JsonValueKind.Object)
    {
        if (arguments.TryGetProperty("minLength", out var minLengthProp)) { minLength = minLengthProp.GetInt32(); }
        if (arguments.TryGetProperty("special", out var specialProp)) { special = specialProp.GetBoolean(); }
    }

    var opts = new PasswordGenerationOptions { MinLength = minLength, Special = special };
    var pwd = PasswordGenerator.BuildPassword(opts);

    SendResult(id, new ToolCallResult(Content: [new ContentItem("text", pwd)]), modern);
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

record DiscoverResult(
    string[] SupportedVersions,
    Capabilities Capabilities,
    string Instructions,
    long TtlMs,
    string CacheScope
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
    ToolsCapability Tools
);

record ToolsCapability;

record ToolsListResult(
    List<Tool> Tools,
    long? TtlMs = null,
    string? CacheScope = null
);

record ToolCallResult(
    List<ContentItem> Content
);

record ContentItem(
    string Type,
    string Text
);
