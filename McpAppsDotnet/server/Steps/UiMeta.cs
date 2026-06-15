using System.Text.Json.Nodes;

namespace McpAppsDotnet.Steps;

/// <summary>
/// Helpers that build the <c>_meta.ui</c> objects an MCP App host reads. In .NET
/// the wire-level <c>_meta</c> field is exposed as a <see cref="JsonObject"/>
/// (the <c>Meta</c> property on tool/resource create-options and on result
/// content). Building it explicitly keeps the Apps extension visible in the code.
/// </summary>
internal static class UiMeta
{
    /// <summary>
    /// Tool-level <c>_meta.ui.resourceUri</c> — the single line that turns a plain
    /// tool into an MCP App tool. The host fetches this <c>ui://</c> resource and
    /// renders it in a sandboxed iframe alongside the tool result.
    /// </summary>
    public static JsonObject ResourceUri(string uri) =>
        new() { ["ui"] = new JsonObject { ["resourceUri"] = uri } };

    /// <summary>
    /// Tool-level <c>_meta.ui.visibility = ["app"]</c> — hides the tool from the
    /// model's tool list while leaving it callable from the View via
    /// <c>app.callServerTool(...)</c>.
    /// </summary>
    public static JsonObject AppOnly() =>
        new() { ["ui"] = new JsonObject { ["visibility"] = new JsonArray("app") } };
}
