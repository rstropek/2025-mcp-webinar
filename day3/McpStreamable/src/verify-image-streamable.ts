import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as fs from "fs";
import { createStreamableHTTPServer } from './lib/streamable-http.js';

const mcpServer = new McpServer({
  name: "verify-image-streamable",
  version: "1.0.0",
});

mcpServer.registerTool(
  "verify-image",
  {
    description: "Verifies whether an image contains given elements",
    inputSchema: {
      requiredImageElements: z.string().describe(`
        A markdown list of the image elements (e.g. texts, logos, etc.) that should be present in the image.`),
      pathToImage: z.string().describe(`
        The full path to the **PNG image** file that should be verified.
        Example (on Windows): "c:\\temp\\images\\game.png"
        Example (on Linux): "/home/user/images/game.png"`),
    },
  },
  async ({ requiredImageElements, pathToImage }) => {
    // Read the image file and convert it to base64
    const image = fs.readFileSync(pathToImage);
    const imageBase64 = image.toString("base64");

    const response = await mcpServer.server.createMessage({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `
                Please verify if the given image contains the following elements:

                <requiredImageElements>
                ${requiredImageElements}
                </requiredImageElements>
                
                Return a markdown list of the required image elements with
                an indication (PRESENT or MISSING) of whether each element is 
                present in the image. If the required image element ask for 
                text, the text must be exactly the same as the text present
                in the image.`,
          },
        },
        {
          role: "user",
          content: {
            type: "image",
            data: imageBase64,
            mimeType: "image/png"
          }
        }
      ],
      maxTokens: 1024
    });

    return {
      content: [
        {
          type: "text",
          text: response.content.type === "text" ? response.content.text : "Unable to generate the report",
        },
      ],
    };
  }
);

// Start the server
createStreamableHTTPServer(mcpServer, "verify-image-streamable", "1.0.0", 3003);
