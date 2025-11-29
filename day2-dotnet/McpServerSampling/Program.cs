using Microsoft.Extensions.AI;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using ModelContextProtocol;
using ModelContextProtocol.Protocol;
using ModelContextProtocol.Server;
using System.ComponentModel;
using System.Text.Json;
using System.Text.RegularExpressions;
using WinterPasswordLib;

var builder = Host.CreateEmptyApplicationBuilder(settings: null);
builder.Services.AddMcpServer().WithStdioServerTransport().WithToolsFromAssembly();
await builder.Build().RunAsync();

[McpServerToolType]
public static class WinterPasswordSamplingTools
{
    [McpServerTool(Name = "winter_password_sampled"), Description("Erzeugt Passwörter; Winter-Wörter werden zur Laufzeit via MCP-Sampling vom LLM geholt.")]
    public static async Task<object> WinterPasswordSampled(
        McpServer server,
        [Description("Anzahl der zu generierenden Passwörter")] int count = 5,
        [Description("Mindestlänge des Passworts")] int minLength = 16,
        [Description("Sonderzeichenersetzung aktivieren")] bool special = false)
    {
        string raw = "";
        try
        {
            var response = await server.AsSamplingChatClient().GetResponseAsync(
                new[] { new ChatMessage(ChatRole.User, string.Join("\n", new[]
                {
                    "Generate a JSON array of 30 distinct winter-related words in German.",
                    "Rules:",
                    "- Each entry must be an object with \"first\" (required) and optional \"last\" properties.",
                    "- Words should be CamelCase strings with letters only (A–Z, a–z), with optional second part.",
                    "- No spaces, no punctuation, no digits.",
                    "Example: [{\"first\":\"Schnee\",\"last\":\"Flocke\"},{\"first\":\"Eis\",\"last\":\"Kälte\"},{\"first\":\"Frost\"}]",
                    "Return ONLY the JSON array."
                })) },
                new ChatOptions { MaxOutputTokens = 800, Temperature = 0.3f },
                CancellationToken.None);
            raw = response.ToString() ?? "";
        }
        catch
        {
            var words = WinterWordLoader.LoadWinterWordsFromFile();
            var fallbackPwds = PasswordGenerator.BuildMany(count, new PasswordGenerationOptions { MinLength = minLength, Special = special }, words);
            return new { content = new[] { new { type = "text", text = JsonSerializer.Serialize(fallbackPwds, new JsonSerializerOptions { WriteIndented = true }) } }, structuredContent = new { result = fallbackPwds, usedNames = Array.Empty<string>() } };
        }

        var winterWords = new List<WinterWord>();
        try
        {
            var parsed = JsonSerializer.Deserialize<JsonElement>(raw);
            if (parsed.ValueKind != JsonValueKind.Array) throw new Exception("not array");
            
            var seen = new HashSet<string>();
            foreach (var item in parsed.EnumerateArray())
            {
                if (item.ValueKind != JsonValueKind.Object || !item.TryGetProperty("first", out var firstProp)) continue;
                var first = firstProp.GetString()?.Trim() ?? "";
                if (string.IsNullOrEmpty(first) || !Regex.IsMatch(first, @"^[A-Za-z]+$") || first.Length < 2) continue;
                var last = item.TryGetProperty("last", out var lastProp) ? lastProp.GetString()?.Trim() : null;
                var key = last != null ? $"{first}{last}" : first;
                if (seen.Add(key)) { winterWords.Add(new WinterWord(first, last)); if (winterWords.Count >= 200) break; }
            }
        }
        catch
        {
            return new { content = new[] { new { type = "text", text = "Konnte die vom LLM gelieferten Winter-Wörter nicht zuverlässig parsen. Bitte erneut versuchen." } }, structuredContent = new { result = Array.Empty<string>(), usedNames = Array.Empty<string>() } };
        }

        if (winterWords.Count == 0) winterWords = WinterWordLoader.LoadWinterWordsFromFile().ToList();
        var opts = new PasswordGenerationOptions { MinLength = minLength, Special = special };
        var pwds = PasswordGenerator.BuildMany(count, opts, winterWords.ToArray());
        var usedNames = winterWords.Take(50).Select(w => w.Last != null ? $"{w.First}{w.Last}" : w.First).ToArray();

        return new
        {
            content = new[] { new { type = "text", text = JsonSerializer.Serialize(pwds, new JsonSerializerOptions { WriteIndented = true }) }, new { type = "text", text = $"Erstellt mit {winterWords.Count} gesampelten Winter-Wörtern." } },
            structuredContent = new { result = pwds, usedNames = usedNames }
        };
    }
}
