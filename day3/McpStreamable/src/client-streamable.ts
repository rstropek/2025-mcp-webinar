import { Client } from "@modelcontextprotocol/sdk/client";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const transport = new StreamableHTTPClientTransport(new URL('http://localhost:3000/mcp'));

const client = new Client({
    name: 'streamable-client',
    version: '1.0.0'
});

await client.connect(transport);

console.log(">>> Connected to streamable MCP server");
console.log(">>> List of tools:");

const tools = await client.listTools();
for (const tool of tools.tools) {
    console.log(`Tool: ${tool.name} (${tool.id}) - ${tool.description}`);
}

console.log("\n>>> List of prompts:");

const prompts = await client.listPrompts();
for (const prompt of prompts.prompts) {
    console.log(`Prompt: ${prompt.name} (${prompt.id}) - ${prompt.description}`);
}

console.log("\n>>> List of resources:");

const resources = await client.listResources();
for (const resource of resources.resources) {
    console.log(`Resource: ${resource.name} (${resource.uri}) - ${resource.description}`);
}

console.log("\n>>> Testing pony_password tool:");

try {
    const result = await client.callTool({
        name: "pony_password",
        arguments: {
            minLength: 16,
            special: true
        }
    });
    
    console.log("Password generated:", ((result as any).content[0] as any).text);
} catch (error) {
    console.error("Error calling tool:", error);
}

console.log("\n>>> Testing pony_password_batch tool:");

try {
    const result = await client.callTool({
        name: "pony_password_batch",
        arguments: {
            count: 3,
            minLength: 20,
            special: false
        }
    });
    
    console.log("Batch passwords generated:");
    const passwords = JSON.parse(((result as any).content[0] as any).text);
    passwords.forEach((pwd: string, index: number) => {
        console.log(`  ${index + 1}. ${pwd}`);
    });
} catch (error) {
    console.error("Error calling batch tool:", error);
}

console.log("\n>>> Testing make-pony-password prompt:");

try {
    const result = await client.getPrompt({
        name: "make-pony-password",
        arguments: {
            minLength: "16",
            special: "true"
        }
    });
    
    console.log("Prompt result:");
    result.messages.forEach((msg, index) => {
        console.log(`  Message ${index + 1}:`, (msg.content as any).text);
    });
} catch (error) {
    console.error("Error getting prompt:", error);
}

console.log("\n>>> Testing pony-characters-text resource:");

try {
    const result = await client.readResource({
        uri: "pony://characters.txt"
    });
    
    console.log("Resource content (first 200 chars):");
    console.log((result.contents[0] as any).text.substring(0, 200) + "...");
} catch (error) {
    console.error("Error reading resource:", error);
}

console.log("\n>>> Disconnecting...");
transport.close();
console.log(">>> Done!");
