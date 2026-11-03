import { describe, expect, it } from 'vitest';
import { createEmptyBoard } from './gomokuLogic';
import { forcedFourMoves } from './forcedFour';

describe('1v1v1 forced defense', () => {
  it.each([
    ['.XXX.', [0, 4]], ['XX.X', [2]], ['X.XX', [1]],
    ['OXXX.', [4]], ['XXX.', [3]], ['XX..X', []], ['XXOX', []],
  ] as Array<[string, number[]]>)('finds winning cells in %s', (pattern, columns) => {
    const board = createEmptyBoard(15);
    [...pattern].forEach((cell, col) => { if (cell === 'X' || cell === 'O') board[7][col] = cell; });
    expect(forcedFourMoves(board, 'T')).toEqual(columns.length ? columns.map((col) => [7, col]) : null);
  });

  it.each([[1, 0], [1, 1], [1, -1]])('finds vertical and diagonal gaps (%s,%s)', (dr, dc) => {
    const board = createEmptyBoard(15);
    for (const i of [0, 1, 3]) board[5 + dr * i][7 + dc * i] = 'O';
    expect(forcedFourMoves(board, 'X')).toEqual([[5 + dr * 2, 7 + dc * 2]]);
  });

  it('offers either opponent’s block and an immediate own win, without changing the board', () => {
    const board = createEmptyBoard(15);
    for (const col of [0, 1, 2]) { board[0][col] = 'X'; board[5][col] = 'O'; board[10][col] = 'T'; }
    const before = structuredClone(board);
    expect(forcedFourMoves(board, 'T')).toEqual([[0, 3], [5, 3], [10, 3]]);
    expect(board).toEqual(before);
  });

  it('leaves play unrestricted if only the mover threatens a win', () => {
    const board = createEmptyBoard(15);
    for (const col of [0, 1, 2]) board[7][col] = 'X';
    expect(forcedFourMoves(board, 'X')).toBeNull();
  });

  it('deduplicates a cell that blocks intersecting threats', () => {
    const board = createEmptyBoard(15);
    for (const col of [3, 4, 6]) board[5][col] = 'X';
    for (const row of [3, 4, 6]) board[row][5] = 'O';
    expect(forcedFourMoves(board, 'T')).toEqual([[5, 5]]);
  });
});
