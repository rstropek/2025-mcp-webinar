using System.ComponentModel;
using System.Reflection;
using ModelContextProtocol.Server;

[McpServerToolType]
public static class AdderTools
{
    [McpServerTool(Name = "add_numbers"), Description("Adds two numbers and displays the result in a visual UI")]
    [McpMeta("ui/resourceUri", "ui://adder/view.html")]
    [McpMeta("ui", JsonValue = """{"resourceUri":"ui://adder/view.html"}""")]
    public static string AddNumbers(
        [Description("First number")] double number1 = 3,
        [Description("Second number")] double number2 = 4)
    {
        return $"{number1} + {number2} = {number1 + number2}";
    }

    [McpServerTool(Name = "add_numbers_interactive"), Description("Opens an interactive form where the user can enter two numbers and compute their sum")]
    [McpMeta("ui/resourceUri", "ui://adder/interactive.html")]
    [McpMeta("ui", JsonValue = """{"resourceUri":"ui://adder/interactive.html"}""")]
    public static string AddNumbersInteractive(
        [Description("First number (pre-filled in form)")] double number1 = 3,
        [Description("Second number (pre-filled in form)")] double number2 = 4)
    {
        return $"{number1} + {number2} = {number1 + number2}";
    }
}

[McpServerResourceType]
public static class AdderResources
{
    private static readonly string _viewHtml;
    private static readonly string _interactiveHtml;

    static AdderResources()
    {
        var assembly = Assembly.GetExecutingAssembly();

        using (var stream = assembly.GetManifestResourceStream("McpAppsDotnet.ui.view.html")!)
        using (var reader = new StreamReader(stream))
            _viewHtml = reader.ReadToEnd();

        using (var stream = assembly.GetManifestResourceStream("McpAppsDotnet.ui.interactive.html")!)
        using (var reader = new StreamReader(stream))
            _interactiveHtml = reader.ReadToEnd();
    }

    [McpServerResource(UriTemplate = "ui://adder/view.html", Name = "Adder UI", MimeType = "text/html;profile=mcp-app")]
    [Description("Visual UI for the adder tool")]
    public static string ViewHtml() => _viewHtml;

    [McpServerResource(UriTemplate = "ui://adder/interactive.html", Name = "Interactive Adder", MimeType = "text/html;profile=mcp-app")]
    [Description("Interactive form UI for the adder tool")]
    public static string InteractiveHtml() => _interactiveHtml;
}
