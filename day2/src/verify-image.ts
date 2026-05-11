import { readFile } from "node:fs/promises";
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const mcpServer = new McpServer({
	name: "verify-image",
	version: "1.0.0",
});

// Map file extensions to the mime types the sampling client will accept.
// Anything not in this list is rejected up-front rather than silently being
// labelled as PNG.
const SUPPORTED_IMAGE_TYPES: Record<string, string> = {
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".gif": "image/gif",
	".webp": "image/webp",
};

mcpServer.registerTool(
	"verify-image",
	{
		description: "Verifies whether an image contains given elements",
		inputSchema: {
			requiredImageElements: z.string().describe(`
        A markdown list of the image elements (e.g. texts, logos, etc.) that should be present in the image.`),
			pathToImage: z.string().describe(`
        The full path to a PNG/JPEG/GIF/WEBP image file that should be verified.
        Example (on Windows): "c:\\temp\\images\\game.png"
        Example (on Linux): "/home/user/images/game.png"`),
		},
	},
	async ({ requiredImageElements, pathToImage }) => {
		// ⚠️ DEMO ONLY. We trust whatever path the model passes in and read it
		// straight from disk. In production this is a path-traversal vector:
		// any file the server process can read is fair game. Real deployments
		// MUST restrict reads to a known sandbox directory and reject paths
		// that resolve outside of it.
		const ext = path.extname(pathToImage).toLowerCase();
		const mimeType = SUPPORTED_IMAGE_TYPES[ext];
		if (!mimeType) {
			return {
				isError: true,
				content: [
					{
						type: "text",
						text: `Unsupported image extension: "${ext}". Supported: ${Object.keys(SUPPORTED_IMAGE_TYPES).join(", ")}.`,
					},
				],
			};
		}

		// Sampling is a CLIENT capability — bail out early with a useful
		// message if the client didn't advertise it during initialize.
		if (!mcpServer.server.getClientCapabilities()?.sampling) {
			return {
				isError: true,
				content: [
					{
						type: "text",
						text: "This tool needs the client's `sampling` capability, but the connected client did not advertise it.",
					},
				],
			};
		}

		const imageBase64 = (await readFile(pathToImage)).toString("base64");

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
						mimeType,
					},
				},
			],
			maxTokens: 1024,
		});

		return {
			content: [
				{
					type: "text",
					text:
						response.content.type === "text"
							? response.content.text
							: "Unable to generate the report",
				},
			],
		};
	},
);

const transport = new StdioServerTransport();
await mcpServer.connect(transport);
