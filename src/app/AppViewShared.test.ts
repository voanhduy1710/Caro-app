import { describe, expect, it } from 'vitest';
import { AI_BOARD_SIZE, aiThinkMs, settingsUpdateFor } from './AppViewShared';

describe('practice bot settings', () => {
  it('uses a 15x15 board', () => {
    expect(AI_BOARD_SIZE).toBe(15);
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
