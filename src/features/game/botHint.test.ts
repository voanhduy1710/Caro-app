import { describe, expect, it } from 'vitest';
import { countStones, hasBotHint, hintSearchFor } from './botHint';
import type { BoardMatrix } from '../../shared/utils/gomokuLogic';

const board: BoardMatrix = [
  ['X', null, 'T'],
  [null, 'O', null],
];

describe('botHint', () => {
  it('is offered to exactly one username', () => {
    expect(hasBotHint('smurf_account')).toBe(true);
    expect(hasBotHint('smurf_account2')).toBe(false);
    expect(hasBotHint('SMURF_ACCOUNT')).toBe(false);
    expect(hasBotHint(undefined)).toBe(false);
  });

  it('counts placed stones', () => {
    expect(countStones(board)).toBe(3);
  });

  it('leaves X and O searches untouched', () => {
    expect(hintSearchFor(board, 'O')).toEqual({ board, piece: 'O' });
  });

  it('swaps T and X so the engine can search for T', () => {
    expect(hintSearchFor(board, 'T')).toEqual({
      board: [['T', null, 'X'], [null, 'O', null]],
      piece: 'X',
    });
  });
});
