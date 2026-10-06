import { describe, expect, it } from 'vitest';
import { DEFAULT_ROOM_SETTINGS } from '../settings/types';
import { applyIntent, CLAIM_DISCONNECT_WIN_MS, COUNTDOWN_MS, createRoom, onCountdownDone, tick } from './roomEngine';
import { claimLostHost } from './hostLossClaim';

const host = { uid: '11111111-1111-4111-8111-111111111111', name: 'Host', isGuest: false };
const guest = { uid: '22222222-2222-4222-8222-222222222222', name: 'Guest', isGuest: false };

const playing = () => {
  const created = createRoom({ roomId: 'ABCDE', isPublic: true, settings: DEFAULT_ROOM_SETTINGS, hostProfile: host }, 0);
  const joined = applyIntent(created, { type: 'HELLO', payload: { profile: guest, tabId: 'guest' } }, null, 1);
  const state = onCountdownDone(joined.state, 1 + COUNTDOWN_MS).state;
  return { state, guestId: state.room.seats.O! };
};

describe('rematch offers', () => {
  it('stays pending after the old 30-second limit', () => {
    const { state, guestId } = playing();
    const gameId = state.room.game!.id;
    const ended = applyIntent(state, { type: 'RESIGN', payload: { gameId } }, guestId, 5_000).state;
    const offered = applyIntent(ended, { type: 'REMATCH_OFFER', payload: { gameId } }, ended.host.hostMemberId, 6_000).state;
    const alive = applyIntent(offered, { type: 'PONG', payload: { t: 65_999 } }, guestId, 65_999).state;
    const later = tick(alive, 66_000).state;
    expect(later.room.game?.rematch?.from).toBe('X');
    const accepted = applyIntent(later, { type: 'REMATCH_ANSWER', payload: { gameId, accept: true } }, guestId, 66_001);
    expect(accepted.state.room.phase).toBe('countdown');
  });
});

describe('claim after the host disconnects', () => {
  it('allows the remaining player to end a 1v1 after 120 seconds', () => {
    const { state, guestId } = playing();
    const room = state.room;
    expect(claimLostHost(room, guestId, 10_000, 10_000 + CLAIM_DISCONNECT_WIN_MS - 1)).toBeNull();
    const claimed = claimLostHost(room, guestId, 10_000, 10_000 + CLAIM_DISCONNECT_WIN_MS);
    expect(claimed?.phase).toBe('ended');
    expect(claimed?.results.at(-1)).toMatchObject({ winner: 'O', reason: 'disconnected' });
    expect(claimed?.game?.clocks.running).toBe(false);
  });

  it('rejects the host, viewers, and games that have already ended', () => {
    const { state, guestId } = playing();
    const deadline = CLAIM_DISCONNECT_WIN_MS + 10_000;
    expect(claimLostHost(state.room, state.host.hostMemberId, 10_000, deadline)).toBeNull();
    expect(claimLostHost(state.room, 'viewer', 10_000, deadline)).toBeNull();
    const gameId = state.room.game!.id;
    const ended = applyIntent(state, { type: 'RESIGN', payload: { gameId } }, guestId, 10_001).state;
    expect(claimLostHost(ended.room, guestId, 10_000, deadline)).toBeNull();
  });
});
