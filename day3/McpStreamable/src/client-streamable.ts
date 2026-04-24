import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const transport = new StreamableHTTPClientTransport(
	new URL("http://localhost:3000/mcp"),
);

const client = new Client({
	name: "streamable-client",
	version: "1.0.0",
});

await client.connect(transport);

console.log(">>> Connected to streamable MCP server");
console.log(">>> List of tools:");

const tools = await client.listTools();
for (const tool of tools.tools) {
	console.log(`Tool: ${tool.name} (${tool.description})`);
}

console.log("\n>>> List of prompts:");

const prompts = await client.listPrompts();
for (const prompt of prompts.prompts) {
	console.log(`Prompt: ${prompt.name} - ${prompt.description}`);
}

console.log("\n>>> List of resources:");

const resources = await client.listResources();
for (const resource of resources.resources) {
	console.log(
		`Resource: ${resource.name} (${resource.uri}) - ${resource.description}`,
	);
}

console.log("\n>>> Testing pony_password tool:");

type TextContent = { type: "text"; text: string };

try {
	const result = await client.callTool({
		name: "pony_password",
		arguments: { minLength: 16, special: true },
	});
	const content = result.content as TextContent[];
	console.log("Password generated:", content[0].text);
} catch (error) {
	console.error("Error calling tool:", error);
}

console.log("\n>>> Testing pony_password_batch tool:");

try {
	const result = await client.callTool({
		name: "pony_password_batch",
		arguments: { count: 3, minLength: 20, special: false },
	});
	const content = result.content as TextContent[];
	console.log("Batch passwords generated:");
	const passwords = JSON.parse(content[0].text) as string[];
	passwords.forEach((pwd, index) => {
		console.log(`  ${index + 1}. ${pwd}`);
	});
} catch (error) {
	console.error("Error calling batch tool:", error);
}

console.log("\n>>> Testing make-pony-password prompt:");

try {
	const result = await client.getPrompt({
		name: "make-pony-password",
		arguments: { minLength: "16", special: "true" },
	});
	console.log("Prompt result:");
	result.messages.forEach((msg, index) => {
		const c = msg.content as TextContent;
		console.log(`  Message ${index + 1}:`, c.text);
	});
} catch (error) {
	console.error("Error getting prompt:", error);
}

console.log("\n>>> Testing pony-characters-text resource:");

try {
	const result = await client.readResource({ uri: "pony://characters.txt" });
	const first = result.contents[0] as { text: string };
	console.log("Resource content (first 200 chars):");
	console.log(`${first.text.substring(0, 200)}...`);
} catch (error) {
	console.error("Error reading resource:", error);
}

console.log("\n>>> Disconnecting...");
await client.close();
console.log(">>> Done!");
