import { beforeEach, describe, expect, it } from 'vitest';
import type { RoomSettings } from '../settings/types';
import {
  ROOM_CODE_PATTERN as SOURCE_ROOM_CODE_PATTERN,
  parseRoomCode as sourceParseRoomCode,
} from '../webrtc/roomCode';
import {
  ROOM_CODE_PATTERN,
  isValidIntent,
  parseIntent,
  parseRoomCode,
  sanitizeProfile,
} from './protocol';
import type { EventKind, HostMessage, Intent, IntentPayloads, IntentType, RejectReason } from './protocol';
import {
  CHAT_IMAGE_MAX,
  COUNTDOWN_MS,
  DISCARD_GUARD_MS,
  GRACE_MS,
  INSTANT_UNDO_MS,
  LOST_AFTER_MS,
  MAX_MEMBERS,
  OFFER_TTL_MS,
  REFUND_AFTER_LAST_SEEN_MS,
  RESULTS_CEILING,
  SEAT_LOG_CAP,
  STALE_MOVER_MS,
  applyIntent,
  boardFromMoves,
  bothSeatedAndConnected,
  checkInvariants,
  clockSync,
  createRoom,
  dedupeName,
  latestResult,
  liveClocks,
  noteMalformed,
  occupant,
  onConnectionLost,
  onCountdownDone,
  onGraceExpired,
  pieceAt,
  ratingDecision,
  restore,
  seatOf,
  snapshot,
  tick,
  toWire,
} from './roomEngine';
import type { EngineEnv, EngineResult, EngineState, Game, PlayerRef } from './roomEngine';

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

let counter = 0;
/** Predictable ids and tokens, so a failing test prints the same state every run. */
const env: EngineEnv = {
  randomId: (length) => {
    counter += 1;
    const s = counter.toString(36);
    return 'z'.repeat(Math.max(0, length - s.length)) + s;
  },
  randomToken: () => {
    counter += 1;
    return `token${counter}`;
  },
};

const UID = {
  A: '11111111-1111-4111-8111-111111111111',
  B: '22222222-2222-4222-8222-222222222222',
  C: '33333333-3333-4333-8333-333333333333',
  D: '44444444-4444-4444-8444-444444444444',
};

const registered = (name: string, uid: string) => ({ uid, name, avatar: 'Ahri', isGuest: false });
const guest = (name: string, uid: string) => ({ uid, name, avatar: null, isGuest: true });

const T0 = 1_700_000_000_000;
const OPEN: RoomSettings = { boardSize: 15, totalTimeMinutes: 0, turnTimeSeconds: 0, allowUndo: true };
const TIMED: RoomSettings = { boardSize: 15, totalTimeMinutes: 5, turnTimeSeconds: 30, allowUndo: true };

const rejections = (r: EngineResult): RejectReason[] =>
  r.replies.flatMap((x) => (x.message.type === 'REJECTED' ? [x.message.payload.reason] : []));

const eventsTo = (r: EngineResult, memberId: string): EventKind[] =>
  r.replies.flatMap((x) => (x.to === memberId && x.message.type === 'EVENT' ? [x.message.payload.kind] : []));

const broadcasts = (r: EngineResult, type: HostMessage['type']): HostMessage[] =>
  r.events.flatMap((e) => (e.kind === 'broadcast' && e.message.type === type ? [e.message] : []));

const hasRoomState = (r: EngineResult) => r.events.some((e) => e.kind === 'room_state');

class Room {
  s: EngineState;
  now = T0;
  last!: EngineResult;
  claims: Record<string, unknown> = {};
  tokens: Record<string, string> = {};
  tabs: Record<string, string> = {};
  private tabCounter = 0;

  constructor(settings: RoomSettings = OPEN, hostClaim: unknown = registered('Alice', UID.A)) {
    this.s = createRoom({ roomId: 'ABC123', isPublic: true, settings, hostProfile: hostClaim }, this.now, env);
    expect(checkInvariants(this.s)).toEqual([]);
    this.claims[this.hostId] = hostClaim;
  }

  get hostId() {
    return this.s.host.hostMemberId;
  }

  get room() {
    return this.s.room;
  }

  get game(): Game {
    const g = this.s.room.game;
    if (!g) throw new Error('expected a game');
    return g;
  }

  apply(r: EngineResult): EngineResult {
    expect(checkInvariants(r.state)).toEqual([]);
    this.s = r.state;
    this.last = r;
    return r;
  }

  act<K extends IntentType>(from: string | null, type: K, payload: IntentPayloads[K]): EngineResult {
    return this.apply(applyIntent(this.s, { type, payload } as Intent, from, this.now, env));
  }

  /** Joins with a fresh tab, or resumes when `resume` names a member. Returns the member id. */
  hello(profile: unknown, opts: { resumeAs?: string; tabId?: string } = {}): string {
    this.tabCounter += 1;
    const tabId = opts.tabId ?? `tab${this.tabCounter}`;
    const resume = opts.resumeAs ? { memberId: opts.resumeAs, token: this.tokens[opts.resumeAs] } : undefined;
    const r = this.act(null, 'HELLO', { profile, tabId, ...(resume ? { resume } : {}) });
    const welcome = r.replies.find((x) => x.message.type === 'WELCOME');
    if (!welcome || welcome.message.type !== 'WELCOME') throw new Error('expected WELCOME');
    const { memberId, token } = welcome.message.payload;
    this.claims[memberId] = profile;
    this.tokens[memberId] = token;
    this.tabs[memberId] = tabId;
    return memberId;
  }

  resume(memberId: string, tabId = this.tabs[memberId]): string {
    return this.hello(this.claims[memberId], { resumeAs: memberId, tabId });
  }

  advance(ms: number) {
    this.now += ms;
  }

  tick() {
    return this.apply(tick(this.s, this.now, env));
  }

  countIn() {
    this.advance(COUNTDOWN_MS);
    return this.apply(onCountdownDone(this.s, this.now, env));
  }

  lost(memberId: string) {
    return this.apply(onConnectionLost(this.s, memberId, this.now, env));
  }

  graceOut(memberId: string) {
    return this.apply(onGraceExpired(this.s, memberId, this.now, env));
  }

  pong(...ids: string[]) {
    for (const id of ids) this.act(id, 'PONG', { t: this.now });
  }

  move(from: string, row: number, col: number) {
    const g = this.game;
    return this.act(from, 'MOVE', { gameId: g.id, n: g.moves.length, row, col });
  }

  wire() {
    return toWire(this.s, this.now);
  }

  clocks() {
    const g = this.wire().game;
    if (!g) throw new Error('expected a game');
    return g.clocks;
  }
}

/** Alice hosts in X, Bob joins into O, the count-in runs, and play starts. */
const playing = (settings: RoomSettings = OPEN, bobClaim: unknown = registered('Bob', UID.B)) => {
  const room = new Room(settings);
  const A = room.hostId;
  const B = room.hello(bobClaim);
  expect(room.room.phase).toBe('countdown');
  room.countIn();
  expect(room.room.phase).toBe('playing');
  return { room, A, B };
};

/** X wins on row 7; O plays along row 0. */
const scriptedWin = (room: Room, x: string, o: string) => {
  const xs: Array<[number, number]> = [[7, 3], [7, 4], [7, 5], [7, 6], [7, 7]];
  const os: Array<[number, number]> = [[0, 0], [0, 1], [0, 2], [0, 3]];
  for (let i = 0; i < xs.length; i += 1) {
    room.move(x, ...xs[i]);
    if (i < os.length) room.move(o, ...os[i]);
  }
};

beforeEach(() => {
  counter = 0;
});

// ---------------------------------------------------------------------------
// protocol.ts
// ---------------------------------------------------------------------------

describe('protocol', () => {
  it('re-exports the one room code rule instead of copying it', () => {
    expect(ROOM_CODE_PATTERN).toBe(SOURCE_ROOM_CODE_PATTERN);
    expect(parseRoomCode).toBe(sourceParseRoomCode);
    expect(parseRoomCode('https://caro.app/?room=abc123')).toBe('ABC123');
  });

  describe('sanitizeProfile', () => {
    it('keeps champion avatars, normalised to the champion id', () => {
      expect(sanitizeProfile({ uid: 'u1', avatar: 'ahri' })?.avatar).toBe('Ahri');
      expect(sanitizeProfile({ uid: 'u1', avatar: 'Avatar/Ahri.gif' })?.avatar).toBe('Ahri');
      expect(
        sanitizeProfile({ uid: 'u1', avatar: 'https://ddragon.leagueoflegends.com/cdn/14.1.1/img/champion/Jinx.png' })
          ?.avatar,
      ).toBe('Jinx');
    });

    it('keeps https Google photos and drops every other URL', () => {
      const photo = 'https://lh3.googleusercontent.com/a/abc=s96-c';
      expect(sanitizeProfile({ uid: 'u1', avatar: photo })?.avatar).toBe(photo);
      for (const avatar of [
        'http://lh3.googleusercontent.com/a/abc',
        'https://evil.example/track.png',
        'https://googleusercontent.com.evil.example/x.png',
        'https://user:pw@lh3.googleusercontent.com/a',
        'javascript:alert(1)',
        `https://lh3.googleusercontent.com/${'a'.repeat(400)}`,
        42,
        { src: 'x' },
      ]) {
        expect(sanitizeProfile({ uid: 'u1', avatar })?.avatar).toBeNull();
      }
    });

    it('trims names to 40 code points, strips invisible characters and falls back to Guest', () => {
      const long = '😀'.repeat(50);
      const name = sanitizeProfile({ uid: 'u1', name: long })?.name ?? '';
      expect(Array.from(name)).toHaveLength(40);
      expect(sanitizeProfile({ uid: 'u1', name: '  Bob‮​  ' })?.name).toBe('Bob');
      expect(sanitizeProfile({ uid: 'u1', name: '   ' })?.name).toBe('Guest');
      expect(sanitizeProfile({ uid: 'u1', name: 7 })?.name).toBe('Guest');
    });

    it('rejects unusable uids and rates only registered server accounts', () => {
      expect(sanitizeProfile({ uid: 'bad uid' })).toBeNull();
      expect(sanitizeProfile({ uid: '' })).toBeNull();
      expect(sanitizeProfile(null)).toBeNull();
      expect(sanitizeProfile({ uid: UID.A, isGuest: false })?.rated).toBe(true);
      expect(sanitizeProfile({ uid: UID.A })?.rated).toBe(false);
      const local = sanitizeProfile({ uid: 'user_42', isGuest: false });
      expect(local?.rated).toBe(false);
      expect(local?.guest).toBe(false);
    });

    it('clamps numeric stats', () => {
      const p = sanitizeProfile({ uid: 'u1', elo: 1e9, wins: -3, losses: Number.NaN, draws: '4', streak: 5 });
      expect(p?.elo).toBe(10_000);
      expect(p?.wins).toBe(0);
      expect(p?.losses).toBeUndefined();
      expect(p?.draws).toBeUndefined();
      expect(p?.streak).toBe(5);
    });
  });

  it('validates intent shapes and the v2 envelope', () => {
    expect(isValidIntent('TAKE_SEAT', { seat: 'X' })).toBe(true);
    expect(isValidIntent('TAKE_SEAT', { seat: 'Z' })).toBe(false);
    expect(isValidIntent('MOVE', { gameId: 'g1', n: 0, row: 1, col: 2 })).toBe(true);
    expect(isValidIntent('MOVE', { gameId: 'g1', n: 0, row: 1.5, col: 2 })).toBe(false);
    expect(isValidIntent('MOVE', { gameId: 'g1', n: -1, row: 1, col: 2 })).toBe(false);
    expect(isValidIntent('HELLO', { profile: {}, tabId: 't1' })).toBe(true);
    expect(isValidIntent('HELLO', { profile: {}, tabId: 't1', resume: { memberId: 'm', token: 5 } })).toBe(false);
    expect(isValidIntent('TEASE', { targetMemberId: 'abc' })).toBe(true);
    expect(isValidIntent('TEASE', {})).toBe(false);
    expect(isValidIntent('CLEAR_SEAT', { seat: 'O' })).toBe(true);
    expect(isValidIntent('DISCARD_GAME', { gameId: 'g1' })).toBe(true);
    expect(isValidIntent('RATING_REPORT', { gameId: 'g1', status: 'saved', deltas: { X: 5, O: -5 } })).toBe(true);
    expect(isValidIntent('RATING_REPORT', { gameId: 'g1', status: 'won' })).toBe(false);
    expect(isValidIntent('UPDATE_SETTINGS', { settings: { boardSize: 15 } })).toBe(false);
    expect(isValidIntent('JOIN_REQUEST', {})).toBe(false);
    expect(isValidIntent('toString', {})).toBe(false);
    expect(isValidIntent('BUZZ', null)).toBe(false);
    expect(parseIntent({ v: 2, type: 'BUZZ', payload: {} })).toEqual({ type: 'BUZZ', payload: {} });
    expect(parseIntent({ type: 'LEAVE_ROOM', payload: {} })).toBeNull();
    expect(parseIntent({ v: 1, type: 'BUZZ', payload: {} })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Derived helpers
// ---------------------------------------------------------------------------

describe('derived helpers', () => {
  it('builds boards and pieces from moves', () => {
    const board = boardFromMoves([[0, 0], [1, 1], [2, 2]], 15);
    expect(board[0][0]).toBe('X');
    expect(board[1][1]).toBe('O');
    expect(board[2][2]).toBe('X');
    expect(pieceAt(4)).toBe('X');
    expect(pieceAt(5)).toBe('O');
  });

  it('extrapolates only running clocks, and only for the side to move', () => {
    const game = {
      clocks: { X: 60_000, O: 60_000, turn: 30_000, elapsed: 1_000, running: true },
      turn: 'O' as const,
      settings: TIMED,
    };
    expect(liveClocks(game, 2_500)).toEqual({ X: 60_000, O: 57_500, turn: 27_500, elapsed: 3_500, running: true });
    expect(liveClocks({ ...game, clocks: { ...game.clocks, running: false } }, 2_500).O).toBe(60_000);
    expect(liveClocks({ ...game, settings: OPEN, clocks: { ...game.clocks, X: 0, O: 0, turn: 0 } }, 2_500)).toEqual({
      X: 0,
      O: 0,
      turn: 0,
      elapsed: 3_500,
      running: true,
    });
  });

  it('dedupes names with " (2)" and keeps the result within 40 code points', () => {
    expect(dedupeName('Alice', ['Bob'])).toBe('Alice');
    expect(dedupeName('alice', ['Alice'])).toBe('alice (2)');
    expect(dedupeName('Alice', ['Alice', 'Alice (2)'])).toBe('Alice (3)');
    const long = 'x'.repeat(40);
    const deduped = dedupeName(long, [long]);
    expect(Array.from(deduped).length).toBeLessThanOrEqual(40);
    expect(deduped.endsWith(' (2)')).toBe(true);
  });

  describe('ratingDecision', () => {
    const ref = (seat: string, rated: boolean, isGuest = !rated): PlayerRef => ({
      memberId: `m${seat}`,
      uid: `u${seat}`,
      name: seat,
      rated,
      guest: isGuest,
    });

    it('has the loser submit a decisive result', () => {
      expect(ratingDecision({ winner: 'X', players: { X: ref('X', true), O: ref('O', true) } })).toEqual({
        rated: true,
        submitters: ['O'],
      });
      expect(ratingDecision({ winner: 'O', players: { X: ref('X', true), O: ref('O', true) } })).toEqual({
        rated: true,
        submitters: ['X'],
      });
    });

    it('has both registered players attempt a draw', () => {
      expect(ratingDecision({ winner: 'DRAW', players: { X: ref('X', true), O: ref('O', true) } })).toEqual({
        rated: true,
        submitters: ['X', 'O'],
      });
    });

    it('leaves a game with a guest or a local account unrated, and says which', () => {
      expect(ratingDecision({ winner: 'X', players: { X: ref('X', true), O: ref('O', false) } })).toEqual({
        rated: false,
        why: 'guest',
        guestSeats: ['O'],
      });
      expect(ratingDecision({ winner: 'X', players: { X: ref('X', false, false), O: ref('O', true) } })).toEqual({
        rated: false,
        why: 'local_account',
        guestSeats: ['X'],
      });
    });
  });

  it('catches broken invariants', () => {
    const { room } = playing();
    const broken = structuredClone(room.s);
    broken.room.phase = 'waiting';
    expect(checkInvariants(broken).length).toBeGreaterThan(0);
    const paused = structuredClone(room.s);
    paused.room.phase = 'paused';
    expect(checkInvariants(paused)).toContain('clocks running outside playing');
    const twice = structuredClone(room.s);
    twice.room.seats.O = twice.room.seats.X;
    expect(checkInvariants(twice)).toContain('one member in both seats');
  });
});

// ---------------------------------------------------------------------------
// 4.1 Join
// ---------------------------------------------------------------------------

describe('join (4.1)', () => {
  it('creates the room with the host seated in X and auto-start armed', () => {
    const room = new Room();
    expect(room.room.seats).toEqual({ X: room.hostId, O: null });
    expect(room.room.phase).toBe('waiting');
    expect(room.room.autoStartArmed).toBe(true);
    expect(room.room.members[0].isHost).toBe(true);
  });

  it('seats a newcomer to a waiting room and starts a count-in', () => {
    const room = new Room();
    const B = room.hello(registered('Bob', UID.B));
    expect(room.room.seats.O).toBe(B);
    expect(room.room.phase).toBe('countdown');
    expect(room.room.countdown?.resuming).toBe(false);
    expect(room.room.autoStartArmed).toBe(false);
    expect(room.game.number).toBe(1);
    expect(room.game.startedWith.O.memberId).toBe(B);
    const welcome = room.last.replies.find((r) => r.message.type === 'WELCOME');
    expect(welcome?.to).toBe(B);
    expect(room.last.events).toContainEqual({ kind: 'bind', memberId: B, supersede: false });
    expect(room.last.events).toContainEqual({ kind: 'room_state', except: [B] });
    expect(room.wire().countdown?.msLeft).toBe(COUNTDOWN_MS);
  });

  it('makes later arrivals viewers while playing, paused or ended', () => {
    const { room, B } = playing();
    const C = room.hello(registered('Cara', UID.C));
    expect(seatOf(room.s, C)).toBeNull();
    room.act(B, 'LEAVE_SEAT', {});
    expect(room.room.phase).toBe('paused');
    const D = room.hello(registered('Dan', UID.D));
    expect(seatOf(room.s, D)).toBeNull();
    expect(room.room.seats.O).toBeNull();
  });

  it('never auto-seats the same account into the other seat', () => {
    const room = new Room();
    const twin = room.hello(registered('Alice again', UID.A));
    expect(seatOf(room.s, twin)).toBeNull();
    expect(room.room.seats.O).toBeNull();
    expect(room.room.phase).toBe('waiting');
    room.act(twin, 'TAKE_SEAT', { seat: 'O' });
    expect(rejections(room.last)).toEqual(['same_account']);
  });

  it('de-duplicates display names', () => {
    const room = new Room();
    const B = room.hello(registered('alice', UID.B));
    expect(occupant(room.s, 'O')?.id).toBe(B);
    expect(room.room.members.find((m) => m.id === B)?.profile.name).toBe('alice (2)');
  });

  it('turns away the ninth member with ROOM_FULL', () => {
    const room = new Room();
    for (let i = 1; i < MAX_MEMBERS; i += 1) room.hello(guest(`G${i}`, `guest_${i}`));
    expect(room.room.members).toHaveLength(MAX_MEMBERS);
    const r = room.act(null, 'HELLO', { profile: guest('Late', 'guest_late'), tabId: 'tabLate' });
    expect(r.replies).toEqual([{ to: null, message: { type: 'ROOM_FULL', payload: { capacity: MAX_MEMBERS } } }]);
    expect(r.events).toContainEqual({ kind: 'close', memberId: null });
    expect(room.room.members).toHaveLength(MAX_MEMBERS);
  });

  it('refuses a HELLO without a usable profile and closes the connection', () => {
    const room = new Room();
    const r = room.act(null, 'HELLO', { profile: { uid: 'no spaces allowed' }, tabId: 't' });
    expect(rejections(r)).toEqual(['bad_profile']);
    expect(r.events).toContainEqual({ kind: 'close', memberId: null });
  });

  it('resumes with the token, keeping the member and seat; a same-tab reconnect is not superseded', () => {
    const { room, B } = playing();
    room.lost(B);
    expect(room.room.phase).toBe('paused');
    room.advance(5_000);
    expect(room.wire().members.find((m) => m.id === B)?.graceMsLeft).toBe(GRACE_MS - 5_000);
    const again = room.resume(B);
    expect(again).toBe(B);
    expect(room.last.events).toContainEqual({ kind: 'bind', memberId: B, supersede: false });
    const welcome = room.last.replies.find((r) => r.message.type === 'WELCOME');
    expect(welcome?.message.type === 'WELCOME' && welcome.message.payload.resumed).toBe(true);
    expect(room.room.seats.O).toBe(B);
    expect(room.room.phase).toBe('countdown');
    expect(room.room.countdown?.resuming).toBe(true);
  });

  it('supersedes the old connection when the same token arrives from another tab', () => {
    const { room, B } = playing();
    room.resume(B, 'another-tab');
    expect(room.last.events).toContainEqual({ kind: 'bind', memberId: B, supersede: true });
    expect(room.room.phase).toBe('playing');
  });

  it('treats an unknown resume as a new member and flags it expired', () => {
    const room = new Room();
    const r = room.act(null, 'HELLO', {
      profile: registered('Bob', UID.B),
      tabId: 't',
      resume: { memberId: 'gone', token: 'nope' },
    });
    const welcome = r.replies.find((x) => x.message.type === 'WELCOME');
    expect(welcome?.message.type === 'WELCOME' && welcome.message.payload.expired).toBe(true);
    expect(room.room.members).toHaveLength(2);
  });

  it('refuses intents from unknown senders without touching the state', () => {
    const room = new Room();
    const r = applyIntent(room.s, { type: 'BUZZ', payload: {} }, 'stranger', room.now, env);
    expect(r.state).toBe(room.s);
    expect(rejections(r)).toEqual(['not_member']);
  });

  it('hands out a WELCOME and a ROOM_STATE that carry nothing host-private', () => {
    const room = new Room();
    room.hello(registered('Bob', UID.B));
    const text = JSON.stringify(room.last.replies);
    expect(text).not.toContain('tokens');
    expect(text).not.toContain('lastSeenAt');
    expect(JSON.stringify(room.wire())).not.toMatch(/token\d/);
  });
});

// ---------------------------------------------------------------------------
// 4.2 / 4.3 Auto-start and the count-in
// ---------------------------------------------------------------------------

describe('count-in (4.2, 4.3)', () => {
  it('starts play with full clocks once the count-in is done', () => {
    const room = new Room(TIMED);
    room.hello(registered('Bob', UID.B));
    room.countIn();
    expect(room.room.phase).toBe('playing');
    expect(room.game.clocks).toEqual({ X: 300_000, O: 300_000, turn: 30_000, elapsed: 0, running: true });
  });

  it('ignores a stale count-in callback that fires early', () => {
    const room = new Room();
    room.hello(registered('Bob', UID.B));
    room.advance(COUNTDOWN_MS - 1);
    const r = room.apply(onCountdownDone(room.s, room.now, env));
    expect(r.state.room.phase).toBe('countdown');
    expect(r.events).toEqual([]);
  });

  it('LEAVE_SEAT during a fresh count-in drops the game and re-arms auto-start', () => {
    const room = new Room();
    const B = room.hello(registered('Bob', UID.B));
    room.act(B, 'LEAVE_SEAT', {});
    expect(room.room.phase).toBe('waiting');
    expect(room.room.game).toBeNull();
    expect(room.room.autoStartArmed).toBe(true);
    expect(room.room.seats.O).toBeNull();
    expect(broadcasts(room.last, 'EVENT')).toEqual([{ type: 'EVENT', payload: { kind: 'seat_opened', seat: 'O' } }]);
    room.act(B, 'TAKE_SEAT', { seat: 'O' });
    expect(room.room.phase).toBe('countdown');
  });

  it('LEAVE_SEAT during a resuming count-in goes back to paused and logs the seat change', () => {
    const { room, B } = playing();
    room.move(room.hostId, 7, 7);
    room.lost(B);
    room.resume(B);
    expect(room.room.countdown?.resuming).toBe(true);
    room.act(B, 'LEAVE_SEAT', {});
    expect(room.room.phase).toBe('paused');
    expect(room.game.moves).toHaveLength(1);
    expect(room.game.seatLog.at(-1)).toMatchObject({ seat: 'O', reason: 'stood', atMove: 1 });
  });

  it('a disconnect during a fresh count-in drops the game; the return starts a new one', () => {
    const room = new Room();
    const B = room.hello(registered('Bob', UID.B));
    const firstId = room.game.id;
    room.lost(B);
    expect(room.room.phase).toBe('waiting');
    expect(room.room.seats.O).toBe(B);
    room.resume(B);
    expect(room.room.phase).toBe('countdown');
    expect(room.game.id).not.toBe(firstId);
    expect(room.game.number).toBe(1);
  });

  it('refuses TAKE_SEAT and CLEAR_SEAT during a count-in', () => {
    const room = new Room();
    const B = room.hello(registered('Bob', UID.B));
    const C = room.hello(registered('Cara', UID.C));
    // A count-in always has both seats filled, so the seat is reported taken.
    room.act(C, 'TAKE_SEAT', { seat: 'O' });
    expect(rejections(room.last)).toEqual(['seat_taken']);
    room.act(room.hostId, 'CLEAR_SEAT', { seat: 'O' });
    expect(rejections(room.last)).toEqual(['countdown']);
    expect(room.room.seats.O).toBe(B);
  });
});

// ---------------------------------------------------------------------------
// 4.4 / 4.5 Standing up and sitting down
// ---------------------------------------------------------------------------

describe('seats (4.4, 4.5)', () => {
  it('standing mid-game pauses with the clocks stopped exactly, and a viewer resumes it', () => {
    const { room, A, B } = playing(TIMED);
    room.advance(4_000);
    room.move(A, 7, 7);
    room.advance(2_500);
    room.move(B, 0, 0);
    room.advance(1_234);
    room.move(A, 7, 8);
    room.advance(700);
    const C = room.hello(registered('Cara', UID.C));
    room.act(B, 'LEAVE_SEAT', {});
    expect(room.room.phase).toBe('paused');
    const frozen = room.clocks();
    expect(frozen).toEqual({ X: 300_000 - 4_000 - 1_234, O: 300_000 - 2_500 - 700, turn: 30_000 - 700, elapsed: 8_434, running: false });
    room.advance(60_000);
    expect(room.clocks()).toEqual(frozen);
    room.act(C, 'TAKE_SEAT', { seat: 'O' });
    expect(room.room.phase).toBe('countdown');
    expect(room.room.countdown?.resuming).toBe(true);
    room.countIn();
    expect(room.room.phase).toBe('playing');
    expect(room.game.moves).toHaveLength(3);
    expect(room.game.turn).toBe('O');
    // Resume exactly: no floor on the per-move timer, nothing adjusted.
    expect(room.clocks()).toEqual({ ...frozen, running: true });
    room.advance(1_000);
    expect(room.clocks()).toEqual({ ...frozen, O: frozen.O - 1_000, turn: frozen.turn - 1_000, elapsed: frozen.elapsed + 1_000, running: true });
    expect(room.game.seatLog.map((c) => [c.reason, c.from?.memberId ?? c.to?.memberId])).toEqual([
      ['stood', B],
      ['sat', C],
    ]);
  });

  // The A1 rule is "resume exactly", and the tests above resume with plenty
  // of move time left. These pause with 3 s on the move timer, below any floor
  // a resume might be tempted to apply, on each of the three paths to a pause.
  it('resumes a per-move timer below 10 s exactly after a player stands (A1)', () => {
    const { room, A, B } = playing(TIMED);
    room.move(A, 7, 7);
    room.advance(27_000);
    const C = room.hello(registered('Cara', UID.C));
    room.act(B, 'LEAVE_SEAT', {});
    const frozen = room.clocks();
    expect(frozen).toEqual({ X: 300_000, O: 273_000, turn: 3_000, elapsed: 27_000, running: false });
    room.advance(20_000);
    room.act(C, 'TAKE_SEAT', { seat: 'O' });
    room.countIn();
    expect(room.room.phase).toBe('playing');
    expect(room.clocks()).toEqual({ ...frozen, running: true });
  });

  it('resumes a per-move timer below 10 s exactly after a disconnect (A1)', () => {
    const { room, A, B } = playing(TIMED);
    room.move(A, 7, 7);
    room.advance(26_500);
    room.pong(B);
    room.advance(500);
    room.lost(B);
    const frozen = room.clocks();
    expect(frozen).toEqual({ X: 300_000, O: 273_000, turn: 3_000, elapsed: 27_000, running: false });
    room.advance(10_000);
    room.resume(B);
    room.countIn();
    expect(room.room.phase).toBe('playing');
    expect(room.clocks()).toEqual({ ...frozen, running: true });
  });

  it('resumes a per-move timer below 10 s exactly after a host restore (A1)', () => {
    const { room, A, B } = playing(TIMED);
    room.move(A, 7, 7);
    room.advance(27_000);
    room.pong(B);
    const before = room.clocks();
    expect(before).toEqual({ X: 300_000, O: 273_000, turn: 3_000, elapsed: 27_000, running: true });
    const saved = JSON.parse(JSON.stringify(snapshot(room.s, room.now)));
    room.advance(5_000);
    room.s = restore(saved, room.now);
    room.resume(B);
    room.countIn();
    expect(room.room.phase).toBe('playing');
    expect(room.clocks()).toEqual(before);
  });

  it('two viewers racing for one seat in the same tick: the second gets seat_taken', () => {
    const { room, B } = playing();
    const C = room.hello(registered('Cara', UID.C));
    const D = room.hello(registered('Dan', UID.D));
    room.act(B, 'LEAVE_SEAT', {});
    room.act(C, 'TAKE_SEAT', { seat: 'O' });
    expect(rejections(room.last)).toEqual([]);
    room.act(D, 'TAKE_SEAT', { seat: 'O' });
    expect(rejections(room.last)).toEqual(['seat_taken']);
    expect(room.room.seats.O).toBe(C);
  });

  it('a player who stood up may not sit again in the same game (gave_up_seat)', () => {
    const { room, A, B } = playing();
    room.move(A, 7, 7);
    room.act(B, 'LEAVE_SEAT', {});
    room.act(B, 'TAKE_SEAT', { seat: 'O' });
    expect(rejections(room.last)).toEqual(['gave_up_seat']);
    // The rule is per game: once this game is gone, the seat is theirs to take.
    room.act(A, 'DISCARD_GAME', { gameId: room.game.id });
    room.act(B, 'TAKE_SEAT', { seat: 'O' });
    expect(rejections(room.last)).toEqual([]);
    expect(room.room.phase).toBe('countdown');
  });

  it('a player who left the room may not sit again in the same game', () => {
    const { room, B } = playing();
    room.act(B, 'LEAVE_ROOM', {});
    const back = room.hello(registered('Bob', UID.B));
    room.act(back, 'TAKE_SEAT', { seat: 'O' });
    expect(rejections(room.last)).toEqual(['gave_up_seat']);
  });

  it('a player whose grace expired may sit again', () => {
    const { room, B } = playing();
    room.lost(B);
    room.advance(GRACE_MS);
    room.graceOut(B);
    expect(room.game.seatLog.at(-1)?.reason).toBe('dropped');
    const back = room.hello(registered('Bob', UID.B));
    room.act(back, 'TAKE_SEAT', { seat: 'O' });
    expect(rejections(room.last)).toEqual([]);
    expect(room.room.phase).toBe('countdown');
  });

  it('refuses already_seated and not_seated', () => {
    const { room, A } = playing();
    const C = room.hello(registered('Cara', UID.C));
    room.act(A, 'TAKE_SEAT', { seat: 'O' });
    expect(rejections(room.last)).toEqual(['already_seated']);
    room.act(C, 'LEAVE_SEAT', {});
    expect(rejections(room.last)).toEqual(['not_seated']);
  });

  it('standing in a waiting room just opens the seat', () => {
    const room = new Room();
    room.act(room.hostId, 'LEAVE_SEAT', {});
    expect(room.room.seats.X).toBeNull();
    expect(room.room.phase).toBe('waiting');
  });

  it('caps the seat log at 64, keeping the first and last entries and counting the rest', () => {
    const { room, B } = playing();
    const C0 = room.hello(registered('Cara', UID.C));
    room.act(B, 'LEAVE_SEAT', {});
    room.act(C0, 'TAKE_SEAT', { seat: 'O' });
    let c = C0;
    for (let i = 0; i < 40; i += 1) {
      room.lost(c);
      room.advance(GRACE_MS);
      room.graceOut(c);
      c = room.hello(registered('Cara', UID.C));
      room.act(c, 'TAKE_SEAT', { seat: 'O' });
    }
    const log = room.game.seatLog;
    expect(log).toHaveLength(SEAT_LOG_CAP);
    expect(room.game.seatLogDropped).toBe(2 + 80 - SEAT_LOG_CAP);
    expect(log[0]).toMatchObject({ reason: 'stood' });
    expect(log.at(-1)).toMatchObject({ reason: 'sat' });
    expect(log.at(-1)?.to?.memberId).toBe(c);
  });
});

// ---------------------------------------------------------------------------
// 4.6 Disconnects, grace, leaving, liveness
// ---------------------------------------------------------------------------

describe('disconnects and leaving (4.6)', () => {
  it('a seated drop pauses; a viewer drop pauses nothing', () => {
    const { room, B } = playing();
    const C = room.hello(registered('Cara', UID.C));
    room.lost(C);
    expect(room.room.phase).toBe('playing');
    room.lost(B);
    expect(room.room.phase).toBe('paused');
    expect(room.room.members.find((m) => m.id === B)?.connected).toBe(false);
  });

  it('grace expiry empties the seat, removes the member and leaves the game paused', () => {
    const { room, B } = playing();
    room.lost(B);
    room.advance(GRACE_MS - 1);
    room.graceOut(B);
    expect(room.room.seats.O).toBe(B);
    room.advance(1);
    room.graceOut(B);
    expect(room.room.seats.O).toBeNull();
    expect(room.room.members.some((m) => m.id === B)).toBe(false);
    expect(room.room.phase).toBe('paused');
    expect(room.last.events).toContainEqual({ kind: 'member_removed', memberId: B });
    expect(room.s.host.tokens[B]).toBeUndefined();
  });

  it('tick() expires grace too', () => {
    const { room, A, B } = playing();
    room.lost(B);
    room.advance(GRACE_MS);
    room.pong(A);
    room.tick();
    expect(room.room.members.some((m) => m.id === B)).toBe(false);
  });

  it('LEAVE_ROOM mid-game pauses at once with no result', () => {
    const { room, B } = playing();
    room.act(B, 'LEAVE_ROOM', {});
    expect(room.room.phase).toBe('paused');
    expect(room.room.seats.O).toBeNull();
    expect(room.room.results).toEqual([]);
    expect(room.game.seatLog.at(-1)?.reason).toBe('left');
    expect(room.last.events).toContainEqual({ kind: 'close', memberId: B });
  });

  it('the host cannot LEAVE_ROOM through the engine; closing the room is the hub’s job', () => {
    const room = new Room();
    room.act(room.hostId, 'LEAVE_ROOM', {});
    expect(rejections(room.last)).toEqual(['host_cannot_leave']);
  });

  it('declares a silent member lost after 6 s and refunds the mover’s time after their last sign of life', () => {
    const { room, A, B } = playing(TIMED);
    room.move(A, 7, 7); // B to move; B's last message is at this instant
    room.pong(B);
    const seenAt = room.now;
    room.advance(LOST_AFTER_MS);
    room.pong(A);
    room.tick();
    expect(room.room.phase).toBe('playing');
    room.advance(1);
    room.pong(A);
    room.tick();
    expect(room.room.phase).toBe('paused');
    expect(room.last.events).toContainEqual({ kind: 'close', memberId: B });
    // B is charged only up to a second after their last message.
    const charged = REFUND_AFTER_LAST_SEEN_MS;
    expect(room.game.clocks.O).toBe(300_000 - charged);
    expect(room.game.clocks.turn).toBe(30_000 - charged);
    expect(room.now - seenAt).toBeGreaterThan(LOST_AFTER_MS);
  });

  it('does not refund the side to move when the other player is the one who dropped', () => {
    const { room, A, B } = playing(TIMED);
    room.pong(B);
    room.advance(2_000);
    room.lost(B);
    expect(room.game.clocks.X).toBe(300_000 - 2_000);
    expect(room.room.members.find((m) => m.id === A)?.connected).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4.11 Moves and 6 clocks
// ---------------------------------------------------------------------------

describe('moves and clocks (4.11, 6)', () => {
  it('applies a move with MOVE_APPLIED instead of ROOM_STATE', () => {
    const { room, A } = playing(TIMED);
    room.advance(1_500);
    const r = room.move(A, 7, 7);
    expect(hasRoomState(r)).toBe(false);
    const [applied] = broadcasts(r, 'MOVE_APPLIED');
    expect(applied).toEqual({
      type: 'MOVE_APPLIED',
      payload: {
        gameId: room.game.id,
        n: 0,
        row: 7,
        col: 7,
        turn: 'O',
        clocks: { X: 298_500, O: 300_000, turn: 30_000, elapsed: 1_500, running: true },
        rev: room.room.rev,
      },
    });
    expect(room.game.moveBy).toEqual([A]);
  });

  it('refuses bad moves with the right reason', () => {
    const { room, A, B } = playing();
    const C = room.hello(registered('Cara', UID.C));
    const id = room.game.id;
    room.act(C, 'MOVE', { gameId: id, n: 0, row: 1, col: 1 });
    expect(rejections(room.last)).toEqual(['not_seated']);
    room.act(B, 'MOVE', { gameId: id, n: 0, row: 1, col: 1 });
    expect(rejections(room.last)).toEqual(['not_your_turn']);
    room.act(A, 'MOVE', { gameId: 'other', n: 0, row: 1, col: 1 });
    expect(rejections(room.last)).toEqual(['wrong_game']);
    room.act(A, 'MOVE', { gameId: id, n: 3, row: 1, col: 1 });
    expect(rejections(room.last)).toEqual(['stale_move']);
    room.act(A, 'MOVE', { gameId: id, n: 0, row: 15, col: 1 });
    expect(rejections(room.last)).toEqual(['out_of_bounds']);
    room.move(A, 1, 1);
    room.act(B, 'MOVE', { gameId: id, n: 1, row: 1, col: 1 });
    expect(rejections(room.last)).toEqual(['occupied']);
    room.act(B, 'LEAVE_SEAT', {});
    room.act(A, 'MOVE', { gameId: id, n: 1, row: 2, col: 2 });
    expect(rejections(room.last)).toEqual(['not_playing']);
  });

  it('ends the game on five in a row, with the line, score and a pending rating for the loser', () => {
    const { room, A, B } = playing();
    scriptedWin(room, A, B);
    expect(room.room.phase).toBe('ended');
    const result = latestResult(room.s);
    expect(result).toMatchObject({ winner: 'X', reason: '5_in_a_row', movesLength: 9, number: 1 });
    expect(result?.line).toEqual([[7, 3], [7, 4], [7, 5], [7, 6], [7, 7]]);
    expect(result?.rating).toEqual({ status: 'pending', submitters: ['O'], reports: {} });
    expect(result?.players.O.memberId).toBe(B);
    expect(room.room.score).toEqual({ pair: `${A}|${B}`, X: 1, O: 0 });
    expect(room.room.gamesPlayed).toBe(1);
    expect(room.game.clocks.running).toBe(false);
    expect(hasRoomState(room.last)).toBe(true);
  });

  it('does not auto-start after a game ends with both players seated', () => {
    const { room, A, B } = playing();
    scriptedWin(room, A, B);
    room.advance(5_000);
    room.pong(B);
    room.tick();
    expect(room.room.phase).toBe('ended');
  });

  it('ends in a draw on a full board, and both registered players are asked to submit', () => {
    const { room, A, B } = playing();
    // (c + 2r) % 4 < 2 never lines up five in any direction, and gives X 113 of 225 cells.
    const xs: Array<[number, number]> = [];
    const os: Array<[number, number]> = [];
    for (let r = 0; r < 15; r += 1) {
      for (let c = 0; c < 15; c += 1) ((c + 2 * r) % 4 < 2 ? xs : os).push([r, c]);
    }
    expect(xs).toHaveLength(113);
    for (let i = 0; i < xs.length; i += 1) {
      room.move(A, ...xs[i]);
      if (i < os.length) room.move(B, ...os[i]);
    }
    const result = latestResult(room.s);
    expect(result).toMatchObject({ winner: 'DRAW', reason: 'board_full', movesLength: 225 });
    expect(result?.rating).toEqual({ status: 'pending', submitters: ['X', 'O'], reports: {} });
    expect(room.room.score).toMatchObject({ X: 0, O: 0 });
  });

  it('leaves a game with a guest unrated', () => {
    const { room, A, B } = playing(OPEN, guest('Guest 4821', 'guest_4821'));
    scriptedWin(room, A, B);
    expect(latestResult(room.s)?.rating).toEqual({ status: 'unrated', why: 'guest', guestSeats: ['O'] });
  });

  it('the watchdog ends a game on the move clock when the mover is present', () => {
    const { room, A, B } = playing({ ...OPEN, turnTimeSeconds: 10 });
    room.move(A, 7, 7);
    room.advance(2_000);
    room.pong(B);
    room.advance(8_000);
    room.pong(B);
    room.tick();
    expect(room.room.phase).toBe('ended');
    expect(latestResult(room.s)).toMatchObject({ winner: 'X', reason: 'turn_timeout' });
    expect(room.game.clocks.turn).toBe(0);
  });

  it('the watchdog ends a game on the total bank', () => {
    const { room, A, B } = playing({ ...OPEN, totalTimeMinutes: 5 });
    room.advance(5 * 60_000 - 1);
    room.pong(B);
    room.tick();
    expect(room.room.phase).toBe('playing');
    room.advance(1);
    room.tick();
    expect(latestResult(room.s)).toMatchObject({ winner: 'O', reason: 'total_time_out' });
    expect(room.game.clocks.X).toBe(0);
    expect(seatOf(room.s, A)).toBe('X');
  });

  it('the watchdog pauses instead of timing out a mover who has gone silent', () => {
    const { room, A, B } = playing({ ...OPEN, turnTimeSeconds: 10 });
    room.move(A, 7, 7);
    room.advance(5_000);
    room.pong(B);
    const seenAt = room.now;
    room.advance(5_000);
    room.tick();
    // Silent for longer than the watchdog tolerates, but not yet long enough
    // for the liveness rule: this is the watchdog's own decision.
    expect(room.now - seenAt).toBeGreaterThan(STALE_MOVER_MS);
    expect(room.now - seenAt).toBeLessThanOrEqual(LOST_AFTER_MS);
    expect(room.room.phase).toBe('paused');
    expect(room.room.results).toEqual([]);
    expect(room.room.members.find((m) => m.id === B)?.connected).toBe(false);
    expect(room.last.events).toContainEqual({ kind: 'close', memberId: B });
    expect(room.game.clocks.turn).toBe(10_000 - 5_000 - REFUND_AFTER_LAST_SEEN_MS);
  });

  it('a move that arrives after the mover’s time ran out loses on time', () => {
    const { room, A, B } = playing({ ...OPEN, turnTimeSeconds: 10 });
    room.move(A, 7, 7);
    room.advance(9_000);
    room.pong(B); // B is present, so being late is B's own doing
    room.advance(1_050);
    room.move(B, 0, 0);
    expect(rejections(room.last)).toEqual(['time_out']);
    expect(latestResult(room.s)).toMatchObject({ winner: 'X', reason: 'turn_timeout' });
    expect(room.game.moves).toHaveLength(1);
  });

  it('a late move from a mover silent past the watchdog’s tolerance pauses with the watchdog’s refund', () => {
    const lateBy = (via: 'move' | 'tick') => {
      const { room, A, B } = playing({ ...OPEN, turnTimeSeconds: 10 });
      room.move(A, 7, 7);
      room.advance(5_000);
      room.pong(B);
      // B's clock ran out 50 ms ago, five seconds into a silence, and no tick
      // has looked yet. The MOVE and the next tick must agree on what that is.
      room.advance(5_050);
      if (via === 'move') room.move(B, 0, 0);
      else room.tick();
      return { room, B };
    };
    const byMove = lateBy('move');
    const byTick = lateBy('tick');
    expect(rejections(byMove.room.last)).toEqual(['not_playing']);
    for (const { room } of [byMove, byTick]) {
      expect(room.room.results).toEqual([]);
      expect(room.game.moves).toHaveLength(1);
      expect(room.game.clocks.turn).toBe(10_000 - 5_000 - REFUND_AFTER_LAST_SEEN_MS);
    }
    expect(byMove.room.game.clocks).toEqual(byTick.room.game.clocks);
    // The MOVE proved B's link alive, so B stays connected and the count-in
    // starts at once instead of waiting for a reconnect.
    expect(byMove.room.room.members.find((m) => m.id === byMove.B)?.connected).toBe(true);
    expect(byMove.room.room.phase).toBe('countdown');
    expect(byMove.room.room.countdown?.resuming).toBe(true);
    byMove.room.countIn();
    byMove.room.move(byMove.B, 0, 0);
    expect(rejections(byMove.room.last)).toEqual([]);
    expect(byMove.room.game.moves).toHaveLength(2);
  });

  it('CLOCK_SYNC carries live clocks while playing only', () => {
    const { room, B } = playing(TIMED);
    room.advance(1_000);
    expect(clockSync(room.s, room.now)).toMatchObject({ type: 'CLOCK_SYNC', payload: { clocks: { X: 299_000 } } });
    room.act(B, 'LEAVE_SEAT', {});
    expect(clockSync(room.s, room.now)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 4.12 Take-back
// ---------------------------------------------------------------------------

describe('take-back (4.12)', () => {
  it('is instant for the mover within 5 s', () => {
    const { room, A } = playing();
    room.move(A, 7, 7);
    room.advance(INSTANT_UNDO_MS);
    room.act(A, 'UNDO_REQUEST', { gameId: room.game.id });
    expect(room.game.moves).toHaveLength(0);
    expect(room.game.turn).toBe('X');
    expect(room.game.undo).toBeNull();
  });

  it('asks the opponent after 5 s; accepting removes back through the requester’s move', () => {
    const { room, A, B } = playing();
    const C = room.hello(registered('Cara', UID.C));
    room.move(A, 7, 7);
    room.move(B, 0, 0);
    room.advance(INSTANT_UNDO_MS + 1);
    room.act(A, 'UNDO_REQUEST', { gameId: room.game.id });
    expect(room.game.undo).toEqual({ from: 'X', expiresAt: room.now + OFFER_TTL_MS });
    room.act(C, 'UNDO_ANSWER', { gameId: room.game.id, accept: true });
    expect(rejections(room.last)).toEqual(['not_addressed']);
    room.act(A, 'UNDO_ANSWER', { gameId: room.game.id, accept: true });
    expect(rejections(room.last)).toEqual(['not_addressed']);
    room.act(B, 'UNDO_ANSWER', { gameId: room.game.id, accept: true });
    expect(room.game.moves).toHaveLength(0);
    expect(room.game.turn).toBe('X');
  });

  it('removes a single move when the opponent has not replied yet', () => {
    const { room, A, B } = playing();
    room.move(A, 7, 7);
    room.move(B, 0, 0);
    room.move(A, 7, 8);
    room.advance(INSTANT_UNDO_MS + 1);
    room.act(A, 'UNDO_REQUEST', { gameId: room.game.id });
    room.act(B, 'UNDO_ANSWER', { gameId: room.game.id, accept: true });
    expect(room.game.moves).toEqual([[7, 7], [0, 0]]);
    expect(room.game.turn).toBe('X');
  });

  it('a decline and an expiry notify only the requester', () => {
    const { room, A, B } = playing();
    room.move(A, 7, 7);
    room.advance(INSTANT_UNDO_MS + 1);
    room.act(A, 'UNDO_REQUEST', { gameId: room.game.id });
    room.act(B, 'UNDO_ANSWER', { gameId: room.game.id, accept: false });
    expect(eventsTo(room.last, A)).toEqual(['undo_declined']);
    expect(eventsTo(room.last, B)).toEqual([]);
    room.act(A, 'UNDO_REQUEST', { gameId: room.game.id });
    room.advance(OFFER_TTL_MS);
    room.pong(B);
    room.tick();
    expect(eventsTo(room.last, A)).toEqual(['undo_expired']);
    expect(room.game.undo).toBeNull();
  });

  it('is not instant for someone who just sat down over the previous occupant’s move', () => {
    const { room, A, B } = playing();
    room.move(A, 7, 7);
    const C = room.hello(registered('Cara', UID.C));
    room.act(A, 'LEAVE_SEAT', {});
    room.act(C, 'TAKE_SEAT', { seat: 'X' });
    room.countIn();
    room.act(C, 'UNDO_REQUEST', { gameId: room.game.id });
    expect(room.game.moves).toHaveLength(1);
    expect(room.game.undo?.from).toBe('X');
    expect(seatOf(room.s, B)).toBe('O');
  });

  it('UNDO_ANSWER after the game ended is refused, and the end cleared the request', () => {
    const { room, A, B } = playing();
    room.move(A, 7, 3);
    room.move(B, 0, 0);
    room.advance(INSTANT_UNDO_MS + 1);
    room.act(B, 'UNDO_REQUEST', { gameId: room.game.id });
    room.move(A, 7, 4);
    room.move(B, 0, 1);
    room.move(A, 7, 5);
    room.move(B, 0, 2);
    room.move(A, 7, 6);
    room.move(B, 0, 3);
    expect(room.game.undo?.from).toBe('O');
    room.move(A, 7, 7);
    expect(room.room.phase).toBe('ended');
    expect(room.game.undo).toBeNull();
    room.act(A, 'UNDO_ANSWER', { gameId: room.game.id, accept: true });
    expect(rejections(room.last)).toEqual(['not_playing']);
    expect(room.game.moves).toHaveLength(9);
  });

  it('a pause expires a pending request, and UNDO_ANSWER during a pause is refused', () => {
    const { room, A, B } = playing();
    room.move(A, 7, 7);
    room.advance(INSTANT_UNDO_MS + 1);
    room.act(A, 'UNDO_REQUEST', { gameId: room.game.id });
    room.lost(B);
    expect(eventsTo(room.last, A)).toEqual(['undo_expired']);
    expect(room.game.undo).toBeNull();
    room.act(A, 'UNDO_REQUEST', { gameId: room.game.id });
    expect(rejections(room.last)).toEqual(['not_playing']);
    room.act(A, 'UNDO_ANSWER', { gameId: room.game.id, accept: true });
    expect(rejections(room.last)).toEqual(['not_playing']);
  });

  it('refuses when take-back is off, with no move, or with one already pending', () => {
    const off = playing({ ...OPEN, allowUndo: false });
    off.room.move(off.A, 7, 7);
    off.room.act(off.A, 'UNDO_REQUEST', { gameId: off.room.game.id });
    expect(rejections(off.room.last)).toEqual(['undo_off']);

    const { room, A, B } = playing();
    room.act(A, 'UNDO_REQUEST', { gameId: room.game.id });
    expect(rejections(room.last)).toEqual(['no_move_to_undo']);
    room.move(A, 7, 7);
    room.advance(INSTANT_UNDO_MS + 1);
    room.act(A, 'UNDO_REQUEST', { gameId: room.game.id });
    room.act(A, 'UNDO_REQUEST', { gameId: room.game.id });
    expect(rejections(room.last)).toEqual(['undo_pending']);
    room.act(B, 'UNDO_REQUEST', { gameId: 'nope' });
    expect(rejections(room.last)).toEqual(['wrong_game']);
  });
});

// ---------------------------------------------------------------------------
// 4.7 Rematch, 4.13 resign, 4.14 results and ratings
// ---------------------------------------------------------------------------

describe('rematch (4.7)', () => {
  it('only a seated player may offer; only the other seat may answer; accepting starts game 2', () => {
    const { room, A, B } = playing();
    const C = room.hello(registered('Cara', UID.C));
    scriptedWin(room, A, B);
    const first = room.game.id;
    room.act(C, 'REMATCH_OFFER', { gameId: first });
    expect(rejections(room.last)).toEqual(['not_seated']);
    room.act(A, 'REMATCH_OFFER', { gameId: first });
    expect(room.game.rematch?.from).toBe('X');
    room.act(A, 'REMATCH_OFFER', { gameId: first });
    expect(rejections(room.last)).toEqual(['offer_pending']);
    room.act(A, 'REMATCH_ANSWER', { gameId: first, accept: true });
    expect(rejections(room.last)).toEqual(['not_addressed']);
    room.act(B, 'REMATCH_ANSWER', { gameId: first, accept: true });
    expect(room.room.phase).toBe('countdown');
    expect(room.game.number).toBe(2);
    expect(room.game.id).not.toBe(first);
    expect(room.game.turn).toBe('O');
    expect(room.game.openingSeat).toBe('O');
    room.countIn();
    room.move(B, 7, 7);
    expect(boardFromMoves(room.game.moves, 15, room.game.openingSeat)[7][7]).toBe('O');
    expect(room.game.turn).toBe('X');
  });

  it('alternates the opening seat every completed game', () => {
    const { room, A, B } = playing();
    expect(room.game.turn).toBe('X');

    scriptedWin(room, A, B);
    const game1 = room.game.id;
    room.act(A, 'REMATCH_OFFER', { gameId: game1 });
    room.act(B, 'REMATCH_ANSWER', { gameId: game1, accept: true });
    expect(room.game.turn).toBe('O');

    room.countIn();
    room.act(A, 'RESIGN', { gameId: room.game.id });
    const game2 = room.game.id;
    room.act(B, 'REMATCH_OFFER', { gameId: game2 });
    room.act(A, 'REMATCH_ANSWER', { gameId: game2, accept: true });
    expect(room.game.turn).toBe('X');
  });

  it('a decline and an expiry notify the offerer', () => {
    const { room, A, B } = playing();
    scriptedWin(room, A, B);
    const id = room.game.id;
    room.act(A, 'REMATCH_OFFER', { gameId: id });
    room.act(B, 'REMATCH_ANSWER', { gameId: id, accept: false });
    expect(eventsTo(room.last, A)).toEqual(['rematch_declined']);
    room.act(B, 'REMATCH_OFFER', { gameId: id });
    room.advance(OFFER_TTL_MS);
    room.pong(B);
    room.tick();
    expect(eventsTo(room.last, B)).toEqual(['rematch_expired']);
    expect(room.game.rematch).toBeNull();
  });

  it('REMATCH_ANSWER after a vacate is refused because the vacate cleared the offer', () => {
    const { room, A, B } = playing();
    scriptedWin(room, A, B);
    const id = room.game.id;
    room.act(B, 'REMATCH_OFFER', { gameId: id });
    room.act(B, 'LEAVE_SEAT', {});
    room.act(A, 'REMATCH_ANSWER', { gameId: id, accept: true });
    expect(rejections(room.last)).toEqual(['no_offer']);
    expect(room.room.phase).toBe('ended');
  });

  it('changing the rules clears the offer, and a game keeps the rules it started with', () => {
    const { room, A, B } = playing();
    scriptedWin(room, A, B);
    room.act(A, 'REMATCH_OFFER', { gameId: room.game.id });
    room.act(A, 'UPDATE_SETTINGS', { settings: { ...OPEN, boardSize: 19 } });
    expect(room.game.rematch).toBeNull();
    expect(room.last.replies).toContainEqual({
      to: A,
      message: { type: 'EVENT', payload: { kind: 'rematch_declined', why: 'rules_changed' } },
    });
    expect(room.game.settings.boardSize).toBe(15);
    expect(room.room.settings.boardSize).toBe(19);
  });

  it('standing up and a new player sitting in `ended` starts a new game; the score resets with the pair', () => {
    const { room, A, B } = playing();
    const C = room.hello(registered('Cara', UID.C));
    scriptedWin(room, A, B);
    room.act(B, 'LEAVE_SEAT', {});
    expect(room.room.autoStartArmed).toBe(true);
    room.act(C, 'TAKE_SEAT', { seat: 'O' });
    expect(room.room.phase).toBe('countdown');
    room.countIn();
    scriptedWin(room, A, C);
    expect(room.room.score).toEqual({ pair: `${A}|${C}`, X: 1, O: 0 });
  });
});

describe('stale gameIds (resolution 4)', () => {
  /** Game 1 is over and the same pair is playing game 2. */
  const secondGame = () => {
    const { room, A, B } = playing();
    scriptedWin(room, A, B);
    const game1 = room.game.id;
    room.act(A, 'REMATCH_OFFER', { gameId: game1 });
    room.act(B, 'REMATCH_ANSWER', { gameId: game1, accept: true });
    room.countIn();
    expect(room.game.number).toBe(2);
    expect(room.room.phase).toBe('playing');
    return { room, A, B, game1 };
  };

  /** Sends an intent naming an earlier game and checks it is refused with nothing changed. */
  const refusedAsStale = <K extends IntentType>(room: Room, from: string, type: K, payload: IntentPayloads[K]) => {
    const before = structuredClone(room.room);
    const r = room.act(from, type, payload);
    expect(rejections(r)).toEqual(['wrong_game']);
    expect(room.room).toEqual(before);
    expect(hasRoomState(r)).toBe(false);
  };

  it('a delayed accept for game 1 does not accept the pending offer for game 2', () => {
    const { room, A, B, game1 } = secondGame();
    scriptedWin(room, A, B);
    room.act(A, 'REMATCH_OFFER', { gameId: room.game.id });
    refusedAsStale(room, B, 'REMATCH_ANSWER', { gameId: game1, accept: true });
    expect(room.room.phase).toBe('ended');
    expect(room.game.rematch?.from).toBe('X');
  });

  it('a rematch offer naming game 1 is refused once game 2 has ended', () => {
    const { room, A, B, game1 } = secondGame();
    scriptedWin(room, A, B);
    refusedAsStale(room, A, 'REMATCH_OFFER', { gameId: game1 });
    expect(room.game.rematch).toBeNull();
  });

  it('take-back intents naming game 1 are refused during game 2', () => {
    const { room, A, B, game1 } = secondGame();
    room.move(A, 7, 7);
    refusedAsStale(room, A, 'UNDO_REQUEST', { gameId: game1 });
    room.advance(INSTANT_UNDO_MS + 1);
    room.act(A, 'UNDO_REQUEST', { gameId: room.game.id });
    expect(room.game.undo?.from).toBe('X');
    refusedAsStale(room, B, 'UNDO_ANSWER', { gameId: game1, accept: true });
    expect(room.game.undo?.from).toBe('X');
    expect(room.game.moves).toHaveLength(1);
  });

  it('a resignation naming game 1 does not end game 2', () => {
    const { room, B, game1 } = secondGame();
    refusedAsStale(room, B, 'RESIGN', { gameId: game1 });
    expect(room.room.phase).toBe('playing');
    expect(room.room.results).toHaveLength(1);
  });
});

describe('resign (4.13)', () => {
  it('gives the game to the other seat and is refused to viewers and while paused', () => {
    const { room, A, B } = playing();
    const C = room.hello(registered('Cara', UID.C));
    room.act(C, 'RESIGN', { gameId: room.game.id });
    expect(rejections(room.last)).toEqual(['not_seated']);
    room.lost(B);
    room.act(A, 'RESIGN', { gameId: room.game.id });
    expect(rejections(room.last)).toEqual(['not_playing']);
    room.resume(B);
    room.countIn();
    room.act(B, 'RESIGN', { gameId: room.game.id });
    expect(latestResult(room.s)).toMatchObject({ winner: 'X', reason: 'resigned' });
  });
});

describe('results and ratings (4.14, 7)', () => {
  it('accepts a report only from the submitter, with sane deltas', () => {
    const { room, A, B } = playing();
    scriptedWin(room, A, B);
    const id = room.game.id;
    room.act(A, 'RATING_REPORT', { gameId: id, status: 'saved', deltas: { X: 12, O: -12 } });
    expect(rejections(room.last)).toEqual(['not_submitter']);
    room.act(B, 'RATING_REPORT', { gameId: id, status: 'saved', deltas: { X: 99, O: -12 } });
    expect(rejections(room.last)).toEqual(['bad_deltas']);
    room.act(B, 'RATING_REPORT', { gameId: 'nope', status: 'saved' });
    expect(rejections(room.last)).toEqual(['no_result']);
    room.act(B, 'RATING_REPORT', { gameId: id, status: 'saved', deltas: { X: 12, O: -12 } });
    expect(latestResult(room.s)?.rating).toEqual({ status: 'saved', by: 'O', deltas: { X: 12, O: -12 } });
    room.act(B, 'RATING_REPORT', { gameId: id, status: 'saved', deltas: { X: 12, O: -12 } });
    expect(rejections(room.last)).toEqual(['not_pending']);
  });

  it('keeps a pending result through a rematch, so the report still lands', () => {
    const { room, A, B } = playing();
    scriptedWin(room, A, B);
    const first = room.game.id;
    room.act(A, 'REMATCH_OFFER', { gameId: first });
    room.act(B, 'REMATCH_ANSWER', { gameId: first, accept: true });
    expect(room.game.id).not.toBe(first);
    expect(room.room.results[0].rating.status).toBe('pending');
    room.act(B, 'RATING_REPORT', { gameId: first, status: 'saved', deltas: { X: 10, O: -10 } });
    expect(rejections(room.last)).toEqual([]);
    expect(room.room.results[0].rating.status).toBe('saved');
  });

  it('on a draw, one side’s refusal waits for the other side’s save', () => {
    const { room, A, B } = playing();
    // Put a draw result in place directly: a full board is covered above.
    room.act(B, 'RESIGN', { gameId: room.game.id });
    const draft = structuredClone(room.s);
    const result = draft.room.results[0];
    result.winner = 'DRAW';
    result.rating = { status: 'pending', submitters: ['X', 'O'], reports: {} };
    room.s = draft;
    room.act(A, 'RATING_REPORT', { gameId: result.gameId, status: 'skipped', why: 'caller_would_gain' });
    expect(room.room.results[0].rating.status).toBe('pending');
    room.act(A, 'RATING_REPORT', { gameId: result.gameId, status: 'saved' });
    expect(rejections(room.last)).toEqual(['not_submitter']);
    room.act(B, 'RATING_REPORT', { gameId: result.gameId, status: 'saved', deltas: { X: 3, O: -3 } });
    expect(room.room.results[0].rating).toEqual({ status: 'saved', by: 'O', deltas: { X: 3, O: -3 } });
  });

  it('on a draw with no save, the most informative outcome wins', () => {
    const { room, A, B } = playing();
    room.act(B, 'RESIGN', { gameId: room.game.id });
    const draft = structuredClone(room.s);
    const result = draft.room.results[0];
    result.rating = { status: 'pending', submitters: ['X', 'O'], reports: {} };
    room.s = draft;
    room.act(A, 'RATING_REPORT', { gameId: result.gameId, status: 'skipped', why: 'caller_would_gain' });
    room.act(B, 'RATING_REPORT', { gameId: result.gameId, status: 'failed', why: 'network' });
    expect(room.room.results[0].rating).toEqual({ status: 'failed', why: 'network' });
  });

  it('a submitter who leaves while pending turns the rating to unknown', () => {
    const { room, A, B } = playing();
    scriptedWin(room, A, B);
    room.act(B, 'LEAVE_ROOM', {});
    expect(latestResult(room.s)?.rating).toEqual({ status: 'unknown', why: 'submitter_left' });
  });

  it('keeps the last five results but never evicts a pending one', () => {
    const { room, A, B } = playing();
    for (let i = 0; i < 7; i += 1) {
      room.act(B, 'RESIGN', { gameId: room.game.id });
      if (i === 0) {
        // The first result stays pending; the rest are settled at once.
      } else {
        room.act(B, 'RATING_REPORT', { gameId: room.game.id, status: 'skipped', why: 'no_session' });
      }
      room.act(A, 'REMATCH_OFFER', { gameId: room.game.id });
      room.act(B, 'REMATCH_ANSWER', { gameId: room.game.id, accept: true });
      room.countIn();
    }
    expect(room.room.results).toHaveLength(5);
    expect(room.room.results[0].number).toBe(1);
    expect(room.room.results[0].rating.status).toBe('pending');
    expect(room.room.results.map((r) => r.number)).toEqual([1, 4, 5, 6, 7]);
  });

  it('never evicts the result that just ended, even when every older one is pending', () => {
    const { room, A, B } = playing();
    for (let i = 1; i <= 5; i += 1) {
      room.act(B, 'RESIGN', { gameId: room.game.id });
      if (i < 5) {
        room.act(A, 'REMATCH_OFFER', { gameId: room.game.id });
        room.act(B, 'REMATCH_ANSWER', { gameId: room.game.id, accept: true });
        room.countIn();
      }
    }
    expect(room.room.results.map((r) => r.rating.status)).toEqual(Array(5).fill('pending'));
    // Game 6 is unrated, so it is settled the moment it ends.
    const G = room.hello(guest('Guest 4821', 'guest_4821'));
    room.act(B, 'LEAVE_SEAT', {});
    room.act(G, 'TAKE_SEAT', { seat: 'O' });
    room.countIn();
    const sixth = room.game.id;
    room.act(G, 'RESIGN', { gameId: sixth });
    expect(latestResult(room.s)?.gameId).toBe(sixth);
    expect(latestResult(room.s)?.rating.status).toBe('unrated');
    expect(room.room.results.map((r) => r.number)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('drops the oldest pending result once pending results reach the ceiling', () => {
    const { room, A, B } = playing();
    const ids: string[] = [];
    for (let i = 0; i < RESULTS_CEILING + 2; i += 1) {
      ids.push(room.game.id);
      room.act(B, 'RESIGN', { gameId: room.game.id });
      expect(latestResult(room.s)?.gameId).toBe(ids[i]);
      room.act(A, 'REMATCH_OFFER', { gameId: room.game.id });
      room.act(B, 'REMATCH_ANSWER', { gameId: room.game.id, accept: true });
      room.countIn();
    }
    expect(room.room.results).toHaveLength(RESULTS_CEILING);
    expect(room.room.results.map((r) => r.number)).toEqual(Array.from({ length: RESULTS_CEILING }, (_, k) => k + 3));
    room.act(B, 'RATING_REPORT', { gameId: ids[0], status: 'saved' });
    expect(rejections(room.last)).toEqual(['no_result']);
  });
});

// ---------------------------------------------------------------------------
// 4.10 Discard, CLEAR_SEAT, settings
// ---------------------------------------------------------------------------

describe('DISCARD_GAME (4.10, A2)', () => {
  it('the host may discard a paused game with an empty seat at once', () => {
    const { room, A, B } = playing();
    room.move(A, 7, 7);
    room.act(A, 'LEAVE_SEAT', {});
    room.act(A, 'DISCARD_GAME', { gameId: room.game.id });
    expect(room.room.phase).toBe('waiting');
    expect(room.room.game).toBeNull();
    expect(room.room.autoStartArmed).toBe(true);
    expect(room.room.results).toEqual([]);
    expect(seatOf(room.s, B)).toBe('O');
  });

  it('the remaining seated player must wait 15 s after the seat emptied', () => {
    const { room, A, B } = playing();
    room.act(B, 'LEAVE_SEAT', {});
    // The host is also the remaining player here, and the host may discard at once.
    const r = room.act(A, 'DISCARD_GAME', { gameId: room.game.id });
    expect(rejections(r)).toEqual([]);
    expect(r.state.room.phase).toBe('waiting');

    const second = playing();
    const C = second.room.hello(registered('Cara', UID.C));
    second.room.act(second.A, 'LEAVE_SEAT', {});
    second.room.act(C, 'DISCARD_GAME', { gameId: second.room.game.id });
    expect(rejections(second.room.last)).toEqual(['not_host']);
    second.room.advance(DISCARD_GUARD_MS - 1);
    second.room.act(second.B, 'DISCARD_GAME', { gameId: second.room.game.id });
    expect(second.room.last.replies).toContainEqual({
      to: second.B,
      message: { type: 'REJECTED', payload: { type: 'DISCARD_GAME', reason: 'too_soon', retryInMs: 1 } },
    });
    second.room.advance(1);
    second.room.act(second.B, 'DISCARD_GAME', { gameId: second.room.game.id });
    expect(second.room.room.phase).toBe('waiting');
  });

  it('the guard runs from when the seat emptied, not from when the game paused', () => {
    const { room, A, B } = playing();
    const C = room.hello(registered('Cara', UID.C));
    room.act(A, 'LEAVE_SEAT', {});
    room.act(C, 'TAKE_SEAT', { seat: 'X' });
    room.countIn();
    expect(room.room.phase).toBe('playing');
    room.lost(C);
    expect(room.room.phase).toBe('paused');
    // Thirty seconds into the pause the seat empties; viewers still get their 15 s.
    room.advance(GRACE_MS);
    room.graceOut(C);
    expect(room.room.seats.X).toBeNull();
    const emptiedAt = room.now;
    room.advance(1);
    room.act(B, 'DISCARD_GAME', { gameId: room.game.id });
    expect(room.last.replies).toContainEqual({
      to: B,
      message: { type: 'REJECTED', payload: { type: 'DISCARD_GAME', reason: 'too_soon', retryInMs: DISCARD_GUARD_MS - 1 } },
    });
    room.now = emptiedAt + DISCARD_GUARD_MS;
    room.act(B, 'DISCARD_GAME', { gameId: room.game.id });
    expect(rejections(room.last)).toEqual([]);
    expect(room.room.phase).toBe('waiting');
  });

  it('the guard starts again when a viewer sits and stands again', () => {
    const { room, A, B } = playing();
    const D = room.hello(registered('Dan', UID.D));
    room.act(A, 'LEAVE_SEAT', {});
    room.advance(10_000);
    room.act(D, 'TAKE_SEAT', { seat: 'X' });
    expect(room.room.phase).toBe('countdown');
    room.act(D, 'LEAVE_SEAT', {});
    expect(room.room.phase).toBe('paused');
    // Twenty seconds after the seat first emptied, but only ten since it emptied again.
    room.advance(10_000);
    room.act(B, 'DISCARD_GAME', { gameId: room.game.id });
    expect(room.last.replies).toContainEqual({
      to: B,
      message: { type: 'REJECTED', payload: { type: 'DISCARD_GAME', reason: 'too_soon', retryInMs: 5_000 } },
    });
    room.advance(5_000);
    room.act(B, 'DISCARD_GAME', { gameId: room.game.id });
    expect(rejections(room.last)).toEqual([]);
    expect(room.room.phase).toBe('waiting');
  });

  it('is refused unless paused with an empty seat', () => {
    const { room, A, B } = playing();
    room.act(A, 'DISCARD_GAME', { gameId: room.game.id });
    expect(rejections(room.last)).toEqual(['not_paused']);
    room.lost(B);
    room.act(A, 'DISCARD_GAME', { gameId: room.game.id });
    expect(rejections(room.last)).toEqual(['no_empty_seat']);
    room.act(A, 'DISCARD_GAME', { gameId: 'nope' });
    expect(rejections(room.last)).toEqual(['wrong_game']);
  });
});

describe('CLEAR_SEAT (resolution 13)', () => {
  it('the host removes a player mid-game: paused, logged as removed, still in the room', () => {
    const { room, A, B } = playing();
    room.act(B, 'CLEAR_SEAT', { seat: 'X' });
    expect(rejections(room.last)).toEqual(['not_host']);
    room.act(A, 'CLEAR_SEAT', { seat: 'X' });
    expect(rejections(room.last)).toEqual(['own_seat']);
    room.act(A, 'CLEAR_SEAT', { seat: 'O' });
    expect(room.room.phase).toBe('paused');
    expect(room.room.seats.O).toBeNull();
    expect(room.room.members.some((m) => m.id === B)).toBe(true);
    expect(room.game.seatLog.at(-1)).toMatchObject({ seat: 'O', reason: 'removed' });
    room.act(A, 'CLEAR_SEAT', { seat: 'O' });
    expect(rejections(room.last)).toEqual(['seat_empty']);
    // Removal was the host's choice, not B's, so B has not given up the seat
    // (resolution 12 bars only a player who stood up or left).
    expect(room.game.gaveUp).not.toContain(UID.B);
    room.act(B, 'TAKE_SEAT', { seat: 'O' });
    expect(rejections(room.last)).toEqual([]);
    expect(room.room.phase).toBe('countdown');
  });

  it('clearing a seat in a waiting room re-arms auto-start', () => {
    const room = new Room();
    const B = room.hello(registered('Bob', UID.B));
    room.lost(B);
    expect(room.room.phase).toBe('waiting');
    room.act(room.hostId, 'CLEAR_SEAT', { seat: 'O' });
    expect(room.room.seats.O).toBeNull();
    expect(room.room.autoStartArmed).toBe(true);
  });
});

describe('UPDATE_SETTINGS', () => {
  it('is host-only, locked during a game, and limited to the offered options', () => {
    const room = new Room();
    room.act(room.hostId, 'UPDATE_SETTINGS', { settings: { ...OPEN, boardSize: 17 } });
    expect(rejections(room.last)).toEqual(['bad_settings']);
    room.act(room.hostId, 'UPDATE_SETTINGS', { settings: { ...OPEN, boardSize: 19, turnTimeSeconds: 30 } });
    expect(room.room.settings).toEqual({ ...OPEN, boardSize: 19, turnTimeSeconds: 30 });
    const B = room.hello(registered('Bob', UID.B));
    expect(room.game.settings.boardSize).toBe(19);
    room.act(B, 'UPDATE_SETTINGS', { settings: OPEN });
    expect(rejections(room.last)).toEqual(['not_host']);
    room.act(room.hostId, 'UPDATE_SETTINGS', { settings: OPEN });
    expect(rejections(room.last)).toEqual(['locked']);
  });
});

// ---------------------------------------------------------------------------
// Chat, buzz, tease
// ---------------------------------------------------------------------------

describe('chat, buzz and tease', () => {
  it('stamps and relays chat to everyone but the sender, and rate-limits it', () => {
    const { room, A, B } = playing();
    room.act(B, 'CHAT', { id: 'c1', text: '  hi  ' });
    const [relay] = room.last.events;
    expect(relay).toEqual({
      kind: 'broadcast',
      message: {
        type: 'CHAT',
        payload: {
          message: { id: 'c1', senderId: B, sender: 'Bob', senderAvatar: 'Ahri', text: 'hi', timestamp: room.now },
        },
      },
      except: [B],
    });
    room.advance(399);
    room.act(B, 'CHAT', { id: 'c2', text: 'again' });
    expect(rejections(room.last)).toEqual(['rate_limited']);
    room.advance(1);
    room.act(B, 'CHAT', { id: 'c3', text: 'x'.repeat(501) });
    expect(rejections(room.last)).toEqual(['too_long']);
    room.act(B, 'CHAT', { id: 'c4', text: '   ' });
    expect(rejections(room.last)).toEqual(['empty']);
    room.act(A, 'CHAT', { id: 'c5', text: 'img', image: 'https://evil.example/x.png' });
    expect(rejections(room.last)).toEqual(['bad_image']);
    room.act(A, 'CHAT', { id: 'c6', text: '', image: `data:image/png;base64,${'a'.repeat(CHAT_IMAGE_MAX)}` });
    expect(rejections(room.last)).toEqual(['bad_image']);
  });

  it('holds images back from the players during a game and delivers them when play stops', () => {
    const { room, A, B } = playing();
    const C = room.hello(registered('Cara', UID.C));
    room.act(C, 'CHAT', { id: 'p1', text: '', image: 'data:image/png;base64,AAAA' });
    const relay = room.last.events.find((e) => e.kind === 'broadcast');
    expect(relay?.kind === 'broadcast' && relay.except).toEqual([C, A, B]);
    room.advance(1_000);
    room.act(C, 'CHAT', { id: 'p2', text: '', image: 'data:image/png;base64,BBBB' });
    expect(rejections(room.last)).toEqual(['rate_limited']);
    room.act(B, 'LEAVE_SEAT', {});
    const delivered = room.last.replies.filter((r) => r.message.type === 'CHAT').map((r) => r.to);
    expect(delivered.sort()).toEqual([A, B].sort());
    expect(room.s.host.heldImages).toEqual([]);
  });

  it('sends the last text-only lines to a newcomer in WELCOME', () => {
    const room = new Room();
    room.act(room.hostId, 'CHAT', { id: 'c1', text: 'hello' });
    room.advance(500);
    room.act(room.hostId, 'CHAT', { id: 'c2', text: '', image: 'data:image/png;base64,AA' });
    room.hello(registered('Bob', UID.B));
    const welcome = room.last.replies.find((r) => r.message.type === 'WELCOME');
    const backlog = welcome?.message.type === 'WELCOME' ? welcome.message.payload.chatBacklog : [];
    expect(backlog.map((m) => m.id)).toEqual(['c1']);
  });

  it('lets only seated players buzz, at most every 2 s', () => {
    const { room, B } = playing();
    const C = room.hello(registered('Cara', UID.C));
    room.act(C, 'BUZZ', {});
    expect(rejections(room.last)).toEqual(['not_seated']);
    room.act(B, 'BUZZ', {});
    expect(broadcasts(room.last, 'BUZZ')).toEqual([{ type: 'BUZZ', payload: { fromSeat: 'O', fromName: 'Bob' } }]);
    room.advance(1_999);
    room.act(B, 'BUZZ', {});
    expect(rejections(room.last)).toEqual(['rate_limited']);
  });

  it('TEASE: validation, broadcast, and both cooldowns', () => {
    const { room, A, B } = playing();
    const C = room.hello(registered('Cara', UID.C));
    room.act(A, 'TEASE', { targetMemberId: 'nobody' });
    expect(rejections(room.last)).toEqual(['no_target']);
    room.act(A, 'TEASE', { targetMemberId: A });
    expect(rejections(room.last)).toEqual(['self']);

    room.act(A, 'TEASE', { targetMemberId: C });
    expect(broadcasts(room.last, 'TEASE')).toEqual([
      { type: 'TEASE', payload: { fromMemberId: A, fromName: 'Alice', toMemberId: C, toName: 'Cara', at: room.now } },
    ]);

    // The sender cooldown: 3 s before teasing anyone.
    room.advance(2_000);
    room.act(A, 'TEASE', { targetMemberId: B });
    expect(room.last.replies).toContainEqual({
      to: A,
      message: { type: 'REJECTED', payload: { type: 'TEASE', reason: 'cooldown', retryInMs: 1_000 } },
    });
    room.advance(1_000);
    room.act(A, 'TEASE', { targetMemberId: B });
    expect(rejections(room.last)).toEqual([]);

    // The pair cooldown: 10 s before teasing the same person again.
    room.advance(5_000);
    room.act(A, 'TEASE', { targetMemberId: C });
    expect(room.last.replies).toContainEqual({
      to: A,
      message: { type: 'REJECTED', payload: { type: 'TEASE', reason: 'cooldown', retryInMs: 2_000 } },
    });
    room.advance(2_000);
    room.act(A, 'TEASE', { targetMemberId: C });
    expect(rejections(room.last)).toEqual([]);

    // Somebody else's cooldown is their own.
    room.act(B, 'TEASE', { targetMemberId: C });
    expect(rejections(room.last)).toEqual([]);

    room.lost(C);
    room.advance(TEASE_WAIT);
    room.act(B, 'TEASE', { targetMemberId: C });
    expect(rejections(room.last)).toEqual(['target_away']);
  });

  it('TEASE never changes the room state', () => {
    const { room, A } = playing();
    const C = room.hello(registered('Cara', UID.C));
    const rev = room.room.rev;
    room.act(A, 'TEASE', { targetMemberId: C });
    expect(room.room.rev).toBe(rev);
    expect(hasRoomState(room.last)).toBe(false);
  });
});

const TEASE_WAIT = 10_000;

// ---------------------------------------------------------------------------
// Host restore, requests and the malformed-message kick
// ---------------------------------------------------------------------------

describe('host restore (5.3)', () => {
  it('round-trips through JSON with the clocks exact to the millisecond', () => {
    const { room, A, B } = playing(TIMED);
    const C = room.hello(registered('Cara', UID.C));
    room.advance(3_217);
    room.move(A, 7, 7);
    room.advance(4_561);
    room.pong(B, C);
    const before = room.clocks();
    expect(before).toEqual({ X: 296_783, O: 295_439, turn: 25_439, elapsed: 7_778, running: true });

    const saved = JSON.parse(JSON.stringify(snapshot(room.s, room.now)));
    room.advance(9_999); // the reload takes a while; none of it may be charged
    room.s = restore(saved, room.now);
    expect(checkInvariants(room.s)).toEqual([]);
    expect(room.room.phase).toBe('paused');
    expect(room.room.members.filter((m) => !m.isHost).every((m) => !m.connected)).toBe(true);
    expect(room.clocks()).toEqual({ ...before, running: false });

    room.resume(C);
    expect(room.room.phase).toBe('paused');
    room.resume(B);
    expect(room.room.phase).toBe('countdown');
    expect(room.room.countdown?.resuming).toBe(true);
    room.countIn();
    expect(room.clocks()).toEqual(before);
    room.advance(1_234);
    expect(room.clocks()).toEqual({ ...before, O: before.O - 1_234, turn: before.turn - 1_234, elapsed: before.elapsed + 1_234 });
    expect(seatOf(room.s, B)).toBe('O');
    expect(room.game.moves).toEqual([[7, 7]]);
  });

  it('keeps settings and privacy, and turns a fresh count-in back into waiting', () => {
    const room = new Room({ ...OPEN, boardSize: 19 });
    room.s = { ...room.s, room: { ...room.s.room, isPublic: false } };
    room.hello(registered('Bob', UID.B));
    expect(room.room.phase).toBe('countdown');
    const restored = restore(snapshot(room.s, room.now), room.now + 500);
    expect(checkInvariants(restored)).toEqual([]);
    expect(restored.room.phase).toBe('waiting');
    expect(restored.room.game).toBeNull();
    expect(restored.room.autoStartArmed).toBe(true);
    expect(restored.room.isPublic).toBe(false);
    expect(restored.room.settings.boardSize).toBe(19);
    expect(restored.room.rev).toBe(room.room.rev + 1);
  });

  it('grace after a restore runs from the restore', () => {
    const { room, B } = playing();
    room.s = restore(snapshot(room.s, room.now), room.now + 5_000);
    room.advance(5_000 + GRACE_MS - 1);
    room.graceOut(B);
    expect(room.room.members.some((m) => m.id === B)).toBe(true);
  });
});

describe('misc', () => {
  it('answers STATE_REQUEST to the sender only, without a state change', () => {
    const { room, B } = playing();
    const rev = room.room.rev;
    room.act(B, 'STATE_REQUEST', {});
    expect(room.last.replies).toHaveLength(1);
    expect(room.last.replies[0].to).toBe(B);
    expect(room.last.replies[0].message.type).toBe('ROOM_STATE');
    expect(room.room.rev).toBe(rev);
    expect(room.last.events).toEqual([]);
  });

  it('bumps rev once per visible change and not for a PONG', () => {
    const { room, A, B } = playing();
    const rev = room.room.rev;
    room.pong(B);
    expect(room.room.rev).toBe(rev);
    room.move(A, 7, 7);
    expect(room.room.rev).toBe(rev + 1);
  });

  it('kicks after three malformed messages within ten seconds', () => {
    const room = new Room();
    let s = room.s;
    let r = noteMalformed(s, 'm1', T0);
    s = r.state;
    r = noteMalformed(s, 'm1', T0 + 5_000);
    s = r.state;
    expect(r.kick).toBe(false);
    r = noteMalformed(s, 'm1', T0 + 11_000);
    expect(r.kick).toBe(false);
    r = noteMalformed(r.state, 'm1', T0 + 12_000);
    expect(r.kick).toBe(true);
  });

  it('reports both seats filled and connected only when they are', () => {
    const { room, B } = playing();
    expect(bothSeatedAndConnected(room.s)).toBe(true);
    room.lost(B);
    expect(bothSeatedAndConnected(room.s)).toBe(false);
  });
});
