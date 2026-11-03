import { describe, expect, it } from 'vitest';
import { DEFAULT_ROOM_SETTINGS } from '../settings/types';
import { applyIntent, createRoom, COUNTDOWN_MS, onCountdownDone } from './roomEngine';
import type { EngineState } from './roomEngine';
import type { Seat } from './protocol';

function played(allowUndo = true, three = true) {
  let state = createRoom({ roomId: 'ABCDE', isPublic: false, settings: { ...DEFAULT_ROOM_SETTINGS, allowUndo, playerMode: three ? 'oneVsOneVsOne' : 'oneVsOne', turnTimeSeconds: 0, totalTimeMinutes: 0 }, hostProfile: { uid: 'host', name: 'Host' } }, 0);
  for (const uid of three ? ['second', 'third', 'viewer'] : ['second', 'viewer']) {
    state = applyIntent(state, { type: 'HELLO', payload: { profile: { uid, name: uid }, tabId: uid } }, null, 1).state;
  }
  state = onCountdownDone(state, COUNTDOWN_MS + 2).state;
  for (let n = 0; n < (three ? 6 : 4); n++) {
    const game = state.room.game!;
    state = applyIntent(state, { type: 'MOVE', payload: { gameId: game.id, n, row: n, col: n % 2 } }, state.room.seats[game.turn], 4_000 + n * 100).state;
  }
  return state;
}

const request = (state: EngineState, seat: Seat, now = 12_000) => applyIntent(state, { type: 'UNDO_REQUEST', payload: { gameId: state.room.game!.id } }, state.room.seats[seat], now);
const answer = (state: EngineState, memberId: string | null, accept = true) => applyIntent(state, { type: 'UNDO_ANSWER', payload: { gameId: state.room.game!.id, accept } }, memberId, 12_100);

describe('takebacks follow room settings', () => {
  it.each(['O', 'T'] as const)('accepts a single %s approval for X in 1v1v1', (approver) => {
    const state = played();
    const offered = request(state, 'X');
    expect(offered.replies).toEqual([]);
    expect(offered.state.room.game!.undo?.from).toBe('X');
    const result = answer(offered.state, state.room.seats[approver]);
    expect(result.replies).toEqual([]);
    expect(result.state.room.game).toMatchObject({ moves: [[0, 0], [1, 1], [2, 0]], turn: 'X', undo: null });
    expect(result.state.room.game!.moveBy).toHaveLength(3);
    expect(result.state.room.game!.moveCorners).toHaveLength(3);
    expect(result.events).toContainEqual({ kind: 'room_state', except: [] });
    expect(answer(result.state, state.room.seats[approver]).replies).toMatchObject([{ message: { payload: { reason: 'no_undo' } } }]);
  });

  it('lets O approve T’s takeback and restores T’s turn', () => {
    const state = played();
    const result = answer(request(state, 'T').state, state.room.seats.O);
    expect(result.replies).toEqual([]);
    expect(result.state.room.game).toMatchObject({ turn: 'T', undo: null });
    expect(result.state.room.game!.moves).toHaveLength(5);
  });

  it('retains the five-second instant undo for the last mover in 1v1v1', () => {
    const result = request(played(), 'T', 5_000);
    expect(result.replies).toEqual([]);
    expect(result.state.room.game).toMatchObject({ turn: 'T', undo: null });
    expect(result.state.room.game!.moves).toHaveLength(5);
  });

  it('rejects self-approval and viewer approval', () => {
    const state = request(played(), 'X').state;
    for (const memberId of [state.room.seats.X, state.room.members[3].id]) {
      const result = answer(state, memberId);
      expect(result.replies).toMatchObject([{ message: { payload: { reason: 'not_addressed' } } }]);
      expect(result.state.room.game!.moves).toHaveLength(6);
      expect(result.state.room.game!.undo?.from).toBe('X');
    }
  });

  it.each(['O', 'T'] as const)('lets %s decline and closes the request', (seat) => {
    const state = request(played(), 'X').state;
    const result = answer(state, state.room.seats[seat], false);
    expect(result.replies).toEqual([{ to: state.room.seats.X, message: { type: 'EVENT', payload: { kind: 'undo_declined' } } }]);
    expect(result.state.room.game!.undo).toBeNull();
    expect(result.state.room.game!.moves).toHaveLength(6);
  });

  it.each([true, false])('rejects takebacks when Allow undo is off (three=%s)', (three) => {
    const result = request(played(false, three), 'X');
    expect(result.replies).toMatchObject([{ message: { payload: { reason: 'undo_off' } } }]);
    expect(result.state.room.game!.undo).toBeNull();
  });

  it('preserves opponent approval in 1v1', () => {
    const state = played(true, false);
    const result = answer(request(state, 'X').state, state.room.seats.O);
    expect(result.replies).toEqual([]);
    expect(result.state.room.game!.moves).toHaveLength(2);
    expect(result.state.room.game!.turn).toBe('X');
  });
});
