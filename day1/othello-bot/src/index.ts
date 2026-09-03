import fs from "node:fs";
import OpenAI from "openai";
import type {
  ResponseFunctionToolCall,
  ResponseInputItem,
  ResponseOutputItem,
  ResponseOutputMessage,
  ResponseReasoningItem,
} from "openai/resources/responses/responses";
import { OthelloBoard } from "othello-game";
import { handleFunctionCall, tools } from "./functions.js";
import { readLine } from "./input-helper.js";

// OpenRouter exposes an OpenAI-compatible Responses API, so we can use the regular
// OpenAI SDK and just point it to a different base URL.
const client = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: {
    // Optional headers used by OpenRouter for app attribution/rankings
    "HTTP-Referer": "https://github.com/rstropek/2025-mcp-webinar",
    "X-OpenRouter-Title": "Othello Bot",
  },
});

const MODEL = "meta/muse-glimmer-30b";

const systemPrompt = await fs.promises.readFile("system-prompt.md", {
  encoding: "utf-8",
});

const board = OthelloBoard.createEmpty();

// OpenRouter's Responses API is stateless (no `store`, no `previous_response_id`).
// Therefore, we have to keep the entire conversation history on the client side
// and send it with every request.
const conversation: ResponseInputItem[] = [{ role: "system", content: systemPrompt }];

while (true) {
  const userMessage = await readLine("You:\n");
  console.log();

  conversation.push({ role: "user", content: userMessage });

  for await (const chunk of createResponse(client)) {
    process.stdout.write(chunk);
  }

  console.log();
}

async function* createResponse(client: OpenAI): AsyncGenerator<string> {
  let requiresFurtherActions: boolean;
  do {
    requiresFurtherActions = false;
    let hasOutputText = false;
    const functionOutputs: ResponseInputItem[] = [];

    const stream = await client.responses.create({
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
            // The model wants us to call a function
            writeToConsoleInLightGray(`>>> Calling function ${event.item.name}(${event.item.arguments})...`);
            requiresFurtherActions = true;
            const result = await handleFunctionCall(event.item, board);
            if (result.displayOutput) {
              yield* result.displayOutput;
            }
            writeToConsoleInLightGray(`>>> Function call completed ${JSON.stringify(result.functionResult)}`);
            functionOutputs.push(result.functionResult);
          }
          break;

        case "response.completed":
          // Append everything the model produced (messages, reasoning, function calls)
          // followed by our function results, so the next request has the full context.
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

/** Output item types that we send back to the model as part of the conversation history. */
function isConversationItem(
  item: ResponseOutputItem,
): item is ResponseOutputMessage | ResponseFunctionToolCall | ResponseReasoningItem {
  return item.type === "message" || item.type === "function_call" || item.type === "reasoning";
}

function writeToConsoleInLightGray(text: string): void {
  process.stdout.write(`\n\x1b[90m${text}\x1b[0m`);
}
