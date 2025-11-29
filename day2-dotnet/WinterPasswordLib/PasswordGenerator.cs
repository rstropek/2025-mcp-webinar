using System.Text.RegularExpressions;

namespace WinterPasswordLib;

/// <summary>
/// Options for password generation.
/// </summary>
public class PasswordGenerationOptions
{
    public int MinLength { get; set; } = 16;
    public bool Special { get; set; } = false;
}

/// <summary>
/// Provides functionality to generate passwords from winter words.
/// </summary>
public static class PasswordGenerator
{
    private static readonly Random Random = new();
    private static readonly string[] Modes = { "full", "first", "last" };

    /// <summary>
    /// Applies special character substitutions to make passwords more secure.
    /// </summary>
    private static string ApplySubstitutions(string s)
    {
        return s
            .Replace("o", "0", StringComparison.OrdinalIgnoreCase)
            .Replace("O", "0")
            .Replace("i", "!", StringComparison.OrdinalIgnoreCase)
            .Replace("I", "!")
            .Replace("e", "€", StringComparison.OrdinalIgnoreCase)
            .Replace("E", "€")
            .Replace("s", "$", StringComparison.OrdinalIgnoreCase)
            .Replace("S", "$");
    }

    private static int RandomInt(int n) => Random.Next(n);
    private static T Choice<T>(T[] arr) => arr[RandomInt(arr.Length)];

    /// <summary>
    /// Builds a password by concatenating randomly selected winter word fragments.
    /// </summary>
    public static string BuildPassword(PasswordGenerationOptions opts, WinterWord[] words)
    {
        if (words.Length == 0)
        {
            throw new ArgumentException("Words array cannot be empty", nameof(words));
        }

        var minLength = opts.MinLength;
        var special = opts.Special;
        var output = string.Empty;
        
        while (output.Length < minLength)
        {
            var word = Choice(words);
            var mode = Choice(Modes);
            var fragment = WinterWordLoader.RenderFragment(word, mode);
            if (string.IsNullOrEmpty(fragment)) continue;
            output += fragment;
        }
        
        return special ? ApplySubstitutions(output) : output;
    }

    /// <summary>
    /// Generates multiple passwords using the same options and winter word list.
    /// </summary>
    public static string[] BuildMany(int count, PasswordGenerationOptions opts, WinterWord[] words)
    {
        return Enumerable.Range(0, count)
            .Select(_ => BuildPassword(opts, words))
            .ToArray();
    }
}

