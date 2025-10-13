using OthelloGame;
using Xunit;

namespace OthelloTests;

public class OthelloBoardTests
{
    [Fact]
    public void CreatesABoardWithStandardInitialSetup()
    {
        var board = OthelloBoard.CreateEmpty();
        Assert.NotNull(board);
        Assert.Equal(Player.Black, board.GetCurrentPlayer());

        var resultBlack = board.GetValidMoves();
        Assert.Equal(4, resultBlack.Moves.Count);
        var positionsBlack = resultBlack.Moves.Select(m => m.Position).ToList();
        Assert.Contains(new Position(2, 3), positionsBlack);
        Assert.Contains(new Position(3, 2), positionsBlack);
        Assert.Contains(new Position(4, 5), positionsBlack);
        Assert.Contains(new Position(5, 4), positionsBlack);

        // Create separate board for white to test white's valid moves
        var boardWhite = OthelloBoard.FromString(
            "........\n........\n........\n...WB...\n...BW...\n........\n........\n........",
            Player.White
        );
        
        if (boardWhite is OthelloBoard whiteBoard)
        {
            var resultWhite = whiteBoard.GetValidMoves();
            Assert.Equal(4, resultWhite.Moves.Count);
            var positionsWhite = resultWhite.Moves.Select(m => m.Position).ToList();
            Assert.Contains(new Position(2, 4), positionsWhite);
            Assert.Contains(new Position(3, 5), positionsWhite);
            Assert.Contains(new Position(4, 2), positionsWhite);
            Assert.Contains(new Position(5, 3), positionsWhite);
        }
    }

    [Fact]
    public void FromString_CreatesValidBoardFromValidString()
    {
        var boardString = "........\n........\n........\n...WB...\n...BW...\n........\n........\n........";

        var result = OthelloBoard.FromString(boardString);
        Assert.IsType<OthelloBoard>(result);
    }

    [Fact]
    public void FromString_RejectsBoardWithTooFewRows()
    {
        var boardString = "........";

        var result = OthelloBoard.FromString(boardString);
        Assert.IsType<InvalidBoardResult>(result);
        if (result is InvalidBoardResult error)
        {
            Assert.Equal("Board must contain exactly 8 rows.", error.Error);
        }
    }

    [Fact]
    public void FromString_RejectsBoardWithTooManyRows()
    {
        var boardString =
            "........\n" +
            "........\n" +
            "........\n" +
            "...WB...\n" +
            "...BW...\n" +
            "........\n" +
            "........\n" +
            "........\n" +
            "........";

        var result = OthelloBoard.FromString(boardString);
        Assert.IsType<InvalidBoardResult>(result);
        if (result is InvalidBoardResult error)
        {
            Assert.Equal("Board must contain exactly 8 rows.", error.Error);
        }
    }

    [Fact]
    public void FromString_RejectsBoardWithRowTooShort()
    {
        var boardString = "........\n.......\n........\n...WB...\n...BW...\n........\n........\n........";

        var result = OthelloBoard.FromString(boardString);
        Assert.IsType<InvalidBoardResult>(result);
        if (result is InvalidBoardResult error)
        {
            Assert.Equal("Each row must contain exactly 8 fields.", error.Error);
        }
    }

    [Fact]
    public void FromString_RejectsBoardWithRowTooLong()
    {
        var boardString = "........\n.........\n........\n...WB...\n...BW...\n........\n........\n........";

        var result = OthelloBoard.FromString(boardString);
        Assert.IsType<InvalidBoardResult>(result);
        if (result is InvalidBoardResult error)
        {
            Assert.Equal("Each row must contain exactly 8 fields.", error.Error);
        }
    }

    [Fact]
    public void FromString_RejectsBoardWithInvalidCharacters()
    {
        var boardString = "........\n........\n........\n...WB...\n...BX...\n........\n........\n........";

        var result = OthelloBoard.FromString(boardString);
        Assert.IsType<InvalidBoardResult>(result);
        if (result is InvalidBoardResult error)
        {
            Assert.Equal("Board can only contain the characters B, W, or .", error.Error);
        }
    }

    [Fact]
    public void GetValidMoves_ReturnsEmptyMovesArrayWhenNoValidMovesExist()
    {
        var boardString = "........\n........\n........\n...BBB..\n........\n........\n........\n........";

        var result = OthelloBoard.FromString(boardString, Player.Black);
        if (result is OthelloBoard board)
        {
            var moves = board.GetValidMoves();
            Assert.Empty(moves.Moves);
        }
    }

    [Fact]
    public void GetValidMoves_ReturnsCorrectFlippedPositionsForSimpleHorizontalCapture()
    {
        var boardString = "........\n........\n........\n..BW....\n........\n........\n........\n........";

        var result = OthelloBoard.FromString(boardString, Player.Black);
        if (result is OthelloBoard board)
        {
            var moves = board.GetValidMoves();
            var move = moves.Moves.FirstOrDefault(m => m.Position.Row == 3 && m.Position.Col == 4);
            Assert.NotNull(move);
            Assert.Contains(new Position(3, 3), move.FlippedPositions);
            Assert.Single(move.FlippedPositions);
        }
    }

    [Fact]
    public void GetValidMoves_ReturnsCorrectFlippedPositionsForSimpleVerticalCapture()
    {
        var boardString = "........\n...B....\n...W....\n........\n........\n........\n........\n........";

        var result = OthelloBoard.FromString(boardString, Player.Black);
        if (result is OthelloBoard board)
        {
            var moves = board.GetValidMoves();
            var move = moves.Moves.FirstOrDefault(m => m.Position.Row == 3 && m.Position.Col == 3);
            Assert.NotNull(move);
            Assert.Contains(new Position(2, 3), move.FlippedPositions);
            Assert.Single(move.FlippedPositions);
        }
    }

    [Fact]
    public void GetValidMoves_ReturnsCorrectFlippedPositionsForDiagonalCapture()
    {
        var boardString = "........\n...B....\n....W...\n........\n........\n........\n........\n........";

        var result = OthelloBoard.FromString(boardString, Player.Black);
        if (result is OthelloBoard board)
        {
            var moves = board.GetValidMoves();
            var move = moves.Moves.FirstOrDefault(m => m.Position.Row == 3 && m.Position.Col == 5);
            Assert.NotNull(move);
            Assert.Contains(new Position(2, 4), move.FlippedPositions);
            Assert.Single(move.FlippedPositions);
        }
    }

    [Fact]
    public void GetValidMoves_ReturnsMultipleFlippedPositionsWhenCapturingInMultipleDirections()
    {
        var boardString = ".....B..\n..BWW...\n...BWW..\n...B.W..\n.....B..\n........\n........\n........";

        var result = OthelloBoard.FromString(boardString, Player.Black);
        if (result is OthelloBoard board)
        {
            var moves = board.GetValidMoves();
            var move = moves.Moves.FirstOrDefault(m => m.Position.Row == 1 && m.Position.Col == 5);
            Assert.NotNull(move);
            // Should flip pieces in both horizontal and vertical directions
            Assert.True(move.FlippedPositions.Count > 1);
            Assert.Contains(new Position(1, 3), move.FlippedPositions);
            Assert.Contains(new Position(1, 4), move.FlippedPositions);
            Assert.Contains(new Position(2, 5), move.FlippedPositions);
            Assert.Contains(new Position(3, 5), move.FlippedPositions);
            Assert.Contains(new Position(2, 4), move.FlippedPositions);
        }
    }

    [Fact]
    public void GetValidMoves_DoesNotAllowMoveOnOccupiedCell()
    {
        var board = OthelloBoard.CreateEmpty();
        var moves = board.GetValidMoves();

        // Check that none of the valid moves are on the initial occupied positions
        var positions = moves.Moves.Select(m => m.Position).ToList();
        Assert.DoesNotContain(new Position(3, 3), positions); // W
        Assert.DoesNotContain(new Position(3, 4), positions); // B
        Assert.DoesNotContain(new Position(4, 3), positions); // B
        Assert.DoesNotContain(new Position(4, 4), positions); // W
    }

    [Fact]
    public void GetValidMoves_CapturesMultiplePiecesInALine()
    {
        var boardString = "........\n........\n........\nBWWW....\n........\n........\n........\n........";

        var result = OthelloBoard.FromString(boardString, Player.Black);
        if (result is OthelloBoard board)
        {
            var moves = board.GetValidMoves();
            var move = moves.Moves.FirstOrDefault(m => m.Position.Row == 3 && m.Position.Col == 4);
            Assert.NotNull(move);
            Assert.Equal(3, move.FlippedPositions.Count);
            Assert.Contains(new Position(3, 1), move.FlippedPositions);
            Assert.Contains(new Position(3, 2), move.FlippedPositions);
            Assert.Contains(new Position(3, 3), move.FlippedPositions);
        }
    }

    [Fact]
    public void GetValidMoves_DoesNotCaptureBeyondBoardBoundaries()
    {
        var boardString = "WWB.....\n........\n........\n........\n........\n........\n........\n........";

        var result = OthelloBoard.FromString(boardString, Player.Black);
        if (result is OthelloBoard board)
        {
            var moves = board.GetValidMoves();
            // Should not find any valid moves from these white pieces
            // because there's no black piece to sandwich them
            Assert.Empty(moves.Moves);
        }
    }

    [Fact]
    public void TryApplyMove_RejectsOccupiedPosition()
    {
        var board = OthelloBoard.CreateEmpty();
        var result = board.TryApplyMove(new Position(3, 3));
        Assert.False(result);
    }

    [Fact]
    public void TryApplyMove_RejectsPositionWithNoCaptures()
    {
        var board = OthelloBoard.CreateEmpty();
        var result = board.TryApplyMove(new Position(0, 0));
        Assert.False(result);
    }

    [Fact]
    public void TryApplyMove_RejectsOutOfBoundsPosition()
    {
        var board = OthelloBoard.CreateEmpty();
        var result = board.TryApplyMove(new Position(-1, 0));
        Assert.False(result);
    }

    [Fact]
    public void TryApplyMove_AcceptsAndAppliesValidMoveWithFlips()
    {
        var boardString = "........\n........\n........\n..BW....\n........\n........\n........\n........";
        var result = OthelloBoard.FromString(boardString, Player.Black);

        if (result is OthelloBoard board)
        {
            var success = board.TryApplyMove(new Position(3, 4));
            Assert.True(success);
            // Verify the flip occurred
            var boardStr = board.ToString();
            var rows = boardStr.Split('\n');
            Assert.Equal('B', rows[3][3]); // Flipped piece
            Assert.Equal('B', rows[3][4]); // Placed piece
        }
    }

    [Fact]
    public void TryApplyMove_AppliesMultiDirectionalCaptureCorrectly()
    {
        var boardString = ".....B..\n..BWW...\n...BWW..\n...B.W..\n.....B..\n........\n........\n........";
        var result = OthelloBoard.FromString(boardString, Player.Black);

        if (result is OthelloBoard board)
        {
            var success = board.TryApplyMove(new Position(1, 5));
            Assert.True(success);
            var boardStr = board.ToString();
            var rows = boardStr.Split('\n');
            // Check that pieces were flipped
            Assert.Equal('B', rows[1][3]);
            Assert.Equal('B', rows[1][4]);
            Assert.Equal('B', rows[2][5]);
            Assert.Equal('B', rows[3][5]);
            Assert.Equal('B', rows[2][4]);
        }
    }

    [Fact]
    public void TryApplyMove_WorksForBothBlackAndWhitePlayersViaCurrentPlayer()
    {
        var boardString = "........\n........\n........\n..BW....\n........\n........\n........\n........";

        // Test black player
        var boardBlack = OthelloBoard.FromString(boardString, Player.Black);
        if (boardBlack is OthelloBoard blackBoard)
        {
            Assert.Equal(Player.Black, blackBoard.GetCurrentPlayer());
            var blackResult = blackBoard.TryApplyMove(new Position(3, 4));
            Assert.True(blackResult);
            Assert.Equal(Player.White, blackBoard.GetCurrentPlayer()); // Player switched
        }

        // Test white player
        var boardWhite = OthelloBoard.FromString(boardString, Player.White);
        if (boardWhite is OthelloBoard whiteBoard)
        {
            Assert.Equal(Player.White, whiteBoard.GetCurrentPlayer());
            var whiteResult = whiteBoard.TryApplyMove(new Position(3, 1));
            Assert.True(whiteResult);
            Assert.Equal(Player.Black, whiteBoard.GetCurrentPlayer()); // Player switched
        }
    }

    [Fact]
    public void TryApplyMoveWithPosition_ReturnsTrueAndAppliesValidMove()
    {
        var board = OthelloBoard.CreateEmpty();
        Assert.Equal(Player.Black, board.GetCurrentPlayer());
        var moves = board.GetValidMoves();
        var move = moves.Moves[0];

        Assert.NotNull(move);

        var result = board.TryApplyMove(move.Position);
        Assert.True(result);
        Assert.Equal(Player.White, board.GetCurrentPlayer()); // Player switched
        var boardString = board.ToString();
        var rows = boardString.Split('\n');
        Assert.Equal('B', rows[move.Position.Row][move.Position.Col]);
    }

    [Fact]
    public void TryApplyMoveWithString_ReturnsTrueAndAppliesValidMove()
    {
        var board = OthelloBoard.CreateEmpty();
        Assert.Equal(Player.Black, board.GetCurrentPlayer());
        var moves = board.GetValidMoves();
        var moveD3 = moves.Moves.FirstOrDefault(m => m.Position.Row == 2 && m.Position.Col == 3);
        Assert.NotNull(moveD3);

        var result = board.TryApplyMove("D3");
        Assert.True(result);
        Assert.Equal(Player.White, board.GetCurrentPlayer()); // Player switched
        var boardString = board.ToString();
        var rows = boardString.Split('\n');
        Assert.Equal('B', rows[2][3]);
    }

    [Fact]
    public void TryApplyMove_ReturnsFalseAndDoesNotModifyBoardForInvalidMoveWithPosition()
    {
        var board = OthelloBoard.CreateEmpty();
        Assert.Equal(Player.Black, board.GetCurrentPlayer());
        var originalString = board.ToString();

        var invalidMove = new Position(0, 0);
        var result = board.TryApplyMove(invalidMove);
        Assert.False(result);
        Assert.Equal(originalString, board.ToString());
        Assert.Equal(Player.Black, board.GetCurrentPlayer()); // Player unchanged
    }

    [Fact]
    public void TryApplyMove_ReturnsFalseAndDoesNotModifyBoardForInvalidMoveWithString()
    {
        var board = OthelloBoard.CreateEmpty();
        Assert.Equal(Player.Black, board.GetCurrentPlayer());
        var originalString = board.ToString();

        var result = board.TryApplyMove("A1");
        Assert.False(result);
        Assert.Equal(originalString, board.ToString());
        Assert.Equal(Player.Black, board.GetCurrentPlayer()); // Player unchanged
    }

    [Fact]
    public void TryApplyMove_ReturnsFalseForOccupiedPositionWithPosition()
    {
        var board = OthelloBoard.CreateEmpty();
        Assert.Equal(Player.Black, board.GetCurrentPlayer());
        var originalString = board.ToString();

        var invalidMove = new Position(3, 3); // Already occupied by W
        var result = board.TryApplyMove(invalidMove);
        Assert.False(result);
        Assert.Equal(originalString, board.ToString());
        Assert.Equal(Player.Black, board.GetCurrentPlayer()); // Player unchanged
    }

    [Fact]
    public void TryApplyMove_ReturnsFalseForOccupiedPositionWithString()
    {
        var board = OthelloBoard.CreateEmpty();
        Assert.Equal(Player.Black, board.GetCurrentPlayer());
        var originalString = board.ToString();

        // D4 is (3, 3)
        var result = board.TryApplyMove("D4");
        Assert.False(result);
        Assert.Equal(originalString, board.ToString());
        Assert.Equal(Player.Black, board.GetCurrentPlayer()); // Player unchanged
    }

    [Fact]
    public void TryApplyMove_ModifiesBoardInPlaceWhenSuccessfulWithPosition()
    {
        var board = OthelloBoard.CreateEmpty();
        var originalString = board.ToString();
        var moves = board.GetValidMoves();
        var move = moves.Moves[0];

        Assert.NotNull(move);

        var result = board.TryApplyMove(move.Position);
        Assert.True(result);
        Assert.NotEqual(originalString, board.ToString());
    }

    [Fact]
    public void TryApplyMove_ModifiesBoardInPlaceWhenSuccessfulWithString()
    {
        var board = OthelloBoard.CreateEmpty();
        var originalString = board.ToString();

        var result = board.TryApplyMove("D3");
        Assert.True(result);
        Assert.NotEqual(originalString, board.ToString());
    }

    [Fact]
    public void TryApplyMove_FlipsOpponentPiecesWhenSuccessfulWithPosition()
    {
        var boardString = "........\n........\n........\n..BW....\n........\n........\n........\n........";
        var result = OthelloBoard.FromString(boardString, Player.Black);

        if (result is OthelloBoard board)
        {
            var moves = board.GetValidMoves();
            var move = moves.Moves.FirstOrDefault(m => m.Position.Row == 3 && m.Position.Col == 4);

            Assert.NotNull(move);

            var success = board.TryApplyMove(move.Position);

            Assert.True(success);
            var newBoardString = board.ToString();
            var rows = newBoardString.Split('\n');

            // Check that the piece at (3, 3) was flipped to B
            Assert.Equal('B', rows[3][3]);
            // Check that the new piece was placed
            Assert.Equal('B', rows[3][4]);
        }
    }

    [Fact]
    public void TryApplyMove_FlipsOpponentPiecesWhenSuccessfulWithString()
    {
        var boardString = "........\n........\n........\n..BW....\n........\n........\n........\n........";
        var result = OthelloBoard.FromString(boardString, Player.Black);

        if (result is OthelloBoard board)
        {
            var success = board.TryApplyMove("E4");

            Assert.True(success);
            var newBoardString = board.ToString();
            var rows = newBoardString.Split('\n');

            // Check that the piece at (3, 3) was flipped to B
            Assert.Equal('B', rows[3][3]);
            // Check that the new piece was placed at (3, 4)
            Assert.Equal('B', rows[3][4]);
        }
    }

    [Fact]
    public void TryApplyMove_AcceptsLowercaseStringPosition()
    {
        var board = OthelloBoard.CreateEmpty();
        var moves = board.GetValidMoves();

        // Find a valid move at position (2, 3) which is D3
        var move = moves.Moves.FirstOrDefault(m => m.Position.Row == 2 && m.Position.Col == 3);
        Assert.NotNull(move);

        var result = board.TryApplyMove("d3");
        Assert.True(result);
    }

    [Fact]
    public void TryApplyMove_ReturnsFalseForInvalidStringPositionFormat()
    {
        var board = OthelloBoard.CreateEmpty();
        var originalString = board.ToString();

        var result = board.TryApplyMove("XYZ");
        Assert.False(result);
        Assert.Equal(originalString, board.ToString());
    }

    [Fact]
    public void TryApplyMove_ReturnsFalseForOutOfBoundsPositionsWithString()
    {
        var board = OthelloBoard.CreateEmpty();
        var originalString = board.ToString();

        // Column out of bounds
        var result1 = board.TryApplyMove("I1");
        Assert.False(result1);
        Assert.Equal(originalString, board.ToString());

        // Row out of bounds
        var result2 = board.TryApplyMove("A9");
        Assert.False(result2);
        Assert.Equal(originalString, board.ToString());

        // Row 0 (invalid)
        var result3 = board.TryApplyMove("A0");
        Assert.False(result3);
        Assert.Equal(originalString, board.ToString());
    }

    [Fact]
    public void TryApplyMove_CorrectlyMapsCornerAndEdgePositionsWithString()
    {
        // Test A1 (row 0, col 0)
        var boardString1 = ".W......\n........\n........\n........\n........\n........\n........\n........";
        var result1 = OthelloBoard.FromString(boardString1, Player.Black);

        if (result1 is OthelloBoard board1)
        {
            var moves = board1.GetValidMoves();
            var hasA1Move = moves.Moves.Any(m => m.Position.Row == 0 && m.Position.Col == 0);
            var moveResult = board1.TryApplyMove("A1");
            Assert.Equal(hasA1Move, moveResult);
        }

        // Test H8 (row 7, col 7)
        var boardString2 = "........\n........\n........\n........\n........\n........\n.......W\n........";
        var result2 = OthelloBoard.FromString(boardString2, Player.Black);

        if (result2 is OthelloBoard board2)
        {
            var moves = board2.GetValidMoves();
            var hasH8Move = moves.Moves.Any(m => m.Position.Row == 7 && m.Position.Col == 7);
            var moveResult = board2.TryApplyMove("H8");
            Assert.Equal(hasH8Move, moveResult);
        }

        // Test C4 (row 3, col 2) - middle position
        var board3 = OthelloBoard.CreateEmpty();
        var moves3 = board3.GetValidMoves();
        var moveC4 = moves3.Moves.FirstOrDefault(m => m.Position.Row == 3 && m.Position.Col == 2);
        Assert.NotNull(moveC4);

        var result3 = board3.TryApplyMove("C4");
        Assert.True(result3);
    }

    [Fact]
    public void GetGameStatistics_ReturnsCorrectStoneCountsForInitialBoard()
    {
        var board = OthelloBoard.CreateEmpty();
        var stats = board.GetGameStatistics();

        Assert.Equal(2, stats.Black);
        Assert.Equal(2, stats.White);
    }

    [Fact]
    public void GetGameStatistics_ReturnsCorrectStoneCountsAfterMoves()
    {
        var boardString = "........\n........\n........\n..BBB...\n........\n........\n........\n........";
        var result = OthelloBoard.FromString(boardString);

        if (result is OthelloBoard board)
        {
            var stats = board.GetGameStatistics();
            Assert.Equal(3, stats.Black);
            Assert.Equal(0, stats.White);
        }
    }

    [Fact]
    public void GetGameStatistics_ReturnsZeroForBothWhenBoardIsEmpty()
    {
        var boardString = "........\n........\n........\n........\n........\n........\n........\n........";
        var result = OthelloBoard.FromString(boardString);

        if (result is OthelloBoard board)
        {
            var stats = board.GetGameStatistics();
            Assert.Equal(0, stats.Black);
            Assert.Equal(0, stats.White);
        }
    }

    [Fact]
    public void ToFormattedString_ReturnsFormattedBoardWithLabelsAndBorders()
    {
        var board = OthelloBoard.CreateEmpty();
        var formatted = board.ToFormattedString();

        Assert.Contains("   A B C D E F G H", formatted);
        Assert.Contains("┌───────────────┐", formatted);
        Assert.Contains("└───────────────┘", formatted);
        Assert.Contains("1 │", formatted);
        Assert.Contains("8 │", formatted);
    }

    [Fact]
    public void ToFormattedString_DisplaysBlackAndWhiteDiscsWithCorrectSymbols()
    {
        var board = OthelloBoard.CreateEmpty();
        var formatted = board.ToFormattedString();

        // Black discs should be displayed as ●
        Assert.Contains("●", formatted);
        // White discs should be displayed as ○
        Assert.Contains("○", formatted);
    }

    [Fact]
    public void ToFormattedString_DisplaysEmptyCellsAsSpaces()
    {
        var boardString = "........\n........\n........\n........\n........\n........\n........\n........";
        var result = OthelloBoard.FromString(boardString);

        if (result is OthelloBoard board)
        {
            var formatted = board.ToFormattedString();
            var lines = formatted.Split('\n');

            // Check that row 1 contains only spaces between borders
            Assert.Matches(@"1 │\s{15}│", lines[2]);
        }
    }

    [Fact]
    public void ToFormattedString_FormatsBoardCorrectlyWithComplexSetup()
    {
        var boardString = "BBBBBBBB\nWWWWWWWW\nBBBBBBBB\nWWWWWWWW\nBBBBBBBB\nWWWWWWWW\nBBBBBBBB\nWWWWWWWW";
        var result = OthelloBoard.FromString(boardString);

        if (result is OthelloBoard board)
        {
            var formatted = board.ToFormattedString();
            var lines = formatted.Split('\n');

            // Should have 11 lines (header + top border + 8 rows + bottom border)
            Assert.Equal(11, lines.Length);

            // Each row should have alternating patterns
            Assert.Contains("● ● ● ● ● ● ● ●", lines[2]); // Row 1
            Assert.Contains("○ ○ ○ ○ ○ ○ ○ ○", lines[3]); // Row 2
        }
    }
}

