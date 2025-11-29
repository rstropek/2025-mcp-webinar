using Microsoft.Extensions.AI;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using ModelContextProtocol;
using ModelContextProtocol.Protocol;
using ModelContextProtocol.Server;
using System;
using System.ComponentModel;
using WinterPasswordLib;

var builder = Host.CreateEmptyApplicationBuilder(settings: null);

builder.Services.AddMcpServer()
    .WithStdioServerTransport()
    .WithToolsFromAssembly()
    .WithPromptsFromAssembly()
    .WithResourcesFromAssembly();

var app = builder.Build();

await app.RunAsync();

[McpServerToolType]
public static class WinterPasswordTools
{
    [McpServerTool, Description("Baut ein Passwort aus Winter-Wörtern.")]
    public static string WinterPassword(
        [Description("Mindestlänge des Passworts")] int minLength = 16,
        [Description("Sonderzeichenersetzung aktivieren")] bool special = false)
    {
        var words = WinterWordLoader.LoadWinterWordsFromFile();
        var opts = new PasswordGenerationOptions { MinLength = minLength, Special = special };
        return PasswordGenerator.BuildPassword(opts, words);
    }

    [McpServerTool(Name = "winter_password_batch"), Description("Generiert N Passwörter mit denselben Optionen.")]
    public static string[] WinterPasswordBatch(
        [Description("Anzahl der zu generierenden Passwörter")] int count = 5,
        [Description("Mindestlänge des Passworts")] int minLength = 16,
        [Description("Sonderzeichenersetzung aktivieren")] bool special = false)
    {
        var words = WinterWordLoader.LoadWinterWordsFromFile();
        var opts = new PasswordGenerationOptions { MinLength = minLength, Special = special };
        return PasswordGenerator.BuildMany(count, opts, words);
    }
}

[McpServerPromptType]
public static class WinterPasswordPrompts
{
    [McpServerPrompt, Description("Prompt zum Erzeugen eines Passworts aus Winter-Wörtern")]
    public static ChatMessage MakeWinterPassword(
        [Description("Mindestlänge des Passworts")] string minLength = "16",
        [Description("Sonderzeichenersetzung aktivieren")] string special = "false")
    {
        var specialBool = special.ToLower() == "true";
        return new ChatMessage(
            ChatRole.User,
            $@"Erzeuge mir ein sicheres Passwort aus Winter-Wörtern.
- Mindestlänge: {minLength}
- Sonderzeichenersetzung aktiv: {specialBool}
Regeln für Ersetzungen (falls aktiv): o/O→0, i/I→!, e/E→€, s/S→$."
        );
    }
}

[McpServerResourceType]
public static class WinterWordResources
{
    [McpServerResource(Name = "winter-characters-text"), Description("Winter-Wörter (Text) - Ein Name pro Zeile aus data/winter-words.txt")]
    public static string WinterCharactersText()
    {
        var words = WinterWordLoader.LoadWinterWordsFromFile();
        return WinterWordLoader.ToOnePerLine(words);
    }
}
