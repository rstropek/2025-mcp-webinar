namespace OthelloGame;

public enum Player
{
    Black,
    White
}

public record Position(int Row, int Col);

public record Move(Position Position, List<Position> FlippedPositions);

public record ValidMovesResult(List<Move> Moves);

public record GameStatistics(int Black, int White);

public class InvalidBoardResult
{
    public string Error { get; }

    public InvalidBoardResult(string error)
    {
        Error = error;
    }
}

public class OthelloBoard
{
    private string[][] _board;
    private Player _currentPlayer;
    private const int BoardSize = 8;

    private OthelloBoard(string[][] board, Player currentPlayer = Player.Black)
    {
        _board = board;
        _currentPlayer = currentPlayer;
    }

    public static OthelloBoard CreateEmpty()
    {
        var board = new OthelloBoard([], Player.Black);
        board.Reset();
        return board;
    }

    public static object FromString(string boardString, Player currentPlayer = Player.Black)
    {
        var rows = boardString.Split('\n');

        if (rows.Length != BoardSize)
        {
            return new InvalidBoardResult("Board must contain exactly 8 rows.");
        }

        foreach (var row in rows)
        {
            if (row.Length != BoardSize)
            {
                return new InvalidBoardResult("Each row must contain exactly 8 fields.");
            }

            if (!System.Text.RegularExpressions.Regex.IsMatch(row, @"^[BW.]+$"))
            {
                return new InvalidBoardResult("Board can only contain the characters B, W, or .");
            }
        }

        var board = rows.Select(row => row.Select(c => c.ToString()).ToArray()).ToArray();
        return new OthelloBoard(board, currentPlayer);
    }

    public void Reset()
    {
        _board =
        [
            [".", ".", ".", ".", ".", ".", ".", "."],
            [".", ".", ".", ".", ".", ".", ".", "."],
            [".", ".", ".", ".", ".", ".", ".", "."],
            [".", ".", ".", "W", "B", ".", ".", "."],
            [".", ".", ".", "B", "W", ".", ".", "."],
            [".", ".", ".", ".", ".", ".", ".", "."],
            [".", ".", ".", ".", ".", ".", ".", "."],
            [".", ".", ".", ".", ".", ".", ".", "."]
        ];
        _currentPlayer = Player.Black;
    }

    public Player GetCurrentPlayer()
    {
        return _currentPlayer;
    }

    private List<Position>? GetMoveResult(Position position, Player player)
    {
        // Check if position is on board
        if (!IsOnBoard(position.Row, position.Col))
        {
            return null;
        }

        // Check if position is empty
        var currentCell = _board[position.Row][position.Col];
        if (currentCell != ".")
        {
            return null;
        }

        var enemy = player == Player.Black ? "W" : "B";
        var playerChar = player == Player.Black ? "B" : "W";
        var directions = new[]
        {
            (-1, -1), (-1, 0), (-1, 1),
            (0, -1), (0, 1),
            (1, -1), (1, 0), (1, 1)
        };

        var flippedPositions = new List<Position>();

        foreach (var (deltaRow, deltaCol) in directions)
        {
            var r = position.Row + deltaRow;
            var c = position.Col + deltaCol;
            var path = new List<Position>();

            while (IsOnBoard(r, c) && _board[r][c] == enemy)
            {
                path.Add(new Position(r, c));
                r += deltaRow;
                c += deltaCol;
            }

            if (path.Count > 0 && IsOnBoard(r, c) && _board[r][c] == playerChar)
            {
                flippedPositions.AddRange(path);
            }
        }

        return flippedPositions.Count > 0 ? flippedPositions : null;
    }

    public ValidMovesResult GetValidMoves()
    {
        var moves = new List<Move>();

        for (int row = 0; row < BoardSize; row++)
        {
            for (int col = 0; col < BoardSize; col++)
            {
                var flippedPositions = GetMoveResult(new Position(row, col), _currentPlayer);

                if (flippedPositions != null)
                {
                    moves.Add(new Move(new Position(row, col), flippedPositions));
                }
            }
        }

        return new ValidMovesResult(moves);
    }

    public GameStatistics GetGameStatistics()
    {
        int black = 0;
        int white = 0;

        for (int row = 0; row < BoardSize; row++)
        {
            for (int col = 0; col < BoardSize; col++)
            {
                var cell = _board[row][col];
                if (cell == "B")
                {
                    black++;
                }
                else if (cell == "W")
                {
                    white++;
                }
            }
        }

        return new GameStatistics(black, white);
    }

    public bool TryApplyMove(Position position)
    {
        // Verify the move is valid for the current player
        var flippedPositions = GetMoveResult(position, _currentPlayer);
        if (flippedPositions == null)
        {
            return false;
        }

        var playerChar = _currentPlayer == Player.Black ? "B" : "W";

        // Place the player's piece at the move position
        _board[position.Row][position.Col] = playerChar;

        // Flip all opponent pieces
        foreach (var flippedPos in flippedPositions)
        {
            _board[flippedPos.Row][flippedPos.Col] = playerChar;
        }

        // Switch to the other player
        _currentPlayer = _currentPlayer == Player.Black ? Player.White : Player.Black;

        return true;
    }

    public bool TryApplyMove(string positionStr)
    {
        var (success, pos) = ParsePosition(positionStr);
        if (!success)
        {
            return false;
        }

        return TryApplyMove(pos);
    }

    public override string ToString()
    {
        return string.Join("\n", _board.Select(row => string.Join("", row)));
    }

    public string ToFormattedString()
    {
        var lines = new List<string>();

        lines.Add("   A B C D E F G H");
        lines.Add("  ┌───────────────┐");

        for (int row = 0; row < BoardSize; row++)
        {
            var rowNum = row + 1;
            var cells = string.Join(" ", _board[row].Select(cell =>
            {
                if (cell == "B") return "●"; // Black disc
                if (cell == "W") return "○"; // White disc
                return " "; // Empty
            }));
            lines.Add($"{rowNum} │{cells}│");
        }

        lines.Add("  └───────────────┘");

        return string.Join("\n", lines);
    }

    private static bool IsOnBoard(int row, int col)
    {
        return row >= 0 && row < BoardSize && col >= 0 && col < BoardSize;
    }

    private static (bool success, Position position) ParsePosition(string position)
    {
        if (position.Length < 2 || position.Length > 3)
        {
            return (false, default!);
        }

        var colChar = char.ToUpper(position[0]);
        var rowStr = position.Substring(1);

        // Parse column (A-H)
        if (colChar < 'A' || colChar > 'H')
        {
            return (false, default!);
        }
        var col = colChar - 'A';

        // Parse row (1-8)
        if (!int.TryParse(rowStr, out var row) || row < 1 || row > 8)
        {
            return (false, default!);
        }

        return (true, new Position(row - 1, col));
    }
}

