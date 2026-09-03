using ModelContextProtocol.Server;
using Microsoft.Extensions.AI;
using System.ComponentModel;
using WinterPasswordLib;
using System.Text.Json;
using ModelContextProtocol.AspNetCore;
using ModelContextProtocol.Protocol;
using static ModelContextProtocol.Protocol.ElicitRequestParams;
using System.Diagnostics;

var builder = WebApplication.CreateBuilder(args);

// CORS for browser-based hosts. Note what is gone compared to the 2025 era:
// `Mcp-Session-Id` is no longer exposed, because the 2026-07-28 revision has no
// sessions. Modern clients send `MCP-Protocol-Version`, `Mcp-Method` and
// `Mcp-Name` instead, all covered by `AllowAnyHeader()`.
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy => policy
        .AllowAnyOrigin()
        .AllowAnyMethod()
        .AllowAnyHeader());
});

// Add MCP server services
builder.Services.AddMcpServer()
    .WithHttpTransport(options =>
    {
        // Why the hybrid mode and not plain `Stateless`?
        //
        // This server wants to ask the *user* something (see
        // `winter_password_with_custom_words`). There are two ways to do that:
        //
        // - 2026-07-28 clients: MRTR. The tool answers `resultType:
        //   "input_required"`, the client collects the answers and RETRIES the
        //   same `tools/call` with `inputResponses`. Completely stateless -
        //   works in every session mode.
        // - 2025-era clients (VS Code today): the server PUSHES an
        //   `elicitation/create` request to the client and waits for the answer
        //   on the same connection. That needs a session, because the pushed
        //   request and its response are two separate HTTP exchanges. The C#
        //   SDK bridges `InputRequiredException` to that push automatically -
        //   but only for stateful legacy sessions.
        //
        // `StatefulForInitializeClients` gives us both: legacy clients that send
        // `initialize` get a real session (and therefore the elicitation
        // bridge), while 2026-07-28 clients are served statelessly with native
        // MRTR. `Stateless` would serve legacy clients too, but their
        // elicitation would silently degrade to the fallback text below.
        options.SessionMode = HttpServerSessionMode.StatefulForInitializeClients;
    })
    .WithToolsFromAssembly()
    .WithPromptsFromAssembly()
    .WithResourcesFromAssembly();

builder.AddServiceDefaults();

var app = builder.Build();

// Use CORS
app.UseCors();

// Health check endpoint
app.MapGet("/health", () => Results.Json(new
{
    status = "healthy",
    timestamp = DateTime.UtcNow.ToString("O"),
    serverName = "winter-password-streamable",
    serverVersion = "0.1.0"
}));

// Map the MCP endpoint on an explicit path so the URL in the clients' config
// files is stable and obvious: http://localhost:5186/mcp
app.MapMcp("/mcp");

app.Run();


[McpServerToolType]
public static class WinterPasswordTools
{
    // .NET Activity Source is called "Tracer" in OpenTelemetry.
    // Consider using https://opentelemetry.io/docs/languages/net/shim/
    // to harmonize the naming of the components.
    private static readonly ActivitySource source = new("McpStreamableServer");

    /// <summary>
    /// Key under which the custom-words question is asked and its answer is
    /// returned. The client echoes this key back in `inputResponses`, which is
    /// how the second run of the handler recognizes the answer.
    /// </summary>
    private const string CustomWordsKey = "customWords";

    [McpServerTool(ReadOnly = true, Title = "Generate a password"), Description("Builds a password from winter words.")]
    public static string WinterPassword(
        [Description("Minimum length of the password")] int minLength = 16,
        [Description("Enable special character replacement")] bool special = false)
    {
        using var activity = source.StartActivity("WinterPassword");
        activity?.SetTag("minLength", minLength);
        activity?.SetTag("special", special);

        var opts = new PasswordGenerationOptions { MinLength = minLength, Special = special };
        var output = PasswordGenerator.BuildPassword(opts);
        return output;
    }

    [McpServerTool(Name = "winter_password_batch", ReadOnly = true, Title = "Generate multiple passwords"), Description("Generates N passwords with the same options.")]
    public static string[] WinterPasswordBatch(
        [Description("Number of passwords to generate")] int count = 5,
        [Description("Minimum length of the password")] int minLength = 16,
        [Description("Enable special character replacement")] bool special = false)
    {
        using var activity = source.StartActivity("WinterPasswordBatch");
        activity?.SetTag("count", count);
        activity?.SetTag("minLength", minLength);
        activity?.SetTag("special", special);

        var opts = new PasswordGenerationOptions { MinLength = minLength, Special = special };
        return PasswordGenerator.BuildMany(count, opts);
    }

    /// <summary>
    /// A tool that needs input from the <em>user</em>, not from the model.
    /// </summary>
    /// <remarks>
    /// <para>
    /// On 2026-07-28 a server never sends a request to its client - the wire is
    /// one POST in, one response out, and the server holds no connection it
    /// could push on. Asking the user something is therefore a <b>Multi
    /// Round-Trip Request (MRTR)</b>: the tool answers with
    /// <c>resultType: "input_required"</c> plus the questions it wants answered,
    /// the client collects the answers, and the client RETRIES the very same
    /// <c>tools/call</c> - this time with <c>inputResponses</c> attached. The
    /// handler runs a <b>second time</b> and finds the answer in
    /// <c>context.Params.InputResponses</c>.
    /// </para>
    /// <para>
    /// The handler is written once for both eras: for a 2025-era client with a
    /// stateful session the SDK turns the thrown
    /// <see cref="InputRequiredException"/> into a push-based
    /// <c>elicitation/create</c> request on the open connection, waits for the
    /// answer and re-runs the handler in-process. One handler, both eras -
    /// which is why this server uses
    /// <see cref="HttpServerSessionMode.StatefulForInitializeClients"/>.
    /// </para>
    /// <para>
    /// The old <c>server.ElicitAsync(...)</c> still exists for legacy-only
    /// servers, but it throws on a stateless request - there is no channel to
    /// push on.
    /// </para>
    /// </remarks>
    [McpServerTool(Name = "winter_password_with_custom_words", ReadOnly = true, Title = "Generate a password (with custom words)"), Description("Builds a password from winter words. The user can override the built-in words with their own custom words.")]
    public static string WinterPasswordWithCustomWords(
        // Injected by the SDK; neither shows up in the tool's input schema.
        McpServer server,
        RequestContext<CallToolRequestParams> context,
        [Description("Minimum length of the password")] int minLength = 16,
        [Description("Enable special character replacement")] bool special = false)
    {
        string[]? customWords = null;

        // Round 2? The client came back with an answer to our question.
        if (context.Params?.InputResponses?.TryGetValue(CustomWordsKey, out var response) == true)
        {
            using var elicitActivity = source.StartActivity("Reading the custom-words answer");

            // The answer is client-supplied and therefore untrusted. Deserialize
            // it defensively and fall back to the built-in words whenever it is
            // unusable (declined, cancelled, empty) instead of failing the call.
            var elicitResult = response.Deserialize(InputResponse.ElicitResultJsonTypeInfo);
            if (elicitResult?.IsAccepted == true
                && elicitResult.Content?.TryGetValue(CustomWordsKey, out var wordsElement) == true
                && wordsElement.ValueKind == JsonValueKind.String)
            {
                var parsed = wordsElement.GetString()!
                    .Split(',')
                    .Select(w => w.Trim())
                    .Where(w => !string.IsNullOrWhiteSpace(w))
                    .ToArray();
                if (parsed.Length > 0)
                {
                    customWords = parsed;
                }
            }

            elicitActivity?.SetTag("customWordCount", customWords?.Length ?? 0);
        }
        else if (server.IsMrtrSupported)
        {
            // Round 1: ask. Note that nothing is awaited here - the tool simply
            // stops with an "input required" result. Whether that travels back
            // as a 2026-07-28 MRTR result or as a pushed `elicitation/create`
            // for a legacy session is the SDK's business, not ours.
            using var askActivity = source.StartActivity("Asking for custom words");

            throw new InputRequiredException(
                inputRequests: new Dictionary<string, InputRequest>
                {
                    [CustomWordsKey] = InputRequest.ForElicitation(new ElicitRequestParams
                    {
                        Message = "Enter your custom winter words (comma-separated), or leave empty to use the built-in ones:",
                        RequestedSchema = new RequestSchema
                        {
                            Properties =
                            {
                                [CustomWordsKey] = new StringSchema
                                {
                                    Title = "Custom Words",
                                    Description = "List your custom winter words, separated by commas (e.g., Snowflake, Icicle, Frost, Winter)",
                                }
                            }
                        }
                    })
                },
                // Opaque state echoed back by the client on the retry. A real
                // server would put everything it needs to resume here (it is
                // stateless, after all); one round trip needs nothing more than
                // a marker.
                requestState: "awaiting-custom-words");
        }
        // The remaining case - neither MRTR nor a stateful legacy session - needs
        // no code at all: this client simply cannot be asked anything, so we fall
        // through and degrade gracefully. Throwing would be wrong here; a password
        // from the built-in words is still a useful answer.

        using var activity = source.StartActivity("Generating password with custom words");
        activity?.SetTag("usedCustomWords", customWords is not null);
        var opts = new PasswordGenerationOptions { MinLength = minLength, Special = special };
        return PasswordGenerator.BuildPassword(opts, customWords ?? PasswordGenerator.DefaultWords);
    }
}

[McpServerPromptType]
public static class WinterPasswordPrompts
{
    [McpServerPrompt, Description("Prompt to generate a password from winter words")]
    public static ChatMessage MakeWinterPassword(
        [Description("Minimum length of the password")] string minLength = "16",
        [Description("Enable special character replacement")] string special = "false")
    {
        var specialBool = bool.TryParse(special, out var s) && s;
        return new ChatMessage(
            ChatRole.User,
            $"""
            Generate a secure password from winter words.
            - Minimum length: {minLength}
            - Special character replacement active: {specialBool}
            Replacement rules (if active): o/O→0, i/I→!, e/E→€, s/S→$.
            """
        );
    }
}

[McpServerResourceType]
public static class WinterWordResources
{
    [McpServerResource(Name = "winter-characters-text"), Description("Winter words (text) - One word per line from data/winter-words.txt")]
    public static string WinterCharactersText() => string.Join('\n', PasswordGenerator.DefaultWords);
}
