using OthelloGame;
using Xunit;

namespace OthelloTests;

public class OthelloBoardTests
{
    private static OthelloBoard Parse(string boardString, Player currentPlayer = Player.Black)
    {
        var ok = OthelloBoard.TryFromString(boardString, out var board, out _, currentPlayer);
        Assert.True(ok);
        Assert.NotNull(board);
        return board!;
    }

    [Fact]
    public void CreatesABoardWithStandardInitialSetup()
    {
        var board = OthelloBoard.CreateEmpty();
        Assert.Equal(Player.Black, board.GetCurrentPlayer());

        var resultBlack = board.GetValidMoves();
        Assert.Equal(4, resultBlack.Moves.Count);
        var positionsBlack = resultBlack.Moves.Select(m => m.Position).ToList();
        Assert.Contains(new Position(2, 3), positionsBlack);
        Assert.Contains(new Position(3, 2), positionsBlack);
        Assert.Contains(new Position(4, 5), positionsBlack);
        Assert.Contains(new Position(5, 4), positionsBlack);

        var whiteBoard = Parse(
            "........\n........\n........\n...WB...\n...BW...\n........\n........\n........",
            Player.White);

        var resultWhite = whiteBoard.GetValidMoves();
        Assert.Equal(4, resultWhite.Moves.Count);
        var positionsWhite = resultWhite.Moves.Select(m => m.Position).ToList();
        Assert.Contains(new Position(2, 4), positionsWhite);
        Assert.Contains(new Position(3, 5), positionsWhite);
        Assert.Contains(new Position(4, 2), positionsWhite);
        Assert.Contains(new Position(5, 3), positionsWhite);
    }

    [Fact]
    public void TryFromString_CreatesValidBoardFromValidString()
    {
        var ok = OthelloBoard.TryFromString(
            "........\n........\n........\n...WB...\n...BW...\n........\n........\n........",
            out var board, out var error);
        Assert.True(ok);
        Assert.NotNull(board);
        Assert.Null(error);
    }

    [Fact]
    public void TryFromString_RejectsBoardWithTooFewRows()
    {
        var ok = OthelloBoard.TryFromString("........", out var board, out var error);
        Assert.False(ok);
        Assert.Null(board);
        Assert.Equal("Board must contain exactly 8 rows.", error);
    }

    [Fact]
    public void TryFromString_RejectsBoardWithTooManyRows()
    {
        var ok = OthelloBoard.TryFromString(
            "........\n........\n........\n...WB...\n...BW...\n........\n........\n........\n........",
            out var board, out var error);
        Assert.False(ok);
        Assert.Null(board);
        Assert.Equal("Board must contain exactly 8 rows.", error);
    }

    [Fact]
    public void TryFromString_RejectsBoardWithRowTooShort()
    {
        var ok = OthelloBoard.TryFromString(
            "........\n.......\n........\n...WB...\n...BW...\n........\n........\n........",
            out var board, out var error);
        Assert.False(ok);
        Assert.Null(board);
        Assert.Equal("Each row must contain exactly 8 fields.", error);
    }

    [Fact]
    public void TryFromString_RejectsBoardWithRowTooLong()
    {
        var ok = OthelloBoard.TryFromString(
            "........\n.........\n........\n...WB...\n...BW...\n........\n........\n........",
            out var board, out var error);
        Assert.False(ok);
        Assert.Null(board);
        Assert.Equal("Each row must contain exactly 8 fields.", error);
    }

    [Fact]
    public void TryFromString_RejectsBoardWithInvalidCharacters()
    {
        var ok = OthelloBoard.TryFromString(
            "........\n........\n........\n...WB...\n...BX...\n........\n........\n........",
            out var board, out var error);
        Assert.False(ok);
        Assert.Null(board);
        Assert.Equal("Board can only contain the characters B, W, or .", error);
    }

    [Fact]
    public void GetValidMoves_ReturnsEmptyMovesArrayWhenNoValidMovesExist()
    {
        var board = Parse("........\n........\n........\n...BBB..\n........\n........\n........\n........", Player.Black);
        Assert.Empty(board.GetValidMoves().Moves);
    }

    [Fact]
    public void GetValidMoves_ReturnsCorrectFlippedPositionsForSimpleHorizontalCapture()
    {
        var board = Parse("........\n........\n........\n..BW....\n........\n........\n........\n........", Player.Black);
        var move = board.GetValidMoves().Moves.FirstOrDefault(m => m.Position.Row == 3 && m.Position.Col == 4);
        Assert.NotNull(move);
        Assert.Contains(new Position(3, 3), move!.FlippedPositions);
        Assert.Single(move.FlippedPositions);
    }

    [Fact]
    public void GetValidMoves_ReturnsCorrectFlippedPositionsForSimpleVerticalCapture()
    {
        var board = Parse("........\n...B....\n...W....\n........\n........\n........\n........\n........", Player.Black);
        var move = board.GetValidMoves().Moves.FirstOrDefault(m => m.Position.Row == 3 && m.Position.Col == 3);
        Assert.NotNull(move);
        Assert.Contains(new Position(2, 3), move!.FlippedPositions);
        Assert.Single(move.FlippedPositions);
    }

    [Fact]
    public void GetValidMoves_ReturnsCorrectFlippedPositionsForDiagonalCapture()
    {
        var board = Parse("........\n...B....\n....W...\n........\n........\n........\n........\n........", Player.Black);
        var move = board.GetValidMoves().Moves.FirstOrDefault(m => m.Position.Row == 3 && m.Position.Col == 5);
        Assert.NotNull(move);
        Assert.Contains(new Position(2, 4), move!.FlippedPositions);
        Assert.Single(move.FlippedPositions);
    }

    [Fact]
    public void GetValidMoves_ReturnsMultipleFlippedPositionsWhenCapturingInMultipleDirections()
    {
        var board = Parse(".....B..\n..BWW...\n...BWW..\n...B.W..\n.....B..\n........\n........\n........", Player.Black);
        var move = board.GetValidMoves().Moves.FirstOrDefault(m => m.Position.Row == 1 && m.Position.Col == 5);
        Assert.NotNull(move);
        Assert.True(move!.FlippedPositions.Count > 1);
        Assert.Contains(new Position(1, 3), move.FlippedPositions);
        Assert.Contains(new Position(1, 4), move.FlippedPositions);
        Assert.Contains(new Position(2, 5), move.FlippedPositions);
        Assert.Contains(new Position(3, 5), move.FlippedPositions);
        Assert.Contains(new Position(2, 4), move.FlippedPositions);
    }

    [Fact]
    public void GetValidMoves_DoesNotAllowMoveOnOccupiedCell()
    {
        var board = OthelloBoard.CreateEmpty();
        var positions = board.GetValidMoves().Moves.Select(m => m.Position).ToList();
        Assert.DoesNotContain(new Position(3, 3), positions);
        Assert.DoesNotContain(new Position(3, 4), positions);
        Assert.DoesNotContain(new Position(4, 3), positions);
        Assert.DoesNotContain(new Position(4, 4), positions);
    }

    [Fact]
    public void GetValidMoves_CapturesMultiplePiecesInALine()
    {
        var board = Parse("........\n........\n........\nBWWW....\n........\n........\n........\n........", Player.Black);
        var move = board.GetValidMoves().Moves.FirstOrDefault(m => m.Position.Row == 3 && m.Position.Col == 4);
        Assert.NotNull(move);
        Assert.Equal(3, move!.FlippedPositions.Count);
        Assert.Contains(new Position(3, 1), move.FlippedPositions);
        Assert.Contains(new Position(3, 2), move.FlippedPositions);
        Assert.Contains(new Position(3, 3), move.FlippedPositions);
    }

    [Fact]
    public void GetValidMoves_DoesNotCaptureBeyondBoardBoundaries()
    {
        var board = Parse("WWB.....\n........\n........\n........\n........\n........\n........\n........", Player.Black);
        Assert.Empty(board.GetValidMoves().Moves);
    }

    [Fact]
    public void TryApplyMove_RejectsOccupiedPosition()
    {
        var board = OthelloBoard.CreateEmpty();
        Assert.False(board.TryApplyMove(new Position(3, 3)));
    }

    [Fact]
    public void TryApplyMove_RejectsPositionWithNoCaptures()
    {
        var board = OthelloBoard.CreateEmpty();
        Assert.False(board.TryApplyMove(new Position(0, 0)));
    }

    [Fact]
    public void TryApplyMove_RejectsOutOfBoundsPosition()
    {
        var board = OthelloBoard.CreateEmpty();
        Assert.False(board.TryApplyMove(new Position(-1, 0)));
    }

    [Fact]
    public void TryApplyMove_AcceptsAndAppliesValidMoveWithFlips()
    {
        var board = Parse("........\n........\n........\n..BW....\n........\n........\n........\n........", Player.Black);
        Assert.True(board.TryApplyMove(new Position(3, 4)));
        var rows = board.ToString().Split('\n');
        Assert.Equal('B', rows[3][3]);
        Assert.Equal('B', rows[3][4]);
    }

    [Fact]
    public void TryApplyMove_AppliesMultiDirectionalCaptureCorrectly()
    {
        var board = Parse(".....B..\n..BWW...\n...BWW..\n...B.W..\n.....B..\n........\n........\n........", Player.Black);
        Assert.True(board.TryApplyMove(new Position(1, 5)));
        var rows = board.ToString().Split('\n');
        Assert.Equal('B', rows[1][3]);
        Assert.Equal('B', rows[1][4]);
        Assert.Equal('B', rows[2][5]);
        Assert.Equal('B', rows[3][5]);
        Assert.Equal('B', rows[2][4]);
    }

    [Fact]
    public void TryApplyMove_WorksForBothBlackAndWhitePlayersViaCurrentPlayer()
    {
        const string boardString = "........\n........\n........\n..BW....\n........\n........\n........\n........";

        var blackBoard = Parse(boardString, Player.Black);
        Assert.Equal(Player.Black, blackBoard.GetCurrentPlayer());
        Assert.True(blackBoard.TryApplyMove(new Position(3, 4)));
        Assert.Equal(Player.White, blackBoard.GetCurrentPlayer());

        var whiteBoard = Parse(boardString, Player.White);
        Assert.Equal(Player.White, whiteBoard.GetCurrentPlayer());
        Assert.True(whiteBoard.TryApplyMove(new Position(3, 1)));
        Assert.Equal(Player.Black, whiteBoard.GetCurrentPlayer());
    }

    [Fact]
    public void TryApplyMoveWithPosition_ReturnsTrueAndAppliesValidMove()
    {
        var board = OthelloBoard.CreateEmpty();
        Assert.Equal(Player.Black, board.GetCurrentPlayer());
        var move = board.GetValidMoves().Moves[0];

        Assert.True(board.TryApplyMove(move.Position));
        Assert.Equal(Player.White, board.GetCurrentPlayer());
        var rows = board.ToString().Split('\n');
        Assert.Equal('B', rows[move.Position.Row][move.Position.Col]);
    }

    [Fact]
    public void TryApplyMoveWithString_ReturnsTrueAndAppliesValidMove()
    {
        var board = OthelloBoard.CreateEmpty();
        Assert.Equal(Player.Black, board.GetCurrentPlayer());
        var moveD3 = board.GetValidMoves().Moves.FirstOrDefault(m => m.Position.Row == 2 && m.Position.Col == 3);
        Assert.NotNull(moveD3);

        Assert.True(board.TryApplyMove("D3"));
        Assert.Equal(Player.White, board.GetCurrentPlayer());
        var rows = board.ToString().Split('\n');
        Assert.Equal('B', rows[2][3]);
    }

    [Fact]
    public void TryApplyMove_ReturnsFalseAndDoesNotModifyBoardForInvalidMoveWithPosition()
    {
        var board = OthelloBoard.CreateEmpty();
        var originalString = board.ToString();

        Assert.False(board.TryApplyMove(new Position(0, 0)));
        Assert.Equal(originalString, board.ToString());
        Assert.Equal(Player.Black, board.GetCurrentPlayer());
    }

    [Fact]
    public void TryApplyMove_ReturnsFalseAndDoesNotModifyBoardForInvalidMoveWithString()
    {
        var board = OthelloBoard.CreateEmpty();
        var originalString = board.ToString();

        Assert.False(board.TryApplyMove("A1"));
        Assert.Equal(originalString, board.ToString());
        Assert.Equal(Player.Black, board.GetCurrentPlayer());
    }

    [Fact]
    public void TryApplyMove_ReturnsFalseForOccupiedPositionWithPosition()
    {
        var board = OthelloBoard.CreateEmpty();
        var originalString = board.ToString();

        Assert.False(board.TryApplyMove(new Position(3, 3)));
        Assert.Equal(originalString, board.ToString());
        Assert.Equal(Player.Black, board.GetCurrentPlayer());
    }

    [Fact]
    public void TryApplyMove_ReturnsFalseForOccupiedPositionWithString()
    {
        var board = OthelloBoard.CreateEmpty();
        var originalString = board.ToString();

        // D4 is (3, 3)
        Assert.False(board.TryApplyMove("D4"));
        Assert.Equal(originalString, board.ToString());
        Assert.Equal(Player.Black, board.GetCurrentPlayer());
    }

    [Fact]
    public void TryApplyMove_ModifiesBoardInPlaceWhenSuccessfulWithPosition()
    {
        var board = OthelloBoard.CreateEmpty();
        var originalString = board.ToString();
        var move = board.GetValidMoves().Moves[0];

        Assert.True(board.TryApplyMove(move.Position));
        Assert.NotEqual(originalString, board.ToString());
    }

    [Fact]
    public void TryApplyMove_ModifiesBoardInPlaceWhenSuccessfulWithString()
    {
        var board = OthelloBoard.CreateEmpty();
        var originalString = board.ToString();

        Assert.True(board.TryApplyMove("D3"));
        Assert.NotEqual(originalString, board.ToString());
    }

    [Fact]
    public void TryApplyMove_FlipsOpponentPiecesWhenSuccessfulWithPosition()
    {
        var board = Parse("........\n........\n........\n..BW....\n........\n........\n........\n........", Player.Black);
        var move = board.GetValidMoves().Moves.FirstOrDefault(m => m.Position.Row == 3 && m.Position.Col == 4);
        Assert.NotNull(move);

        Assert.True(board.TryApplyMove(move!.Position));
        var rows = board.ToString().Split('\n');
        Assert.Equal('B', rows[3][3]);
        Assert.Equal('B', rows[3][4]);
    }

    [Fact]
    public void TryApplyMove_FlipsOpponentPiecesWhenSuccessfulWithString()
    {
        var board = Parse("........\n........\n........\n..BW....\n........\n........\n........\n........", Player.Black);
        Assert.True(board.TryApplyMove("E4"));
        var rows = board.ToString().Split('\n');
        Assert.Equal('B', rows[3][3]);
        Assert.Equal('B', rows[3][4]);
    }

    [Fact]
    public void TryApplyMove_AcceptsLowercaseStringPosition()
    {
        var board = OthelloBoard.CreateEmpty();
        var move = board.GetValidMoves().Moves.FirstOrDefault(m => m.Position.Row == 2 && m.Position.Col == 3);
        Assert.NotNull(move);

        Assert.True(board.TryApplyMove("d3"));
    }

    [Fact]
    public void TryApplyMove_ReturnsFalseForInvalidStringPositionFormat()
    {
        var board = OthelloBoard.CreateEmpty();
        var originalString = board.ToString();

        Assert.False(board.TryApplyMove("XYZ"));
        Assert.Equal(originalString, board.ToString());
    }

    [Fact]
    public void TryApplyMove_ReturnsFalseForOutOfBoundsPositionsWithString()
    {
        var board = OthelloBoard.CreateEmpty();
        var originalString = board.ToString();

        Assert.False(board.TryApplyMove("I1"));
        Assert.Equal(originalString, board.ToString());

        Assert.False(board.TryApplyMove("A9"));
        Assert.Equal(originalString, board.ToString());

        Assert.False(board.TryApplyMove("A0"));
        Assert.Equal(originalString, board.ToString());
    }

    [Fact]
    public void TryApplyMove_CorrectlyMapsCornerAndEdgePositionsWithString()
    {
        // A1 (row 0, col 0)
        var board1 = Parse(".W......\n........\n........\n........\n........\n........\n........\n........", Player.Black);
        var hasA1Move = board1.GetValidMoves().Moves.Any(m => m.Position.Row == 0 && m.Position.Col == 0);
        Assert.Equal(hasA1Move, board1.TryApplyMove("A1"));

        // H8 (row 7, col 7)
        var board2 = Parse("........\n........\n........\n........\n........\n........\n.......W\n........", Player.Black);
        var hasH8Move = board2.GetValidMoves().Moves.Any(m => m.Position.Row == 7 && m.Position.Col == 7);
        Assert.Equal(hasH8Move, board2.TryApplyMove("H8"));

        // C4 (row 3, col 2) — middle position
        var board3 = OthelloBoard.CreateEmpty();
        var moveC4 = board3.GetValidMoves().Moves.FirstOrDefault(m => m.Position.Row == 3 && m.Position.Col == 2);
        Assert.NotNull(moveC4);
        Assert.True(board3.TryApplyMove("C4"));
    }

    [Fact]
    public void GetGameStatistics_ReturnsCorrectStoneCountsForInitialBoard()
    {
        var stats = OthelloBoard.CreateEmpty().GetGameStatistics();
        Assert.Equal(2, stats.Black);
        Assert.Equal(2, stats.White);
    }

    [Fact]
    public void GetGameStatistics_ReturnsCorrectStoneCountsAfterMoves()
    {
        var board = Parse("........\n........\n........\n..BBB...\n........\n........\n........\n........");
        var stats = board.GetGameStatistics();
        Assert.Equal(3, stats.Black);
        Assert.Equal(0, stats.White);
    }

    [Fact]
    public void GetGameStatistics_ReturnsZeroForBothWhenBoardIsEmpty()
    {
        var board = Parse("........\n........\n........\n........\n........\n........\n........\n........");
        var stats = board.GetGameStatistics();
        Assert.Equal(0, stats.Black);
        Assert.Equal(0, stats.White);
    }

    [Fact]
    public void ToFormattedString_ReturnsFormattedBoardWithLabelsAndBorders()
    {
        var formatted = OthelloBoard.CreateEmpty().ToFormattedString();

        Assert.Contains("   A B C D E F G H", formatted);
        Assert.Contains("┌───────────────┐", formatted);
        Assert.Contains("└───────────────┘", formatted);
        Assert.Contains("1 │", formatted);
        Assert.Contains("8 │", formatted);
    }

    [Fact]
    public void ToFormattedString_DisplaysBlackAndWhiteDiscsWithCorrectSymbols()
    {
        var formatted = OthelloBoard.CreateEmpty().ToFormattedString();
        Assert.Contains("●", formatted);
        Assert.Contains("○", formatted);
    }

    [Fact]
    public void ToFormattedString_DisplaysEmptyCellsAsSpaces()
    {
        var board = Parse("........\n........\n........\n........\n........\n........\n........\n........");
        var lines = board.ToFormattedString().Split('\n');
        Assert.Matches(@"1 │\s{15}│", lines[2]);
    }

    [Fact]
    public void ToFormattedString_FormatsBoardCorrectlyWithComplexSetup()
    {
        var board = Parse("BBBBBBBB\nWWWWWWWW\nBBBBBBBB\nWWWWWWWW\nBBBBBBBB\nWWWWWWWW\nBBBBBBBB\nWWWWWWWW");
        var lines = board.ToFormattedString().Split('\n');

        Assert.Equal(11, lines.Length);
        Assert.Contains("● ● ● ● ● ● ● ●", lines[2]);
        Assert.Contains("○ ○ ○ ○ ○ ○ ○ ○", lines[3]);
    }

    [Fact]
    public void IsGameOver_FalseAtStart()
    {
        Assert.False(OthelloBoard.CreateEmpty().IsGameOver());
    }

    [Fact]
    public void IsGameOver_TrueWhenNeitherPlayerHasMoves()
    {
        var board = Parse("........\n........\n........\n........\n........\n........\n........\n........");
        Assert.True(board.IsGameOver());
    }

    [Fact]
    public void HasValidMoves_TrueForBothPlayersAtStart()
    {
        var board = OthelloBoard.CreateEmpty();
        Assert.True(board.HasValidMoves(Player.Black));
        Assert.True(board.HasValidMoves(Player.White));
    }

    [Fact]
    public void PassTurn_SwitchesCurrentPlayer()
    {
        var board = OthelloBoard.CreateEmpty();
        Assert.Equal(Player.Black, board.GetCurrentPlayer());
        board.PassTurn();
        Assert.Equal(Player.White, board.GetCurrentPlayer());
        board.PassTurn();
        Assert.Equal(Player.Black, board.GetCurrentPlayer());
    }
}
