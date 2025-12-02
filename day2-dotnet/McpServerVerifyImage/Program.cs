using Microsoft.Extensions.AI;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using ModelContextProtocol.Server;
using System.ComponentModel;

var builder = Host.CreateEmptyApplicationBuilder(settings: null);
builder.Services.AddMcpServer().WithStdioServerTransport().WithToolsFromAssembly();
await builder.Build().RunAsync();

[McpServerToolType]
public static class VerifyImageTools
{
    [McpServerTool(Name = "verify-image"), Description("Verifies whether an image contains given elements")]
    public static async Task<object> VerifyImage(
        McpServer server,
        [Description("A markdown list of the image elements (e.g. texts, logos, etc.) that should be present in the image.")] string requiredImageElements,
        [Description("The full path to the **PNG image** file that should be verified. Example (on Windows): \"c:\\\\temp\\\\images\\\\game.png\" Example (on Linux): \"/home/user/images/game.png\"")] string pathToImage)
    {
        if (!File.Exists(pathToImage))
        {
            return new { content = new[] { new { type = "text", text = $"Error: Image file not found at path: {pathToImage}" } } };
        }

        try
        {
            var imageBytes = await File.ReadAllBytesAsync(pathToImage);

            // Determine MIME type from file extension
            var mimeType = Path.GetExtension(pathToImage).ToLowerInvariant() switch
            {
                ".jpg" or ".jpeg" => "image/jpeg",
                ".gif" => "image/gif",
                ".webp" => "image/webp",
                _ => "image/png"
            };

            var prompt = $"""
                Please verify if the given image contains the following elements:

                <requiredImageElements>
                {requiredImageElements}
                </requiredImageElements>

                Return a markdown list of the required image elements with
                an indication (PRESENT or MISSING) of whether each element is 
                present in the image. If the required image element asks for 
                text, the text must be exactly the same as the text present
                in the image.
                """;

            var response = await server.AsSamplingChatClient().GetResponseAsync(
                [
                    new ChatMessage(ChatRole.User, [ new TextContent(prompt), ]),
                    new ChatMessage(ChatRole.Tool, [ new DataContent(imageBytes, mimeType) ])
                ],
                new ChatOptions { },
                CancellationToken.None);

            var responseText = response.ToString() ?? "Unable to generate the report";

            return new { content = new[] { new { type = "text", text = responseText } } };
        }
        catch (Exception ex)
        {
            return new { content = new[] { new { type = "text", text = $"Error during image verification: {ex.Message}" } } };
        }
    }
}
