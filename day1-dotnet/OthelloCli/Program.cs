using OthelloGame;

var board = OthelloBoard.CreateEmpty();

Console.WriteLine("\n" + new string('=', 40));
Console.WriteLine("🎮 OTHELLO / REVERSI");
Console.WriteLine(new string('=', 40));
Console.WriteLine("Rules:");
Console.WriteLine("• Black (●) goes first");
Console.WriteLine("• Place discs to flip opponent's discs");
Console.WriteLine("• Enter moves like: A1, B2, C3, etc.");
Console.WriteLine("• Type \"q\" to quit");
Console.WriteLine(new string('=', 40));

while (!board.IsGameOver())
{
    var validMovesResult = board.GetValidMoves();

    DisplayBoard();
    DisplayScore();
    DisplayValidMoves(validMovesResult);

    if (validMovesResult.Moves.Count == 0)
    {
        Console.WriteLine($"\n⏭️  {GetPlayerName()} passes (no valid moves).");
        board.PassTurn();
        continue;
    }

    var input = PromptMove();

    if (string.Equals(input, "q", StringComparison.OrdinalIgnoreCase))
    {
        Console.WriteLine("\n👋 Game quit by player.");
        return;
    }

    if (!board.TryApplyMove(input))
    {
        Console.WriteLine("\n❌ Invalid move! Please try again.");
        continue;
    }

    Console.WriteLine($"\n✓ Move {input.ToUpperInvariant()} applied successfully!");
}

DisplayBoard();
DisplayScore();
DisplayWinner();

void DisplayBoard()
{
    Console.WriteLine("\n" + board.ToFormattedString());
}

void DisplayScore()
{
    var stats = board.GetGameStatistics();
    Console.WriteLine($"\n📊 Score: Black (●) {stats.Black} - White (○) {stats.White}");
}

void DisplayValidMoves(ValidMovesResult validMovesResult)
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

static string PositionToString(Position pos)
{
    var col = (char)('A' + pos.Col);
    var row = pos.Row + 1;
    return $"{col}{row}";
}

string GetPlayerName()
{
    return board.GetCurrentPlayer() == Player.Black ? "Black (●)" : "White (○)";
}

void DisplayWinner()
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

string PromptMove()
{
    Console.Write($"\n{GetPlayerName()}'s turn. Enter move (e.g., A1) or 'q' to quit: ");
    return Console.ReadLine()?.Trim() ?? "";
}
