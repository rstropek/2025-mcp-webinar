using Microsoft.Extensions.AI;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using ModelContextProtocol;
using ModelContextProtocol.Protocol;
using ModelContextProtocol.Server;
using System.ComponentModel;
using System.Reflection;

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
        // Read the image file and convert it to base64
        if (!File.Exists(pathToImage))
        {
            return new
            {
                content = new[] { new { type = "text", text = $"Error: Image file not found at path: {pathToImage}" } }
            };
        }

        var imageBytes = await File.ReadAllBytesAsync(pathToImage);
        var imageBase64 = Convert.ToBase64String(imageBytes);

        try
        {
            // Determine MIME type from file extension
            var mimeType = "image/png";
            var extension = Path.GetExtension(pathToImage).ToLowerInvariant();
            if (extension == ".jpg" || extension == ".jpeg") mimeType = "image/jpeg";
            else if (extension == ".gif") mimeType = "image/gif";
            else if (extension == ".webp") mimeType = "image/webp";

            // Use server.server.createMessage directly, just like in TypeScript
            // In TypeScript: mcpServer.server.createMessage({ messages: [...], maxTokens: 1024 })
            var serverType = server.GetType();
            var serverProperty = serverType.GetProperty("Server") ?? serverType.GetProperty("server");
            
            if (serverProperty == null)
            {
                return new
                {
                    content = new[] { new { type = "text", text = "Error: Could not access server.server property" } }
                };
            }

            var serverInstance = serverProperty.GetValue(server);
            var createMessageMethod = serverInstance?.GetType().GetMethod("CreateMessageAsync") 
                                   ?? serverInstance?.GetType().GetMethod("createMessage");
            
            if (createMessageMethod == null)
            {
                return new
                {
                    content = new[] { new { type = "text", text = "Error: Could not find createMessage method" } }
                };
            }

            // Construct the message payload exactly like in TypeScript
            var textContent = new
            {
                type = "text",
                text = $@"
Please verify if the given image contains the following elements:

<requiredImageElements>
{requiredImageElements}
</requiredImageElements>

Return a markdown list of the required image elements with
an indication (PRESENT or MISSING) of whether each element is 
present in the image. If the required image element ask for 
text, the text must be exactly the same as the text present
in the image."
            };
            
            var imageContent = new
            {
                type = "image",
                data = imageBase64,
                mimeType = mimeType
            };
            
            var messagePayload = new
            {
                messages = new object[]
                {
                    new { role = "user", content = textContent },
                    new { role = "user", content = imageContent }
                },
                maxTokens = 1024
            };
            
            var task = createMessageMethod.Invoke(serverInstance, new[] { messagePayload }) as Task<object>;
            if (task == null)
            {
                return new
                {
                    content = new[] { new { type = "text", text = "Error: createMessage did not return a Task" } }
                };
            }

            var result = await task;
            var resultType = result.GetType();
            var contentProperty = resultType.GetProperty("Content") ?? resultType.GetProperty("content");
            var content = contentProperty?.GetValue(result);
            
            if (content == null)
            {
                return new
                {
                    content = new[] { new { type = "text", text = "Unable to generate the report" } }
                };
            }

            var contentType = content.GetType();
            var typeProperty = contentType.GetProperty("Type") ?? contentType.GetProperty("type");
            var textProperty = contentType.GetProperty("Text") ?? contentType.GetProperty("text");
            
            var responseText = "Unable to generate the report";
            if (typeProperty?.GetValue(content)?.ToString() == "text" && textProperty != null)
            {
                responseText = textProperty.GetValue(content)?.ToString() ?? responseText;
            }

            return new
            {
                content = new[] { new { type = "text", text = responseText } }
            };
        }
        catch (Exception ex)
        {
            return new
            {
                content = new[] { new { type = "text", text = $"Error during image verification: {ex.Message}" } }
            };
        }
    }
}
