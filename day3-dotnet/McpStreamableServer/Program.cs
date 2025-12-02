using ModelContextProtocol.Server;
using Microsoft.Extensions.AI;
using System.ComponentModel;
using WinterPasswordLib;
using System.Text.Json;
using ModelContextProtocol;
using ModelContextProtocol.Protocol;
using static ModelContextProtocol.Protocol.ElicitRequestParams;

var builder = WebApplication.CreateBuilder(args);

// Add CORS services
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy => policy
        .AllowAnyOrigin()
        .AllowAnyMethod()
        .AllowAnyHeader()
        .WithExposedHeaders("Mcp-Session-Id"));
});

// Add MCP server services
builder.Services.AddMcpServer()
    .WithHttpTransport()
    .WithToolsFromAssembly()
    .WithPromptsFromAssembly()
    .WithResourcesFromAssembly();

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

// Map MCP endpoints
app.MapMcp();

app.Run();

[McpServerToolType]
public static class WinterPasswordTools
{
    [McpServerTool, Description("Builds a password from winter words.")]
    public static string WinterPassword(
        [Description("Minimum length of the password")] int minLength = 16,
        [Description("Enable special character replacement")] bool special = false)
    {
        var opts = new PasswordGenerationOptions { MinLength = minLength, Special = special };
        var output = PasswordGenerator.BuildPassword(opts);
        return output;
    }

    [McpServerTool(Name = "winter_password_batch"), Description("Generates N passwords with the same options.")]
    public static string[] WinterPasswordBatch(
        [Description("Number of passwords to generate")] int count = 5,
        [Description("Minimum length of the password")] int minLength = 16,
        [Description("Enable special character replacement")] bool special = false)
    {
        var opts = new PasswordGenerationOptions { MinLength = minLength, Special = special };
        return PasswordGenerator.BuildMany(count, opts);
    }

    [McpServerTool(Name = "winter_password_with_custom_words"), Description("Builds a password from winter words. The user can override the built-in words with their own custom words.")]
    public static async Task<string> WinterPasswordWithCustomWords(
        McpServer server,
        [Description("Minimum length of the password")] int minLength = 16,
        [Description("Enable special character replacement")] bool special = false)
    {
        // Check if the client supports elicitation
        if (server.ClientCapabilities?.Elicitation == null)
        {
            throw new McpException("Client does not support elicitation");
        }

        // Ask the user if they want to use custom words
        var useCustomSchema = new RequestSchema
        {
            Properties =
            {
                ["UseCustomWords"] = new BooleanSchema
                {
                    Title = "Use Custom Words",
                    Description = "Do you want to provide your own winter words instead of using the built-in ones?"
                }
            }
        };

        var useCustomResponse = await server.ElicitAsync(new ElicitRequestParams
        {
            Message = "Do you want to use custom winter words?",
            RequestedSchema = useCustomSchema
        }, CancellationToken.None);

        string[]? customWords = null;

        // If user wants to provide custom words
        if (useCustomResponse.Action == "accept" && useCustomResponse.Content?["UseCustomWords"].ValueKind == JsonValueKind.True)
        {
            var wordsSchema = new RequestSchema
            {
                Properties =
                {
                    ["CustomWords"] = new StringSchema
                    {
                        Title = "Custom Words",
                        Description = "List your custom winter words, separated by commas (e.g., Snowflake, Icicle, Frost, Winter)",
                        MinLength = 1
                    }
                }
            };

            var wordsResponse = await server.ElicitAsync(new ElicitRequestParams
            {
                Message = "Enter your custom winter words (comma-separated):",
                RequestedSchema = wordsSchema
            }, CancellationToken.None);

            if (wordsResponse.Action == "accept")
            {
                var wordsString = wordsResponse.Content?["CustomWords"].GetString();
                if (!string.IsNullOrWhiteSpace(wordsString))
                {
                    customWords = wordsString.Split(',')
                        .Select(w => w.Trim())
                        .Where(w => !string.IsNullOrWhiteSpace(w))
                        .ToArray();
                }
            }
        }
        else
        {
            // User chose not to provide custom words
            customWords = PasswordGenerator.DefaultWords;
        }

        var opts = new PasswordGenerationOptions { MinLength = minLength, Special = special };
        var output = PasswordGenerator.BuildPassword(opts, customWords);
        return output;
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
        var specialBool = special.ToLower() == "true";
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
    public static string WinterCharactersText() => JsonSerializer.Serialize(PasswordGenerator.DefaultWords);
}
