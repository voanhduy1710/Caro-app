import { describe, expect, it } from 'vitest';
import { AI_BOARD_SIZE, BOT_WIN_QUIPS, aiThinkMs, botQuip, settingsUpdateFor } from './AppViewShared';

describe('practice bot settings', () => {
  it('uses a 19x19 board', () => {
    expect(AI_BOARD_SIZE).toBe(19);
  });

  it('thinks 900 ms without a turn timer', () => {
    expect(aiThinkMs(0)).toBe(900);
  });

  it('uses at most a quarter of a short turn timer', () => {
    expect(aiThinkMs(2)).toBe(500);
    expect(aiThinkMs(10)).toBe(900);
  });
});

describe('settingsUpdateFor', () => {
  const room = { boardSize: 30, totalTimeMinutes: 0, turnTimeSeconds: 0, allowUndo: true };

  it('keeps the room board size when rules change during practice', () => {
    const next = settingsUpdateFor(room, { ...room, boardSize: AI_BOARD_SIZE, turnTimeSeconds: 30 }, true);
    expect(next).toEqual({ ...room, turnTimeSeconds: 30 });
  });

  it('passes changes through outside practice', () => {
    expect(settingsUpdateFor(room, { ...room, boardSize: 19 }, false)).toEqual({ ...room, boardSize: 19 });
  });
});

describe('botQuip', () => {
  it('promises a comeback when the bot loses', () => {
    expect(botQuip('lost', 0)).toBe("I'll win next time");
    expect(botQuip('lost', 5)).toBe("I'll win next time");
  });

  it('gloats with one of the win lines, picked by the seed', () => {
    const lines = Array.from({ length: BOT_WIN_QUIPS.length }, (_, seed) => botQuip('won', seed));
    expect(new Set(lines)).toEqual(new Set(BOT_WIN_QUIPS));
    expect(botQuip('won', 3)).toBe(botQuip('won', 3));
  });

  it('wraps seeds of any size, including negative ones', () => {
    expect(BOT_WIN_QUIPS).toContain(botQuip('won', 1_000_003));
    expect(BOT_WIN_QUIPS).toContain(botQuip('won', -7));
  });
});
