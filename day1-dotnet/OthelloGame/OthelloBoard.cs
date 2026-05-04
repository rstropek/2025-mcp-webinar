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

public class OthelloBoard
{
    public const char Black = 'B';
    public const char White = 'W';
    public const char Empty = '.';
    private const int BoardSize = 8;

    private static readonly (int dr, int dc)[] Directions =
    [
        (-1, -1), (-1, 0), (-1, 1),
        ( 0, -1),          ( 0, 1),
        ( 1, -1), ( 1, 0), ( 1, 1)
    ];

    private readonly char[,] _board;
    private Player _currentPlayer;

    private OthelloBoard(char[,] board, Player currentPlayer)
    {
        _board = board;
        _currentPlayer = currentPlayer;
    }

    public static OthelloBoard CreateEmpty()
    {
        var board = new char[BoardSize, BoardSize];
        for (int r = 0; r < BoardSize; r++)
        {
            for (int c = 0; c < BoardSize; c++)
            {
                board[r, c] = Empty;
            }
        }
        board[3, 3] = White;
        board[3, 4] = Black;
        board[4, 3] = Black;
        board[4, 4] = White;
        return new OthelloBoard(board, Player.Black);
    }

    public static bool TryFromString(
        string boardString,
        out OthelloBoard? board,
        out string? error,
        Player currentPlayer = Player.Black)
    {
        board = null;
        var rows = boardString.Split('\n');

        if (rows.Length != BoardSize)
        {
            error = "Board must contain exactly 8 rows.";
            return false;
        }

        var cells = new char[BoardSize, BoardSize];
        for (int r = 0; r < BoardSize; r++)
        {
            var row = rows[r];
            if (row.Length != BoardSize)
            {
                error = "Each row must contain exactly 8 fields.";
                return false;
            }

            for (int c = 0; c < BoardSize; c++)
            {
                var ch = row[c];
                if (ch != Black && ch != White && ch != Empty)
                {
                    error = "Board can only contain the characters B, W, or .";
                    return false;
                }
                cells[r, c] = ch;
            }
        }

        error = null;
        board = new OthelloBoard(cells, currentPlayer);
        return true;
    }

    public Player GetCurrentPlayer() => _currentPlayer;

    private static char PieceOf(Player player) => player == Player.Black ? Black : White;

    private static char EnemyOf(Player player) => player == Player.Black ? White : Black;

    private List<Position>? GetMoveResult(Position position, Player player)
    {
        if (!IsOnBoard(position.Row, position.Col)) return null;
        if (_board[position.Row, position.Col] != Empty) return null;

        var enemy = EnemyOf(player);
        var piece = PieceOf(player);
        var flipped = new List<Position>();

        foreach (var (dr, dc) in Directions)
        {
            var r = position.Row + dr;
            var c = position.Col + dc;
            var path = new List<Position>();

            while (IsOnBoard(r, c) && _board[r, c] == enemy)
            {
                path.Add(new Position(r, c));
                r += dr;
                c += dc;
            }

            if (path.Count > 0 && IsOnBoard(r, c) && _board[r, c] == piece)
            {
                flipped.AddRange(path);
            }
        }

        return flipped.Count > 0 ? flipped : null;
    }

    public ValidMovesResult GetValidMoves() => GetValidMoves(_currentPlayer);

    public ValidMovesResult GetValidMoves(Player player)
    {
        var moves = new List<Move>();
        for (int row = 0; row < BoardSize; row++)
        {
            for (int col = 0; col < BoardSize; col++)
            {
                var flipped = GetMoveResult(new Position(row, col), player);
                if (flipped != null)
                {
                    moves.Add(new Move(new Position(row, col), flipped));
                }
            }
        }
        return new ValidMovesResult(moves);
    }

    public bool HasValidMoves(Player player)
    {
        for (int row = 0; row < BoardSize; row++)
        {
            for (int col = 0; col < BoardSize; col++)
            {
                if (GetMoveResult(new Position(row, col), player) != null) return true;
            }
        }
        return false;
    }

    public bool IsGameOver() => !HasValidMoves(Player.Black) && !HasValidMoves(Player.White);

    public void PassTurn()
    {
        _currentPlayer = _currentPlayer == Player.Black ? Player.White : Player.Black;
    }

    public GameStatistics GetGameStatistics()
    {
        int black = 0, white = 0;
        for (int row = 0; row < BoardSize; row++)
        {
            for (int col = 0; col < BoardSize; col++)
            {
                var cell = _board[row, col];
                if (cell == Black) black++;
                else if (cell == White) white++;
            }
        }
        return new GameStatistics(black, white);
    }

    public bool TryApplyMove(Position position)
    {
        var flipped = GetMoveResult(position, _currentPlayer);
        if (flipped == null) return false;

        var piece = PieceOf(_currentPlayer);
        _board[position.Row, position.Col] = piece;
        foreach (var p in flipped)
        {
            _board[p.Row, p.Col] = piece;
        }

        _currentPlayer = _currentPlayer == Player.Black ? Player.White : Player.Black;
        return true;
    }

    public bool TryApplyMove(string positionStr)
    {
        return TryParsePosition(positionStr, out var pos) && TryApplyMove(pos);
    }

    public override string ToString()
    {
        var sb = new System.Text.StringBuilder(BoardSize * (BoardSize + 1));
        for (int r = 0; r < BoardSize; r++)
        {
            if (r > 0) sb.Append('\n');
            for (int c = 0; c < BoardSize; c++)
            {
                sb.Append(_board[r, c]);
            }
        }
        return sb.ToString();
    }

    public string ToFormattedString()
    {
        var lines = new List<string>
        {
            "   A B C D E F G H",
            "  ┌───────────────┐"
        };

        for (int row = 0; row < BoardSize; row++)
        {
            var sb = new System.Text.StringBuilder();
            sb.Append(row + 1).Append(" │");
            for (int col = 0; col < BoardSize; col++)
            {
                if (col > 0) sb.Append(' ');
                sb.Append(_board[row, col] switch
                {
                    Black => '●',
                    White => '○',
                    _ => ' '
                });
            }
            sb.Append('│');
            lines.Add(sb.ToString());
        }

        lines.Add("  └───────────────┘");
        return string.Join("\n", lines);
    }

    private static bool IsOnBoard(int row, int col) =>
        row >= 0 && row < BoardSize && col >= 0 && col < BoardSize;

    public static bool TryParsePosition(string position, out Position result)
    {
        result = default!;
        if (position is null || position.Length < 2 || position.Length > 3) return false;

        var colChar = char.ToUpperInvariant(position[0]);
        if (colChar < 'A' || colChar > 'H') return false;

        if (!int.TryParse(position.AsSpan(1), out var row) || row < 1 || row > BoardSize) return false;

        result = new Position(row - 1, colChar - 'A');
        return true;
    }
}
