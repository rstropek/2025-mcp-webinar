import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type { CallToolResult, MessageExtraInfo, ServerNotification, ServerRequest } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

const echoToolSchema = z.object({
  message: z.string().describe('The message to echo back.'),
});
type EchoToolInput = z.infer<typeof echoToolSchema>;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
            
async function echoTool(
  server: McpServer,
  params: EchoToolInput,
  extra: RequestHandlerExtra<ServerRequest, ServerNotification>
): Promise<CallToolResult> {
  await server.sendLoggingMessage(
    {
      level: 'debug',
      data: 'Echo tool invoked',
      relatedRequestId: extra.requestId,
    },
    extra.sessionId
  );
  await sleep(500); // Simulate some processing delay
  return {
    content: [
      {
        type: 'text',
        text: `Echo: ${params.message}`,
      },
    ],
  };
}

export function registerEchoTool(server: McpServer) {
  server.registerTool(
    'echo-tool',
    {
      title: 'Echo Tool',
      description: 'A tool that echoes back the input it receives.',
      inputSchema: echoToolSchema.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
      },
    },
    (params, extra) => echoTool(server, params, extra)
  );
}

export function getServer(): McpServer {
  const server = new McpServer(
    {
      name: 'demo-mcp-server',
      version: '1.0.0',
    },
    { capabilities: { logging: {} } }
  );

  registerEchoTool(server);

  return server;
}
