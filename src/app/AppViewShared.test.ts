import { describe, expect, it } from 'vitest';
import { AI_BOARD_SIZE, BOT_WIN_QUIPS, aiThinkMs, botQuip, canLetBotOpen, firstTurnFor, settingsUpdateFor } from './AppViewShared';

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

describe('canLetBotOpen', () => {
  const fresh = { gameStatus: 'playing' as const, moveCount: 0, threePlayer: false, currentTurn: 'X' as const, myPiece: 'X' as const, isAiThinking: false };

  it('is offered on a fresh one-on-one game', () => {
    expect(canLetBotOpen(fresh)).toBe(true);
  });

  it('is not offered once a stone is down', () => {
    expect(canLetBotOpen({ ...fresh, moveCount: 1 })).toBe(false);
  });

  it('is not offered outside a live game', () => {
    expect(canLetBotOpen({ ...fresh, gameStatus: 'lobby' })).toBe(false);
    expect(canLetBotOpen({ ...fresh, gameStatus: 'ended' })).toBe(false);
  });

  it('is not offered in a three-player game, whose turn order it would scramble', () => {
    expect(canLetBotOpen({ ...fresh, threePlayer: true })).toBe(false);
  });

  it('is not offered once the bot already holds the move', () => {
    expect(canLetBotOpen({ ...fresh, currentTurn: 'O' })).toBe(false);
    expect(canLetBotOpen({ ...fresh, isAiThinking: true })).toBe(false);
  });
});

describe('firstTurnFor', () => {
  it('gives the opening to the player by default and to the bot when asked', () => {
    expect(firstTurnFor(false)).toBe('X');
    expect(firstTurnFor(true)).toBe('O');
  });
});
