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

describe('double down', () => {
  it('becomes active once the opponent accepts, and marks the result', () => {
    const { state, hostId, friendId, gameId } = playing();
    const offered = offer(state, hostId, gameId);
    expect(offered.state.room.game!.doubleDown).toEqual({ offered: [seatOf(state.room, hostId)], pending: seatOf(state.room, hostId), accepted: false });
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
});
