import { describe, expect, it } from 'vitest';
import { DEFAULT_ROOM_SETTINGS } from '../settings/types';
import { applyIntent, COUNTDOWN_MS, createRoom, onConnectionLost, onCountdownDone } from './roomEngine';
import type { EngineState } from './roomEngine';

const host = { uid: 'host-uid', name: 'Host', isGuest: false };
const friend = { uid: 'friend-uid', name: 'Friend', isGuest: false };
const third = { uid: 'third-uid', name: 'Third', isGuest: false };
const viewer = { uid: 'viewer-uid', name: 'Viewer', isGuest: false };

const THREE = { ...DEFAULT_ROOM_SETTINGS, playerMode: 'oneVsOneVsOne' as const };

const hello = (state: EngineState, profile: object, tabId: string, now: number) => {
  const result = applyIntent(state, { type: 'HELLO', payload: { profile, tabId } }, null, now);
  const bind = result.events.find((e) => e.kind === 'bind');
  if (!bind || bind.kind !== 'bind') throw new Error('not joined');
  return { state: result.state, id: bind.memberId, result };
};

const rejected = (replies: { message: { type: string } }[]) => replies.some((r) => r.message.type === 'REJECTED');

/** A three-player room whose first game has just ended in a draw, plus one viewer. */
const endedThreePlayer = () => {
  const created = createRoom({ roomId: 'ABCDE', isPublic: true, settings: THREE, hostProfile: host, hostTabId: 'tabhost' }, 0);
  const f = hello(created, friend, 'tabfriend', 1);
  const t = hello(f.state, third, 'tabthird', 2);
  const v = hello(t.state, viewer, 'tabviewer', 3);
  const playing = onCountdownDone(v.state, 3 + COUNTDOWN_MS).state;
  const gameId = playing.room.game!.id;
  const ended = applyIntent(playing, { type: 'RESIGN', payload: { gameId } }, f.id, 10_000).state;
  return { state: ended, hostId: created.host.hostMemberId, friendId: f.id, thirdId: t.id, viewerId: v.id, gameId };
};

describe('the third seat', () => {
  it('cannot be taken in a 1v1 room', () => {
    const created = createRoom({ roomId: 'ABCDE', isPublic: true, settings: DEFAULT_ROOM_SETTINGS, hostProfile: host, hostTabId: 'tabhost' }, 0);
    const f = hello(created, friend, 'tabfriend', 1);
    const v = hello(f.state, viewer, 'tabviewer', 2);
    // The friend stands up before the count-in ends, so the room waits with O open.
    const waiting = applyIntent(v.state, { type: 'LEAVE_SEAT', payload: {} }, f.id, 3).state;
    expect(waiting.room.phase).toBe('waiting');
    const result = applyIntent(waiting, { type: 'TAKE_SEAT', payload: { seat: 'T' } }, v.id, 4);
    expect(result.state.room.seats.T).toBeNull();
    expect(rejected(result.replies)).toBe(true);
  });

  it('is emptied when the host switches the room to 1v1', () => {
    const { state, hostId, thirdId } = endedThreePlayer();
    expect(state.room.phase).toBe('ended');
    expect(state.room.seats.T).toBe(thirdId);
    const result = applyIntent(state, { type: 'UPDATE_SETTINGS', payload: { settings: DEFAULT_ROOM_SETTINGS } }, hostId, 11_000);
    expect(result.state.room.settings.playerMode).toBe('oneVsOne');
    expect(result.state.room.seats.T).toBeNull();
  });
});

describe('three-player rematch', () => {
  it('cannot be answered by a viewer', () => {
    const { state, hostId, viewerId, gameId } = endedThreePlayer();
    const offered = applyIntent(state, { type: 'REMATCH_OFFER', payload: { gameId } }, hostId, 11_000).state;
    expect(offered.room.game!.rematch).toEqual({ from: 'X' });
    const result = applyIntent(offered, { type: 'REMATCH_ANSWER', payload: { gameId, accept: true } }, viewerId, 12_000);
    expect(rejected(result.replies)).toBe(true);
    expect(result.state.room.phase).toBe('ended');
    expect(result.state.room.game!.id).toBe(gameId);
  });

  it('cannot be declined by a viewer either', () => {
    const { state, hostId, viewerId, gameId } = endedThreePlayer();
    const offered = applyIntent(state, { type: 'REMATCH_OFFER', payload: { gameId } }, hostId, 11_000).state;
    const result = applyIntent(offered, { type: 'REMATCH_ANSWER', payload: { gameId, accept: false } }, viewerId, 12_000);
    expect(rejected(result.replies)).toBe(true);
    expect(result.state.room.game!.rematch).toEqual({ from: 'X' });
  });

  it('can be accepted by another seated player', () => {
    const { state, hostId, thirdId, gameId } = endedThreePlayer();
    const offered = applyIntent(state, { type: 'REMATCH_OFFER', payload: { gameId } }, hostId, 11_000).state;
    const result = applyIntent(offered, { type: 'REMATCH_ANSWER', payload: { gameId, accept: true } }, thirdId, 12_000);
    expect(rejected(result.replies)).toBe(false);
    expect(result.state.room.game!.id).not.toBe(gameId);
  });
});

describe('rejoining', () => {
  it('cannot take a seated player’s name', () => {
    const created = createRoom({ roomId: 'ABCDE', isPublic: true, settings: DEFAULT_ROOM_SETTINGS, hostProfile: host, hostTabId: 'tabhost' }, 0);
    const f = hello(created, friend, 'tabfriend', 1);
    const v = hello(f.state, viewer, 'tabviewer', 2);
    const dropped = onConnectionLost(v.state, v.id, 3).state;
    const token = dropped.host.tokens[v.id];
    const back = applyIntent(
      dropped,
      { type: 'HELLO', payload: { profile: { ...viewer, name: 'friend' }, tabId: 'tabviewer', resume: { memberId: v.id, token } } },
      null,
      4,
    ).state;
    const names = back.room.members.map((m) => m.profile.name);
    expect(names.filter((n) => n.toLowerCase() === 'friend')).toHaveLength(1);
    expect(back.room.members.find((m) => m.id === v.id)!.profile.name).toBe('friend (2)');
  });

  it('keeps a member’s own name when it clashes with nobody else', () => {
    const created = createRoom({ roomId: 'ABCDE', isPublic: true, settings: DEFAULT_ROOM_SETTINGS, hostProfile: host, hostTabId: 'tabhost' }, 0);
    const v = hello(created, viewer, 'tabviewer', 1);
    const dropped = onConnectionLost(v.state, v.id, 2).state;
    const token = dropped.host.tokens[v.id];
    const back = applyIntent(dropped, { type: 'HELLO', payload: { profile: viewer, tabId: 'tabviewer', resume: { memberId: v.id, token } } }, null, 3).state;
    expect(back.room.members.find((m) => m.id === v.id)!.profile.name).toBe('Viewer');
  });
});
