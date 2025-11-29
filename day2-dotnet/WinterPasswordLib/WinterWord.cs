namespace WinterPasswordLib;

/// <summary>
/// Represents a winter word with a required first part and optional second part.
/// </summary>
public class WinterWord
{
    public string First { get; set; } = string.Empty;
    public string? Last { get; set; }

    public WinterWord(string first, string? last = null)
    {
        First = first;
        Last = last;
    }
}

