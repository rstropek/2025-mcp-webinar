import OpenAI from "openai";
import fs from "fs";
import { OthelloBoard } from "othello-game";
import { readLine } from "./input-helper.js";
import type { ResponseInputItem } from "openai/resources/responses/responses.mjs";

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
  });

  for await (const chunk of response) {
    if (chunk.type === "response.created") {
      console.log("Response created:", chunk.response.id);
      previousResponseId = chunk.response.id;
    } else if (chunk.type === "response.output_text.delta") {
      yield chunk.delta;
    }
  }
}
