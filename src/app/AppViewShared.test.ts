import { describe, expect, it } from 'vitest';
import { AI_BOARD_SIZE, aiThinkMs } from './AppViewShared';

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
