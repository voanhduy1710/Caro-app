import { describe, expect, it } from 'vitest';
import { EngineBoard, engineBoardFrom } from './board';
import { VCT_UNKNOWN, findVcf, findVct, threatDefences } from './threats';
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

/** Two open twos of X cross at (7,5): playing there makes a double open three. */
const crossingTwos = () => engineBoardFrom(
  boardWith(SIZE, [[7, 3, 'X'], [7, 4, 'X'], [5, 5, 'X'], [6, 5, 'X'], [12, 12, 'O'], [12, 2, 'O']]),
  SIZE,
  'O',
);

describe('findVct', () => {
  it('finds a win through a double open three', () => {
    expect(findVct(crossingTwos(), 2)).toBeGreaterThanOrEqual(0);
  });

  it('finds no win when the open twos are far apart', () => {
    const board = engineBoardFrom(
      boardWith(SIZE, [[7, 3, 'X'], [7, 4, 'X'], [2, 11, 'X'], [3, 11, 'X'], [12, 12, 'O'], [12, 2, 'O']]),
      SIZE,
      'O',
    );
    expect(findVct(board, 2)).toBe(-1);
  });

  it('returns -1 for scattered stones', () => {
    const board = new EngineBoard(SIZE);
    board.place(at(7, 7), 1);
    board.place(at(2, 2), 2);
    expect(findVct(board, 1)).toBe(-1);
  });

  it('reports unknown, not a safe -1, when the deadline cuts it short', () => {
    expect(findVct(crossingTwos(), 2, undefined, performance.now() - 1)).toBe(VCT_UNKNOWN);
  });

  it('reports unknown when it runs out of nodes', () => {
    const board = engineBoardFrom(
      boardWith(SIZE, [[7, 3, 'X'], [7, 4, 'X'], [2, 11, 'X'], [3, 11, 'X'], [12, 12, 'O'], [12, 2, 'O']]),
      SIZE,
      'O',
    );
    expect(findVct(board, 2, { depth: 6, nodes: 1 })).toBe(VCT_UNKNOWN);
  });

  it('leaves the board unchanged', () => {
    const board = crossingTwos();
    const hash = board.hash;
    const moves = board.moves.length;
    findVct(board, 2);
    findVct(board, 1);
    expect(board.hash).toBe(hash);
    expect(board.moves).toHaveLength(moves);
  });
});

describe('threatDefences', () => {
  it('answers a broken three at the gap and at both near ends', () => {
    const board = new EngineBoard(SIZE);
    board.place(at(7, 4), 1);
    board.place(at(7, 6), 1);
    board.place(at(7, 7), 1);
    expect(threatDefences(board, 1, at(7, 7)).sort((a, b) => a - b)).toEqual([at(7, 3), at(7, 5), at(7, 8)]);
  });

  it('finds no single answer to a double three', () => {
    const board = engineBoardFrom(
      boardWith(SIZE, [[7, 3, 'X'], [7, 4, 'X'], [5, 5, 'X'], [6, 5, 'X'], [7, 5, 'X']]),
      SIZE,
      'O',
    );
    expect(threatDefences(board, 2, at(7, 5))).toEqual([]);
  });
});
