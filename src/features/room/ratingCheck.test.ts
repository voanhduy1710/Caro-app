import { describe, expect, it } from 'vitest';
import { buildRatedBody } from './ratingCheck';
import type { Clocks, GameResult } from './roomEngine';

const player = (uid: string, name: string) => ({ uid, name }) as GameResult['players']['X'];

const result = {
  gameId: 'g1',
  settings: { boardSize: 15 },
  movesLength: 23,
  winner: 'X',
  players: { X: player('ux', 'Xavier'), O: player('uo', 'Olga'), T: player('ux', 'Xavier') },
} as unknown as GameResult;

const clocks = { elapsedBySeat: { X: 41_250.4, O: 38_100.2, T: 0 } } as unknown as Clocks;

describe('buildRatedBody', () => {
  it('sends the move count and the summed thinking time submit-match checks', () => {
    const body = buildRatedBody(result, null, clocks);
    expect(body.moveCount).toBe(23);
    expect(body.durationMs).toBe(79_351);
    expect(body.winnerUid).toBe('ux');
  });

  it('leaves the duration out when the result clocks are unknown', () => {
    const body = buildRatedBody(result, null);
    expect(body.moveCount).toBe(23);
    expect(body).not.toHaveProperty('durationMs');
  });
});
