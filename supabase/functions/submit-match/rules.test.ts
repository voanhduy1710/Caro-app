import { describe, expect, it } from 'vitest';
import {
  MIN_RATED_MOVES,
  MIN_RATED_SECONDS,
  PAIR_DAILY_GAIN_CAP,
  PAIR_DAILY_RATED_LIMIT,
  applyPairLimits,
  isGameTooShort,
  parseGameShape,
  shapesDisagree,
  storedName,
  ticketsOnOppositeSeats,
} from './rules.ts';

describe('ticketsOnOppositeSeats', () => {
  it('needs both players, on different seats', () => {
    expect(ticketsOnOppositeSeats([{ uid: 'a', seat: 'X' }, { uid: 'b', seat: 'O' }], 'a', 'b')).toBe(true);
    expect(ticketsOnOppositeSeats([{ uid: 'a', seat: 'O' }, { uid: 'b', seat: 'X' }], 'a', 'b')).toBe(true);
  });

  it('refuses a missing opponent ticket (the old losing path)', () => {
    expect(ticketsOnOppositeSeats([{ uid: 'a', seat: 'X' }], 'a', 'b')).toBe(false);
    expect(ticketsOnOppositeSeats([], 'a', 'b')).toBe(false);
  });

  it('refuses two tickets on the same seat or a ticket from someone else', () => {
    expect(ticketsOnOppositeSeats([{ uid: 'a', seat: 'X' }, { uid: 'b', seat: 'X' }], 'a', 'b')).toBe(false);
    expect(ticketsOnOppositeSeats([{ uid: 'a', seat: 'X' }, { uid: 'spectator', seat: 'O' }], 'a', 'b')).toBe(false);
    expect(ticketsOnOppositeSeats([{ uid: 'a', seat: 'X' }], 'a', 'a')).toBe(false);
  });
});

describe('parseGameShape', () => {
  it('treats missing fields as an older client', () => {
    expect(parseGameShape({})).toEqual({ moveCount: null, durationMs: null });
  });

  it('reads well-formed values and rejects malformed ones', () => {
    expect(parseGameShape({ moveCount: 30, durationMs: 90_000 })).toEqual({ moveCount: 30, durationMs: 90_000 });
    expect(parseGameShape({ moveCount: -1 })).toBe('invalid');
    expect(parseGameShape({ moveCount: 1.5 })).toBe('invalid');
    expect(parseGameShape({ durationMs: '9000' })).toBe('invalid');
  });
});

describe('isGameTooShort', () => {
  const old = { moveCount: null, durationMs: null };

  it('uses the server clock for every client', () => {
    expect(isGameTooShort(old, MIN_RATED_SECONDS - 1)).toBe(true);
    expect(isGameTooShort(old, MIN_RATED_SECONDS)).toBe(false);
    expect(isGameTooShort(old, Number.NaN)).toBe(true);
  });

  it('checks the reported moves and duration when sent', () => {
    expect(isGameTooShort({ moveCount: MIN_RATED_MOVES - 1, durationMs: null }, 600)).toBe(true);
    expect(isGameTooShort({ moveCount: MIN_RATED_MOVES, durationMs: null }, 600)).toBe(false);
    expect(isGameTooShort({ moveCount: 40, durationMs: MIN_RATED_SECONDS * 1000 - 1 }, 600)).toBe(true);
    expect(isGameTooShort({ moveCount: 40, durationMs: 120_000 }, 600)).toBe(false);
  });
});

describe('shapesDisagree', () => {
  it('compares only what both reported', () => {
    expect(shapesDisagree({ moveCount: 20, durationMs: null }, { moveCount: null, durationMs: 60_000 })).toBe(false);
    expect(shapesDisagree({ moveCount: 20, durationMs: 60_000 }, { moveCount: 20, durationMs: 62_000 })).toBe(false);
    expect(shapesDisagree({ moveCount: 20, durationMs: null }, { moveCount: 21, durationMs: null })).toBe(true);
    expect(shapesDisagree({ moveCount: 20, durationMs: 60_000 }, { moveCount: 20, durationMs: 120_000 })).toBe(true);
  });
});

describe('applyPairLimits', () => {
  const fresh = { ratedGames: 0, gained1: 0, gained2: 0 };

  it('leaves an ordinary game alone', () => {
    expect(applyPairLimits(16, -16, fresh)).toEqual({ rated: true, delta1: 16, delta2: -16 });
    expect(applyPairLimits(-16, 16, fresh)).toEqual({ rated: true, delta1: -16, delta2: 16 });
  });

  it('records the game after the daily limit unrated', () => {
    expect(applyPairLimits(16, -16, { ...fresh, ratedGames: PAIR_DAILY_RATED_LIMIT - 1 }).rated).toBe(true);
    expect(applyPairLimits(16, -16, { ...fresh, ratedGames: PAIR_DAILY_RATED_LIMIT })).toEqual({ rated: false, code: 'pair_daily_limit' });
  });

  it('cuts a gain to what is left of the daily cap, and the loss with it', () => {
    expect(applyPairLimits(36, -36, { ...fresh, gained1: PAIR_DAILY_GAIN_CAP - 10 })).toEqual({ rated: true, delta1: 10, delta2: -10 });
    expect(applyPairLimits(-20, 25, { ...fresh, gained2: PAIR_DAILY_GAIN_CAP - 5 })).toEqual({ rated: true, delta1: -5, delta2: 5 });
  });

  it('records unrated once the winner has nothing left of the cap', () => {
    expect(applyPairLimits(16, -16, { ...fresh, gained1: PAIR_DAILY_GAIN_CAP })).toEqual({ rated: false, code: 'pair_gain_cap' });
  });

  it('does not let a capped winner protect the loser\'s own gains, nor block losses', () => {
    // The capped player loses: nothing to cap.
    expect(applyPairLimits(-16, 16, { ...fresh, gained1: PAIR_DAILY_GAIN_CAP })).toEqual({ rated: true, delta1: -16, delta2: 16 });
  });

  it('stops a farm loop: 10 losses in a row gain the main account at most the cap', () => {
    let stats = { ...fresh };
    let gained = 0;
    for (let i = 0; i < 20; i += 1) {
      const decision = applyPairLimits(-16, 16, stats);
      if (!decision.rated) continue;
      gained += decision.delta2;
      stats = { ratedGames: stats.ratedGames + 1, gained1: stats.gained1, gained2: stats.gained2 + Math.max(decision.delta2, 0) };
    }
    expect(gained).toBeLessThanOrEqual(PAIR_DAILY_GAIN_CAP);
    expect(stats.ratedGames).toBeLessThanOrEqual(PAIR_DAILY_RATED_LIMIT);
  });
});

describe('storedName', () => {
  it('keeps a stored name, cleaned and capped', () => {
    expect(storedName('Alice', 'Player 1')).toBe('Alice');
    expect(storedName('  a\u0007b ', 'Player 1')).toBe('ab');
    expect(storedName('x'.repeat(60), 'Player 1')).toBe('x'.repeat(40));
    expect(storedName(null, 'Player 2')).toBe('Player 2');
  });
});
