import { Client } from "@modelcontextprotocol/sdk/client";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
    command: "node",
    args: ["./dist/server-sdk.js"]
});
const client = new Client({
    name: 'example-client',
    version: '1.0.0'
});
await client.connect(transport);

console.log(">>> List of tools:");

const tools = await client.listTools();
for (const tool of tools.tools) {
    console.log(`Tool: ${tool.name} (${tool.id}) - ${tool.description}`);
}

transport.close();
