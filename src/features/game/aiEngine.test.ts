import { describe, expect, it } from 'vitest';
import { getBestAiMove } from './aiEngine';
import { engineBoardFrom } from './ai/board';
import { findVcf } from './ai/threats';
import { boardWith } from './ai/testBoards';
import type { BoardMatrix } from '../../shared/utils/gomokuLogic';

const SIZE = 15;
const FAST = { timeLimitMs: 300 };

const play = (board: BoardMatrix, piece: 'X' | 'O' = 'O') => getBestAiMove(board, SIZE, piece, FAST);

describe('getBestAiMove', () => {
  it('opens in the centre', () => {
    expect(play(boardWith(SIZE, []))).toEqual([7, 7]);
  });

  it('takes a win', () => {
    const board = boardWith(SIZE, [
      [7, 4, 'O'], [7, 5, 'O'], [7, 6, 'O'], [7, 7, 'O'],
      [6, 4, 'X'], [6, 5, 'X'], [6, 6, 'X'], [8, 8, 'X'],
    ]);
    expect([[7, 3], [7, 8]]).toContainEqual(play(board));
  });

  it('prefers its own win over blocking', () => {
    const board = boardWith(SIZE, [
      [7, 4, 'O'], [7, 5, 'O'], [7, 6, 'O'], [7, 7, 'O'],
      [3, 3, 'X'], [3, 4, 'X'], [3, 5, 'X'], [3, 6, 'X'],
    ]);
    expect([[7, 3], [7, 8]]).toContainEqual(play(board));
  });

  it('plays as X too', () => {
    const board = boardWith(SIZE, [
      [7, 4, 'X'], [7, 5, 'X'], [7, 6, 'X'], [7, 7, 'X'],
      [6, 4, 'O'], [6, 5, 'O'], [6, 6, 'O'],
    ]);
    expect([[7, 3], [7, 8]]).toContainEqual(play(board, 'X'));
  });

  it('blocks a four', () => {
    const board = boardWith(SIZE, [
      [7, 3, 'X'], [7, 4, 'X'], [7, 5, 'X'], [7, 6, 'X'],
      [7, 2, 'O'], [6, 6, 'O'],
    ]);
    expect(play(board)).toEqual([7, 7]);
  });

  it('blocks an open three at an end', () => {
    const board = boardWith(SIZE, [[7, 5, 'X'], [7, 6, 'X'], [7, 7, 'X'], [8, 6, 'O']]);
    expect([[7, 4], [7, 8]]).toContainEqual(play(board));
  });

  it('finds a double four', () => {
    const board = boardWith(SIZE, [
      [7, 3, 'O'], [7, 4, 'O'], [7, 5, 'O'], [7, 2, 'X'],
      [4, 6, 'O'], [5, 6, 'O'], [6, 6, 'O'], [3, 6, 'X'],
    ]);
    expect(play(board)).toEqual([7, 6]);
  });

  it("refutes the opponent's double four", () => {
    const board = boardWith(SIZE, [
      [7, 3, 'X'], [7, 4, 'X'], [7, 5, 'X'], [7, 2, 'O'],
      [4, 6, 'X'], [5, 6, 'X'], [6, 6, 'X'], [3, 6, 'O'],
    ]);
    const [r, c] = play(board);
    board[r][c] = 'O';
    expect(findVcf(engineBoardFrom(board, SIZE, 'O'), 2)).toBe(-1);
  });

  it('never plays on a T stone', () => {
    const board = boardWith(SIZE, [
      [7, 4, 'O'], [7, 5, 'O'], [7, 6, 'O'], [7, 7, 'O'], [7, 8, 'T'],
      [6, 4, 'X'], [6, 5, 'X'],
    ]);
    expect(play(board)).toEqual([7, 3]);
  });

  it('still blocks when the position is lost', () => {
    const board = boardWith(SIZE, [
      [7, 3, 'X'], [7, 4, 'X'], [7, 5, 'X'], [7, 6, 'X'], [9, 9, 'O'],
    ]);
    expect([[7, 2], [7, 7]]).toContainEqual(play(board));
  });

  it('finds the last empty cell', () => {
    // (r + 2c) mod 4 < 2 never puts five of one piece in a row in any direction.
    const board: BoardMatrix = Array.from({ length: SIZE }, (_, r) =>
      Array.from({ length: SIZE }, (_, c) => ((r + 2 * c) % 4 < 2 ? 'X' : 'O')));
    board[0][0] = null;
    expect(play(board)).toEqual([0, 0]);
  });

  it('respects the time budget', () => {
    const stones: Array<[number, number, 'X' | 'O']> = [];
    for (let r = 4; r <= 10; r++) {
      for (let c = 4; c <= 10; c++) {
        if ((r * 7 + c) % 5 !== 0) stones.push([r, c, (r + 2 * c) % 4 < 2 ? 'X' : 'O']);
      }
    }
    const started = performance.now();
    const [r, c] = getBestAiMove(boardWith(SIZE, stones), SIZE, 'O', { timeLimitMs: 200 });
    expect(performance.now() - started).toBeLessThan(800);
    expect(boardWith(SIZE, stones)[r][c]).toBeNull();
  });

  it('is deterministic', () => {
    const board = boardWith(SIZE, [[7, 7, 'X'], [7, 8, 'O'], [8, 7, 'X']]);
    const options = { maxDepth: 4, timeLimitMs: 5000 };
    expect(getBestAiMove(board, SIZE, 'O', options)).toEqual(getBestAiMove(board, SIZE, 'O', options));
  });

  it('still works on a 30x30 board', () => {
    const board = boardWith(30, [[15, 15, 'X'], [15, 16, 'O'], [16, 15, 'X']]);
    const [r, c] = getBestAiMove(board, 30, 'O', { timeLimitMs: 200 });
    expect(board[r][c]).toBeNull();
  });
});
