import { describe, expect, it } from 'vitest';
import { DEFAULT_ROOM_SETTINGS } from '../settings/types';
import { applyIntent, createRoom, COUNTDOWN_MS, onCountdownDone } from './roomEngine';
import type { EngineState } from './roomEngine';

function threatenedRoom(three = true) {
  let state = createRoom({ roomId: 'ABCDE', isPublic: false, settings: { ...DEFAULT_ROOM_SETTINGS, playerMode: three ? 'oneVsOneVsOne' : 'oneVsOne', turnTimeSeconds: 0, totalTimeMinutes: 0 }, hostProfile: { uid: 'host', name: 'Host' } }, 0);
  for (const uid of three ? ['second', 'third'] : ['second']) state = applyIntent(state, { type: 'HELLO', payload: { profile: { uid, name: uid }, tabId: uid } }, null, 1).state;
  state = onCountdownDone(state, COUNTDOWN_MS + 2).state;
  state.room.game!.moves = three ? [[7, 3], [0, 0], [2, 0], [7, 4], [0, 2], [2, 2], [7, 5]] : [[7, 3], [0, 0], [7, 4], [0, 2], [7, 5]];
  state.room.game!.turn = 'O';
  return state;
}
const move = (state: EngineState, row: number, col: number) => applyIntent(state, { type: 'MOVE', payload: { gameId: state.room.game!.id, n: state.room.game!.moves.length, row, col } }, state.room.seats[state.room.game!.turn], 5_000);

describe('authoritative 1v1v1 forced blocks', () => {
  it('rejects an unrelated move without placing a stone or changing the turn', () => {
    const state = threatenedRoom();
    const result = move(state, 10, 10);
    expect(result.replies).toContainEqual({ to: state.room.seats.O, message: { type: 'REJECTED', payload: { type: 'MOVE', reason: 'must_block' } } });
    expect(result.state.room.game!.moves).toEqual(state.room.game!.moves);
    expect(result.state.room.game!.turn).toBe('O');
  });

  it('allows one end, then forces the third player to block the remaining end', () => {
    const blocked = move(threatenedRoom(), 7, 2);
    expect(blocked.replies).toEqual([]);
    expect(blocked.state.room.game!.turn).toBe('T');
    expect(move(blocked.state, 10, 10).replies).toMatchObject([{ message: { payload: { reason: 'must_block' } } }]);
    expect(move(blocked.state, 7, 6).replies).toEqual([]);
  });

  it('allows an immediate win instead of a block', () => {
    const state = threatenedRoom();
    state.room.game!.moves.push([0, 4], [2, 4], [10, 10]);
    state.room.game!.moves[4] = [0, 1];
    state.room.game!.moves[7] = [0, 2];
    const result = move(state, 0, 3);
    expect(result.replies).toEqual([]);
    expect(result.state.room.phase).toBe('ended');
    expect(result.state.room.results.at(-1)?.winner).toBe('O');
  });

  it('does not restrict ordinary 1v1', () => {
    expect(move(threatenedRoom(false), 10, 10).replies).toEqual([]);
  });
});
