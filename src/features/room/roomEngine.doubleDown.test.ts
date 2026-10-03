import { describe, expect, it } from 'vitest';
import { DEFAULT_ROOM_SETTINGS } from '../settings/types';
import { applyIntent, COUNTDOWN_MS, createRoom, onCountdownDone, seatOf } from './roomEngine';
import type { EngineState } from './roomEngine';

const host = { uid: 'host-uid', name: 'Host', isGuest: false };
const friend = { uid: 'friend-uid', name: 'Friend', isGuest: false };

/** A 1v1 room with both seats filled and the game under way. */
const playing = () => {
  let state = createRoom({ roomId: 'ABCDE', isPublic: true, settings: { ...DEFAULT_ROOM_SETTINGS, firstMoveMethod: 'default' }, hostProfile: host, hostTabId: 'tabhost' }, 0);
  const joined = applyIntent(state, { type: 'HELLO', payload: { profile: friend, tabId: 'tabfriend' } }, null, 1);
  const bind = joined.events.find((e) => e.kind === 'bind');
  if (!bind || bind.kind !== 'bind') throw new Error('not joined');
  state = onCountdownDone(joined.state, 1 + COUNTDOWN_MS).state;
  expect(state.room.phase).toBe('playing');
  return { state, hostId: state.host.hostMemberId, friendId: bind.memberId, gameId: state.room.game!.id };
};

const offer = (state: EngineState, from: string, gameId: string, now = 5_000) =>
  applyIntent(state, { type: 'DOUBLE_DOWN_OFFER', payload: { gameId } }, from, now);
const answer = (state: EngineState, from: string, gameId: string, accept: boolean, now = 5_100) =>
  applyIntent(state, { type: 'DOUBLE_DOWN_ANSWER', payload: { gameId, accept } }, from, now);
const rejected = (result: ReturnType<typeof offer>) =>
  result.replies.find((r) => r.message.type === 'REJECTED')?.message.payload;
const move = (state: EngineState, gameId: string, row: number, col: number, now: number) => {
  const game = state.room.game!;
  const moverId = state.room.seats[game.turn]!;
  return applyIntent(state, { type: 'MOVE', payload: { gameId, n: game.moves.length, row, col } }, moverId, now);
};

describe('double down', () => {
  it('becomes active once the opponent accepts, and marks the result', () => {
    const { state, hostId, friendId, gameId } = playing();
    const offered = offer(state, hostId, gameId);
    expect(offered.state.room.game!.doubleDown).toEqual({ offered: [seatOf(state.room, hostId)], pending: seatOf(state.room, hostId), accepted: false, answerMovesLeft: 5, expired: false });
    const accepted = answer(offered.state, friendId, gameId, true);
    expect(accepted.state.room.game!.doubleDown).toMatchObject({ pending: null, accepted: true });
    const resigned = applyIntent(accepted.state, { type: 'RESIGN', payload: { gameId } }, friendId, 6_000);
    expect(resigned.state.room.results.at(-1)?.doubleDown).toBe(true);
  });

  it('carries on unchanged when rejected, and the offer cannot be made twice', () => {
    const { state, hostId, friendId, gameId } = playing();
    const declined = answer(offer(state, hostId, gameId).state, friendId, gameId, false);
    expect(declined.state.room.game!.doubleDown).toMatchObject({ pending: null, accepted: false });
    expect(rejected(offer(declined.state, hostId, gameId))).toMatchObject({ reason: 'already_offered' });
    // The other player still has their own one offer.
    const second = offer(declined.state, friendId, gameId);
    expect(rejected(second)).toBeUndefined();
    const resigned = applyIntent(answer(second.state, hostId, gameId, false).state, { type: 'RESIGN', payload: { gameId } }, friendId, 6_000);
    expect(resigned.state.room.results.at(-1)?.doubleDown).toBeUndefined();
  });

  it('can only be answered by the opponent', () => {
    const { state, hostId, gameId } = playing();
    const offered = offer(state, hostId, gameId);
    expect(rejected(answer(offered.state, hostId, gameId, true))).toMatchObject({ reason: 'not_addressed' });
  });

  it('is refused while another offer is waiting or once accepted', () => {
    const { state, hostId, friendId, gameId } = playing();
    const offered = offer(state, hostId, gameId);
    expect(rejected(offer(offered.state, friendId, gameId))).toMatchObject({ reason: 'offer_pending' });
    const accepted = answer(offered.state, friendId, gameId, true);
    expect(rejected(offer(accepted.state, friendId, gameId))).toMatchObject({ reason: 'already_doubled' });
  });

  it('is called off when a player gives up their seat', () => {
    const { state, hostId, friendId, gameId } = playing();
    const accepted = answer(offer(state, hostId, gameId).state, friendId, gameId, true);
    const stood = applyIntent(accepted.state, { type: 'LEAVE_SEAT', payload: {} }, friendId, 6_000);
    expect(stood.state.room.game!.doubleDown).toMatchObject({ accepted: false, pending: null });
  });

  it('expires after five valid moves by the answering player, not five moves total', () => {
    const { state, hostId, friendId, gameId } = playing();
    let current = offer(state, hostId, gameId).state;
    const positions = [[0, 0], [2, 0], [0, 2], [2, 2], [0, 4], [2, 4], [0, 6], [2, 6], [0, 8], [2, 8]];
    for (let i = 0; i < 9; i += 1) {
      current = move(current, gameId, positions[i][0], positions[i][1], 6_000 + i * 100).state;
    }
    expect(current.room.game!.doubleDown).toMatchObject({ pending: seatOf(state.room, hostId), answerMovesLeft: 1 });
    expect(rejected(answer(current, friendId, gameId, true, 7_000))).toBeUndefined();

    current = move(current, gameId, positions[9][0], positions[9][1], 7_000).state;
    expect(current.room.game!.doubleDown).toMatchObject({ pending: null, accepted: false, answerMovesLeft: 0, expired: true });
    expect(rejected(answer(current, friendId, gameId, true, 7_100))).toMatchObject({ reason: 'no_offer' });
  });

  it('starts a new five move window for the other player after rejection', () => {
    const { state, hostId, friendId, gameId } = playing();
    const first = answer(offer(state, hostId, gameId).state, friendId, gameId, false);
    const second = offer(first.state, friendId, gameId);
    expect(second.state.room.game!.doubleDown).toMatchObject({ pending: seatOf(state.room, friendId), answerMovesLeft: 5, expired: false });
    expect(rejected(answer(second.state, hostId, gameId, true))).toBeUndefined();
  });

  it('does not count a rejected move attempt', () => {
    const { state, hostId, friendId, gameId } = playing();
    const offered = offer(state, hostId, gameId);
    const hostMoved = move(offered.state, gameId, 0, 0, 6_000);
    const invalid = applyIntent(hostMoved.state, { type: 'MOVE', payload: { gameId, n: 1, row: 0, col: 0 } }, friendId, 6_100);
    expect(rejected(invalid)).toMatchObject({ reason: 'occupied' });
    expect(invalid.state.room.game!.doubleDown).toMatchObject({ pending: seatOf(state.room, hostId), answerMovesLeft: 5 });
    const valid = move(invalid.state, gameId, 2, 0, 6_200);
    expect(valid.state.room.game!.doubleDown).toMatchObject({ pending: seatOf(state.room, hostId), answerMovesLeft: 4 });
  });
});
