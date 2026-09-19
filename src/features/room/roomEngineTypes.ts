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
import type { RoomSettings } from '../settings/types';
import { PROTOCOL_VERSION } from './protocol';
import type { HostMessage, MemberProfile, Phase, RoomChatMessage, Seat } from './protocol';

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
// Data URLs are ~4/3 the original binary size. 670k characters therefore
// permits roughly a 500 KB local GIF or image over the P2P room connection.
export const CHAT_IMAGE_MAX = 670_000;
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

export type ResultReason = '5_in_a_row' | 'board_full' | 'turn_timeout' | 'total_time_out' | 'resigned' | 'disconnected';

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
  /** Shared, pre-game resolution shown to every seated player. */
  firstMove: {
    method: 'default' | 'coinFlip' | 'rockPaperScissors';
    winner: Seat | null;
    /** Coin call and result: X is sun/heads, O is moon/tails. */
    call?: 'X' | 'O' | null;
    face?: 'X' | 'O' | null;
    /** The seated player who made the visible coin selection. */
    callerMemberId?: string | null;
    choices?: { X: 'rock' | 'paper' | 'scissors' | null; O: 'rock' | 'paper' | 'scissors' | null };
  };
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


