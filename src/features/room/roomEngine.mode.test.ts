import { describe, expect, it } from 'vitest';
import { DEFAULT_ROOM_SETTINGS } from '../settings/types';
import { applyIntent, COUNTDOWN_MS, createRoom, onCountdownDone, restore, snapshot } from './roomEngine';

const host = { uid: '11111111-1111-4111-8111-111111111111', name: 'Host', isGuest: false };
const friend = { uid: '22222222-2222-4222-8222-222222222222', name: 'Friend', isGuest: false };

const finish = (mode: 'casual' | 'ranked') => {
  const created = createRoom({ roomId: 'ABCDE', isPublic: true, mode, settings: DEFAULT_ROOM_SETTINGS, hostProfile: host }, 0);
  const joined = applyIntent(created, { type: 'HELLO', payload: { profile: friend, tabId: 'friend' } }, null, 1);
  const playing = onCountdownDone(joined.state, 1 + COUNTDOWN_MS).state;
  const gameId = playing.room.game!.id;
  return applyIntent(playing, { type: 'RESIGN', payload: { gameId } }, playing.room.seats.O, 10_000).state;
};

describe('room modes', () => {
  it('keeps casual results unrated and restores the mode', () => {
    const ended = finish('casual');
    expect(ended.room.mode).toBe('casual');
    expect(ended.room.results[0].rating).toMatchObject({ status: 'unrated', why: 'casual' });
    expect(restore(snapshot(ended, 11_000), 12_000).room.mode).toBe('casual');
  });

  it('keeps ranked results eligible for rating', () => {
    const ended = finish('ranked');
    expect(ended.room.results[0].rating.status).toBe('pending');
  });

  it('does not allow a rating side bet in a casual game', () => {
    const created = createRoom({ roomId: 'ABCDE', isPublic: true, mode: 'casual', settings: DEFAULT_ROOM_SETTINGS, hostProfile: host }, 0);
    const joined = applyIntent(created, { type: 'HELLO', payload: { profile: friend, tabId: 'friend' } }, null, 1);
    const playing = onCountdownDone(joined.state, 1 + COUNTDOWN_MS).state;
    const offered = applyIntent(playing, { type: 'DOUBLE_DOWN_OFFER', payload: { gameId: playing.room.game!.id } }, playing.room.seats.X, 5_000);
    expect(offered.state.room.game!.doubleDown?.pending).toBeNull();
    expect(offered.replies.some((reply) => reply.message.type === 'REJECTED')).toBe(true);
  });

  it('never seats anyone or starts a game in a chat room', () => {
    const created = createRoom({ roomId: 'ABCDE', isPublic: false, mode: 'chat', settings: DEFAULT_ROOM_SETTINGS, hostProfile: host }, 0);
    expect(created.room.seats).toEqual({ X: null, O: null, T: null });
    const joined = applyIntent(created, { type: 'HELLO', payload: { profile: friend, tabId: 'friend' } }, null, 1);
    expect(joined.state.room.seats).toEqual({ X: null, O: null, T: null });
    const friendId = joined.state.room.members[1].id;
    const sat = applyIntent(joined.state, { type: 'TAKE_SEAT', payload: { seat: 'X' } }, friendId, 2);
    expect(sat.state.room.seats.X).toBeNull();
    expect(sat.state.room.phase).toBe('waiting');
    expect(sat.state.room.game).toBeNull();
    const chatted = applyIntent(sat.state, { type: 'CHAT', payload: { id: 'msg1', text: 'hi' } }, friendId, 3);
    expect(chatted.events.some((e) => e.kind === 'broadcast' && e.message.type === 'CHAT')).toBe(true);
  });
});
