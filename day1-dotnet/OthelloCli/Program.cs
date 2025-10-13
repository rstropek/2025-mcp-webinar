using OthelloGame;
using System;
using System.Linq;
using System.Threading.Tasks;

namespace OthelloCli;

class Program
{
    private static OthelloBoard board = OthelloBoard.CreateEmpty();

    static async Task Main(string[] args)
    {
        await PlayAsync();
    }

    /// <summary>
    /// Display the board with row and column labels
    /// </summary>
    private static void DisplayBoard()
    {
        Console.WriteLine("\n" + board.ToFormattedString());
    }

    /// <summary>
    /// Calculate and display the current score
    /// </summary>
    private static void DisplayScore()
    {
        var stats = board.GetGameStatistics();
        Console.WriteLine($"\n📊 Score: Black (●) {stats.Black} - White (○) {stats.White}");
    }

    /// <summary>
    /// Display valid moves for the current player
    /// </summary>
    private static void DisplayValidMoves(ValidMovesResult validMovesResult)
    {
        if (validMovesResult.Moves.Count == 0)
        {
            Console.WriteLine($"\n❌ No valid moves available for {GetPlayerName()}.");
            return;
        }

        Console.WriteLine($"\n✓ Valid moves for {GetPlayerName()}:");
        var moveStrings = validMovesResult.Moves.Select(m => PositionToString(m.Position));
        Console.WriteLine($"  {string.Join(", ", moveStrings)}");
    }

    /// <summary>
    /// Convert position to string notation (e.g., A1, B2)
    /// </summary>
    private static string PositionToString(Position pos)
    {
        var col = (char)('A' + pos.Col);
        var row = pos.Row + 1;
        return $"{col}{row}";
    }

    /// <summary>
    /// Get player name with color
    /// </summary>
    private static string GetPlayerName()
    {
        var currentPlayer = board.GetCurrentPlayer();
        return currentPlayer == Player.Black ? "Black (●)" : "White (○)";
    }

    /// <summary>
    /// Check if the game is over
    /// We need to check both players' valid moves to determine if the game is truly over
    /// </summary>
    private static bool IsGameOver()
    {
        // Create temporary boards to check each player's moves
        var currentBoardString = board.ToString();
        var blackBoard = OthelloBoard.FromString(currentBoardString, Player.Black);
        var whiteBoard = OthelloBoard.FromString(currentBoardString, Player.White);

        if (blackBoard is not OthelloBoard blackBoardObj || whiteBoard is not OthelloBoard whiteBoardObj)
        {
            return false;
        }

        var blackMoves = blackBoardObj.GetValidMoves().Moves;
        var whiteMoves = whiteBoardObj.GetValidMoves().Moves;

        return blackMoves.Count == 0 && whiteMoves.Count == 0;
    }

    /// <summary>
    /// Display the game winner
    /// </summary>
    private static void DisplayWinner()
    {
        var stats = board.GetGameStatistics();

        Console.WriteLine("\n" + new string('=', 40));
        Console.WriteLine("🎮 GAME OVER!");
        Console.WriteLine(new string('=', 40));
        Console.WriteLine($"Final Score: Black (●) {stats.Black} - White (○) {stats.White}");

        if (stats.Black > stats.White)
        {
            Console.WriteLine("🏆 Black (●) wins!");
        }
        else if (stats.White > stats.Black)
        {
            Console.WriteLine("🏆 White (○) wins!");
        }
        else
        {
            Console.WriteLine("🤝 It's a tie!");
        }
        Console.WriteLine(new string('=', 40) + "\n");
    }

    /// <summary>
    /// Prompt the player for input
    /// </summary>
    private static string PromptMove()
    {
        Console.Write($"\n{GetPlayerName()}'s turn. Enter move (e.g., A1) or 'q' to quit: ");
        return Console.ReadLine()?.Trim() ?? "";
    }

    /// <summary>
    /// Main game loop
    /// </summary>
    private static async Task PlayAsync()
    {
        Console.WriteLine("\n" + new string('=', 40));
        Console.WriteLine("🎮 OTHELLO / REVERSI");
        Console.WriteLine(new string('=', 40));
        Console.WriteLine("Rules:");
        Console.WriteLine("• Black (●) goes first");
        Console.WriteLine("• Place discs to flip opponent's discs");
        Console.WriteLine("• Valid moves shown as (·)");
        Console.WriteLine("• Enter moves like: A1, B2, C3, etc.");
        Console.WriteLine("• Type \"q\" to quit");
        Console.WriteLine(new string('=', 40));

        int consecutivePasses = 0;

        while (!IsGameOver())
        {
            var validMovesResult = board.GetValidMoves();

            DisplayBoard();
            DisplayScore();
            DisplayValidMoves(validMovesResult);

            // If no valid moves, pass turn
            if (validMovesResult.Moves.Count == 0)
            {
                Console.WriteLine($"\n⏭️  {GetPlayerName()} passes (no valid moves).");
                consecutivePasses++;

                if (consecutivePasses >= 2)
                {
                    break; // Game ends if both players pass
                }

                await Task.Delay(1500);

                // Manually switch player by creating a new board with the opposite player
                var currentBoardString = board.ToString();
                var nextPlayer = board.GetCurrentPlayer() == Player.Black ? Player.White : Player.Black;
                var newBoard = OthelloBoard.FromString(currentBoardString, nextPlayer);
                if (newBoard is OthelloBoard newBoardObj)
                {
                    board = newBoardObj;
                }
                continue;
            }

            consecutivePasses = 0;

            // Get player input
            var input = PromptMove();

            if (input.ToLower() == "q")
            {
                Console.WriteLine("\n👋 Game quit by player.");
                return;
            }

            // Try to apply the move (this will automatically switch the player)
            var success = board.TryApplyMove(input);

            if (!success)
            {
                Console.WriteLine("\n❌ Invalid move! Please try again.");
                await Task.Delay(1000);
                continue;
            }

            Console.WriteLine($"\n✓ Move {input.ToUpper()} applied successfully!");
        }

        // Game over
        DisplayBoard();
        DisplayScore();
        DisplayWinner();
    }
}
