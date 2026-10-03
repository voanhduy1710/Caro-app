import type { BoardMatrix } from '../../../shared/utils/gomokuLogic';
import { createEmptyBoard } from '../../../shared/utils/gomokuLogic';

/** Builds a test position from [row, col, piece] triples. */
export const boardWith = (size: number, stones: Array<[number, number, 'X' | 'O' | 'T']>): BoardMatrix => {
  const board = createEmptyBoard(size);
  for (const [row, col, piece] of stones) board[row][col] = piece;
  return board;
};
