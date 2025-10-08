import OpenAI from "openai";
import fs from "fs";
import { OthelloBoard } from "othello-game";
import { readLine } from "./input-helper.js";
import type { ResponseInputItem } from "openai/resources/responses/responses.mjs";
import { getValidMovesTool, resetBoardTool, handleFunctionCall, showBoardTool, tryApplyMoveTool } from "./functions.js";

const client = new OpenAI();

const systemPrompt = await fs.promises.readFile("system-prompt.md", {
  encoding: "utf-8",
});

const board = OthelloBoard.createEmpty();

let previousResponseId: string | null = null;

while (true) {
  const userMessage = await readLine("You:\n");
  console.log();

  const response = createResponse(client, userMessage);
  for await (const chunk of response) {
    process.stdout.write(chunk);
  }

  console.log();
}

async function* createResponse(client: OpenAI, userMessage: string): AsyncGenerator<string> {
  let input: ResponseInputItem[] = [{ role: "user", content: userMessage }];
  let requiresFurtherActions: boolean;
  do {
    requiresFurtherActions = false;
    const response = await client.responses.create({
      model: "gpt-5",
      reasoning: {
        effort: 'minimal',
      },
      instructions: systemPrompt,
      input,
      store: true,
      previous_response_id: previousResponseId,
      stream: true,
      tools: [
        resetBoardTool,
        getValidMovesTool,
        tryApplyMoveTool,
        showBoardTool,
      ],
    });
    
    input = [];
    for await (const chunk of response) {
      if (chunk.type === "response.created") {
        previousResponseId = chunk.response.id;
      } else if (chunk.type === "response.output_text.delta") {
        // Text to be displayed to the user
        yield chunk.delta;
      } else if (chunk.type === "response.output_item.done" && chunk.item.type === "function_call") {
        // We have to do a function call
        writeToConsoleInLightGray(`>>> Calling function ${chunk.item.name}(${JSON.stringify(chunk.item.arguments)})...`);
        requiresFurtherActions = true;
        const result = await handleFunctionCall(chunk.item, board);
        if (result.displayOutput) {
          yield* result.displayOutput;
        }
        writeToConsoleInLightGray(`>>> Function call completed ${JSON.stringify(result.functionResult)}`);
        input.push(result.functionResult);
      } else if (chunk.type === "response.completed") {
        writeToConsoleInLightGray(`>>> Response completed ${JSON.stringify(chunk.response.usage)}`);
      }
    }
  } while (requiresFurtherActions);
}

function writeToConsoleInLightGray(text: string): void {
  process.stdout.write(`\n\x1b[90m${text}\x1b[0m`);
}