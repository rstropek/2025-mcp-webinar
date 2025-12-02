using System.ComponentModel;
using Microsoft.Extensions.AI;
using ModelContextProtocol.Server;
using WinterPasswordLib;

namespace McpServerSdk;

[McpServerToolType]
public static class WinterPasswordTools
{
    [McpServerTool, Description("Generates a password made of winter-themed words.")]
    public static string WinterPassword(
        [Description("Minimum length of the password")] int minLength = 16,
        [Description("Enable special character replacement")] bool special = false)
    {
        var opts = new PasswordGenerationOptions { MinLength = minLength, Special = special };
        return PasswordGenerator.BuildPassword(opts);
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
}

[McpServerPromptType]
public static class WinterPasswordPrompts
{
    [McpServerPrompt, Description("Prompt to generate a password made of winter-themed words")]
    public static ChatMessage MakeWinterPassword(
        [Description("Minimum length of the password")] string minLength = "16",
        [Description("Enable special character replacement")] string special = "false")
    {
        var specialBool = special.Equals("true", StringComparison.CurrentCultureIgnoreCase);
        return new ChatMessage(
            ChatRole.User,
            $@" Generate a secure password made of winter-themed words.
- Minimum length: {minLength}
- Enable special character replacement: {specialBool}
Rules for replacements (if enabled): o/O→0, i/I→!, e/E→€, s/S→$."
        );
    }
}

[McpServerResourceType]
public static class WinterWordResources
{
    [McpServerResource(Name = "winter-characters-text"), Description("Winter words (text) - one name per line")]
    public static string WinterCharactersText()
    {
        return string.Join("\n", PasswordGenerator.DefaultWords);
    }
}
