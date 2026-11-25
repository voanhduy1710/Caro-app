import { describe, expect, it } from 'vitest';
import { DEFAULT_ROOM_SETTINGS } from '../settings/types';
import { applyIntent, COUNTDOWN_MS, createRoom, kickForMalformed, MAX_MEMBERS, onConnectionLost, onCountdownDone, scorePairKey, tick, VIEWER_GRACE_MS } from './roomEngine';
import type { EngineResult, EngineState } from './roomEngine';

const host = { uid: 'host-uid', name: 'Host', isGuest: false };
const friend = { uid: 'friend-uid', name: 'Friend', isGuest: false };
const viewer = { uid: 'viewer-uid', name: 'Viewer', isGuest: true };

const fresh = () => createRoom({ roomId: 'ABCDE', isPublic: true, settings: DEFAULT_ROOM_SETTINGS, hostProfile: host, hostTabId: 'tabhost' }, 0);

const welcomeOf = (result: EngineResult) => {
  const reply = result.replies.find((r) => r.message.type === 'WELCOME');
  if (!reply || reply.message.type !== 'WELCOME') throw new Error('no welcome');
  return reply.message.payload;
};

const hello = (state: EngineState, profile: object, tabId: string, now: number, resume?: { memberId: string; token: string }) => {
  const result = applyIntent(state, { type: 'HELLO', payload: { profile, tabId, ...(resume ? { resume } : {}) } }, null, now);
  const welcome = welcomeOf(result);
  return { state: result.state, id: welcome.memberId, token: welcome.token, welcome, result };
};

/** Host in X, the friend in O, the game running and then paused by the friend's drop. */
const pausedGame = () => {
  const f = hello(fresh(), friend, 'tabfriend', 1);
  let state = onCountdownDone(f.state, COUNTDOWN_MS + 1).state;
  expect(state.room.phase).toBe('playing');
  state = onConnectionLost(state, f.id, COUNTDOWN_MS + 2).state;
  expect(state.room.phase).toBe('paused');
  return { state, friendId: f.id, friendToken: f.token };
};

describe('reclaiming a dropped member', () => {
  it('needs the resume token: the uid alone joins as a new member', () => {
    const { state, friendId, friendToken } = pausedGame();
    const attacker = hello(state, friend, 'tabattacker', 10_000);
    expect(attacker.id).not.toBe(friendId);
    expect(attacker.token).not.toBe(friendToken);
    expect(attacker.welcome.resumed).toBe(false);
    expect(attacker.state.room.seats.O).toBe(friendId);
    expect(attacker.state.host.tokens[friendId]).toBe(friendToken);
    expect(attacker.state.room.members.find((m) => m.id === friendId)?.connected).toBe(false);
  });

  it('still lets the holder of the token back into the seat', () => {
    const { state, friendId, friendToken } = pausedGame();
    const back = hello(state, friend, 'tabfriend2', 10_000, { memberId: friendId, token: friendToken });
    expect(back.id).toBe(friendId);
    expect(back.welcome.resumed).toBe(true);
  });

  it('does not let the tokenless copy of a seated account sit in the other seat', () => {
    const { state, friendId } = pausedGame();
    const copy = hello(state, friend, 'tabcopy', 10_000);
    // Paused game: the copy watches, and the seat stays with the absent player.
    expect(Object.values(copy.state.room.seats)).not.toContain(copy.id);
    expect(copy.state.room.seats.O).toBe(friendId);
  });

  it('between games, a tokenless copy of the same account takes the absent seat', () => {
    const f = hello(fresh(), friend, 'tabfriend', 1);
    // Dropping during the count-in sends the room back to waiting.
    const state = onConnectionLost(f.state, f.id, 2).state;
    expect(state.room.phase).toBe('waiting');
    const copy = hello(state, friend, 'tabcopy', 3);
    expect(copy.id).not.toBe(f.id);
    expect(copy.state.room.seats.O).toBe(copy.id);
    // The old copy is now an absent viewer and goes soon.
    expect(copy.state.host.graceEndsAt[f.id]).toBeLessThanOrEqual(3 + VIEWER_GRACE_MS);
  });
});

describe('absent viewers', () => {
  it('are removed after the short viewer grace; a seated player keeps the long one', () => {
    const f = hello(fresh(), friend, 'tabfriend', 1);
    const v = hello(f.state, viewer, 'tabviewer', 2);
    let state = onConnectionLost(v.state, v.id, 3).state;
    state = onConnectionLost(state, f.id, 3).state;
    state = tick(state, 3 + VIEWER_GRACE_MS + 1).state;
    expect(state.room.members.some((m) => m.id === v.id)).toBe(false);
    expect(state.room.members.some((m) => m.id === f.id)).toBe(true);
    expect(state.room.seats.O).toBe(f.id);
  });

  it('give up their place to a new arrival when the room is full', () => {
    let state = fresh();
    const ids: string[] = [];
    for (let i = 1; i < MAX_MEMBERS; i += 1) {
      const j = hello(state, { uid: `u${i}`, name: `P${i}`, isGuest: true }, `tab${i}`, i);
      state = j.state;
      ids.push(j.id);
    }
    expect(state.room.members.length).toBe(MAX_MEMBERS);
    const dropped = ids[ids.length - 1];
    expect(Object.values(state.room.seats)).not.toContain(dropped);
    state = onConnectionLost(state, dropped, 100).state;
    const late = hello(state, viewer, 'tablate', 200);
    expect(late.state.room.members.length).toBe(MAX_MEMBERS);
    expect(late.state.room.members.some((m) => m.id === late.id)).toBe(true);
    expect(late.state.room.members.some((m) => m.id === dropped)).toBe(false);
  });

  it('a full room of connected members still turns a newcomer away', () => {
    let state = fresh();
    for (let i = 1; i < MAX_MEMBERS; i += 1) state = hello(state, { uid: `u${i}`, name: `P${i}`, isGuest: true }, `tab${i}`, i).state;
    const result = applyIntent(state, { type: 'HELLO', payload: { profile: viewer, tabId: 'tablate' } }, null, 200);
    expect(result.replies.some((r) => r.message.type === 'ROOM_FULL')).toBe(true);
  });
});

describe('kick for malformed messages', () => {
  it('removes the member and its token, freeing the seat without a result', () => {
    const f = hello(fresh(), friend, 'tabfriend', 1);
    const playing = onCountdownDone(f.state, COUNTDOWN_MS + 1).state;
    const result = kickForMalformed(playing, f.id, COUNTDOWN_MS + 2);
    expect(result.state.room.members.some((m) => m.id === f.id)).toBe(false);
    expect(result.state.host.tokens[f.id]).toBeUndefined();
    expect(result.state.room.seats.O).toBeNull();
    expect(result.state.room.phase).toBe('paused');
    expect(result.state.room.results).toEqual([]);
    expect(result.replies.some((r) => r.to === f.id && r.message.type === 'ROOM_CLOSED')).toBe(true);
    const back = hello(result.state, friend, 'tabfriend', COUNTDOWN_MS + 3, { memberId: f.id, token: f.token });
    expect(back.welcome.resumed).toBe(false);
    expect(back.id).not.toBe(f.id);
  });
});

describe('chat ids', () => {
  const chat = (state: EngineState, from: string, id: string, now: number) =>
    applyIntent(state, { type: 'CHAT', payload: { id, text: `from ${from}` } }, from, now);

  it('rejects an id already used, keeping the original quote', () => {
    const f = hello(fresh(), friend, 'tabfriend', 1);
    const hostId = f.state.host.hostMemberId;
    const first = chat(f.state, hostId, 'msg1', 10);
    const reuse = chat(first.state, f.id, 'msg1', 20);
    expect(reuse.replies).toContainEqual({ to: f.id, message: { type: 'REJECTED', payload: { type: 'CHAT', reason: 'duplicate_id', id: 'msg1' } } });
    expect(reuse.events.some((e) => e.kind === 'broadcast' && e.message.type === 'CHAT')).toBe(false);
    expect(reuse.state.host.recentQuotes.find((q) => q.id === 'msg1')?.senderId).toBe(hostId);
  });

  it('names the rejected message in every CHAT rejection', () => {
    const f = hello(fresh(), friend, 'tabfriend', 1);
    const first = chat(f.state, f.id, 'msg1', 10);
    const fast = chat(first.state, f.id, 'msg2', 11);
    const rejected = fast.replies.find((r) => r.message.type === 'REJECTED');
    expect(rejected?.message.type === 'REJECTED' ? rejected.message.payload.id : null).toBe('msg2');
  });
});

describe('session score', () => {
  it('includes seat T in a three-player key', () => {
    expect(scorePairKey({ X: 'a', O: 'b', T: 'c' }, 'oneVsOneVsOne')).toBe('a|b|c');
    expect(scorePairKey({ X: 'a', O: 'b', T: 'c' }, 'oneVsOne')).toBe('a|b');
  });

  it('resets when the T player is replaced', () => {
    let state = createRoom({ roomId: 'ABCDE', isPublic: false, settings: { ...DEFAULT_ROOM_SETTINGS, playerMode: 'oneVsOneVsOne', turnTimeSeconds: 0, totalTimeMinutes: 0 }, hostProfile: { uid: 'host', name: 'Host' } }, 0);
    for (const uid of ['second', 'third']) state = applyIntent(state, { type: 'HELLO', payload: { profile: { uid, name: uid }, tabId: uid } }, null, 1).state;
    state = onCountdownDone(state, COUNTDOWN_MS + 2).state;
    const { X, O } = state.room.seats;
    // What an earlier game with a different T player left behind under the X|O key.
    state.room.score = { pair: `${X}|${O}`, X: 0, O: 0, T: 5 };
    state.room.game!.moves = [[7, 3], [0, 0], [2, 0], [7, 4], [0, 1], [2, 2], [7, 5], [0, 4], [2, 4], [10, 10]];
    state.room.game!.moves[7] = [0, 2];
    state.room.game!.turn = 'O';
    const result = applyIntent(state, { type: 'MOVE', payload: { gameId: state.room.game!.id, n: state.room.game!.moves.length, row: 0, col: 3 } }, O, 5_000);
    expect(result.state.room.phase).toBe('ended');
    expect(result.state.room.score.T).toBe(0);
    expect(result.state.room.score.O).toBe(1);
  });
});
