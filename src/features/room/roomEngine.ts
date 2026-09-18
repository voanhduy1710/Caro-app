/**
 * The Caro room engine: every rule of a v2 room, as pure functions.
 *
 * The host is the only authority. Each member, the host included, sends
 * intents; the host feeds them through applyIntent here and broadcasts what
 * comes back. Nothing in this file touches PeerJS, React, timers or the wall
 * clock. Every function takes `now` (host epoch milliseconds, from one clock
 * for the whole life of the room, restores included) so the whole room can be
 * replayed in a unit test, and so a host refresh can restore it exactly.
 *
 * Conventions:
 * - Functions never mutate their input. They return a new state plus the
 *   `replies` (messages for one connection) and `events` (broadcasts and
 *   connection chores) the hub must carry out, in that order.
 * - `rev` goes up by one whenever anything a member can see has changed, so
 *   members can discard stale snapshots.
 * - Host-private bookkeeping (tokens, deadlines, rate limits) lives in
 *   `EngineState.host` and never reaches the wire; toWire() builds what does.
 */
import { checkWin, createEmptyBoard } from '../../shared/utils/gomokuLogic';
import type { BoardMatrix } from '../../shared/utils/gomokuLogic';
import type { RoomSettings } from '../settings/types';
import {
  PROTOCOL_VERSION,
  cutToCodePoints,
  isAllowedSettings,
  MAX_NAME_CODE_POINTS,
  sanitizeProfile,
} from './protocol';
import type {
  EventKind,
  HostMessage,
  Intent,
  IntentPayloads,
  IntentType,
  MemberProfile,
  Phase,
  RatingReportStatus,
  RejectReason,
  RoomChatMessage,
  Seat,
} from './protocol';

export type { MemberProfile, Phase, Seat } from './protocol';
export { PROTOCOL_VERSION } from './protocol';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const MAX_MEMBERS = 8; // includes the host and members in grace
export const GRACE_MS = 30_000;
export const COUNTDOWN_MS = 3_000;
export const INSTANT_UNDO_MS = 5_000;
export const OFFER_TTL_MS = 30_000; // undo requests and rematch offers
/** The hub pings this often; any inbound message counts as a sign of life. */
export const PING_INTERVAL_MS = 2_000;
/** A connected member silent for longer than this is treated as dropped. */
export const LOST_AFTER_MS = 6_000;
/** The watchdog will not time out a side to move that has been silent this long. */
export const STALE_MOVER_MS = 3_000;
/** When a member is declared lost, time after their last message plus this is refunded. */
export const REFUND_AFTER_LAST_SEEN_MS = 1_000;
export const TEASE_PAIR_COOLDOWN_MS = 10_000;
export const TEASE_SENDER_COOLDOWN_MS = 3_000;
/** How long a seat must stay empty before the remaining player may end the game. */
export const DISCARD_GUARD_MS = 15_000;
export const RESULTS_KEPT = 5;
/**
 * The most results kept even when they are pending. A loser who never reports
 * would otherwise grow every ROOM_STATE by one result per game for ever.
 */
export const RESULTS_CEILING = 2 * RESULTS_KEPT;
export const SEAT_LOG_CAP = 64;
export const CHAT_TEXT_MAX = 500;
export const CHAT_IMAGE_MAX = 250_000;
export const CHAT_MIN_INTERVAL_MS = 400;
export const ROOM_IMAGE_INTERVAL_MS = 5_000;
export const CHAT_BACKLOG_SIZE = 50;
/** Images held back from a seated player during a game, per player. */
export const HELD_IMAGES_PER_MEMBER = 10;
export const BUZZ_INTERVAL_MS = 2_000;
export const MALFORMED_WINDOW_MS = 10_000;
export const MALFORMED_KICK_COUNT = 3;
export const RATING_DELTA_MAX = 64;

// ---------------------------------------------------------------------------
// State types
// ---------------------------------------------------------------------------

export interface Member {
  id: string; // host-assigned, 10 base36 characters
  profile: MemberProfile;
  isHost: boolean;
  connected: boolean;
  /** Set while connected is false. Only meaningful in a toWire() copy, which recomputes it. */
  graceMsLeft: number | null;
  joinedAt: number;
}

export interface PlayerRef {
  memberId: string;
  uid: string;
  name: string;
  rated: boolean;
  guest: boolean;
}

export interface SeatChange {
  seat: Seat;
  from: PlayerRef | null; // null when an empty seat is filled
  to: PlayerRef | null; // null when the seat is vacated
  atMove: number; // moves.length at the time
  reason: 'stood' | 'left' | 'dropped' | 'sat' | 'removed';
  at: number;
}

export interface Clocks {
  X: number; // total banks in ms (0 = unlimited when totalTimeMinutes = 0)
  O: number;
  T: number;
  turn: number; // per-move timer in ms (0 = unlimited when turnTimeSeconds = 0)
  elapsed: number;
  running: boolean;
}

export type RatingOutcome = { status: 'failed' | 'skipped' | 'unknown'; why: string | null };

export type RatingState =
  | { status: 'unrated'; why: 'guest' | 'local_account' | 'three_player'; guestSeats: Seat[] }
  | {
      status: 'pending';
      /** The seats whose clients attempt the submission: the loser, or both on a draw. */
      submitters: Seat[];
      /** Submitters that have reported without saving. */
      reports: Partial<Record<Seat, RatingOutcome>>;
    }
  | { status: 'saved'; by: Seat; deltas: { X: number; O: number } | null }
  | RatingOutcome;

export type ResultReason = '5_in_a_row' | 'board_full' | 'turn_timeout' | 'total_time_out' | 'resigned';

export interface GameResult {
  gameId: string;
  number: number;
  settings: RoomSettings;
  movesLength: number;
  winner: Seat | 'DRAW';
  line: Array<[number, number]> | null;
  reason: ResultReason;
  players: { X: PlayerRef; O: PlayerRef; T: PlayerRef }; // T mirrors X in a 1v1 result and is ignored there.
  rating: RatingState;
  endedAt: number;
}

export interface Game {
  id: string; // 16 base36 characters; the server's idempotency key
  number: number;
  /** The rules this game is played under, fixed at creation. Room settings may change later. */
  settings: RoomSettings;
  /** The fixed symbol of the player who made the first move. */
  openingSeat: Seat;
  /** Alternates from openingSeat; players themselves always retain X or O. */
  moves: Array<[number, number]>;
  /** Visual position of each move, index-for-index with `moves`. */
  moveCorners?: import('./protocol').MoveCorner[];
  /** The member who made each move, index for index with `moves`. */
  moveBy: string[];
  turn: Seat;
  clocks: Clocks;
  startedWith: { X: PlayerRef; O: PlayerRef; T: PlayerRef };
  seatLog: SeatChange[];
  /** Entries removed from the middle of seatLog to keep it at SEAT_LOG_CAP. */
  seatLogDropped: number;
  /** uids that stood up or left during this game and may not sit in it again. */
  gaveUp: string[];
  /** When each seat was last vacated during this game, for the discard guard. */
  vacatedAt: { X: number | null; O: number | null; T: number | null };
  lastMove: { by: string; at: number } | null;
  undo: { from: Seat; expiresAt: number } | null;
  rematch: { from: Seat; expiresAt: number } | null; // only while phase = ended
}

export interface RoomState {
  v: typeof PROTOCOL_VERSION;
  roomId: string;
  rev: number;
  isPublic: boolean;
  createdAt: number;
  settings: RoomSettings;
  members: Member[]; // host first, then join order
  seats: { X: string | null; O: string | null; T: string | null };
  phase: Phase;
  /** msLeft is only meaningful in a toWire() copy, which recomputes it. */
  countdown: { msLeft: number; resuming: boolean } | null;
  autoStartArmed: boolean;
  game: Game | null;
  /**
   * The last results, oldest first. The newest is never evicted, and a pending
   * one only when RESULTS_CEILING results are all waiting on their submitters.
   */
  results: GameResult[];
  /** Games that reached a result; numbers the next game even after a discard. */
  gamesPlayed: number;
  score: { pair: string; X: number; O: number; T: number };
  sentAt: number;
}

/** Host-only bookkeeping. None of it is ever sent to a member. */
export interface HostBook {
  hostMemberId: string;
  tokens: Record<string, string>;
  tabIds: Record<string, string>;
  lastSeenAt: Record<string, number>;
  graceEndsAt: Record<string, number>;
  /** When the running clocks were last banked; null whenever they are stopped. */
  runningSince: number | null;
  countdownEndsAt: number | null;
  teaseBySender: Record<string, number>;
  /** Keyed `${from}>${to}`. */
  teaseByPair: Record<string, number>;
  lastChatAt: Record<string, number>;
  lastImageAt: number | null;
  lastBuzzAt: Record<string, number>;
  malformedAt: Record<string, number[]>;
  chatBacklog: RoomChatMessage[];
  heldImages: Array<{ to: string; message: RoomChatMessage }>;
}

export interface EngineState {
  room: RoomState;
  host: HostBook;
}

/** A message for one connection. `to: null` is the unbound connection a HELLO arrived on. */
export interface Reply {
  to: string | null;
  message: HostMessage;
}

export type EngineEvent =
  /** Send toWire(state) as ROOM_STATE to every connected member except these. */
  | { kind: 'room_state'; except: string[] }
  | { kind: 'broadcast'; message: HostMessage; except: string[] }
  /**
   * Bind the HELLO connection to this member. An older connection bound to the
   * same member is closed: after SUPERSEDED when `supersede` (another tab),
   * silently otherwise (the same tab reconnecting).
   */
  | { kind: 'bind'; memberId: string; supersede: boolean }
  /** Close this member's connection after flushing, or the unbound HELLO connection when null. */
  | { kind: 'close'; memberId: string | null }
  | { kind: 'member_removed'; memberId: string };

export interface EngineResult {
  state: EngineState;
  events: EngineEvent[];
  replies: Reply[];
}

/** The only source of randomness, injectable so tests can predict ids. */
export interface EngineEnv {
  randomId(length: number): string;
  randomToken(): string;
}

const randomBytes = (count: number): Uint8Array => {
  const bytes = new Uint8Array(count);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
};

export const cryptoEnv: EngineEnv = {
  randomId: (length) =>
    Array.from(randomBytes(length), (b) => (b % 36).toString(36)).join(''),
  // 128 bits: the token is the only proof of identity on a resume.
  randomToken: () => Array.from(randomBytes(16), (b) => b.toString(16).padStart(2, '0')).join(''),
};

// ---------------------------------------------------------------------------
// Derived helpers
// ---------------------------------------------------------------------------

export const SEATS: readonly Seat[] = ['X', 'O', 'T'];
export const activeSeats = (settings: RoomSettings): readonly Seat[] =>
  settings.playerMode === 'oneVsOneVsOne' ? SEATS : ['X', 'O'];

export const otherSeat = (seat: Seat): Seat => (seat === 'X' ? 'O' : 'X');

export const nextSeat = (seat: Seat, settings: RoomSettings): Seat => {
  const seats = activeSeats(settings);
  return seats[(seats.indexOf(seat) + 1) % seats.length];
};

export const pieceAt = (index: number, openingSeat: Seat = 'X', settings?: RoomSettings): Seat => {
  const seats = settings ? activeSeats(settings) : (['X', 'O'] as const);
  return seats[(seats.indexOf(openingSeat) + index) % seats.length];
};

export const boardFromMoves = (
  moves: ReadonlyArray<[number, number]>,
  size: number,
  openingSeat: Seat = 'X',
  settings?: RoomSettings,
): BoardMatrix => {
  const board = createEmptyBoard(size);
  moves.forEach(([row, col], i) => {
    board[row][col] = pieceAt(i, openingSeat, settings);
  });
  return board;
};

const roomOf = (state: EngineState | RoomState): RoomState => ('room' in state ? state.room : state);

export const findMember = (state: EngineState | RoomState, memberId: string | null): Member | undefined =>
  memberId === null ? undefined : roomOf(state).members.find((m) => m.id === memberId);

export const seatOf = (state: EngineState | RoomState, memberId: string | null): Seat | null => {
  const { seats } = roomOf(state);
  if (memberId === null) return null;
  if (seats.X === memberId) return 'X';
  if (seats.O === memberId) return 'O';
  if (seats.T === memberId) return 'T';
  return null;
};

export const occupant = (state: EngineState | RoomState, seat: Seat): Member | undefined =>
  findMember(state, roomOf(state).seats[seat]);

export const bothSeatedAndConnected = (state: EngineState | RoomState): boolean =>
  activeSeats(roomOf(state).settings).every((seat) => occupant(state, seat)?.connected === true);

/** The newest result, which the result card shows. */
export const latestResult = (state: EngineState | RoomState): GameResult | null => {
  const { results } = roomOf(state);
  return results.length ? results[results.length - 1] : null;
};

export const turnLimitMs = (settings: RoomSettings): number => settings.turnTimeSeconds * 1000;
export const bankLimitMs = (settings: RoomSettings): number => settings.totalTimeMinutes * 60_000;

/**
 * The clocks `ms` milliseconds after they were banked. Only a running clock
 * moves, and only the bank of the side to move, the per-move timer and the
 * elapsed time; a limit of 0 means unlimited, so that clock never moves.
 * Clients call this with the time since the last ROOM_STATE, MOVE_APPLIED or
 * CLOCK_SYNC; the host calls it with the time since it last banked.
 */
export const liveClocks = (game: Pick<Game, 'clocks' | 'turn' | 'settings'>, ms: number): Clocks => {
  const clocks = { ...game.clocks };
  if (!clocks.running || ms <= 0) return clocks;
  if (game.settings.totalTimeMinutes > 0) clocks[game.turn] = Math.max(0, clocks[game.turn] - ms);
  if (game.settings.turnTimeSeconds > 0) clocks.turn = Math.max(0, clocks.turn - ms);
  clocks.elapsed += ms;
  return clocks;
};

const liveClocksAt = (state: EngineState, now: number): Clocks | null => {
  const { game } = state.room;
  if (!game) return null;
  const since = state.host.runningSince;
  return liveClocks(game, since === null ? 0 : now - since);
};

const playerRef = (member: Member): PlayerRef => ({
  memberId: member.id,
  uid: member.profile.uid,
  name: member.profile.name,
  rated: member.profile.rated,
  guest: member.profile.guest,
});

export type RatingDecision =
  | { rated: false; why: 'guest' | 'local_account'; guestSeats: Seat[] }
  | { rated: true; submitters: Seat[] };

/**
 * Who, if anyone, submits a result to the rating server.
 *
 * The server only accepts a submission from a player whose rating does not go
 * up, so the protection comes from the server, not from this choice. The
 * choice only has to name a client the server will accept: the loser on a
 * decisive result. On a draw the host cannot know which side's delta is not
 * positive, because that depends on stored ratings it cannot trust, so both
 * registered players attempt with the same gameId; the server keeps one and
 * refuses the other, and the idempotency key stops a double count.
 */
export const ratingDecision = (result: Pick<GameResult, 'winner' | 'players'>): RatingDecision => {
  const ratedSeats = result.players.T.memberId === result.players.X.memberId ? (['X', 'O'] as const) : SEATS;
  const unratedSeats = ratedSeats.filter((seat) => !result.players[seat].rated);
  if (unratedSeats.length > 0) {
    const anyGuest = unratedSeats.some((seat) => result.players[seat].guest);
    return { rated: false, why: anyGuest ? 'guest' : 'local_account', guestSeats: unratedSeats };
  }
  if (result.winner === 'DRAW') return { rated: true, submitters: ['X', 'O'] };
  return { rated: true, submitters: [otherSeat(result.winner)] };
};

/** Every rule the room must hold between two host mutations; empty when all hold. */
export const checkInvariants = (state: EngineState | RoomState): string[] => {
  const room = roomOf(state);
  const problems: string[] = [];
  const hasGame = room.game !== null;
  const gamePhase = room.phase !== 'waiting';
  if (hasGame !== gamePhase) problems.push(`phase ${room.phase} with game ${hasGame ? 'present' : 'absent'}`);
  if (room.phase === 'playing') {
    if (!bothSeatedAndConnected(room)) problems.push('playing without two connected occupants');
    if (!room.game?.clocks.running) problems.push('playing with stopped clocks');
  }
  if (room.game?.clocks.running && room.phase !== 'playing') problems.push('clocks running outside playing');
  if ((room.countdown !== null) !== (room.phase === 'countdown')) problems.push('countdown out of step with phase');
  const occupiedIds = SEATS.map((seat) => room.seats[seat]).filter((id): id is string => id !== null);
  if (new Set(occupiedIds).size !== occupiedIds.length) problems.push('one member in multiple seats');
  for (const seat of SEATS) {
    const id = room.seats[seat];
    if (id !== null && !room.members.some((m) => m.id === id)) problems.push(`seat ${seat} holds a non-member`);
  }
  const x = occupant(room, 'X');
  const o = occupant(room, 'O');
  if (x && o && x.profile.uid === o.profile.uid) problems.push('one account in both seats');
  if (room.members.length > MAX_MEMBERS) problems.push('too many members');
  if (!room.members[0]?.isHost || room.members.filter((m) => m.isHost).length !== 1) {
    problems.push('host is not the single first member');
  }
  if (room.game && room.game.moveBy.length !== room.game.moves.length) problems.push('moveBy out of step with moves');
  if (room.game && room.game.seatLog.length > SEAT_LOG_CAP) problems.push('seatLog over its cap');
  if (room.results.length > RESULTS_CEILING) problems.push('results over their ceiling');
  if ('host' in state) {
    if ((state.host.runningSince !== null) !== (room.game?.clocks.running === true)) {
      problems.push('runningSince out of step with the clocks');
    }
    if ((state.host.countdownEndsAt !== null) !== (room.phase === 'countdown')) {
      problems.push('countdown deadline out of step with phase');
    }
  }
  return problems;
};

// ---------------------------------------------------------------------------
// Construction, serialisation and restore
// ---------------------------------------------------------------------------

export interface CreateRoomOptions {
  roomId: string;
  isPublic: boolean;
  settings: RoomSettings;
  /** Sanitised the same way as any member's, so the host gets no special display rights. */
  hostProfile: unknown;
  hostTabId?: string;
}

/** A new room: the host alone, seated in X, with auto-start armed for the first opponent. */
export const createRoom = (opts: CreateRoomOptions, now: number, env: EngineEnv = cryptoEnv): EngineState => {
  const profile = sanitizeProfile(opts.hostProfile);
  if (!profile) throw new Error('createRoom: the host profile has no usable uid');
  if (!isAllowedSettings(opts.settings)) throw new Error('createRoom: settings outside the allowed options');
  const hostId = env.randomId(10);
  return {
    room: {
      v: PROTOCOL_VERSION,
      roomId: opts.roomId,
      rev: 1,
      isPublic: opts.isPublic,
      createdAt: now,
      settings: { ...opts.settings, playerMode: opts.settings.playerMode ?? 'oneVsOne' },
      members: [{ id: hostId, profile, isHost: true, connected: true, graceMsLeft: null, joinedAt: now }],
      seats: { X: hostId, O: null, T: null },
      phase: 'waiting',
      countdown: null,
      autoStartArmed: true,
      game: null,
      results: [],
      gamesPlayed: 0,
      score: { pair: '', X: 0, O: 0, T: 0 },
      sentAt: now,
    },
    host: {
      hostMemberId: hostId,
      tokens: {},
      tabIds: opts.hostTabId ? { [hostId]: opts.hostTabId } : {},
      lastSeenAt: {},
      graceEndsAt: {},
      runningSince: null,
      countdownEndsAt: null,
      teaseBySender: {},
      teaseByPair: {},
      lastChatAt: {},
      lastImageAt: null,
      lastBuzzAt: {},
      malformedAt: {},
      chatBacklog: [],
      heldImages: [],
    },
  };
};

/**
 * The state as members see it at `now`: clocks, the count-in and grace
 * periods recomputed to that instant, and nothing host-private.
 */
export const toWire = (state: EngineState, now: number): RoomState => {
  const room = structuredClone(state.room);
  room.sentAt = now;
  for (const member of room.members) {
    const endsAt = state.host.graceEndsAt[member.id];
    member.graceMsLeft = member.connected || endsAt === undefined ? null : Math.max(0, endsAt - now);
  }
  if (room.countdown) room.countdown.msLeft = Math.max(0, (state.host.countdownEndsAt ?? now) - now);
  const clocks = liveClocksAt(state, now);
  if (room.game && clocks) room.game.clocks = clocks;
  return room;
};

/** CLOCK_SYNC for the hub's periodic send while playing, or null when there is nothing to sync. */
export const clockSync = (state: EngineState, now: number): HostMessage | null => {
  const { game } = state.room;
  const clocks = liveClocksAt(state, now);
  if (!game || !clocks || state.room.phase !== 'playing') return null;
  return { type: 'CLOCK_SYNC', payload: { gameId: game.id, clocks, rev: state.room.rev } };
};

export interface HostSnapshot {
  state: EngineState;
  savedAt: number;
}

/**
 * What the host keeps in sessionStorage. The clocks are banked at `now`, so a
 * restore resumes them from exactly this instant however long the reload took.
 * Held images are left out: they are large and sessionStorage is small.
 */
export const snapshot = (state: EngineState, now: number): HostSnapshot => {
  const d = cloneState(state);
  bankClocks(d, now);
  d.host.heldImages = [];
  return { state: structuredClone(d), savedAt: now };
};

/**
 * Brings a room back after the host tab reloaded. Every connection died with
 * the old tab, so every member starts a fresh grace period and has to HELLO
 * again; a game in progress is paused until both players are back, and a new
 * game that had not started yet is dropped rather than paused at move 0.
 */
export const restore = (snap: HostSnapshot, now: number): EngineState => {
  const d = cloneState(snap.state);
  const { room, host } = d;
  // v2 snapshots predate the third seat. Keep them playable as 1v1 rooms.
  room.settings.playerMode ??= 'oneVsOne';
  room.seats.T ??= null;
  room.score.T ??= 0;
  if (room.game) {
    room.game.settings.playerMode ??= 'oneVsOne';
    room.game.clocks.T ??= room.game.clocks.X;
    room.game.startedWith.T ??= room.game.startedWith.X;
    room.game.vacatedAt.T ??= null;
  }
  for (const result of room.results) result.players.T ??= result.players.X;
  room.rev += 1;
  for (const member of room.members) {
    if (member.isHost) {
      member.connected = true;
      member.graceMsLeft = null;
      continue;
    }
    member.connected = false;
    member.graceMsLeft = GRACE_MS;
    host.graceEndsAt[member.id] = now + GRACE_MS;
  }
  host.lastSeenAt = {};
  host.lastChatAt = {};
  host.lastBuzzAt = {};
  host.malformedAt = {};
  host.lastImageAt = null;
  host.heldImages = [];
  const game = room.game;
  if (game) {
    // The snapshot banked the clocks when it was saved; stopping them here
    // without banking again is what keeps them exact across the reload.
    game.clocks.running = false;
    host.runningSince = null;
    game.undo = null;
    if (room.phase === 'playing') room.phase = 'paused';
    if (room.phase === 'countdown') {
      if (room.countdown?.resuming) {
        room.phase = 'paused';
      } else {
        room.game = null;
        room.phase = 'waiting';
        room.autoStartArmed = true;
      }
      room.countdown = null;
    }
  }
  host.countdownEndsAt = null;
  return d;
};

// ---------------------------------------------------------------------------
// Internal machinery
// ---------------------------------------------------------------------------

interface Ctx {
  now: number;
  env: EngineEnv;
  events: EngineEvent[];
  replies: Reply[];
  /** Set by a move that did not end the game: MOVE_APPLIED replaces ROOM_STATE. */
  moveApplied: { n: number; row: number; col: number; corner?: import('./protocol').MoveCorner } | null;
  welcome: { memberId: string; token: string; resumed: boolean; expired: boolean } | null;
}

const newCtx = (now: number, env: EngineEnv): Ctx => ({
  now,
  env,
  events: [],
  replies: [],
  moveApplied: null,
  welcome: null,
});

/**
 * A working copy. The room is small, so it is cloned outright; the book is
 * copied one level deep, and the chat arrays share their (never mutated)
 * messages so large held images are not copied four times a second by tick().
 */
const cloneState = (state: EngineState): EngineState => {
  const h = state.host;
  const malformedAt: Record<string, number[]> = {};
  for (const [id, times] of Object.entries(h.malformedAt)) malformedAt[id] = [...times];
  return {
    room: structuredClone(state.room),
    host: {
      ...h,
      tokens: { ...h.tokens },
      tabIds: { ...h.tabIds },
      lastSeenAt: { ...h.lastSeenAt },
      graceEndsAt: { ...h.graceEndsAt },
      teaseBySender: { ...h.teaseBySender },
      teaseByPair: { ...h.teaseByPair },
      lastChatAt: { ...h.lastChatAt },
      lastBuzzAt: { ...h.lastBuzzAt },
      malformedAt,
      chatBacklog: [...h.chatBacklog],
      heldImages: [...h.heldImages],
    },
  };
};

const reject = (
  ctx: Ctx,
  to: string | null,
  type: IntentType,
  reason: RejectReason,
  retryInMs?: number,
): void => {
  const payload = retryInMs === undefined ? { type, reason } : { type, reason, retryInMs };
  ctx.replies.push({ to, message: { type: 'REJECTED', payload } });
};

const sendEvent = (ctx: Ctx, to: Member | undefined, kind: EventKind, extra: { seat?: Seat; why?: string } = {}) => {
  if (to) ctx.replies.push({ to: to.id, message: { type: 'EVENT', payload: { kind, ...extra } } });
};

/** Moves the running clocks' used time into the banks, as of `at`. */
const bankClocks = (d: EngineState, at: number): void => {
  const { game } = d.room;
  const since = d.host.runningSince;
  if (!game || since === null || !game.clocks.running) return;
  game.clocks = liveClocks(game, Math.max(0, at - since));
  d.host.runningSince = Math.max(since, at);
};

const stopClocks = (d: EngineState, at: number): void => {
  bankClocks(d, at);
  if (d.room.game) d.room.game.clocks.running = false;
  d.host.runningSince = null;
};

const fullClocks = (settings: RoomSettings): Clocks => ({
  X: bankLimitMs(settings),
  O: bankLimitMs(settings),
  T: bankLimitMs(settings),
  turn: turnLimitMs(settings),
  elapsed: 0,
  running: false,
});

const appendSeatChange = (game: Game, change: SeatChange): void => {
  // Keep the first half (who started) and the most recent half (who finished);
  // the middle of a long casual game matters least and the server caps it anyway.
  if (game.seatLog.length >= SEAT_LOG_CAP) {
    game.seatLog.splice(SEAT_LOG_CAP / 2, 1);
    game.seatLogDropped += 1;
  }
  game.seatLog.push(change);
};

const startCountdown = (d: EngineState, resuming: boolean, now: number): void => {
  d.room.phase = 'countdown';
  d.room.countdown = { msLeft: COUNTDOWN_MS, resuming };
  d.host.countdownEndsAt = now + COUNTDOWN_MS;
};

const startNewGame = (d: EngineState, ctx: Ctx): void => {
  const x = occupant(d, 'X');
  const o = occupant(d, 'O');
  const t = occupant(d, 'T');
  if (!x || !o || (d.room.settings.playerMode === 'oneVsOneVsOne' && !t)) return;
  const settings = {
    ...d.room.settings,
    placementMode: d.room.settings.placementMode ?? 'normal',
    playerMode: d.room.settings.playerMode ?? 'oneVsOne',
  };
  // The host occupies X in a fresh room, so X opens game one. Every completed
  // game flips the opening seat: O opens game two, X game three, and so on.
  // `gamesPlayed` only increments in endGame, so an aborted count-in does not
  // accidentally consume a player's turn to open.
  const openingSeat = activeSeats(settings)[d.room.gamesPlayed % activeSeats(settings).length];
  d.room.game = {
    id: ctx.env.randomId(16),
    number: d.room.gamesPlayed + 1,
    settings,
    moves: [],
    moveCorners: [],
    moveBy: [],
    turn: openingSeat,
    openingSeat,
    clocks: fullClocks(settings),
    startedWith: { X: playerRef(x), O: playerRef(o), T: playerRef(t ?? x) },
    seatLog: [],
    seatLogDropped: 0,
    gaveUp: [],
    vacatedAt: { X: null, O: null, T: null },
    lastMove: null,
    undo: null,
    rematch: null,
  };
  d.host.runningSince = null;
  d.room.autoStartArmed = false;
  startCountdown(d, false, ctx.now);
};

/**
 * A count-in cannot survive a missing player. A fresh game has no moves to
 * keep, so it is dropped and the room waits again; a resuming game goes back
 * to paused exactly as it was.
 */
const abortCountdown = (d: EngineState): void => {
  const { room } = d;
  if (room.countdown?.resuming) {
    room.phase = 'paused';
  } else {
    room.game = null;
    room.phase = 'waiting';
    room.autoStartArmed = true;
  }
  room.countdown = null;
  d.host.countdownEndsAt = null;
};

/** Stops play. A pending take-back cannot outlive a pause, so it expires with notice. */
const pause = (d: EngineState, ctx: Ctx, bankAt: number): void => {
  const { game } = d.room;
  if (!game) return;
  stopClocks(d, bankAt);
  d.room.phase = 'paused';
  if (game.undo) {
    const requester = occupant(d, game.undo.from);
    game.undo = null;
    sendEvent(ctx, requester, 'undo_expired');
  }
};

const vacate = (d: EngineState, seat: Seat, reason: SeatChange['reason'], ctx: Ctx): void => {
  const { room } = d;
  const member = occupant(d, seat);
  room.seats[seat] = null;
  const { game } = room;
  if (game) {
    game.undo = null;
    game.rematch = null;
    if (member && (room.phase === 'countdown' || room.phase === 'playing' || room.phase === 'paused')) {
      appendSeatChange(game, {
        seat,
        from: playerRef(member),
        to: null,
        atMove: game.moves.length,
        reason,
        at: ctx.now,
      });
      game.vacatedAt[seat] = ctx.now;
      // Standing up freezes both clocks. Without this, a player short of time
      // could stand, think for free, and sit again with the same clocks. Only
      // the player's own choice bars them: a drop is not a choice, and neither
      // is the host's Remove, which is mostly used on someone still stuck
      // reconnecting who should be free to sit again once they are back.
      const choseToGo = reason === 'stood' || reason === 'left';
      if (choseToGo && !game.gaveUp.includes(member.profile.uid)) game.gaveUp.push(member.profile.uid);
    }
  }
  if (room.phase === 'waiting' || room.phase === 'ended') room.autoStartArmed = true;
  ctx.events.push({ kind: 'broadcast', message: { type: 'EVENT', payload: { kind: 'seat_opened', seat } }, except: [] });
};

/** Empties a seat, then does what the phase demands: pause a game, or abort a count-in. */
const vacateSeat = (d: EngineState, seat: Seat, reason: SeatChange['reason'], ctx: Ctx): void => {
  switch (d.room.phase) {
    case 'playing':
      vacate(d, seat, reason, ctx);
      pause(d, ctx, ctx.now);
      break;
    case 'countdown':
      abortCountdown(d);
      vacate(d, seat, reason, ctx);
      break;
    default:
      vacate(d, seat, reason, ctx);
  }
};

const settleRating = (result: GameResult): void => {
  const rating = result.rating;
  if (rating.status !== 'pending') return;
  const outcomes = rating.submitters.map((seat) => rating.reports[seat]);
  if (outcomes.some((o) => o === undefined)) return;
  const done = outcomes as RatingOutcome[];
  // Prefer the outcome that tells people the most: "may have been saved"
  // beats "could not be saved", which beats "not rated".
  const pick =
    done.find((o) => o.status === 'unknown') ?? done.find((o) => o.status === 'failed') ?? done[0];
  result.rating = { status: pick.status, why: pick.why };
};

/**
 * A submitter who leaves while their result is pending may still have a
 * request in flight, so the outcome is unknown rather than failed.
 */
const markSubmitterGone = (d: EngineState, memberId: string): void => {
  for (const result of d.room.results) {
    const rating = result.rating;
    if (rating.status !== 'pending') continue;
    for (const seat of rating.submitters) {
      if (result.players[seat].memberId === memberId && !rating.reports[seat]) {
        rating.reports[seat] = { status: 'unknown', why: 'submitter_left' };
      }
    }
    settleRating(result);
  }
};

const removeMember = (d: EngineState, memberId: string, ctx: Ctx): void => {
  const { host } = d;
  d.room.members = d.room.members.filter((m) => m.id !== memberId);
  delete host.tokens[memberId];
  delete host.tabIds[memberId];
  delete host.lastSeenAt[memberId];
  delete host.graceEndsAt[memberId];
  delete host.teaseBySender[memberId];
  delete host.lastChatAt[memberId];
  delete host.lastBuzzAt[memberId];
  delete host.malformedAt[memberId];
  for (const key of Object.keys(host.teaseByPair)) {
    const [from, to] = key.split('>');
    if (from === memberId || to === memberId) delete host.teaseByPair[key];
  }
  host.heldImages = host.heldImages.filter((h) => h.to !== memberId);
  markSubmitterGone(d, memberId);
  ctx.events.push({ kind: 'member_removed', memberId });
};

/**
 * Which clock ran out for the side to move, if one did. When both did, the one
 * with less time left when last banked ran out first.
 */
const expiredClock = (d: EngineState, now: number): 'turn_timeout' | 'total_time_out' | null => {
  const { game } = d.room;
  const live = liveClocksAt(d, now);
  if (!game || !live || !game.clocks.running) return null;
  const bankOut = game.settings.totalTimeMinutes > 0 && live[game.turn] <= 0;
  const turnOut = game.settings.turnTimeSeconds > 0 && live.turn <= 0;
  if (bankOut && turnOut) return game.clocks[game.turn] <= game.clocks.turn ? 'total_time_out' : 'turn_timeout';
  if (bankOut) return 'total_time_out';
  if (turnOut) return 'turn_timeout';
  return null;
};

const endGame = (
  d: EngineState,
  winner: Seat | 'DRAW',
  reason: ResultReason,
  line: Array<[number, number]> | null,
  ctx: Ctx,
): void => {
  const { room } = d;
  const game = room.game;
  const x = occupant(d, 'X');
  const o = occupant(d, 'O');
  const t = occupant(d, 'T');
  if (!game || !x || !o || (game.settings.playerMode === 'oneVsOneVsOne' && !t)) return;
  stopClocks(d, ctx.now);
  game.undo = null;
  game.rematch = null;
  room.phase = 'ended';
  room.countdown = null;
  d.host.countdownEndsAt = null;
  const pair = `${x.id}|${o.id}`;
  if (room.score.pair !== pair) room.score = { pair, X: 0, O: 0, T: 0 };
  if (winner !== 'DRAW') room.score[winner] += 1;
  const players = { X: playerRef(x), O: playerRef(o), T: playerRef(t ?? x) };
  const rating: RatingState = game.settings.playerMode === 'oneVsOneVsOne'
    ? { status: 'unrated', why: 'three_player', guestSeats: [] }
    : (() => {
        const decision = ratingDecision({ winner, players: { X: players.X, O: players.O, T: players.T } });
        return decision.rated
          ? { status: 'pending', submitters: decision.submitters, reports: {} }
          : { status: 'unrated', why: decision.why, guestSeats: decision.guestSeats };
      })();
  room.results.push({
    gameId: game.id,
    number: game.number,
    settings: { ...game.settings },
    movesLength: game.moves.length,
    winner,
    line,
    reason,
    players,
    rating,
    endedAt: ctx.now,
  });
  // Evict the oldest settled results first. A pending one is kept: its
  // submitter may still be working on it, and a quick rematch must not make
  // the rating report bounce. The result just pushed is never a candidate,
  // because the result card shows the newest entry and it must be this game.
  // Past the ceiling the oldest pending result goes too; only a submitter who
  // has not reported for that many games gets there, and the server still
  // holds whatever they did send, so the room merely stops showing it.
  while (room.results.length > RESULTS_KEPT) {
    const newest = room.results.length - 1;
    let i = room.results.findIndex((r, k) => k < newest && r.rating.status !== 'pending');
    if (i === -1) {
      if (room.results.length <= RESULTS_CEILING) break;
      i = 0;
    }
    room.results.splice(i, 1);
  }
  room.gamesPlayed += 1;
};

/** The two rules that start play on their own, checked after every mutation. */
const runStartChecks = (d: EngineState, ctx: Ctx): void => {
  const { room } = d;
  if (!bothSeatedAndConnected(d)) return;
  if (room.phase === 'paused') {
    startCountdown(d, true, ctx.now);
  } else if ((room.phase === 'waiting' || room.phase === 'ended') && room.autoStartArmed) {
    startNewGame(d, ctx);
  }
};

const finalize = (before: EngineState, d: EngineState, ctx: Ctx): EngineResult => {
  runStartChecks(d, ctx);

  // Images held back from the players during a game go out as soon as play stops.
  if (d.room.phase !== 'playing' && d.host.heldImages.length > 0) {
    for (const held of d.host.heldImages) {
      if (findMember(d, held.to)) ctx.replies.push({ to: held.to, message: { type: 'CHAT', payload: { message: held.message } } });
    }
    d.host.heldImages = [];
  }

  const changed = JSON.stringify(before.room) !== JSON.stringify(d.room);
  if (changed) d.room.rev = before.room.rev + 1;

  const { game } = d.room;
  if (ctx.moveApplied && game) {
    ctx.events.push({
      kind: 'broadcast',
      message: {
        type: 'MOVE_APPLIED',
        payload: { ...ctx.moveApplied, gameId: game.id, turn: game.turn, clocks: { ...game.clocks }, rev: d.room.rev },
      },
      except: [],
    });
  } else if (changed) {
    ctx.events.push({ kind: 'room_state', except: ctx.welcome ? [ctx.welcome.memberId] : [] });
  }

  if (ctx.welcome) {
    const { memberId, token, resumed, expired } = ctx.welcome;
    ctx.replies.push({
      to: memberId,
      message: {
        type: 'WELCOME',
        payload: {
          memberId,
          token,
          resumed,
          ...(expired ? { expired: true } : {}),
          state: toWire(d, ctx.now),
          chatBacklog: [...d.host.chatBacklog],
        },
      },
    });
  }
  return { state: d, events: ctx.events, replies: ctx.replies };
};

const uniqueMemberId = (d: EngineState, env: EngineEnv): string => {
  for (;;) {
    const id = env.randomId(10);
    if (!findMember(d, id)) return id;
  }
};

const nameKey = (name: string): string => name.normalize('NFKC').toLowerCase();

/**
 * Names are self-chosen, so a viewer could call themselves after a seated
 * player and speak in chat as them. A clash gets " (2)", " (3)" and so on,
 * compared case-insensitively so "alice" cannot pass for "Alice".
 */
export const dedupeName = (name: string, taken: string[]): string => {
  const used = new Set(taken.map(nameKey));
  if (!used.has(nameKey(name))) return name;
  for (let k = 2; ; k += 1) {
    const suffix = ` (${k})`;
    const base = cutToCodePoints(name, MAX_NAME_CODE_POINTS - suffix.length).trimEnd();
    const candidate = `${base}${suffix}`;
    if (!used.has(nameKey(candidate))) return candidate;
  }
};

const sameAccountInOtherSeat = (d: EngineState, seat: Seat, uid: string): boolean =>
  activeSeats(d.room.settings).some((other) => other !== seat && occupant(d, other)?.profile.uid === uid);

/**
 * Where to bank the clocks when the side to move turns out to have been
 * silent since `seen`: a second after that last sign of life, so the silence
 * is given back, but never before the clocks last started running.
 */
const refundedBankAt = (d: EngineState, seen: number, now: number): number =>
  Math.max(d.host.runningSince ?? now, Math.min(now, seen + REFUND_AFTER_LAST_SEEN_MS));

// ---------------------------------------------------------------------------
// Intent handlers
// ---------------------------------------------------------------------------

const handleHello = (d: EngineState, p: IntentPayloads['HELLO'], from: string | null, ctx: Ctx): void => {
  if (from !== null) {
    reject(ctx, from, 'HELLO', 'already_joined');
    return;
  }
  const profile = sanitizeProfile(p.profile);
  if (!profile) {
    reject(ctx, null, 'HELLO', 'bad_profile');
    ctx.events.push({ kind: 'close', memberId: null });
    return;
  }
  const { host, room } = d;
  if (p.resume) {
    const { memberId, token } = p.resume;
    const member = findMember(d, memberId);
    const known = host.tokens[memberId];
    if (member && known !== undefined && known === token) {
      const supersede = host.tabIds[memberId] !== p.tabId;
      member.connected = true;
      member.graceMsLeft = null;
      delete host.graceEndsAt[memberId];
      host.lastSeenAt[memberId] = ctx.now;
      host.tabIds[memberId] = p.tabId;
      ctx.events.push({ kind: 'bind', memberId, supersede });
      ctx.welcome = { memberId, token: known, resumed: true, expired: false };
      return;
    }
  }
  if (room.members.length >= MAX_MEMBERS) {
    ctx.replies.push({ to: null, message: { type: 'ROOM_FULL', payload: { capacity: MAX_MEMBERS } } });
    ctx.events.push({ kind: 'close', memberId: null });
    return;
  }
  const id = uniqueMemberId(d, ctx.env);
  const token = ctx.env.randomToken();
  const name = dedupeName(profile.name, room.members.map((m) => m.profile.name));
  const member: Member = {
    id,
    profile: { ...profile, name },
    isHost: false,
    connected: true,
    graceMsLeft: null,
    joinedAt: ctx.now,
  };
  room.members.push(member);
  host.tokens[id] = token;
  host.tabIds[id] = p.tabId;
  host.lastSeenAt[id] = ctx.now;
  // A friend opening the invite link to a fresh room plays at once. Later
  // arrivals watch, and one account never fills both seats.
  if (room.phase === 'waiting') {
    const seat = activeSeats(room.settings).find((s) => room.seats[s] === null && !sameAccountInOtherSeat(d, s, profile.uid));
    if (seat) room.seats[seat] = id;
  }
  ctx.events.push({ kind: 'bind', memberId: id, supersede: false });
  ctx.welcome = { memberId: id, token, resumed: false, expired: p.resume !== undefined };
};

const handleTakeSeat = (d: EngineState, m: Member, seat: Seat, ctx: Ctx): void => {
  const { room } = d;
  if (seatOf(d, m.id)) return reject(ctx, m.id, 'TAKE_SEAT', 'already_seated');
  // seat_taken comes before the count-in check: the loser of a race for the
  // last seat arrives just after the winner's sit started a count-in, and
  // "someone else took that seat" is what actually happened to them.
  if (room.seats[seat] !== null) return reject(ctx, m.id, 'TAKE_SEAT', 'seat_taken');
  if (sameAccountInOtherSeat(d, seat, m.profile.uid)) return reject(ctx, m.id, 'TAKE_SEAT', 'same_account');
  if (room.phase === 'countdown') return reject(ctx, m.id, 'TAKE_SEAT', 'countdown');
  const { game } = room;
  if (room.phase === 'paused' && game?.gaveUp.includes(m.profile.uid)) {
    return reject(ctx, m.id, 'TAKE_SEAT', 'gave_up_seat');
  }
  room.seats[seat] = m.id;
  if (game && room.phase === 'paused') {
    appendSeatChange(game, { seat, from: null, to: playerRef(m), atMove: game.moves.length, reason: 'sat', at: ctx.now });
    game.vacatedAt[seat] = null;
  }
};

/** `prevSeen` is when the mover was last heard from before this MOVE arrived. */
const handleMove = (
  d: EngineState,
  m: Member,
  p: IntentPayloads['MOVE'],
  prevSeen: number | undefined,
  ctx: Ctx,
): void => {
  const { room } = d;
  const game = room.game;
  if (room.phase !== 'playing' || !game) return reject(ctx, m.id, 'MOVE', 'not_playing');
  if (p.gameId !== game.id) return reject(ctx, m.id, 'MOVE', 'wrong_game');
  const seat = seatOf(d, m.id);
  if (!seat) return reject(ctx, m.id, 'MOVE', 'not_seated');
  if (seat !== game.turn) return reject(ctx, m.id, 'MOVE', 'not_your_turn');
  if (p.n !== game.moves.length) return reject(ctx, m.id, 'MOVE', 'stale_move');
  const size = game.settings.boardSize;
  if (p.row >= size || p.col >= size) return reject(ctx, m.id, 'MOVE', 'out_of_bounds');
  const board = boardFromMoves(game.moves, size, game.openingSeat, game.settings);
  if (board[p.row][p.col] !== null) return reject(ctx, m.id, 'MOVE', 'occupied');
  // A move that arrives after the mover's clock ran out is too late: the
  // watchdog only looks four times a second, and the gap must not save anyone.
  const expired = expiredClock(d, ctx.now);
  if (expired) {
    // The watchdog would not have timed out a mover who had been silent for
    // longer than STALE_MOVER_MS; it pauses with a refund instead. A late MOVE
    // is judged the same way, or the outcome would hang on where the 250 ms
    // tick (longer in a throttled background tab) happened to fall. The link
    // has just proved itself alive, so unlike the watchdog this keeps the
    // connection, and the resuming count-in starts straight away.
    if (!m.isHost && prevSeen !== undefined && ctx.now - prevSeen > STALE_MOVER_MS) {
      pause(d, ctx, refundedBankAt(d, prevSeen, ctx.now));
      return reject(ctx, m.id, 'MOVE', 'not_playing');
    }
    endGame(d, nextSeat(seat, game.settings), expired, null, ctx);
    return reject(ctx, m.id, 'MOVE', 'time_out');
  }
  bankClocks(d, ctx.now);
  game.moves.push([p.row, p.col]);
  (game.moveCorners ??= []).push(game.settings.placementMode === 'lmao' ? p.corner ?? 'center' : 'center');
  game.moveBy.push(m.id);
  game.lastMove = { by: m.id, at: ctx.now };
  board[p.row][p.col] = seat;
  const win = checkWin(board, p.row, p.col, size);
  if (win) return endGame(d, win.winner, '5_in_a_row', win.line, ctx);
  if (game.moves.length === size * size) return endGame(d, 'DRAW', 'board_full', null, ctx);
  game.turn = nextSeat(seat, game.settings);
  game.clocks.turn = turnLimitMs(game.settings);
  ctx.moveApplied = { n: p.n, row: p.row, col: p.col, corner: game.moveCorners[game.moveCorners.length - 1] };
};

/** Takes back moves from the end through `seat`'s most recent one, and gives `seat` the move. */
const takeBack = (d: EngineState, seat: Seat, ctx: Ctx): void => {
  const game = d.room.game;
  if (!game) return;
  bankClocks(d, ctx.now);
  while (game.moves.length > 0) {
    const piece = pieceAt(game.moves.length - 1, game.openingSeat, game.settings);
    game.moves.pop();
    game.moveCorners?.pop();
    game.moveBy.pop();
    if (piece === seat) break;
  }
  game.turn = seat;
  game.clocks.turn = turnLimitMs(game.settings);
  game.lastMove = null;
  game.undo = null;
};

const handleUndoRequest = (d: EngineState, m: Member, p: IntentPayloads['UNDO_REQUEST'], ctx: Ctx): void => {
  const { room } = d;
  const game = room.game;
  if (room.phase !== 'playing' || !game) return reject(ctx, m.id, 'UNDO_REQUEST', 'not_playing');
  if (p.gameId !== game.id) return reject(ctx, m.id, 'UNDO_REQUEST', 'wrong_game');
  if (game.settings.playerMode === 'oneVsOneVsOne') return reject(ctx, m.id, 'UNDO_REQUEST', 'undo_off');
  if (!game.settings.allowUndo) return reject(ctx, m.id, 'UNDO_REQUEST', 'undo_off');
  const seat = seatOf(d, m.id);
  if (!seat) return reject(ctx, m.id, 'UNDO_REQUEST', 'not_seated');
  if (!game.moves.some((_, i) => pieceAt(i, game.openingSeat, game.settings) === seat)) return reject(ctx, m.id, 'UNDO_REQUEST', 'no_move_to_undo');
  if (game.undo) return reject(ctx, m.id, 'UNDO_REQUEST', 'undo_pending');
  const last = game.moves.length - 1;
  // Instant only for the member who actually made that move: someone who has
  // just sat down must not quietly erase the previous occupant's stone.
  const instant =
    pieceAt(last, game.openingSeat, game.settings) === seat &&
    game.moveBy[last] === m.id &&
    game.lastMove !== null &&
    ctx.now - game.lastMove.at <= INSTANT_UNDO_MS;
  if (instant) return takeBack(d, seat, ctx);
  game.undo = { from: seat, expiresAt: ctx.now + OFFER_TTL_MS };
};

const handleUndoAnswer = (d: EngineState, m: Member, p: IntentPayloads['UNDO_ANSWER'], ctx: Ctx): void => {
  const { room } = d;
  const game = room.game;
  if (room.phase !== 'playing' || !game) return reject(ctx, m.id, 'UNDO_ANSWER', 'not_playing');
  if (p.gameId !== game.id) return reject(ctx, m.id, 'UNDO_ANSWER', 'wrong_game');
  if (!game.undo) return reject(ctx, m.id, 'UNDO_ANSWER', 'no_undo');
  if (game.settings.playerMode === 'oneVsOneVsOne') return reject(ctx, m.id, 'UNDO_ANSWER', 'not_addressed');
  if (seatOf(d, m.id) !== otherSeat(game.undo.from)) return reject(ctx, m.id, 'UNDO_ANSWER', 'not_addressed');
  const from = game.undo.from;
  if (p.accept) return takeBack(d, from, ctx);
  game.undo = null;
  sendEvent(ctx, occupant(d, from), 'undo_declined');
};

const handleRematchOffer = (d: EngineState, m: Member, p: IntentPayloads['REMATCH_OFFER'], ctx: Ctx): void => {
  const { room } = d;
  const game = room.game;
  if (room.phase !== 'ended' || !game) return reject(ctx, m.id, 'REMATCH_OFFER', 'not_ended');
  if (p.gameId !== game.id) return reject(ctx, m.id, 'REMATCH_OFFER', 'wrong_game');
  const seat = seatOf(d, m.id);
  if (!seat) return reject(ctx, m.id, 'REMATCH_OFFER', 'not_seated');
  if (!bothSeatedAndConnected(d)) return reject(ctx, m.id, 'REMATCH_OFFER', 'seat_empty');
  if (game.rematch) return reject(ctx, m.id, 'REMATCH_OFFER', 'offer_pending');
  game.rematch = { from: seat, expiresAt: ctx.now + OFFER_TTL_MS };
};

const handleRematchAnswer = (d: EngineState, m: Member, p: IntentPayloads['REMATCH_ANSWER'], ctx: Ctx): void => {
  const { room } = d;
  const game = room.game;
  if (room.phase !== 'ended' || !game) return reject(ctx, m.id, 'REMATCH_ANSWER', 'not_ended');
  if (p.gameId !== game.id) return reject(ctx, m.id, 'REMATCH_ANSWER', 'wrong_game');
  if (!game.rematch) return reject(ctx, m.id, 'REMATCH_ANSWER', 'no_offer');
  if (game.settings.playerMode === 'oneVsOneVsOne') {
    if (seatOf(d, m.id) === game.rematch.from) return reject(ctx, m.id, 'REMATCH_ANSWER', 'not_addressed');
    if (!p.accept) {
      const offerer = occupant(d, game.rematch.from);
      game.rematch = null;
      sendEvent(ctx, offerer, 'rematch_declined');
      return;
    }
    if (!bothSeatedAndConnected(d)) return reject(ctx, m.id, 'REMATCH_ANSWER', 'seat_empty');
    startNewGame(d, ctx);
    return;
  }
  if (seatOf(d, m.id) !== otherSeat(game.rematch.from)) return reject(ctx, m.id, 'REMATCH_ANSWER', 'not_addressed');
  const offerer = occupant(d, game.rematch.from);
  if (!p.accept) {
    game.rematch = null;
    sendEvent(ctx, offerer, 'rematch_declined');
    return;
  }
  if (!bothSeatedAndConnected(d)) return reject(ctx, m.id, 'REMATCH_ANSWER', 'seat_empty');
  startNewGame(d, ctx);
};

const handleResign = (d: EngineState, m: Member, p: IntentPayloads['RESIGN'], ctx: Ctx): void => {
  const { room } = d;
  const game = room.game;
  if (room.phase !== 'playing' || !game) return reject(ctx, m.id, 'RESIGN', 'not_playing');
  if (p.gameId !== game.id) return reject(ctx, m.id, 'RESIGN', 'wrong_game');
  const seat = seatOf(d, m.id);
  if (!seat) return reject(ctx, m.id, 'RESIGN', 'not_seated');
  endGame(d, game.settings.playerMode === 'oneVsOneVsOne' ? 'DRAW' : otherSeat(seat), 'resigned', null, ctx);
};

const handleDiscard = (d: EngineState, m: Member, p: IntentPayloads['DISCARD_GAME'], ctx: Ctx): void => {
  const { room } = d;
  const game = room.game;
  if (room.phase !== 'paused' || !game) return reject(ctx, m.id, 'DISCARD_GAME', 'not_paused');
  if (p.gameId !== game.id) return reject(ctx, m.id, 'DISCARD_GAME', 'wrong_game');
  const empty = activeSeats(room.settings).find((s) => room.seats[s] === null);
  if (!empty) return reject(ctx, m.id, 'DISCARD_GAME', 'no_empty_seat');
  if (!m.isHost) {
    // The remaining player may end the game too, but only after the seat has
    // stood empty for a while, so a viewer gets a moment to take it first.
    const seat = seatOf(d, m.id);
    if (!seat || activeSeats(room.settings).some((other) => other !== seat && room.seats[other] !== null)) {
      return reject(ctx, m.id, 'DISCARD_GAME', 'not_host');
    }
    const since = game.vacatedAt[empty] ?? ctx.now;
    const waited = ctx.now - since;
    if (waited < DISCARD_GUARD_MS) return reject(ctx, m.id, 'DISCARD_GAME', 'too_soon', DISCARD_GUARD_MS - waited);
  }
  room.game = null;
  room.phase = 'waiting';
  room.autoStartArmed = true;
  d.host.runningSince = null;
};

const handleClearSeat = (d: EngineState, m: Member, seat: Seat, ctx: Ctx): void => {
  const { room } = d;
  if (!m.isHost) return reject(ctx, m.id, 'CLEAR_SEAT', 'not_host');
  if (room.phase === 'countdown') return reject(ctx, m.id, 'CLEAR_SEAT', 'countdown');
  const id = room.seats[seat];
  if (id === null) return reject(ctx, m.id, 'CLEAR_SEAT', 'seat_empty');
  if (id === m.id) return reject(ctx, m.id, 'CLEAR_SEAT', 'own_seat');
  vacateSeat(d, seat, 'removed', ctx);
};

const handleUpdateSettings = (d: EngineState, m: Member, p: IntentPayloads['UPDATE_SETTINGS'], ctx: Ctx): void => {
  const { room } = d;
  if (!m.isHost) return reject(ctx, m.id, 'UPDATE_SETTINGS', 'not_host');
  if (room.phase !== 'waiting' && room.phase !== 'ended') return reject(ctx, m.id, 'UPDATE_SETTINGS', 'locked');
  if (!isAllowedSettings(p.settings)) return reject(ctx, m.id, 'UPDATE_SETTINGS', 'bad_settings');
  const { boardSize, totalTimeMinutes, turnTimeSeconds, allowUndo } = p.settings;
  room.settings = {
    boardSize,
    totalTimeMinutes,
    turnTimeSeconds,
    allowUndo,
    placementMode: p.settings.placementMode ?? 'normal',
    playerMode: p.settings.playerMode ?? 'oneVsOne',
  };
  // A rematch offer was made under the old rules; accepting it must not start
  // a game under rules the other player never saw.
  const game = room.game;
  if (game?.rematch) {
    const offerer = occupant(d, game.rematch.from);
    game.rematch = null;
    sendEvent(ctx, offerer, 'rematch_declined', { why: 'rules_changed' });
  }
};

const handleChat = (d: EngineState, m: Member, p: IntentPayloads['CHAT'], ctx: Ctx): void => {
  const { host, room } = d;
  const text = p.text.trim();
  const image = p.image;
  if (!text && !image) return reject(ctx, m.id, 'CHAT', 'empty');
  if (Array.from(text).length > CHAT_TEXT_MAX) return reject(ctx, m.id, 'CHAT', 'too_long');
  if (image !== undefined && (!image.startsWith('data:image/') || image.length > CHAT_IMAGE_MAX)) {
    return reject(ctx, m.id, 'CHAT', 'bad_image');
  }
  const lastChat = host.lastChatAt[m.id];
  if (lastChat !== undefined && ctx.now - lastChat < CHAT_MIN_INTERVAL_MS) {
    return reject(ctx, m.id, 'CHAT', 'rate_limited', CHAT_MIN_INTERVAL_MS - (ctx.now - lastChat));
  }
  if (image !== undefined && host.lastImageAt !== null && ctx.now - host.lastImageAt < ROOM_IMAGE_INTERVAL_MS) {
    return reject(ctx, m.id, 'CHAT', 'rate_limited', ROOM_IMAGE_INTERVAL_MS - (ctx.now - host.lastImageAt));
  }
  host.lastChatAt[m.id] = ctx.now;
  if (image !== undefined) host.lastImageAt = ctx.now;
  const message: RoomChatMessage = {
    id: p.id,
    senderId: m.id,
    sender: m.profile.name,
    senderAvatar: m.profile.avatar,
    text,
    ...(image !== undefined ? { image } : {}),
    timestamp: ctx.now,
  };
  if (image === undefined) {
    host.chatBacklog = [...host.chatBacklog, message].slice(-CHAT_BACKLOG_SIZE);
  }
  // Every message shares one ordered channel with the moves, so an image
  // relayed to a player mid-game would queue their opponent's move behind it
  // while the host's clock charges them. Players get images when play stops.
  const holdFor =
    image !== undefined && room.phase === 'playing'
      ? activeSeats(room.settings).map((s) => room.seats[s]).filter((id): id is string => id !== null && id !== m.id)
      : [];
  for (const to of holdFor) {
    const mine = host.heldImages.filter((h) => h.to === to);
    if (mine.length >= HELD_IMAGES_PER_MEMBER) {
      const oldest = mine[0];
      host.heldImages = host.heldImages.filter((h) => h !== oldest);
    }
    host.heldImages.push({ to, message });
  }
  ctx.events.push({ kind: 'broadcast', message: { type: 'CHAT', payload: { message } }, except: [m.id, ...holdFor] });
};

const handleBuzz = (d: EngineState, m: Member, ctx: Ctx): void => {
  const seat = seatOf(d, m.id);
  if (!seat) return reject(ctx, m.id, 'BUZZ', 'not_seated');
  const last = d.host.lastBuzzAt[m.id];
  if (last !== undefined && ctx.now - last < BUZZ_INTERVAL_MS) {
    return reject(ctx, m.id, 'BUZZ', 'rate_limited', BUZZ_INTERVAL_MS - (ctx.now - last));
  }
  d.host.lastBuzzAt[m.id] = ctx.now;
  ctx.events.push({
    kind: 'broadcast',
    message: { type: 'BUZZ', payload: { fromSeat: seat, fromName: m.profile.name } },
    except: [],
  });
};

const handleTease = (d: EngineState, m: Member, p: IntentPayloads['TEASE'], ctx: Ctx): void => {
  const { host } = d;
  const target = findMember(d, p.targetMemberId);
  if (!target) return reject(ctx, m.id, 'TEASE', 'no_target');
  if (target.id === m.id) return reject(ctx, m.id, 'TEASE', 'self');
  if (!target.connected) return reject(ctx, m.id, 'TEASE', 'target_away');
  const pairKey = `${m.id}>${target.id}`;
  const lastPair = host.teaseByPair[pairKey];
  const lastSender = host.teaseBySender[m.id];
  const pairWait = lastPair === undefined ? 0 : TEASE_PAIR_COOLDOWN_MS - (ctx.now - lastPair);
  const senderWait = lastSender === undefined ? 0 : TEASE_SENDER_COOLDOWN_MS - (ctx.now - lastSender);
  const wait = Math.max(pairWait, senderWait);
  if (wait > 0) return reject(ctx, m.id, 'TEASE', 'cooldown', wait);
  host.teaseByPair[pairKey] = ctx.now;
  host.teaseBySender[m.id] = ctx.now;
  ctx.events.push({
    kind: 'broadcast',
    message: {
      type: 'TEASE',
      payload: { fromMemberId: m.id, fromName: m.profile.name, toMemberId: target.id, toName: target.profile.name, at: ctx.now },
    },
    except: [],
  });
};

const handleRatingReport = (d: EngineState, m: Member, p: IntentPayloads['RATING_REPORT'], ctx: Ctx): void => {
  const result = d.room.results.find((r) => r.gameId === p.gameId);
  if (!result) return reject(ctx, m.id, 'RATING_REPORT', 'no_result');
  const rating = result.rating;
  if (rating.status !== 'pending') return reject(ctx, m.id, 'RATING_REPORT', 'not_pending');
  const seat = rating.submitters.find((s) => result.players[s].memberId === m.id && !rating.reports[s]);
  if (!seat) return reject(ctx, m.id, 'RATING_REPORT', 'not_submitter');
  const { deltas } = p;
  if (
    deltas !== undefined &&
    ![deltas.X, deltas.O].every((v) => Number.isInteger(v) && Math.abs(v) <= RATING_DELTA_MAX)
  ) {
    return reject(ctx, m.id, 'RATING_REPORT', 'bad_deltas');
  }
  if (p.status === 'saved') {
    result.rating = { status: 'saved', by: seat, deltas: deltas ? { X: deltas.X, O: deltas.O } : null };
    return;
  }
  const status: Exclude<RatingReportStatus, 'saved'> = p.status;
  rating.reports[seat] = { status, why: p.why ?? null };
  settleRating(result);
};

const handleLeaveRoom = (d: EngineState, m: Member, ctx: Ctx): void => {
  if (m.isHost) return reject(ctx, m.id, 'LEAVE_ROOM', 'host_cannot_leave');
  const seat = seatOf(d, m.id);
  // Leaving pauses the game and opens the seat. It never produces a result:
  // no path may hand a win to, or take one from, a player who walked away.
  if (seat) vacateSeat(d, seat, 'left', ctx);
  removeMember(d, m.id, ctx);
  ctx.events.push({ kind: 'close', memberId: m.id });
};

// ---------------------------------------------------------------------------
// Public transitions
// ---------------------------------------------------------------------------

/**
 * Applies one intent. `fromMemberId` is the member the host bound the
 * connection to, never anything claimed in the payload; it is null only for
 * a HELLO on a connection not yet bound.
 */
export const applyIntent = (
  state: EngineState,
  intent: Intent,
  fromMemberId: string | null,
  now: number,
  env: EngineEnv = cryptoEnv,
): EngineResult => {
  const d = cloneState(state);
  const ctx = newCtx(now, env);
  if (intent.type === 'HELLO') {
    handleHello(d, intent.payload, fromMemberId, ctx);
    return finalize(state, d, ctx);
  }
  const m = findMember(d, fromMemberId);
  if (!m) {
    reject(ctx, fromMemberId, intent.type, 'not_member');
    return { state, events: [], replies: ctx.replies };
  }
  // Read before this message counts as a sign of life: a late MOVE is judged
  // on the silence that came before it, exactly as the watchdog would have.
  const prevSeen = d.host.lastSeenAt[m.id];
  if (!m.isHost) d.host.lastSeenAt[m.id] = now;
  if (!m.connected) {
    reject(ctx, m.id, intent.type, 'not_connected');
    return finalize(state, d, ctx);
  }
  switch (intent.type) {
    case 'TAKE_SEAT':
      handleTakeSeat(d, m, intent.payload.seat, ctx);
      break;
    case 'LEAVE_SEAT': {
      const seat = seatOf(d, m.id);
      if (seat) vacateSeat(d, seat, 'stood', ctx);
      else reject(ctx, m.id, 'LEAVE_SEAT', 'not_seated');
      break;
    }
    case 'MOVE':
      handleMove(d, m, intent.payload, prevSeen, ctx);
      break;
    case 'UNDO_REQUEST':
      handleUndoRequest(d, m, intent.payload, ctx);
      break;
    case 'UNDO_ANSWER':
      handleUndoAnswer(d, m, intent.payload, ctx);
      break;
    case 'REMATCH_OFFER':
      handleRematchOffer(d, m, intent.payload, ctx);
      break;
    case 'REMATCH_ANSWER':
      handleRematchAnswer(d, m, intent.payload, ctx);
      break;
    case 'RESIGN':
      handleResign(d, m, intent.payload, ctx);
      break;
    case 'DISCARD_GAME':
      handleDiscard(d, m, intent.payload, ctx);
      break;
    case 'CLEAR_SEAT':
      handleClearSeat(d, m, intent.payload.seat, ctx);
      break;
    case 'UPDATE_SETTINGS':
      handleUpdateSettings(d, m, intent.payload, ctx);
      break;
    case 'CHAT':
      handleChat(d, m, intent.payload, ctx);
      break;
    case 'BUZZ':
      handleBuzz(d, m, ctx);
      break;
    case 'TEASE':
      handleTease(d, m, intent.payload, ctx);
      break;
    case 'RATING_REPORT':
      handleRatingReport(d, m, intent.payload, ctx);
      break;
    case 'STATE_REQUEST':
      ctx.replies.push({ to: m.id, message: { type: 'ROOM_STATE', payload: { state: toWire(d, now) } } });
      break;
    case 'PONG':
      break;
    case 'LEAVE_ROOM':
      handleLeaveRoom(d, m, ctx);
      break;
  }
  return finalize(state, d, ctx);
};

const loseConnection = (d: EngineState, memberId: string, ctx: Ctx): void => {
  const m = findMember(d, memberId);
  if (!m || m.isHost || !m.connected) return;
  m.connected = false;
  m.graceMsLeft = GRACE_MS;
  d.host.graceEndsAt[m.id] = ctx.now + GRACE_MS;
  const seat = seatOf(d, m.id);
  if (!seat) return;
  const { room } = d;
  if (room.phase === 'playing' && room.game) {
    // Loss is noticed seconds late. Time the side to move spent after its last
    // sign of life (plus a second of slack) is given back, so a drop pauses
    // the game instead of quietly running the dropped player's clock down.
    const bankAt =
      room.game.turn === seat ? refundedBankAt(d, d.host.lastSeenAt[m.id] ?? ctx.now, ctx.now) : ctx.now;
    pause(d, ctx, bankAt);
  } else if (room.phase === 'countdown') {
    abortCountdown(d);
  }
};

/** A member's connection closed, errored or went silent. Their grace period starts. */
export const onConnectionLost = (
  state: EngineState,
  memberId: string,
  now: number,
  env: EngineEnv = cryptoEnv,
): EngineResult => {
  const d = cloneState(state);
  const ctx = newCtx(now, env);
  loseConnection(d, memberId, ctx);
  return finalize(state, d, ctx);
};

const expireGrace = (d: EngineState, memberId: string, ctx: Ctx): void => {
  const m = findMember(d, memberId);
  const endsAt = d.host.graceEndsAt[memberId];
  if (!m || m.connected || endsAt === undefined || ctx.now < endsAt) return;
  const seat = seatOf(d, memberId);
  if (seat) vacateSeat(d, seat, 'dropped', ctx);
  removeMember(d, memberId, ctx);
};

/** A disconnected member's grace ran out: their seat opens and they leave the room. */
export const onGraceExpired = (
  state: EngineState,
  memberId: string,
  now: number,
  env: EngineEnv = cryptoEnv,
): EngineResult => {
  const d = cloneState(state);
  const ctx = newCtx(now, env);
  expireGrace(d, memberId, ctx);
  return finalize(state, d, ctx);
};

const completeCountdown = (d: EngineState, ctx: Ctx): void => {
  const { room, host } = d;
  if (room.phase !== 'countdown' || host.countdownEndsAt === null || ctx.now < host.countdownEndsAt) return;
  if (!room.game || !bothSeatedAndConnected(d)) {
    abortCountdown(d);
    return;
  }
  // Clocks continue from exactly where they stopped. There is no floor on the
  // move timer, by the owner's rule; the stand-and-resit trick it once guarded
  // against is closed by gave_up_seat instead.
  room.phase = 'playing';
  room.countdown = null;
  host.countdownEndsAt = null;
  room.game.clocks.running = true;
  host.runningSince = ctx.now;
};

/** The count-in finished. A stale call for an earlier count-in is ignored. */
export const onCountdownDone = (state: EngineState, now: number, env: EngineEnv = cryptoEnv): EngineResult => {
  const d = cloneState(state);
  const ctx = newCtx(now, env);
  completeCountdown(d, ctx);
  return finalize(state, d, ctx);
};

/**
 * The host's heartbeat, meant to run every 250 ms. It declares silent members
 * lost, expires offers, finishes a count-in and a grace period whose time has
 * come, and is the clock watchdog: a side whose clock ran out loses, unless it
 * has been silent long enough that the silence, not the player, is the likely
 * cause, in which case the game pauses instead.
 */
export const tick = (state: EngineState, now: number, env: EngineEnv = cryptoEnv): EngineResult => {
  const d = cloneState(state);
  const ctx = newCtx(now, env);
  const { host } = d;

  for (const m of [...d.room.members]) {
    if (m.isHost || !m.connected) continue;
    const seen = host.lastSeenAt[m.id] ?? now;
    if (now - seen > LOST_AFTER_MS) {
      loseConnection(d, m.id, ctx);
      ctx.events.push({ kind: 'close', memberId: m.id });
    }
  }

  const game = d.room.game;
  if (game?.undo && now >= game.undo.expiresAt) {
    const requester = occupant(d, game.undo.from);
    game.undo = null;
    sendEvent(ctx, requester, 'undo_expired');
  }
  if (game?.rematch && now >= game.rematch.expiresAt) {
    const offerer = occupant(d, game.rematch.from);
    game.rematch = null;
    sendEvent(ctx, offerer, 'rematch_expired');
  }

  completeCountdown(d, ctx);

  for (const m of [...d.room.members]) {
    if (!m.connected) expireGrace(d, m.id, ctx);
  }

  const expired = d.room.phase === 'playing' ? expiredClock(d, now) : null;
  const current = d.room.game;
  if (expired && current) {
    const moverId = d.room.seats[current.turn];
    const mover = findMember(d, moverId);
    const seen = moverId === null ? now : (host.lastSeenAt[moverId] ?? now);
    if (mover && !mover.isHost && now - seen > STALE_MOVER_MS) {
      loseConnection(d, mover.id, ctx);
      ctx.events.push({ kind: 'close', memberId: mover.id });
    } else {
      endGame(d, nextSeat(current.turn, current.settings), expired, null, ctx);
    }
  }

  return finalize(state, d, ctx);
};

/**
 * Counts a malformed or unknown message from a member. Three within ten
 * seconds means the connection is closed. Rule rejections never come here: a
 * player tapping out of turn is not misbehaving.
 */
export const noteMalformed = (
  state: EngineState,
  memberId: string,
  now: number,
): { state: EngineState; kick: boolean } => {
  const d = cloneState(state);
  const recent = (d.host.malformedAt[memberId] ?? []).filter((t) => now - t < MALFORMED_WINDOW_MS);
  recent.push(now);
  d.host.malformedAt[memberId] = recent;
  return { state: d, kick: recent.length >= MALFORMED_KICK_COUNT };
};
