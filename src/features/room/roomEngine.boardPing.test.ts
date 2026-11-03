import { describe, expect, it } from 'vitest';
import { DEFAULT_ROOM_SETTINGS } from '../settings/types';
import { applyIntent, COUNTDOWN_MS, createRoom, onCountdownDone, snapshot, restore, toWire } from './roomEngine';
import type { EngineState } from './roomEngine';
import { isValidIntent } from './protocol';
import type { Seat } from './protocol';

const playing = (three = true) => {
  let state = createRoom({ roomId: 'ABCDE', isPublic: true, hostProfile: { uid: 'host', name: 'Host' }, settings: { ...DEFAULT_ROOM_SETTINGS, playerMode: three ? 'oneVsOneVsOne' : 'oneVsOne', turnTimeSeconds: 0, totalTimeMinutes: 0 } }, 0);
  for (const uid of three ? ['friend', 'third', 'viewer'] : ['friend', 'viewer']) {
    state = applyIntent(state, { type: 'HELLO', payload: { profile: { uid, name: uid }, tabId: uid } }, null, 1).state;
  }
  return onCountdownDone(state, COUNTDOWN_MS + 2).state;
};

const ping = (state: EngineState, seat: Seat, row = 4, col = 5) => applyIntent(state, {
  type: 'BOARD_PING', payload: { gameId: state.room.game!.id, row, col },
}, state.room.seats[seat], 5_000);

describe('shared board pings', () => {
  it('validates ping coordinates on the wire', () => {
    expect(isValidIntent('BOARD_PING', { gameId: 'game1', row: 4, col: 5 })).toBe(true);
    for (const row of [-1, 1.5, null, '4', Infinity]) {
      expect(isValidIntent('BOARD_PING', { gameId: 'game1', row, col: 5 })).toBe(false);
    }
  });

  it('shares one persistent ping per player, including players waiting for their turn', () => {
    const state = playing();
    const first = ping(state, 'O');
    expect(first.state.room.game).toMatchObject({ pings: { O: { row: 4, col: 5 } }, moves: [], turn: 'X' });
    expect(first.events).toContainEqual({ kind: 'room_state', except: [] });
    const second = ping(first.state, 'T', 6, 7);
    const replaced = ping(second.state, 'O', 8, 9).state;
    expect(replaced.room.game?.pings).toEqual({ O: { row: 8, col: 9 }, T: { row: 6, col: 7 } });
    expect(toWire(replaced, 60_000).game?.pings).toEqual(replaced.room.game?.pings);
    expect(restore(snapshot(replaced, 60_000), 61_000).room.game?.pings).toEqual(replaced.room.game?.pings);
    expect(state.room.game?.pings).toBeUndefined();
  });

  it('toggles only the sender’s ping off at the same cell', () => {
    const both = ping(ping(playing(), 'O').state, 'T').state;
    expect(ping(both, 'O').state.room.game?.pings).toEqual({ T: { row: 4, col: 5 } });
  });

  it('clears only the sender’s ping and repeated clears never recreate it', () => {
    const both = ping(ping(playing(), 'O').state, 'T').state;
    const intent = { type: 'BOARD_PING_CLEAR' as const, payload: { gameId: both.room.game!.id } };
    expect(isValidIntent(intent.type, intent.payload)).toBe(true);
    const cleared = applyIntent(both, intent, both.room.seats.O, 5_100);
    expect(cleared.state.room.game?.pings).toEqual({ T: { row: 4, col: 5 } });
    expect(cleared.events).toContainEqual({ kind: 'room_state', except: [] });
    const repeated = applyIntent(cleared.state, intent, both.room.seats.O, 5_101);
    expect(repeated.state.room.game?.pings).toEqual({ T: { row: 4, col: 5 } });
  });

  it('clears all pings on a cell when a real move lands and sends the updated markers', () => {
    const state = ping(ping(playing(), 'O').state, 'T').state;
    const moved = applyIntent(state, { type: 'MOVE', payload: { gameId: state.room.game!.id, n: 0, row: 4, col: 5 } }, state.room.seats.X, 5_100);
    expect(moved.state.room.game?.pings).toEqual({});
    const event = moved.events.find((e) => e.kind === 'broadcast' && e.message.type === 'MOVE_APPLIED');
    expect(event).toMatchObject({ message: { payload: { pings: {} } } });
  });

  it('removes a player’s ping when they leave their seat', () => {
    const state = ping(playing(), 'O').state;
    const left = applyIntent(state, { type: 'LEAVE_SEAT', payload: {} }, state.room.seats.O, 5_100);
    expect(left.state.room.game?.pings).toEqual({});
  });

  it('rejects pings outside 1v1v1, from viewers, on occupied cells, out of bounds, or for an old game', () => {
    const state = playing();
    const cases: Array<[EngineState, string | null, string, number, number]> = [
      [playing(false), null, 'current', 4, 5],
      [state, state.room.members[3].id, 'current', 4, 5],
      [state, state.room.seats.O, 'current', 99, 5],
      [state, state.room.seats.O, 'old', 4, 5],
      [{ ...state, room: { ...state.room, phase: 'ended' } }, state.room.seats.O, 'current', 4, 5],
    ];
    const moved = applyIntent(state, { type: 'MOVE', payload: { gameId: state.room.game!.id, n: 0, row: 4, col: 5 } }, state.room.seats.X, 5_000).state;
    cases.push([moved, moved.room.seats.O, 'current', 4, 5]);
    for (const [s, member, id, row, col] of cases) {
      const result = applyIntent(s, { type: 'BOARD_PING', payload: { gameId: id === 'current' ? s.room.game!.id : id, row, col } }, member ?? s.room.seats.X, 5_100);
      expect(result.replies).toContainEqual(expect.objectContaining({ message: expect.objectContaining({ type: 'REJECTED' }) }));
      expect(result.state.room.game?.pings).toBeUndefined();
    }
  });
});
