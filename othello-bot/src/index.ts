import OpenAI from "openai";
import fs from "fs";
import { OthelloBoard } from "othello-game";

const client = new OpenAI();

const systemPrompt = await fs.promises.readFile("system-prompt.md", {
  encoding: "utf-8",
});

const board = OthelloBoard.createEmpty();
