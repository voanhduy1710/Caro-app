import { describe, expect, it } from 'vitest';
import { DEFAULT_ROOM_SETTINGS } from '../settings/types';
import { applyIntent, createRoom, onConnectionLost } from './roomEngine';
import type { EngineState } from './roomEngine';

const host = { uid: 'host-uid', name: 'Host', isGuest: false };
const guest = { uid: 'guest-uid', name: 'Guest 5154', isGuest: true };
const account = { uid: 'friend-uid', name: 'Friend', isGuest: false };
const viewer = { uid: 'viewer-uid', name: 'Viewer', isGuest: true };

const hello = (state: EngineState, profile: object, tabId: string, now: number) => {
  const result = applyIntent(state, { type: 'HELLO', payload: { profile, tabId } }, null, now);
  const bind = result.events.find((e) => e.kind === 'bind');
  if (!bind || bind.kind !== 'bind') throw new Error('not joined');
  return { state: result.state, id: bind.memberId, result };
};

const fresh = () => createRoom({ roomId: 'ABCDE', isPublic: true, settings: DEFAULT_ROOM_SETTINGS, hostProfile: host, hostTabId: 'tabhost' }, 0);

describe('seat held by a dropped member', () => {
  it('goes to the next arrival while the room is waiting', () => {
    let state = fresh();
    const g = hello(state, guest, 'tabguest', 1);
    // The guest is O; drop them so they hold the seat in grace.
    state = onConnectionLost(g.state, g.id, 2).state;
    expect(state.room.seats.O).toBe(g.id);
    const f = hello(state, account, 'tabfriend', 3);
    expect(f.state.room.seats.O).toBe(f.id);
  });

  it('can be taken by someone already watching', () => {
    let state = fresh();
    const g = hello(state, guest, 'tabguest', 1);
    const v = hello(g.state, viewer, 'tabviewer', 2);
    expect(v.state.room.seats.O).toBe(g.id);
    state = onConnectionLost(v.state, g.id, 3).state;
    state = applyIntent(state, { type: 'TAKE_SEAT', payload: { seat: 'O' } }, v.id, 4).state;
    expect(state.room.seats.O).toBe(v.id);
  });

  it('stays protected while it is connected', () => {
    const g = hello(fresh(), guest, 'tabguest', 1);
    const v = hello(g.state, viewer, 'tabviewer', 2);
    const result = applyIntent(v.state, { type: 'TAKE_SEAT', payload: { seat: 'O' } }, v.id, 3);
    expect(result.state.room.seats.O).toBe(g.id);
    expect(result.replies.some((r) => r.message.type === 'REJECTED')).toBe(true);
  });
});

describe('KICK_MEMBER', () => {
  it('lets the host remove anyone, freeing the seat and the place', () => {
    const g = hello(fresh(), guest, 'tabguest', 1);
    const hostId = g.state.host.hostMemberId;
    const result = applyIntent(g.state, { type: 'KICK_MEMBER', payload: { memberId: g.id } }, hostId, 2);
    expect(result.state.room.members.some((m) => m.id === g.id)).toBe(false);
    expect(result.state.room.seats.O).toBeNull();
    expect(result.replies).toContainEqual({ to: g.id, message: { type: 'ROOM_CLOSED', payload: { reason: 'kicked', hostName: 'Host' } } });
  });

  it('removes a member stuck reconnecting', () => {
    const g = hello(fresh(), guest, 'tabguest', 1);
    const v = hello(g.state, viewer, 'tabviewer', 2);
    const state = onConnectionLost(v.state, v.id, 3).state;
    const result = applyIntent(state, { type: 'KICK_MEMBER', payload: { memberId: v.id } }, state.host.hostMemberId, 4);
    expect(result.state.room.members.some((m) => m.id === v.id)).toBe(false);
  });

  it('is host only and cannot target the host', () => {
    const g = hello(fresh(), guest, 'tabguest', 1);
    const v = hello(g.state, viewer, 'tabviewer', 2);
    const hostId = v.state.host.hostMemberId;
    const byMember = applyIntent(v.state, { type: 'KICK_MEMBER', payload: { memberId: g.id } }, v.id, 3);
    expect(byMember.state.room.members.some((m) => m.id === g.id)).toBe(true);
    const atHost = applyIntent(v.state, { type: 'KICK_MEMBER', payload: { memberId: hostId } }, hostId, 3);
    expect(atHost.state.room.members.some((m) => m.id === hostId)).toBe(true);
  });
});

describe('chat replies', () => {
  const chat = (state: EngineState, from: string, id: string, text: string, replyTo?: string, now = 10) =>
    applyIntent(state, { type: 'CHAT', payload: { id, text, ...(replyTo ? { replyTo } : {}) } }, from, now);
  const sent = (result: ReturnType<typeof chat>) => {
    const event = result.events.find((e) => e.kind === 'broadcast' && e.message.type === 'CHAT');
    if (!event || event.kind !== 'broadcast' || event.message.type !== 'CHAT') throw new Error('no chat');
    return event.message.payload.message;
  };

  it('quotes the answered message as the host saw it', () => {
    const g = hello(fresh(), guest, 'tabguest', 1);
    const hostId = g.state.host.hostMemberId;
    const first = chat(g.state, g.id, 'msg1', 'vl ác =))', undefined, 10);
    const reply = sent(chat(first.state, hostId, 'msg2', 'haha', 'msg1', 20));
    expect(reply.replyTo).toEqual({ id: 'msg1', senderId: g.id, sender: 'Guest 5154', text: 'vl ác =))', hasImage: false });
  });

  it('drops a reply to a message the host does not know', () => {
    const g = hello(fresh(), guest, 'tabguest', 1);
    const reply = sent(chat(g.state, g.id, 'msg2', 'haha', 'nosuchmsg'));
    expect(reply.replyTo).toBeUndefined();
  });
});

describe('chat read receipts', () => {
  const chat = (state: EngineState, from: string, id: string, now: number) =>
    applyIntent(state, { type: 'CHAT', payload: { id, text: 'hi' } }, from, now).state;
  const seen = (state: EngineState, from: string, messageId: string, now = 2_000) =>
    applyIntent(state, { type: 'CHAT_SEEN', payload: { messageId } }, from, now);
  const receipts = (result: ReturnType<typeof seen>) =>
    result.events.filter((e) => e.kind === 'broadcast' && e.message.type === 'CHAT_SEEN');

  const room = () => {
    const g = hello(fresh(), guest, 'tabguest', 1);
    const v = hello(g.state, viewer, 'tabviewer', 2);
    const hostId = v.state.host.hostMemberId;
    let state = chat(v.state, hostId, 'msg1', 10);
    state = chat(state, hostId, 'msg2', 1_000);
    return { state, hostId, playerId: g.id, viewerId: v.id };
  };

  it('records and broadcasts what a seated player has read', () => {
    const { state, playerId } = room();
    const result = seen(state, playerId, 'msg2');
    expect(result.state.host.chatSeen[playerId]).toBe('msg2');
    expect(receipts(result)).toEqual([
      { kind: 'broadcast', message: { type: 'CHAT_SEEN', payload: { memberId: playerId, messageId: 'msg2' } }, except: [playerId] },
    ]);
  });

  it('ignores a viewer', () => {
    const { state, viewerId } = room();
    const result = seen(state, viewerId, 'msg2');
    expect(result.state.host.chatSeen[viewerId]).toBeUndefined();
    expect(receipts(result)).toEqual([]);
    expect(result.replies.some((r) => r.message.type === 'REJECTED')).toBe(false);
  });

  it('only moves forward and only to a message the host knows', () => {
    const { state, playerId } = room();
    const read = seen(state, playerId, 'msg2').state;
    const back = seen(read, playerId, 'msg1');
    expect(back.state.host.chatSeen[playerId]).toBe('msg2');
    expect(receipts(back)).toEqual([]);
    const unknown = seen(read, playerId, 'nosuchmsg');
    expect(unknown.state.host.chatSeen[playerId]).toBe('msg2');
    expect(receipts(unknown)).toEqual([]);
  });

  it('hands a rejoining member the receipts in WELCOME', () => {
    const { state, playerId } = room();
    const read = seen(state, playerId, 'msg1').state;
    const late = hello(read, account, 'tablate', 3_000);
    const welcome = late.result.replies.find((r) => r.message.type === 'WELCOME');
    expect(welcome?.message.type === 'WELCOME' ? welcome.message.payload.chatSeen : null).toEqual({ [playerId]: 'msg1' });
  });
});
