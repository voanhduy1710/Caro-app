import { describe, expect, it } from 'vitest';
import { EngineBoard, engineBoardFrom, type Stone } from './board';
import { WIN_VALUE } from './patterns';
import { boardWith } from './testBoards';

const SIZE = 15;
const at = (r: number, c: number) => r * SIZE + c;

const rng = (seed: number) => () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed;
};

describe('EngineBoard', () => {
  it('offers only the centre on an empty board', () => {
    expect(new EngineBoard(SIZE).candidates()).toEqual([at(7, 7)]);
  });

  it('offers the 24 cells around a lone stone', () => {
    const board = new EngineBoard(SIZE);
    board.place(at(7, 7), 1);
    expect(board.candidates()).toHaveLength(24);
  });

  it('keeps incremental state equal to a fresh build after place and undo', () => {
    const next = rng(42);
    const board = new EngineBoard(SIZE);
    for (let n = 0; n < 60; n++) {
      const free = board.candidates();
      board.place(free[next() % free.length], (n % 2 === 0 ? 1 : 2) as Stone);
    }
    for (let n = 0; n < 25; n++) board.undo();

    const fresh = new EngineBoard(SIZE);
    board.moves.forEach((i, n) => fresh.place(i, (n % 2 === 0 ? 1 : 2) as Stone));

    expect(Array.from(board.cells)).toEqual(Array.from(fresh.cells));
    expect(Array.from(board.near)).toEqual(Array.from(fresh.near));
    expect(Array.from(board.shapes)).toEqual(Array.from(fresh.shapes));
    expect(Array.from(board.values)).toEqual(Array.from(fresh.values));
    expect(board.totals).toEqual(fresh.totals);
    expect(board.hash).toBe(fresh.hash);
  });

  it('returns to a zero hash when every move is undone', () => {
    const board = new EngineBoard(SIZE);
    board.place(at(7, 7), 1);
    board.place(at(7, 8), 2);
    board.undo();
    board.undo();
    expect(board.hash).toBe(0);
  });

  it('finds the five-completing cells of an open four', () => {
    const board = new EngineBoard(SIZE);
    for (const c of [4, 5, 6, 7]) board.place(at(7, c), 1);
    expect(board.cellsWith(1, WIN_VALUE).sort((a, b) => a - b)).toEqual([at(7, 3), at(7, 8)]);
    expect(board.cellsWith(2, WIN_VALUE)).toEqual([]);
  });

  it('treats the board edge as a blocker', () => {
    const board = new EngineBoard(SIZE);
    for (const c of [0, 1, 2, 3]) board.place(at(0, c), 1);
    expect(board.cellsWith(1, WIN_VALUE)).toEqual([at(0, 4)]);
  });

  it('treats walls as blockers for both players', () => {
    const board = engineBoardFrom(
      boardWith(SIZE, [[7, 3, 'O'], [7, 4, 'O'], [7, 5, 'O'], [7, 6, 'O'], [7, 7, 'T']]),
      SIZE,
      'O',
    );
    expect(board.cellsWith(1, WIN_VALUE)).toEqual([at(7, 2)]);
    expect(board.candidates()).not.toContain(at(7, 7));
  });

  it('maps the bot piece to stone 1 and the opponent to stone 2', () => {
    const board = engineBoardFrom(boardWith(SIZE, [[0, 0, 'X'], [0, 1, 'O']]), SIZE, 'X');
    expect(board.cells[at(0, 0)]).toBe(1);
    expect(board.cells[at(0, 1)]).toBe(2);
  });

  it('reports fours', () => {
    const board = new EngineBoard(SIZE);
    for (const c of [4, 5, 6]) board.place(at(7, c), 1);
    expect(board.makesFour(1, at(7, 7))).toBe(true);
    expect(board.makesFour(1, at(0, 0))).toBe(false);
  });
});
