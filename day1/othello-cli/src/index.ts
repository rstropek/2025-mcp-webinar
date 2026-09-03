import * as readline from "node:readline";
import { isInvalidBoardResult, type Move, OthelloBoard } from "othello-game";

// Global variables
let board: OthelloBoard = OthelloBoard.createEmpty();
const rl: readline.Interface = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

/**
 * Display the board with row and column labels
 */
function displayBoard(): void {
  console.log(`\n${board.toFormattedString()}`);
}

/**
 * Calculate and display the current score
 */
function displayScore(): void {
  const boardString = board.toString();
  const blackCount = (boardString.match(/B/g) || []).length;
  const whiteCount = (boardString.match(/W/g) || []).length;

  console.log(`\n📊 Score: Black (●) ${blackCount} - White (○) ${whiteCount}`);
}

/**
 * Display valid moves for the current player
 */
function displayValidMoves(moves: Move[]): void {
  if (moves.length === 0) {
    console.log(`\n❌ No valid moves available for ${getPlayerName()}.`);
    return;
  }

  console.log(`\n✓ Valid moves for ${getPlayerName()}:`);
  const moveStrings = moves.map((m) => positionToString(m.position));
  console.log(`  ${moveStrings.join(", ")}`);
}

/**
 * Convert position to string notation (e.g., A1, B2)
 */
function positionToString(pos: { row: number; col: number }): string {
  const col = String.fromCharCode("A".charCodeAt(0) + pos.col);
  const row = pos.row + 1;
  return `${col}${row}`;
}

/**
 * Get player name with color
 */
function getPlayerName(): string {
  const currentPlayer = board.getCurrentPlayer();
  return currentPlayer === "B" ? "Black (●)" : "White (○)";
}

/**
 * Check if the game is over
 * We need to check both players' valid moves to determine if the game is truly over
 */
function isGameOver(): boolean {
  // Create temporary boards to check each player's moves
  const currentBoardString = board.toString();
  const blackBoard = OthelloBoard.fromString(currentBoardString, "B");
  const whiteBoard = OthelloBoard.fromString(currentBoardString, "W");

  if (isInvalidBoardResult(blackBoard) || isInvalidBoardResult(whiteBoard)) {
    return false;
  }

  const blackMoves = blackBoard.getValidMoves().moves;
  const whiteMoves = whiteBoard.getValidMoves().moves;

  return blackMoves.length === 0 && whiteMoves.length === 0;
}

/**
 * Display the game winner
 */
function displayWinner(): void {
  const boardString = board.toString();
  const blackCount = (boardString.match(/B/g) || []).length;
  const whiteCount = (boardString.match(/W/g) || []).length;

  console.log(`\n${"=".repeat(40)}`);
  console.log("🎮 GAME OVER!");
  console.log("=".repeat(40));
  console.log(`Final Score: Black (●) ${blackCount} - White (○) ${whiteCount}`);

  if (blackCount > whiteCount) {
    console.log("🏆 Black (●) wins!");
  } else if (whiteCount > blackCount) {
    console.log("🏆 White (○) wins!");
  } else {
    console.log("🤝 It's a tie!");
  }
  console.log(`${"=".repeat(40)}\n`);
}

/**
 * Prompt the player for input
 */
function promptMove(): Promise<string> {
  return new Promise((resolve) => {
    rl.question(`\n${getPlayerName()}'s turn. Enter move (e.g., A1) or 'q' to quit: `, (answer) => {
      resolve(answer.trim());
    });
  });
}

/**
 * Main game loop
 */
async function play(): Promise<void> {
  console.log(`\n${"=".repeat(40)}`);
  console.log("🎮 OTHELLO / REVERSI");
  console.log("=".repeat(40));
  console.log("Rules:");
  console.log("• Black (●) goes first");
  console.log("• Place discs to flip opponent's discs");
  console.log("• Valid moves shown as (·)");
  console.log("• Enter moves like: A1, B2, C3, etc.");
  console.log('• Type "q" to quit');
  console.log("=".repeat(40));

  let consecutivePasses = 0;

  while (!isGameOver()) {
    const validMovesResult = board.getValidMoves();
    const validMoves = validMovesResult.moves;

    displayBoard();
    displayScore();
    displayValidMoves(validMoves);

    // If no valid moves, pass turn
    if (validMoves.length === 0) {
      console.log(`\n⏭️  ${getPlayerName()} passes (no valid moves).`);
      consecutivePasses++;

      if (consecutivePasses >= 2) {
        break; // Game ends if both players pass
      }

      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Manually switch player by creating a new board with the opposite player
      const currentBoardString = board.toString();
      const nextPlayer = board.getCurrentPlayer() === "B" ? "W" : "B";
      const newBoard = OthelloBoard.fromString(currentBoardString, nextPlayer);
      if (!isInvalidBoardResult(newBoard)) {
        board = newBoard;
      }
      continue;
    }

    consecutivePasses = 0;

    // Get player input
    const input = await promptMove();

    if (input.toLowerCase() === "q") {
      console.log("\n👋 Game quit by player.");
      rl.close();
      return;
    }

    // Try to apply the move (this will automatically switch the player)
    const success = board.tryApplyMove(input);

    if (!success) {
      console.log("\n❌ Invalid move! Please try again.");
      await new Promise((resolve) => setTimeout(resolve, 1000));
      continue;
    }

    console.log(`\n✓ Move ${input.toUpperCase()} applied successfully!`);
  }

  // Game over
  displayBoard();
  displayScore();
  displayWinner();
  rl.close();
}

// Start the game
play().catch((error) => {
  console.error("Error running game:", error);
  process.exit(1);
});
