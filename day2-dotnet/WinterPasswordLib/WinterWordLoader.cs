using System.Text.RegularExpressions;

namespace WinterPasswordLib;

/// <summary>
/// Provides functionality to load and parse winter word data from a text file.
/// </summary>
public static class WinterWordLoader
{
    /// <summary>
    /// Gets the default path to the winter words data file.
    /// </summary>
    private static string GetDefaultDataPath()
    {
        // Try to find the data file relative to the assembly location
        var assemblyLocation = System.Reflection.Assembly.GetExecutingAssembly().Location;
        var assemblyDirectory = Path.GetDirectoryName(assemblyLocation) ?? AppDomain.CurrentDomain.BaseDirectory;
        
        // Look for data/winter-words.txt relative to the assembly
        var dataPath = Path.Combine(assemblyDirectory, "data", "winter-words.txt");
        if (File.Exists(dataPath))
        {
            return dataPath;
        }
        
        // Fallback: look in the project directory (for development)
        var projectDataPath = Path.Combine(assemblyDirectory, "..", "..", "..", "..", "data", "winter-words.txt");
        if (File.Exists(projectDataPath))
        {
            return Path.GetFullPath(projectDataPath);
        }
        
        // Final fallback: use the default path
        return Path.Combine(assemblyDirectory, "data", "winter-words.txt");
    }

    /// <summary>
    /// Loads and parses winter word data from a text file.
    /// </summary>
    public static WinterWord[] LoadWinterWordsFromFile(string? filePath = null)
    {
        filePath ??= GetDefaultDataPath();
        
        // Normalize the path
        filePath = Path.GetFullPath(filePath);
        
        if (!File.Exists(filePath))
        {
            throw new FileNotFoundException($"Winter words file not found: {filePath}");
        }

        var raw = File.ReadAllText(filePath, System.Text.Encoding.UTF8);
        
        return raw
            .Split(new[] { "\r\n", "\r", "\n" }, StringSplitOptions.None)
            .Select(l => l.Trim())
            .Where(l => l.Length > 0 && !l.StartsWith("#"))
            .Select(line =>
            {
                var parts = Regex.Split(line, @"\s+");
                
                if (parts.Length == 1)
                {
                    return new WinterWord(parts[0]);
                }
                else
                {
                    var first = parts[0];
                    var last = string.Join(" ", parts.Skip(1));
                    return new WinterWord(first, last);
                }
            })
            .ToArray();
    }

    /// <summary>
    /// Renders a winter word according to the specified mode.
    /// </summary>
    public static string RenderFragment(WinterWord word, string mode)
    {
        var f = word.First ?? string.Empty;
        var l = word.Last ?? string.Empty;
        
        if (mode == "first") return f;
        if (mode == "last") return l.Length > 0 ? l : f;
        
        return l.Length > 0 ? (f + Regex.Replace(l, @"\s+", "")) : f;
    }

    /// <summary>
    /// Converts an array of winter words to a multi-line string format.
    /// </summary>
    public static string ToOnePerLine(WinterWord[] words)
    {
        return string.Join("\n", words.Select(p => 
            p.Last != null 
                ? (p.First + " " + Regex.Replace(p.Last, @"\s+", "")) 
                : p.First
        ));
    }
}

