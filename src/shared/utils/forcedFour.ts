import type { BoardMatrix, CellValue } from './gomokuLogic';

type Piece = Exclude<CellValue, null>;
const DIRECTIONS = [[0, 1], [1, 0], [1, 1], [1, -1]] as const;

/** null means unrestricted. Otherwise, block any immediate threat or win now. */
export function forcedFourMoves(board: BoardMatrix, turn: Piece): Array<[number, number]> | null {
  const size = board.length;
  const wins: Record<Piece, Set<number>> = { X: new Set(), O: new Set(), T: new Set() };
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      for (const [dr, dc] of DIRECTIONS) {
        const endRow = row + 3 * dr;
        const endCol = col + 3 * dc;
        if (endRow >= size || endCol < 0 || endCol >= size) continue;
        let piece: Piece | null = null;
        let empty = -1;
        let valid = true;
        for (let i = 0; i < 4; i++) {
          const r = row + i * dr;
          const c = col + i * dc;
          const cell = board[r][c];
          if (cell === null) {
            if (empty !== -1) { valid = false; break; }
            empty = r * size + c;
          } else if (piece !== null && cell !== piece) {
            valid = false;
            break;
          } else piece = cell;
        }
        if (valid && piece !== null && empty !== -1) wins[piece].add(empty);
      }
    }
  }
  const opponents = (['X', 'O', 'T'] as const).filter((piece) => piece !== turn);
  if (opponents.every((piece) => wins[piece].size === 0)) return null;
  const allowed = new Set([...wins.X, ...wins.O, ...wins.T]);
  return [...allowed].sort((a, b) => a - b).map((index) => [Math.floor(index / size), index % size]);
}
