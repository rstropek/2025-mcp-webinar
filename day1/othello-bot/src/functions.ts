import { zodResponsesFunction } from "openai/helpers/zod";
import type { ResponseFunctionToolCall, ResponseInputItem } from "openai/resources/responses/responses";
import type { OthelloBoard } from "othello-game";
import { z } from "zod";

// Tool definitions
// `zodResponsesFunction` turns a Zod schema into a strict Responses API function tool
// (JSON schema with `additionalProperties: false`, all properties required) and gives us
// `$parseRaw` to validate the arguments the model sends back.

export const EmptyObjectSchema = z.object({});

export const resetBoardTool = zodResponsesFunction({
  name: "resetBoard",
  description: "Resets the current Othello board to the initial state.",
  parameters: EmptyObjectSchema,
});

export const getValidMovesTool = zodResponsesFunction({
  name: "getValidMoves",
  description: `Gets the valid moves given the current board state and the player to move as well as the current
     board state and game statistics (which player has how many stones). Will return an array with valid
     moves. For each valid move, it will also return the stones that would be flipped with that move.`,
  parameters: EmptyObjectSchema,
});

export const PositionSchema = z.object({
  row: z.number().min(0).max(7),
  col: z.number().min(0).max(7),
});
export type Position = z.infer<typeof PositionSchema>;

export const tryApplyMoveTool = zodResponsesFunction({
  name: "tryApplyMove",
  description:
    "Tries to apply a move given the current board state and the player to move. Row and column are 0-7. Will return a boolean indicating if the move was successful. Use the showBoard function to display the current board state after the move.",
  parameters: PositionSchema,
});

export const showBoardTool = zodResponsesFunction({
  name: "showBoard",
  description: "Shows the current board state to the user.",
  parameters: EmptyObjectSchema,
});

export const tools = [resetBoardTool, getValidMovesTool, tryApplyMoveTool, showBoardTool];

// Tool execution

type FunctionCallResult = {
  /** The item that has to be sent back to the model in the next request. */
  functionResult: ResponseInputItem.FunctionCallOutput;
  /** Optional text that should be shown to the user (e.g. the board). */
  displayOutput: Generator<string> | null;
};

export async function handleFunctionCall(item: ResponseFunctionToolCall, board: OthelloBoard): Promise<FunctionCallResult> {
  let output: string;
  let displayOutput: Generator<string> | null = null;

  switch (item.name) {
    case resetBoardTool.name:
      board.reset();
      output = "ok";
      break;
    case getValidMovesTool.name: {
      const moves = board.getValidMoves();
      const boardWithMoves = {
        ...moves,
        board: board.toString(),
        currentPlayer: board.getCurrentPlayer(),
        stats: board.getGameStatistics(),
      };
      output = JSON.stringify(boardWithMoves);
      break;
    }
    case tryApplyMoveTool.name: {
      let position: Position;
      try {
        position = tryApplyMoveTool.$parseRaw(item.arguments);
      } catch (error) {
        output = `ERROR: ${error}`;
        break;
      }
      output = board.tryApplyMove(position) ? "ok" : "Invalid move";
      break;
    }
    case showBoardTool.name:
      displayOutput = (function* () {
        yield "\n\n";
        yield board.toFormattedString();
        yield "\n";
      })();
      output = "ok";
      break;
    default:
      output = `ERROR: Unknown function call: ${item.name}`;
      break;
  }

  return {
    functionResult: { type: "function_call_output", call_id: item.call_id, output },
    displayOutput,
  };
}
