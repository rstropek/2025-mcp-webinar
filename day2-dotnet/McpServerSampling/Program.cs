using Microsoft.Extensions.AI;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using ModelContextProtocol.Server;
using System.ComponentModel;
using System.Text.Json;
using System.Text.RegularExpressions;
using WinterPasswordLib;

var builder = Host.CreateEmptyApplicationBuilder(settings: null);
builder.Services.AddMcpServer().WithStdioServerTransport().WithToolsFromAssembly();
await builder.Build().RunAsync();

record WinterWord(string Word);

[McpServerToolType]
public static partial class WinterPasswordSamplingTools
{
    [McpServerTool(Name = "winter_password_sampled"), Description("Generates passwords; winter words are fetched at runtime via MCP sampling from the LLM.")]
    public static async Task<object> WinterPasswordSampled(
        McpServer server,
        [Description("Number of passwords to generate")] int count = 5,
        [Description("Minimum length of the password")] int minLength = 16,
        [Description("Enable special character replacement")] bool special = false)
    {
        string raw = "";
        try
        {
            var response = await server.AsSamplingChatClient().GetResponseAsync(
                [
                    new ChatMessage(
                        ChatRole.User, 
                        """
                        Generate a JSON array of 30 distinct winter-related words in German.

                        Rules:
                        - Each entry must be an object with a \"word\" property containing a SINGLE word (no spaces).
                        - Words should be CamelCase strings with letters only (A-Z, a-z).
                        - No spaces, no punctuation, no digits.
                        Example: [{\"word\":\"Schneeflocke\"},{\"word\":\"Eiskälte\"},{\"word\":\"Frost\"}]

                        Return ONLY the JSON array WITHOUT any additional text or Markdown code (including backticks)."
                        """)
                ],
                new ChatOptions { },
                CancellationToken.None);
            raw = response.ToString() ?? "";

            WinterWord[] winterWords;
            winterWords = JsonSerializer.Deserialize<WinterWord[]>(raw, new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase }) ?? throw new Exception("null result");
            if (winterWords.Length == 0 || winterWords.Any(w => string.IsNullOrEmpty(w.Word) || !MyRegex().IsMatch(w.Word)))
            {
                throw new Exception("Invalid words in response");
            }

            var opts = new PasswordGenerationOptions { MinLength = minLength, Special = special };
            var winterWordStrings = winterWords.Select(w => w.Word).ToArray();
            var pwds = PasswordGenerator.BuildMany(count, opts, winterWordStrings);

            return new
            {
                content = new[] { new
                    { 
                        type = "text", 
                        text = JsonSerializer.Serialize(pwds)
                    }, 
                    new
                    { 
                        type = "text",
                        text = $"Generated with {winterWords.Length} sampled winter words."
                    }
                },
                structuredContent = new { result = pwds }
            };
        }
        catch (Exception ex)
        {
            return new { content = new[] { new { type = "text", text = $"An internal error has occurred: {ex.Message}" } } };
        }
    }

    [GeneratedRegex(@"^[A-Za-z]+$")]
    private static partial Regex MyRegex();
}
