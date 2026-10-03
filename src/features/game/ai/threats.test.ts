import { describe, expect, it } from 'vitest';
import { EngineBoard, engineBoardFrom } from './board';
import { findVcf } from './threats';
import { boardWith } from './testBoards';

const SIZE = 15;
const at = (r: number, c: number) => r * SIZE + c;

/** O has two blocked threes that cross at (7,6): playing there makes a double four. */
const doubleFour = () => engineBoardFrom(
  boardWith(SIZE, [
    [7, 3, 'O'], [7, 4, 'O'], [7, 5, 'O'], [7, 2, 'X'],
    [4, 6, 'O'], [5, 6, 'O'], [6, 6, 'O'], [3, 6, 'X'],
  ]),
  SIZE,
  'O',
);

describe('findVcf', () => {
  it('finds a double four', () => {
    expect(findVcf(doubleFour(), 1)).toBe(at(7, 6));
  });

  it('returns an existing five first', () => {
    const board = new EngineBoard(SIZE);
    for (const c of [3, 4, 5, 6]) board.place(at(7, c), 1);
    board.place(at(7, 2), 2);
    expect(findVcf(board, 1)).toBe(at(7, 7));
  });

  it('returns -1 when there is no forcing win', () => {
    const board = new EngineBoard(SIZE);
    board.place(at(7, 7), 1);
    board.place(at(7, 8), 2);
    expect(findVcf(board, 1)).toBe(-1);
  });

  it('gives up when the defender has a four to play first', () => {
    const board = doubleFour();
    for (const c of [10, 11, 12, 13]) board.place(at(12, c), 2);
    expect(findVcf(board, 1)).toBe(-1);
  });

  it('leaves the board unchanged', () => {
    const board = doubleFour();
    const hash = board.hash;
    const moves = board.moves.length;
    findVcf(board, 1);
    findVcf(board, 2);
    expect(board.hash).toBe(hash);
    expect(board.moves).toHaveLength(moves);
  });
});
