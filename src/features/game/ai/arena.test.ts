import { describe, expect, it } from 'vitest';
import { checkWin, createEmptyBoard } from '../../../shared/utils/gomokuLogic';
import { getBestAiMove } from '../aiEngine';
import { getBestAiMove as getLegacyMove } from './arena/legacyEngine';

const SIZE = 15;
const GAMES = 20;
type Result = 'new' | 'legacy' | 'draw';

/** One game from a seeded two-stone opening near the centre. */
const playGame = (newPiece: 'X' | 'O', seed: number): Result => {
  let state = seed;
  const rand = (n: number) => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state % n;
  };
  const board = createEmptyBoard(SIZE);
  const xr = 6 + rand(3);
  const xc = 6 + rand(3);
  board[xr][xc] = 'X';
  const around: Array<[number, number]> = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
  const [dr, dc] = around[rand(around.length)];
  board[xr + dr][xc + dc] = 'O';

  let turn: 'X' | 'O' = 'X';
  for (let n = 2; n < SIZE * SIZE; n++) {
    const mover: Result = turn === newPiece ? 'new' : 'legacy';
    const [r, c] = mover === 'new'
      ? getBestAiMove(board, SIZE, turn, { timeLimitMs: 300 })
      : getLegacyMove(board, SIZE, turn);
    if (board[r][c] !== null) return mover === 'new' ? 'legacy' : 'new';
    board[r][c] = turn;
    if (checkWin(board, r, c, SIZE)) return mover;
    turn = turn === 'X' ? 'O' : 'X';
  }
  return 'draw';
};

describe.runIf(process.env.AI_ARENA === '1')('arena: new engine vs legacy', () => {
  it('wins at least 90% of games', { timeout: 900_000 }, () => {
    const tally: Record<Result, number> = { new: 0, legacy: 0, draw: 0 };
    for (let g = 0; g < GAMES; g++) tally[playGame(g % 2 === 0 ? 'X' : 'O', 1000 + g)]++;
    console.log('arena result', tally);
    expect(tally.new / GAMES).toBeGreaterThanOrEqual(0.9);
  });
});
