import { describe, expect, it } from 'vitest';
import { DEFAULT_ROOM_SETTINGS } from '../settings/types';
import { applyIntent, coinCallerSeat, createRoom, toWire } from './roomEngine';
import type { EngineState } from './roomEngine';

const host = { uid: 'host-uid', name: 'Host', isGuest: false };
const friend = { uid: 'friend-uid', name: 'Friend', isGuest: false };
const viewer = { uid: 'viewer-uid', name: 'Viewer', isGuest: false };

const RPS = { ...DEFAULT_ROOM_SETTINGS, firstMoveMethod: 'rockPaperScissors' as const };
const COIN = { ...DEFAULT_ROOM_SETTINGS, firstMoveMethod: 'coinFlip' as const };

const hello = (state: EngineState, profile: object, tabId: string, now: number) => {
  const result = applyIntent(state, { type: 'HELLO', payload: { profile, tabId } }, null, now);
  const bind = result.events.find((e) => e.kind === 'bind');
  if (!bind || bind.kind !== 'bind') throw new Error('not joined');
  return { state: result.state, id: bind.memberId, result };
};

const rpsOpening = () => {
  const created = createRoom({ roomId: 'ABCDE', isPublic: true, settings: RPS, hostProfile: host, hostTabId: 'tabhost' }, 0);
  const f = hello(created, friend, 'tabfriend', 1);
  return { state: f.state, hostId: created.host.hostMemberId, friendId: f.id, gameId: f.state.room.game!.id };
};

describe('rock paper scissors on the wire', () => {
  it('hides a first pick from everyone but the player who made it', () => {
    const { state, hostId, friendId, gameId } = rpsOpening();
    expect(state.room.phase).toBe('opening');
    const picked = applyIntent(state, { type: 'FIRST_MOVE_CHOICE', payload: { gameId, choice: 'rock' } }, friendId, 2).state;
    expect(picked.room.game!.firstMove.choices).toEqual({ X: null, O: 'rock' });

    const forHost = toWire(picked, 3, hostId).game!.firstMove;
    expect(forHost.choices).toEqual({ X: null, O: null });
    expect(forHost.chosen).toEqual({ X: false, O: true });

    const forViewer = toWire(picked, 3).game!.firstMove;
    expect(forViewer.choices).toEqual({ X: null, O: null });

    const forChooser = toWire(picked, 3, friendId).game!.firstMove;
    expect(forChooser.choices).toEqual({ X: null, O: 'rock' });
  });

  it('reveals both picks once both are in', () => {
    const { state, hostId, friendId, gameId } = rpsOpening();
    const one = applyIntent(state, { type: 'FIRST_MOVE_CHOICE', payload: { gameId, choice: 'rock' } }, friendId, 2).state;
    const both = applyIntent(one, { type: 'FIRST_MOVE_CHOICE', payload: { gameId, choice: 'paper' } }, hostId, 3).state;
    expect(both.room.phase).toBe('countdown');
    expect(toWire(both, 4).game!.firstMove.choices).toEqual({ X: 'paper', O: 'rock' });
    expect(toWire(both, 4).game!.firstMove.winner).toBe('X');
  });

  it('never changes the host’s own state', () => {
    const { state, friendId, gameId } = rpsOpening();
    const picked = applyIntent(state, { type: 'FIRST_MOVE_CHOICE', payload: { gameId, choice: 'rock' } }, friendId, 2).state;
    toWire(picked, 3);
    expect(picked.room.game!.firstMove.choices).toEqual({ X: null, O: 'rock' });
  });
});

describe('a seat emptied during the opening', () => {
  it('sends the room back to waiting, so nobody inherits the leaver’s pick', () => {
    const { state, friendId, gameId } = rpsOpening();
    const picked = applyIntent(state, { type: 'FIRST_MOVE_CHOICE', payload: { gameId, choice: 'rock' } }, friendId, 2).state;
    const stood = applyIntent(picked, { type: 'LEAVE_SEAT', payload: {} }, friendId, 3).state;
    expect(stood.room.phase).toBe('waiting');
    expect(stood.room.game).toBeNull();
    const v = hello(stood, viewer, 'tabviewer', 4);
    expect(v.state.room.seats.O).toBe(v.id);
    expect(v.state.room.phase).toBe('opening');
    expect(v.state.room.game!.firstMove.choices).toEqual({ X: null, O: null });
  });

  it('also resets when the host clears the seat', () => {
    const { state, hostId } = rpsOpening();
    const cleared = applyIntent(state, { type: 'CLEAR_SEAT', payload: { seat: 'O' } }, hostId, 3).state;
    expect(cleared.room.phase).toBe('waiting');
    expect(cleared.room.game).toBeNull();
  });
});

describe('coin call with the host not playing', () => {
  it('lets X call the first toss', () => {
    const created = createRoom({ roomId: 'ABCDE', isPublic: true, settings: COIN, hostProfile: host, hostTabId: 'tabhost' }, 0);
    const hostId = created.host.hostMemberId;
    const stood = applyIntent(created, { type: 'LEAVE_SEAT', payload: {} }, hostId, 1).state;
    const f = hello(stood, friend, 'tabfriend', 2);
    const v = hello(f.state, viewer, 'tabviewer', 3);
    expect(v.state.room.seats).toMatchObject({ X: f.id, O: v.id });
    expect(v.state.room.phase).toBe('opening');
    expect(coinCallerSeat(v.state.room, v.state.room.game!)).toBe('X');
    const gameId = v.state.room.game!.id;
    const called = applyIntent(v.state, { type: 'COIN_CALL', payload: { gameId, call: 'X' } }, f.id, 4);
    expect(called.replies.some((r) => r.message.type === 'REJECTED')).toBe(false);
    expect(called.state.room.phase).toBe('countdown');
  });

  it('still lets the seated host call the first toss and the other player the second', () => {
    const created = createRoom({ roomId: 'ABCDE', isPublic: true, settings: COIN, hostProfile: host, hostTabId: 'tabhost' }, 0);
    const f = hello(created, friend, 'tabfriend', 1);
    const game = f.state.room.game!;
    expect(coinCallerSeat(f.state.room, game)).toBe('X');
    expect(coinCallerSeat(f.state.room, { ...game, number: 2 })).toBe('O');
    const hostIsO = { ...f.state.room, seats: { X: f.id, O: created.host.hostMemberId, T: null } };
    expect(coinCallerSeat(hostIsO, game)).toBe('O');
  });
});
