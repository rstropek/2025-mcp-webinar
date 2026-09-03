import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import OpenAI from "openai";
import type {
  FunctionTool,
  ResponseFunctionToolCall,
  ResponseInputItem,
  ResponseOutputItem,
  ResponseOutputMessage,
  ResponseReasoningItem,
} from "openai/resources/responses/responses";

// ---------------------------------------------------------------------------
// A minimal console chat bot on top of an MCP server.
//
// This is the day1 Othello bot with ONE decisive difference: day1 hard-coded its
// tool definitions in `functions.ts` and hard-coded the matching `switch` to
// execute them. Here nothing about the tools is known at compile time. The bot
// connects to the Sample 2 MCP server, asks it `tools/list` at runtime, converts
// whatever comes back into Responses-API function tools and forwards every tool
// call straight back to the server via `tools/call`.
//
// That is the whole point of MCP: the model's capabilities are discovered, not
// compiled in. Add a tool to `server-sdk.ts`, restart — this file stays as is.
// ---------------------------------------------------------------------------

// The prompt is passed on the command line, e.g.:
//   npm run start:chat -- "Create one 20 character password with special characters"
const prompt = process.argv.slice(2).join(" ").trim();
if (!prompt) {
  console.error('Usage: npm run start:chat -- "<your prompt>"');
  process.exit(1);
}

// OpenRouter exposes an OpenAI-compatible Responses API, so we can use the regular
// OpenAI SDK and just point it to a different base URL. The API key comes from the
// `.env` file (see readme.md), which `node --env-file=.env` loads for us.
const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: {
    // Optional headers used by OpenRouter for app attribution/rankings
    "HTTP-Referer": "https://github.com/rstropek/2025-mcp-webinar",
    "X-OpenRouter-Title": "MCP Pony Chat",
  },
});

// The same cheap model as in the Mastra client (Sample 5) and the pi.dev tests.
const MODEL = "z-ai/glm-5.3-flash";

// Spawn Sample 2's MCP server as a child process and talk to it over stdio.
// `versionNegotiation.mode: "auto"` probes with `server/discover` first and falls
// back to the legacy 2025-era `initialize` handshake (see client.ts for details).
const transport = new StdioClientTransport({
  command: "node",
  args: ["./dist/server-sdk.js"],
});
const mcp = new Client({ name: "pony-chat-client", version: "1.0.0" }, { versionNegotiation: { mode: "auto" } });
await mcp.connect(transport);
writeToConsoleInLightGray(`>>> Connected to MCP server (protocol era: ${mcp.getProtocolEra()})`);

try {
  // Discover the tools instead of hard-coding them. `listTools()` without a
  // cursor auto-aggregates all pages.
  const { tools: mcpTools } = await mcp.listTools();
  writeToConsoleInLightGray(`>>> Discovered ${mcpTools.length} MCP tool(s): ${mcpTools.map((t) => t.name).join(", ")}`);

  // Convert MCP tool descriptors into Responses API function tools. An MCP
  // `inputSchema` already *is* a JSON schema, so it can be handed over as-is.
  // `strict: false` because MCP schemas may use defaults/optional properties,
  // which strict mode (all-required, `additionalProperties: false`) forbids.
  const tools: FunctionTool[] = mcpTools.map((tool) => ({
    type: "function",
    name: tool.name,
    // Fold the human-readable title into the description so the model gets as
    // much guidance as the server offers.
    description: [tool.title, tool.description].filter(Boolean).join(" — "),
    parameters: tool.inputSchema as Record<string, unknown>,
    strict: false,
  }));

  // OpenRouter's Responses API is stateless (no `store`, no `previous_response_id`).
  // Therefore, we have to keep the entire conversation history on the client side
  // and send it with every request.
  const conversation: ResponseInputItem[] = [
    {
      role: "system",
      content:
        "You help users create passwords from My Little Pony character names. " +
        "Always use the available tools to generate passwords instead of inventing them yourself. " +
        "Pass the arguments exactly as described by each tool's JSON schema. " +
        "Keep your answers short and friendly.",
    },
    { role: "user", content: prompt },
  ];

  for await (const chunk of createResponse(conversation, tools)) {
    process.stdout.write(chunk);
  }
  console.log();
} finally {
  // `close()` tears down the transport and terminates the spawned child process.
  // Without this the process would hang on the still-open stdio pipe.
  await mcp.close();
}

/**
 * Runs the model until it stops asking for tool calls. Every `function_call` the
 * model emits is executed against the MCP server, and its result is appended to
 * the conversation before the next round trip.
 */
async function* createResponse(conversation: ResponseInputItem[], tools: FunctionTool[]): AsyncGenerator<string> {
  let requiresFurtherActions: boolean;
  do {
    requiresFurtherActions = false;
    let hasOutputText = false;
    const functionOutputs: ResponseInputItem[] = [];

    const stream = await openai.responses.create({
      model: MODEL,
      reasoning: { effort: "low" },
      input: conversation,
      stream: true,
      tools,
    });

    for await (const event of stream) {
      switch (event.type) {
        case "response.output_text.delta":
          // Add newline before first text output in each iteration
          if (!hasOutputText) {
            yield "\n";
            hasOutputText = true;
          }
          // Text to be displayed to the user
          yield event.delta;
          break;

        case "response.output_item.done":
          if (event.item.type === "function_call") {
            // The model wants us to call a tool -> forward it to the MCP server
            writeToConsoleInLightGray(`>>> Calling MCP tool ${event.item.name}(${event.item.arguments})...`);
            requiresFurtherActions = true;
            const output = await callMcpTool(event.item);
            writeToConsoleInLightGray(`>>> MCP tool completed: ${output}`);
            functionOutputs.push({ type: "function_call_output", call_id: event.item.call_id, output });
          }
          break;

        case "response.completed":
          // Append everything the model produced (messages, reasoning, function calls)
          // followed by our tool results, so the next request has the full context.
          conversation.push(...event.response.output.filter(isConversationItem), ...functionOutputs);
          writeToConsoleInLightGray(`>>> Response completed ${JSON.stringify(event.response.usage)}`);
          break;

        case "response.failed":
          throw new Error(`Response failed: ${JSON.stringify(event.response.error)}`);

        case "error":
          throw new Error(`Stream error: ${event.message}`);
      }
    }
  } while (requiresFurtherActions);
}

/**
 * Executes one model-requested function call as an MCP `tools/call` and turns the
 * MCP result into the plain string the Responses API expects.
 */
async function callMcpTool(item: ResponseFunctionToolCall): Promise<string> {
  let args: Record<string, unknown>;
  try {
    args = item.arguments ? JSON.parse(item.arguments) : {};
  } catch (error) {
    // Give the model a chance to fix malformed JSON instead of crashing.
    return `ERROR: arguments are not valid JSON: ${error}`;
  }

  try {
    const result = await mcp.callTool({ name: item.name, arguments: args });

    // Prefer the machine-readable payload if the tool defines an output schema...
    if (result.structuredContent !== undefined) {
      return JSON.stringify(result.structuredContent);
    }

    // ...otherwise fall back to the human-readable text content blocks.
    const text = result.content
      .filter((c) => c.type === "text")
      .map((c) => c.text)
      .join("\n");
    return result.isError ? `ERROR: ${text}` : text;
  } catch (error) {
    // Protocol-level failures (unknown tool, schema violation, ...) are thrown.
    // Reporting them back to the model lets it retry with corrected arguments.
    return `ERROR: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/** Output item types that we send back to the model as part of the conversation history. */
function isConversationItem(
  item: ResponseOutputItem,
): item is ResponseOutputMessage | ResponseFunctionToolCall | ResponseReasoningItem {
  return item.type === "message" || item.type === "function_call" || item.type === "reasoning";
}

function writeToConsoleInLightGray(text: string): void {
  process.stdout.write(`\n\x1b[90m${text}\x1b[0m`);
}
