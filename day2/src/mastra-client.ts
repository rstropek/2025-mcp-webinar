import { fileURLToPath } from "node:url";
import { Agent } from "@mastra/core/agent";
import { MCPClient } from "@mastra/mcp";

// The prompt is passed on the command line, e.g.:
//   npm run start:mastra-client -- "Create a 20 character password with specials"
const prompt = process.argv.slice(2).join(" ").trim();
if (!prompt) {
	console.error('Usage: npm run start:mastra-client -- "<your prompt>"');
	process.exit(1);
}

// Talk to the local Ollama server through its OpenAI-compatible endpoint
// (http://localhost:11434/v1). The "ollama/" prefix is just a label; the `url`
// is what routes Mastra to Ollama. Override the host with OLLAMA_BASE_URL.
const MODEL = {
	id: "ollama/gpt-oss:20b",
	url: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434/v1",
	apiKey: "ollama", // Ollama ignores the key, but the client expects a value.
} as const;

// Run the day2 "server-sdk" MCP server (Sample 2) over stdio. We spawn it as a
// single Node process with the tsx loader (no `npx` wrapper) so closing the MCP
// connection reliably terminates it. An `npx` wrapper would leave the real
// server process orphaned, holding the stdio pipe open and hanging this CLI
// forever after the answer was printed.
const serverPath = fileURLToPath(new URL("./server-sdk.ts", import.meta.url));
const projectRoot = fileURLToPath(new URL("..", import.meta.url));

const mcp = new MCPClient({
	servers: {
		pony: {
			command: process.execPath, // the same node binary running this script
			args: ["--import", "tsx", serverPath],
			cwd: projectRoot,
		},
	},
});

// Hand every tool the MCP server exposes (pony_password, pony_password_batch)
// to the agent. The agent decides on its own when to call them.
const agent = new Agent({
	id: "pony-password-assistant",
	name: "Pony Password Assistant",
	instructions:
		"You help users create passwords from My Little Pony character names. " +
		"Always use the available MCP tools to generate passwords instead of " +
		"inventing them yourself. Keep your answers short and friendly.",
	model: MODEL,
	tools: await mcp.listTools(),
});

try {
	// Stream the answer token by token. maxSteps > 1 lets the agent call a tool
	// and then summarise the result in a second step.
	const stream = await agent.stream(prompt, { maxSteps: 5 });
	for await (const chunk of stream.textStream) {
		process.stdout.write(chunk);
	}
	process.stdout.write("\n");
} finally {
	await mcp.disconnect();
}

// Mastra's HTTP client to Ollama can leave a keep-alive socket open, so exit
// explicitly to return to the shell instead of lingering.
process.exit(0);
