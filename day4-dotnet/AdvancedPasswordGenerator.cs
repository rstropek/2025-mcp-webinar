using System.Text;

namespace McpStreamableAuth;

/// <summary>Options for the advanced (hybrid) password generator.</summary>
public record AdvancedPasswordOptions(
    int Length = 20,
    bool IncludeNumbers = true,
    bool IncludeSymbols = true,
    bool IncludeUppercase = true);

/// <summary>What the generator did — returned as the tool's structured content.</summary>
public record AdvancedPasswordMetadata(
    int Length,
    bool IncludedNumbers,
    bool IncludedSymbols,
    bool IncludedUppercase,
    IReadOnlyList<string> Composition);

/// <summary>The advanced generator's result: the password plus its metadata.</summary>
public record AdvancedPasswordResult(string Result, AdvancedPasswordMetadata Metadata);

/// <summary>
/// A stronger password generator than <see cref="WinterPasswordLib.PasswordGenerator"/>:
/// it mixes winter words with digits, a symbol and random case variation.
///
/// It lives in this sample rather than in <c>WinterPasswordLib</c> on purpose —
/// day 4 is about OAuth, and this generator only exists so there is a tool worth
/// protecting with a dedicated scope (<c>ponypwd:generate</c>).
/// </summary>
public static class AdvancedPasswordGenerator
{
    private const string Symbols = "!@#$%^&*()_+-=[]{}|;:,.<>?";

    public static AdvancedPasswordResult Build(AdvancedPasswordOptions opts, string[] words)
    {
        ArgumentOutOfRangeException.ThrowIfZero(words.Length);

        // Reserve room for the digits and the symbol appended at the end.
        var reserved = (opts.IncludeNumbers ? 2 : 0) + (opts.IncludeSymbols ? 1 : 0);
        var wordSpace = Math.Max(5, opts.Length - reserved);

        var password = new StringBuilder();
        var composition = new List<string>();

        while (password.Length < wordSpace)
        {
            var word = words[Random.Shared.Next(words.Length)];
            var fragment = ApplyCaseVariation(word, opts.IncludeUppercase);
            var remaining = wordSpace - password.Length;

            if (fragment.Length <= remaining)
            {
                password.Append(fragment);
                composition.Add(word);
            }
            else
            {
                // Last fragment: truncate so we hit the requested length exactly.
                password.Append(fragment.AsSpan(0, remaining));
                composition.Add(word);
                break;
            }
        }

        if (opts.IncludeNumbers)
        {
            password.Append(Random.Shared.Next(10, 100));
            composition.Add("numbers");
        }

        if (opts.IncludeSymbols)
        {
            password.Append(Symbols[Random.Shared.Next(Symbols.Length)]);
            composition.Add("symbol");
        }

        var result = password.ToString();
        return new AdvancedPasswordResult(
            result,
            new AdvancedPasswordMetadata(
                result.Length,
                opts.IncludeNumbers,
                opts.IncludeSymbols,
                opts.IncludeUppercase,
                composition));
    }

    /// <summary>
    /// Narrows the built-in word list to the words the caller asked for
    /// (case-insensitive substring match). Returns an empty array when nothing matches.
    /// </summary>
    public static string[] Filter(string[] words, IEnumerable<string> terms)
        => [.. words.Where(w => terms.Any(t =>
            !string.IsNullOrWhiteSpace(t) &&
            w.Contains(t.Trim(), StringComparison.OrdinalIgnoreCase)))];

    private static string ApplyCaseVariation(string word, bool includeUppercase)
        => includeUppercase
            ? string.Create(word.Length, word, static (span, source) =>
            {
                for (var i = 0; i < source.Length; i++)
                {
                    span[i] = Random.Shared.Next(2) == 0
                        ? char.ToUpperInvariant(source[i])
                        : char.ToLowerInvariant(source[i]);
                }
            })
            : word;
}
