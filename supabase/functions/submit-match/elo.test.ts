import { describe, expect, it } from 'vitest';
import { ratingDelta } from './elo.ts';

describe('ratingDelta', () => {
  it('gives the usual Elo change between equal players', () => {
    expect(ratingDelta(1, 1200, 1200)).toBe(16);
    expect(ratingDelta(0, 1200, 1200)).toBe(-16);
    expect(ratingDelta(0.5, 1200, 1200)).toBe(0);
  });

  it('still gives a winner at least 1 point when they were heavily favoured', () => {
    // Expected score above 0.984 rounds 32 * (1 - expected) down to 0.
    expect(ratingDelta(1, 2200, 1200)).toBe(1);
    expect(ratingDelta(1, 3000, 800)).toBe(1);
  });

  it('still takes at least 1 point from the loser of such a game', () => {
    expect(ratingDelta(0, 1200, 2200)).toBe(-1);
    expect(ratingDelta(0, 800, 3000)).toBe(-1);
  });

  it('leaves larger changes alone', () => {
    expect(ratingDelta(1, 1200, 2200)).toBe(32);
    expect(ratingDelta(0, 2200, 1200)).toBe(-32);
  });

  it('lets a lopsided draw round to zero', () => {
    expect(ratingDelta(0.5, 1200, 1210)).toBe(0);
  });
});
