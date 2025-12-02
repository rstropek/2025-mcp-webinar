namespace WinterPasswordLib;

/// <summary>
/// Options for password generation.
/// </summary>
public record PasswordGenerationOptions(int MinLength = 16, bool Special = false);

/// <summary>
/// Provides functionality to generate passwords from winter words.
/// </summary>
public static class PasswordGenerator
{
    /// <summary>
    /// Default winter words used for password generation.
    /// </summary>
    public static readonly string[] DefaultWords =
    [
        "Schnee", "Eis", "Frost", "Winter", "Kälte", "Schneeflocke", "Glatteis", "Schneesturm",
        "Eiszapfen", "Schneemann", "Wintermantel", "Handschuhe", "Mütze", "Schal", "Stiefel",
        "Wintersonne", "Winterwald", "Eisblume", "Schneeglöckchen", "Wintermärchen", "Winterabend",
        "Wintermorgen", "Wintertag", "Winternacht", "Schneelandschaft", "Eislandschaft", "Winterluft",
        "Frostluft", "Schneetreiben", "Eisregen", "Winterwind", "Frostwind", "Schneewehe",
        "Eisschicht", "Winterhimmel", "Frostnacht", "Schneedecke", "Eisdecke", "Winterzeit", "Frostzeit"
    ];

    /// <summary>
    /// Applies special character substitutions to make passwords more secure.
    /// </summary>
    private static string ApplySubstitutions(string s)
        => string.Create(s.Length, s, static (span, source) =>
        {
            for (int i = 0; i < source.Length; i++)
            {
                span[i] = source[i] switch
                {
                    'o' or 'O' => '0',
                    'i' or 'I' => '!',
                    'e' or 'E' => '€',
                    's' or 'S' => '$',
                    _ => source[i]
                };
            }
        });

    private static T Choice<T>(T[] arr) => arr[Random.Shared.Next(arr.Length)];

    /// <summary>
    /// Builds a password by concatenating randomly selected winter words.
    /// </summary>
    public static string BuildPassword(PasswordGenerationOptions opts, string[]? words = null)
    {
        words ??= DefaultWords;

        if (words.Length == 0)
        {
            throw new ArgumentException("Words array cannot be empty", nameof(words));
        }

        var output = string.Empty;

        while (output.Length < opts.MinLength)
        {
            output += Choice(words);
        }

        return opts.Special ? ApplySubstitutions(output) : output;
    }

    /// <summary>
    /// Generates multiple passwords using the same options and winter word list.
    /// </summary>
    public static string[] BuildMany(int count, PasswordGenerationOptions opts, string[]? words = null)
        => [.. Enumerable.Range(0, count).Select(_ => BuildPassword(opts, words))];
}

