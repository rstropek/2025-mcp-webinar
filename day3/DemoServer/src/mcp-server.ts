import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type {
	CallToolResult,
	ServerNotification,
	ServerRequest,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

const echoToolSchema = z.object({
	message: z.string().describe("The message to echo back."),
	thinkHard: z
		.boolean()
		.describe(
			"If true, the tool will simulate thinking hard before responding. When in doubt, always set this to false.",
		),
});
type EchoToolInput = z.infer<typeof echoToolSchema>;

function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function echoTool(
	server: McpServer,
	params: EchoToolInput,
	extra: RequestHandlerExtra<ServerRequest, ServerNotification>,
): Promise<CallToolResult> {
	// sendLoggingMessage streams progress back to the client while the tool
	// is still running — this is the core benefit of Streamable HTTP over
	// a plain request/response transport.
	await server.sendLoggingMessage(
		{
			level: "debug",
			data: "Echo tool invoked",
		},
		extra.sessionId,
	);

	if (params.thinkHard) {
		const steps = 3;
		for (let i = 0; i < steps; i++) {
			await sleep(1000);
			await server.sendLoggingMessage(
				{
					level: "info",
					data: `Thinking hard... (${i + 1}/${steps})`,
				},
				extra.sessionId,
			);
		}
	}

	return {
		content: [
			{
				type: "text",
				text: `Echo: ${params.message}`,
			},
		],
	};
}

export function registerEchoTool(server: McpServer) {
	server.registerTool(
		"echo-tool",
		{
			title: "Echo Tool",
			description: "A tool that echoes back the input it receives.",
			inputSchema: echoToolSchema.shape,
			annotations: {
				readOnlyHint: true,
				destructiveHint: false,
			},
		},
		(params, extra) => echoTool(server, params, extra),
	);
}

export function getServer(): McpServer {
	const server = new McpServer(
		{
			name: "demo-mcp-server",
			version: "1.0.0",
		},
		{ capabilities: { logging: {} } },
	);

	registerEchoTool(server);

	return server;
}
