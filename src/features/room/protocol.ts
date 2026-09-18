/**
 * Caro room protocol v2: the wire vocabulary shared by the host hub and its
 * members.
 *
 * Everything here is pure data and validation. The host runs every inbound
 * message through isValidIntent before the room engine sees it, so the engine
 * can rely on field types and spend its checks on the rules of the room
 * instead. A message that fails here is malformed, which is the only kind of
 * failure that counts toward the kick; a well-formed intent the rules refuse
 * is answered with REJECTED and never counts.
 */
import type { RoomSettings } from '../settings/types';
import type { ChatMessage } from '../webrtc/types';
import { getChampionId, isRagnarokAvatar } from '../avatar/avatarService';
import type { Clocks, RoomState } from './roomEngine';

// The room code rule has exactly one home. Join and the public lobby already
// read it from there, and a copy here would drift the moment either changed.
export { ROOM_CODE_PATTERN, parseRoomCode } from '../webrtc/roomCode';

export const PROTOCOL_VERSION = 2;

export type Seat = 'X' | 'O' | 'T';
/** Where a mark sits inside its logical board cell in LMAO mode. */
export type MoveCorner =
  | 'center'
  | 'top-left'
  | 'top'
  | 'top-right'
  | 'left'
  | 'right'
  | 'bottom-left'
  | 'bottom'
  | 'bottom-right';
export type Phase = 'waiting' | 'opening' | 'countdown' | 'playing' | 'paused' | 'ended';

/**
 * The one place the tease phrase lives. The owner asked for this Vietnamese
 * text verbatim, even though the rest of the interface is English, so it is
 * kept in a single constant that can be changed without hunting for copies.
 */
export const TEASE_PHRASE = 'Giỏi thì đánh đi';

// ---------------------------------------------------------------------------
// Profiles
// ---------------------------------------------------------------------------

/** A profile after the host has sanitised it. Everything in it is display data. */
export interface MemberProfile {
  uid: string;
  name: string;
  /** A champion id, a safe Ragnarok GIF key, a Google profile photo URL, or null for the default avatar. */
  avatar: string | null;
  /** Claims a registered account with a server uid; decides whether a game is rated. */
  rated: boolean;
  /** Claims to be a guest. Only used to word the "unrated" note accurately. */
  guest: boolean;
  elo?: number;
  wins?: number;
  losses?: number;
  draws?: number;
  streak?: number;
}

export const MAX_NAME_CODE_POINTS = 40;
export const MAX_AVATAR_LENGTH = 300;
const DEFAULT_NAME = 'Guest';
const UID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** A public Storage object name, never a URL or a nested path. */
const RAGNAROK_GIF_KEY = /^ragnarok:([^/\\\u0000-\u001f?#]{1,260}\.gif)$/i;
const STAT_KEYS = ['elo', 'wins', 'losses', 'draws', 'streak'] as const;
const STAT_MAX = 10_000;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Cuts a string to at most `max` code points. String.slice counts UTF-16 units,
 * which would split an emoji in half and leave a broken surrogate on screen.
 */
export const cutToCodePoints = (value: string, max: number): string => {
  const points = Array.from(value);
  return points.length <= max ? value : points.slice(0, max).join('');
};

/**
 * Control characters, zero-width characters and bidi overrides. None of them
 * belongs in a display name, and the bidi overrides in particular let a name
 * render as something other than what it is, which is a way to impersonate.
 */
const isInvisible = (codePoint: number): boolean =>
  codePoint <= 0x1f ||
  (codePoint >= 0x7f && codePoint <= 0x9f) ||
  (codePoint >= 0x200b && codePoint <= 0x200f) ||
  (codePoint >= 0x202a && codePoint <= 0x202e) ||
  (codePoint >= 0x2060 && codePoint <= 0x2069) ||
  codePoint === 0xfeff;

const cleanName = (value: unknown): string => {
  if (typeof value !== 'string') return DEFAULT_NAME;
  const visible = Array.from(value)
    .filter((ch) => !isInvisible(ch.codePointAt(0) ?? 0))
    .join('')
    .trim();
  const cut = cutToCodePoints(visible, MAX_NAME_CODE_POINTS).trim();
  return cut || DEFAULT_NAME;
};

/**
 * Only avatars that cannot be used to track anyone survive. An arbitrary URL
 * would make every browser in the room fetch it, which leaks each member's IP
 * address to whoever runs that server; the star topology otherwise keeps
 * members' addresses from one another. Champion icons come from our own
 * table, and Google photos are kept because the owner wants real profile
 * pictures to show.
 */
const cleanAvatar = (value: unknown): string | null => {
  if (typeof value !== 'string' || !value || value.length > MAX_AVATAR_LENGTH) return null;
  // Ragnarok selections are keys, not URLs. This lets a peer resolve only our
  // public bucket instead of letting a room member inject a tracking image.
  if (isRagnarokAvatar(value) && RAGNAROK_GIF_KEY.test(value)) return value;
  const champion = getChampionId(value);
  if (champion) return champion;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  const isGoogle = host === 'googleusercontent.com' || host.endsWith('.googleusercontent.com');
  if (url.protocol !== 'https:' || !isGoogle || url.username || url.password || url.port) return null;
  return url.href;
};

/** The same avatar rule for anything else that shows a picture it was sent, such as the public room list. */
export const sanitizeAvatar = (value: unknown): string | null => cleanAvatar(value);

const clampStat = (value: unknown): number | undefined => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Math.min(STAT_MAX, Math.max(0, value));
};

/**
 * Turns whatever a member claimed about itself into a profile the room can
 * show. Returns null when the uid is unusable, because the uid is what keeps
 * one account out of both seats and the host cannot invent one.
 *
 * `rated` needs both a claim of a registered account and a server-shaped uid:
 * local-only `user_*` accounts and `guest_*` uids can never be rated, whatever
 * they claim, because the rating server would not know them.
 */
export const sanitizeProfile = (claim: unknown): MemberProfile | null => {
  if (!isRecord(claim)) return null;
  const { uid } = claim;
  if (typeof uid !== 'string' || !UID_PATTERN.test(uid)) return null;
  const guest = claim.isGuest !== false;
  const profile: MemberProfile = {
    uid,
    name: cleanName(claim.name),
    avatar: cleanAvatar(claim.avatar),
    rated: !guest && UUID_PATTERN.test(uid),
    guest,
  };
  for (const key of STAT_KEYS) {
    const stat = clampStat(claim[key]);
    if (stat !== undefined) profile[key] = stat;
  }
  return profile;
};

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

/** The option lists SettingsAndThemeModal offers; nothing else is accepted. */
export const BOARD_SIZES = [15, 19, 30, 50] as const;
export const TOTAL_TIME_MINUTES = [0, 5, 15, 30] as const;
export const TURN_TIME_SECONDS = [0, 10, 30, 60] as const;

export const isAllowedSettings = (value: RoomSettings): boolean =>
  (BOARD_SIZES as readonly number[]).includes(value.boardSize) &&
  (TOTAL_TIME_MINUTES as readonly number[]).includes(value.totalTimeMinutes) &&
  (TURN_TIME_SECONDS as readonly number[]).includes(value.turnTimeSeconds) &&
  typeof value.allowUndo === 'boolean' &&
  (value.placementMode === undefined || value.placementMode === 'normal' || value.placementMode === 'lmao') &&
  (value.playerMode === undefined || value.playerMode === 'oneVsOne' || value.playerMode === 'oneVsOneVsOne') &&
  (value.firstMoveMethod === undefined || value.firstMoveMethod === 'coinFlip' || value.firstMoveMethod === 'rockPaperScissors');

// ---------------------------------------------------------------------------
// Member to host: intents
// ---------------------------------------------------------------------------

export type RatingReportStatus = 'saved' | 'failed' | 'skipped' | 'unknown';

export interface HelloPayload {
  /** Unsanitised on purpose: the host runs it through sanitizeProfile. */
  profile: unknown;
  resume?: { memberId: string; token: string };
  /**
   * Random per page load and never stored. A resume from the same tab is a
   * reconnect and closes the old connection quietly; a resume from another tab
   * is a duplicated tab and gets SUPERSEDED. The token alone cannot tell them
   * apart, because a duplicated tab copies sessionStorage.
   */
  tabId: string;
}

export interface IntentPayloads {
  HELLO: HelloPayload;
  TAKE_SEAT: { seat: Seat };
  LEAVE_SEAT: Record<string, never>;
  MOVE: { gameId: string; n: number; row: number; col: number; corner?: MoveCorner };
  UNDO_REQUEST: { gameId: string };
  UNDO_ANSWER: { gameId: string; accept: boolean };
  REMATCH_OFFER: { gameId: string };
  REMATCH_ANSWER: { gameId: string; accept: boolean };
  RESIGN: { gameId: string };
  DISCARD_GAME: { gameId: string };
  CLEAR_SEAT: { seat: Seat };
  UPDATE_SETTINGS: { settings: RoomSettings };
  FIRST_MOVE_CHOICE: { gameId: string; choice: 'rock' | 'paper' | 'scissors' };
  COIN_CALL: { gameId: string; call: 'X' | 'O' };
  CHAT: { id: string; text: string; image?: string };
  BUZZ: Record<string, never>;
  TEASE: { targetMemberId: string };
  RATING_REPORT: {
    gameId: string;
    status: RatingReportStatus;
    deltas?: { X: number; O: number };
    why?: string;
  };
  STATE_REQUEST: Record<string, never>;
  PONG: { t: number };
  LEAVE_ROOM: Record<string, never>;
}

export type IntentType = keyof IntentPayloads;

export type Intent = { [K in IntentType]: { type: K; payload: IntentPayloads[K] } }[IntentType];

export type IntentEnvelope = Intent & { v: typeof PROTOCOL_VERSION };

// ---------------------------------------------------------------------------
// Host to member
// ---------------------------------------------------------------------------

/** A chat line as the host relays it: the host stamps who sent it and when. */
export interface RoomChatMessage extends ChatMessage {
  senderId: string;
  senderAvatar: string | null;
}

export type EventKind =
  | 'undo_declined'
  | 'undo_expired'
  | 'rematch_declined'
  | 'rematch_expired'
  | 'seat_opened';

export type RejectReason =
  | 'not_member'
  | 'not_connected'
  | 'already_joined'
  | 'bad_profile'
  | 'already_seated'
  | 'not_seated'
  | 'seat_taken'
  | 'seat_empty'
  | 'same_account'
  | 'gave_up_seat'
  | 'countdown'
  | 'not_playing'
  | 'not_paused'
  | 'not_ended'
  | 'wrong_game'
  | 'not_your_turn'
  | 'stale_move'
  | 'out_of_bounds'
  | 'occupied'
  | 'time_out'
  | 'undo_off'
  | 'no_move_to_undo'
  | 'undo_pending'
  | 'no_undo'
  | 'offer_pending'
  | 'no_offer'
  | 'not_addressed'
  | 'not_host'
  | 'own_seat'
  | 'no_empty_seat'
  | 'too_soon'
  | 'locked'
  | 'bad_settings'
  | 'empty'
  | 'too_long'
  | 'bad_image'
  | 'rate_limited'
  | 'no_target'
  | 'self'
  | 'target_away'
  | 'cooldown'
  | 'no_result'
  | 'not_pending'
  | 'not_submitter'
  | 'bad_deltas'
  | 'host_cannot_leave';

export interface HostMessagePayloads {
  WELCOME: {
    memberId: string;
    token: string;
    resumed: boolean;
    expired?: boolean;
    state: RoomState;
    /** The last text-only chat lines, so a late joiner or a refresh does not see an empty chat. */
    chatBacklog: RoomChatMessage[];
  };
  ROOM_STATE: { state: RoomState };
  MOVE_APPLIED: {
    gameId: string;
    n: number;
    row: number;
    col: number;
    corner?: MoveCorner;
    turn: Seat;
    clocks: Clocks;
    rev: number;
  };
  CLOCK_SYNC: { gameId: string; clocks: Clocks; rev: number };
  REJECTED: { type: IntentType; reason: RejectReason; retryInMs?: number };
  EVENT: { kind: EventKind; seat?: Seat; by?: string; why?: string };
  CHAT: { message: RoomChatMessage };
  BUZZ: { fromSeat: Seat; fromName: string };
  TEASE: { fromMemberId: string; fromName: string; toMemberId: string; toName: string; at: number };
  PING: { t: number };
  ROOM_FULL: { capacity: number };
  ROOM_CLOSED: { reason: 'host_left'; hostName: string };
  SUPERSEDED: Record<string, never>;
}

export type HostMessageType = keyof HostMessagePayloads;

export type HostMessage = {
  [K in HostMessageType]: { type: K; payload: HostMessagePayloads[K] };
}[HostMessageType];

export type HostEnvelope = HostMessage & { v: typeof PROTOCOL_VERSION };

/** Wraps a host message in the v2 envelope for sending. */
export const envelope = (message: HostMessage): HostEnvelope => ({ v: PROTOCOL_VERSION, ...message });

// ---------------------------------------------------------------------------
// Validation of inbound intents (shape only)
// ---------------------------------------------------------------------------

const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;
const REPORT_STATUSES: readonly string[] = ['saved', 'failed', 'skipped', 'unknown'];

const isSeat = (value: unknown): value is Seat => value === 'X' || value === 'O' || value === 'T';
const isMoveCorner = (value: unknown): value is MoveCorner =>
  value === 'center' ||
  value === 'top-left' ||
  value === 'top' ||
  value === 'top-right' ||
  value === 'left' ||
  value === 'right' ||
  value === 'bottom-left' ||
  value === 'bottom' ||
  value === 'bottom-right';
const isId = (value: unknown): value is string => typeof value === 'string' && SAFE_ID.test(value);
const isCount = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0;
const hasGameId = (p: Record<string, unknown>): boolean => isId(p.gameId);

const VALIDATORS: { [K in IntentType]: (p: Record<string, unknown>) => boolean } = {
  HELLO: (p) => {
    if (!isRecord(p.profile) || !isId(p.tabId)) return false;
    if (p.resume === undefined) return true;
    return isRecord(p.resume) && isId(p.resume.memberId) && isId(p.resume.token);
  },
  TAKE_SEAT: (p) => isSeat(p.seat),
  LEAVE_SEAT: () => true,
  MOVE: (p) => hasGameId(p) && isCount(p.n) && isCount(p.row) && isCount(p.col) && (p.corner === undefined || isMoveCorner(p.corner)),
  UNDO_REQUEST: hasGameId,
  UNDO_ANSWER: (p) => hasGameId(p) && typeof p.accept === 'boolean',
  REMATCH_OFFER: hasGameId,
  REMATCH_ANSWER: (p) => hasGameId(p) && typeof p.accept === 'boolean',
  RESIGN: hasGameId,
  DISCARD_GAME: hasGameId,
  CLEAR_SEAT: (p) => isSeat(p.seat),
  UPDATE_SETTINGS: (p) =>
    isRecord(p.settings) &&
    typeof p.settings.boardSize === 'number' &&
    typeof p.settings.totalTimeMinutes === 'number' &&
    typeof p.settings.turnTimeSeconds === 'number' &&
    typeof p.settings.allowUndo === 'boolean' &&
    (p.settings.placementMode === undefined || p.settings.placementMode === 'normal' || p.settings.placementMode === 'lmao') &&
    (p.settings.playerMode === undefined || p.settings.playerMode === 'oneVsOne' || p.settings.playerMode === 'oneVsOneVsOne') &&
    (p.settings.firstMoveMethod === undefined || p.settings.firstMoveMethod === 'coinFlip' || p.settings.firstMoveMethod === 'rockPaperScissors'),
  FIRST_MOVE_CHOICE: (p) => hasGameId(p) && (p.choice === 'rock' || p.choice === 'paper' || p.choice === 'scissors'),
  COIN_CALL: (p) => hasGameId(p) && (p.call === 'X' || p.call === 'O'),
  CHAT: (p) =>
    isId(p.id) && typeof p.text === 'string' && (p.image === undefined || typeof p.image === 'string'),
  BUZZ: () => true,
  TEASE: (p) => isId(p.targetMemberId),
  RATING_REPORT: (p) =>
    hasGameId(p) &&
    typeof p.status === 'string' &&
    REPORT_STATUSES.includes(p.status) &&
    (p.deltas === undefined ||
      (isRecord(p.deltas) && typeof p.deltas.X === 'number' && typeof p.deltas.O === 'number')) &&
    (p.why === undefined || (typeof p.why === 'string' && p.why.length <= 200)),
  STATE_REQUEST: () => true,
  PONG: (p) => typeof p.t === 'number' && Number.isFinite(p.t),
  LEAVE_ROOM: () => true,
};

/**
 * Whether a message is a well-formed intent. Business rules (whose turn it
 * is, whether a seat is free, chat length) are the engine's job; this only
 * guarantees the engine never reads a field of the wrong type.
 */
export const isValidIntent = (type: unknown, payload: unknown): boolean => {
  if (typeof type !== 'string' || !Object.prototype.hasOwnProperty.call(VALIDATORS, type)) return false;
  if (!isRecord(payload)) return false;
  return VALIDATORS[type as IntentType](payload);
};

/** Reads a raw DataChannel message as a v2 intent, or null when it is not one. */
export const parseIntent = (raw: unknown): Intent | null => {
  if (!isRecord(raw) || raw.v !== PROTOCOL_VERSION) return null;
  if (!isValidIntent(raw.type, raw.payload)) return null;
  return { type: raw.type, payload: raw.payload } as Intent;
};
