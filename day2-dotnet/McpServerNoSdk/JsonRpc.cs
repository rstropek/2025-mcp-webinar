using System.Text.Json;
using System.Text.Json.Serialization;

namespace McpServerNoSdk;

// JSON-RPC message type
record JsonRpcMessage(
    [property: JsonPropertyName("jsonrpc")] string JsonRpc = "2.0",
    // JSON-RPC 2.0 requires `id` on every response, even when it is null
    // (e.g. a parse error, where we could not read the request's id), so this
    // one property opts out of the "omit nulls" default.
    [property: JsonIgnore(Condition = JsonIgnoreCondition.Never)] object? Id = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? Method = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] JsonElement? Params = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] object? Result = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] JsonRpcError? Error = null
);

record JsonRpcError(
    int Code,
    string Message,
    // JSON-RPC allows an optional, free-form `data` member on errors. MCP uses it
    // to make errors actionable: the -32022 "unsupported protocol version" error
    // carries the list of versions the server actually speaks, so the client can
    // retry with a matching one instead of just giving up.
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] object? Data = null
);
