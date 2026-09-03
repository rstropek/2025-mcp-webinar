import { fileURLToPath } from "node:url";
import { Agent } from "@mastra/core/agent";
import { MCPClient } from "@mastra/mcp";

// ---------------------------------------------------------------------------
// The same console chat bot as Sample 4 (`chat-client.ts`), but written with the
// Mastra agent framework instead of a hand-written tool loop.
//
// In Sample 4 we did everything ourselves: convert MCP tool descriptors into
// function tools, run the `do … while` loop, execute every `function_call` and
// feed the result back into the conversation. Mastra does all of that for us —
// we only hand the agent the tools that its MCP client discovered and call
// `agent.stream(...)`.
// ---------------------------------------------------------------------------

// The prompt is passed on the command line, e.g.:
//   npm run start:mastra-client -- "Create a 20 character password with specials"
const prompt = process.argv.slice(2).join(" ").trim();
if (!prompt) {
  console.error('Usage: npm run start:mastra-client -- "<your prompt>"');
  process.exit(1);
}

// The API key comes from the `.env` file (see readme.md), which
// `node --env-file=.env` loads for us. Mastra's model router picks it up from
// the environment, so fail early with a clear message if it is missing.
if (!process.env.OPENROUTER_API_KEY) {
  console.error("OPENROUTER_API_KEY is not set. Put it into day2/.env (see readme.md).");
  process.exit(1);
}

// Mastra's model router understands plain `"<gateway>/<provider>/<model>"`
// strings. The `openrouter/` prefix routes the request through OpenRouter's
// OpenAI-compatible endpoint and makes Mastra read `OPENROUTER_API_KEY` from
// the environment — no provider object, no base URL needed. We use the same
// cheap model as the pi.dev tests in readme.md.
const MODEL = "openrouter/z-ai/glm-5.3-flash";

// Run the day2 "server-sdk" MCP server (Sample 2) over stdio. We spawn the
// *built* server (`dist/server-sdk.js`) with the very same node binary that runs
// this script — no `tsx`, no `npx` wrapper. An `npx` wrapper would leave the
// real server process orphaned, holding the stdio pipe open and hanging this CLI
// forever after the answer was printed.
const serverPath = fileURLToPath(new URL("./server-sdk.js", import.meta.url));
const projectRoot = fileURLToPath(new URL("..", import.meta.url));

const mcp = new MCPClient({
  servers: {
    pony: {
      command: process.execPath, // the same node binary running this script
      args: [serverPath],
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

// The HTTP client talking to OpenRouter can leave a keep-alive socket open, so
// exit explicitly to return to the shell instead of lingering.
process.exit(0);
