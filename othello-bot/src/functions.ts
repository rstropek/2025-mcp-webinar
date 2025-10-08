import type { FunctionTool } from "openai/resources/responses/responses.mjs";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const EmptyObjectSchema = z.object({});

export const resetBoardTool: FunctionTool = {
  type: "function",
  name: "resetBoard",
  description: "Resets the current Othello board to the initial state.",
  strict: true,
  parameters: zodToJsonSchema(EmptyObjectSchema),
};

export const getValidMovesTool: FunctionTool = {
  type: "function",
  name: "getValidMoves",
  description: `Gets the valid moves given the current board state and the player to move as well as the current 
     board state and game statistics (which player has how many stones). Will return an array with valid 
     moves. For each valid move, it will also return the stones that would be flipped with that move.`,
  parameters: zodToJsonSchema(EmptyObjectSchema),
  strict: true,
};

export const PositionSchema = z.object({
  row: z.number().min(0).max(7),
  col: z.number().min(0).max(7),
});
export type Position = z.infer<typeof PositionSchema>;

export const tryApplyMoveTool: FunctionTool = {
  type: "function",
  name: "tryApplyMove",
  description:
    "Tries to apply a move given the current board state and the player to move. Row and column are 0-7. Will return a boolean indicating if the move was successful. Use the getBoard function to get the current board state after the move.",
  parameters: zodToJsonSchema(PositionSchema),
  strict: true,
};

export const showBoardTool: FunctionTool = {
  type: "function",
  name: "showBoard",
  description: "Shows the current board state to the user.",
  parameters: zodToJsonSchema(EmptyObjectSchema),
  strict: true,
};
