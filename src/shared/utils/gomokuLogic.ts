export type CellValue = 'X' | 'O' | null;
export type BoardMatrix = CellValue[][];

export interface WinResult {
  winner: 'X' | 'O';
  line: Array<[number, number]>;
}

/**
 * Initializes an empty square matrix for Gomoku board.
 */
export const createEmptyBoard = (size: number): BoardMatrix => {
  return Array.from({ length: size }, () => Array(size).fill(null));
};

/**
 * Checks for 5 or more in a row horizontally, vertically, or diagonally.
 * Returns the winning player and the array of coordinate tuples forming the line.
 */
export const checkWin = (
  board: BoardMatrix,
  lastRow: number,
  lastCol: number,
  size: number
): WinResult | null => {
  const player = board[lastRow][lastCol];
  if (!player) return null;

  const directions: Array<[number, number]> = [
    [0, 1],   // Horizontal
    [1, 0],   // Vertical
    [1, 1],   // Diagonal Down-Right
    [1, -1],  // Diagonal Down-Left
  ];

  for (const [dr, dc] of directions) {
    const line: Array<[number, number]> = [[lastRow, lastCol]];

    // Check forward direction
    let r = lastRow + dr;
    let c = lastCol + dc;
    while (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === player) {
      line.push([r, c]);
      r += dr;
      c += dc;
    }

    // Check backward direction
    r = lastRow - dr;
    c = lastCol - dc;
    while (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === player) {
      line.unshift([r, c]);
      r -= dr;
      c -= dc;
    }

    if (line.length >= 5) {
      return { winner: player, line };
    }
  }

  return null;
};

/**
 * Checks if the board is completely full (Draw condition).
 */
export const isBoardFull = (board: BoardMatrix): boolean => {
  return board.every((row) => row.every((cell) => cell !== null));
};
