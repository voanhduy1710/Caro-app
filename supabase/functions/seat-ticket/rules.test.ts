import { describe, expect, it } from 'vitest';
import { decideTicket } from './rules.ts';

describe('decideTicket', () => {
  it('gives the first player a free seat', () => {
    expect(decideTicket([], 'a', 'X')).toEqual({ action: 'insert' });
    expect(decideTicket([{ uid: 'a', seat: 'X' }], 'b', 'O')).toEqual({ action: 'insert' });
  });

  it('gives the same player their existing ticket again', () => {
    expect(decideTicket([{ uid: 'a', seat: 'X' }, { uid: 'b', seat: 'O' }], 'a', 'X')).toEqual({ action: 'exists' });
  });

  it('refuses a seat someone else holds, first writer wins', () => {
    expect(decideTicket([{ uid: 'a', seat: 'X' }], 'spectator', 'X')).toEqual({ action: 'refuse', code: 'seat_taken' });
    expect(decideTicket([{ uid: 'a', seat: 'X' }, { uid: 'b', seat: 'O' }], 'spectator', 'O')).toEqual({ action: 'refuse', code: 'seat_taken' });
  });

  it('refuses a player switching to the other seat', () => {
    expect(decideTicket([{ uid: 'a', seat: 'X' }], 'a', 'O')).toEqual({ action: 'refuse', code: 'seat_mismatch' });
  });
});
