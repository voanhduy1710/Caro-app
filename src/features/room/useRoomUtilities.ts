import type { DataConnection } from 'peerjs';
import type { UserProfile } from '../auth/AuthContext';
import type { ChatMessage } from '../webrtc/types';
import { PROTOCOL_VERSION, parseRoomCode } from './protocol';
import type { HostMessagePayloads, RejectReason } from './protocol';
import { cryptoEnv } from './roomEngine';
import type { RoomState } from './roomEngine';
import type { LastRoom } from './useRoomTypes';

const TOKENS_KEY = 'caro_room_tokens';
const LAST_ROOM_KEY = 'caro_last_room';
export const HANDLED_RESULTS_KEY = 'caro_room_handled_results';
const TOKEN_TTL_MS = 2 * 60_000;
export const LAST_ROOM_TTL_MS = 15 * 60_000;
export const CHAT_KEEP = 200;
const ROOM_CODE_LENGTH = 6;
const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Identifies this page load without persisting across tabs. */
export const TAB_ID = cryptoEnv.randomId(12);

export const readJson = <T,>(storage: Storage, key: string): T | null => {
  try {
    const raw = storage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
};

export const writeJson = (storage: Storage, key: string, value: unknown) => {
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // Full or blocked storage only costs the ability to resume.
  }
};

export const removeKey = (storage: Storage, key: string) => {
  try {
    storage.removeItem(key);
  } catch {
    // Nothing to clean up.
  }
};

export interface SavedSession {
  roomId: string;
  isHost: boolean;
  memberId?: string;
  token?: string;
}

type SavedTokens = Record<string, { memberId: string; token: string; savedAt: number }>;

export const rememberToken = (roomId: string, memberId: string, token: string) => {
  const now = Date.now();
  const all = readJson<SavedTokens>(localStorage, TOKENS_KEY) ?? {};
  const fresh: SavedTokens = {};
  for (const [id, entry] of Object.entries(all)) {
    if (entry && now - entry.savedAt < TOKEN_TTL_MS) fresh[id] = entry;
  }
  fresh[roomId] = { memberId, token, savedAt: now };
  writeJson(localStorage, TOKENS_KEY, fresh);
};

export const readToken = (roomId: string): { memberId: string; token: string } | null => {
  const entry = readJson<SavedTokens>(localStorage, TOKENS_KEY)?.[roomId];
  if (!entry || Date.now() - entry.savedAt >= TOKEN_TTL_MS) return null;
  return typeof entry.memberId === 'string' && typeof entry.token === 'string'
    ? { memberId: entry.memberId, token: entry.token }
    : null;
};

export const forgetToken = (roomId: string | null) => {
  if (!roomId) return;
  const all = readJson<SavedTokens>(localStorage, TOKENS_KEY);
  if (!all?.[roomId]) return;
  delete all[roomId];
  writeJson(localStorage, TOKENS_KEY, all);
};

export const readLastRoom = (): LastRoom | null => {
  const last = readJson<LastRoom>(localStorage, LAST_ROOM_KEY);
  if (!last || typeof last.roomId !== 'string' || typeof last.leftAt !== 'number') return null;
  if (Date.now() - last.leftAt > LAST_ROOM_TTL_MS || !parseRoomCode(last.roomId)) return null;
  return { roomId: last.roomId, hostName: typeof last.hostName === 'string' ? last.hostName : '', leftAt: last.leftAt, reason: last.reason === 'dropped' ? 'dropped' : 'left' };
};

export const clearLastRoom = () => removeKey(localStorage, LAST_ROOM_KEY);
export const writeLastRoom = (last: LastRoom) => writeJson(localStorage, LAST_ROOM_KEY, last);

export const readHandled = (): string[] => {
  const list = readJson<unknown>(sessionStorage, HANDLED_RESULTS_KEY);
  return Array.isArray(list) ? list.filter((id): id is string => typeof id === 'string').slice(-50) : [];
};

export const setUrlRoom = (code: string | null) => {
  try {
    window.history.replaceState(window.history.state, '', code ? `?room=${code}` : window.location.pathname);
  } catch {
    // The URL is only for sharing and for resuming after a refresh.
  }
};

export const randomCode = (): string => {
  const bytes = new Uint8Array(ROOM_CODE_LENGTH);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ROOM_CODE_ALPHABET[b % ROOM_CODE_ALPHABET.length]).join('');
};

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const isRoomState = (value: unknown): value is RoomState =>
  isRecord(value) &&
  value.v === PROTOCOL_VERSION &&
  typeof value.roomId === 'string' &&
  typeof value.rev === 'number' &&
  Array.isArray(value.members) &&
  isRecord(value.seats) &&
  Array.isArray(value.results) &&
  isRecord(value.settings);

export const profileClaim = (user: UserProfile | null) =>
  user
    ? { uid: user.uid, name: user.displayName, avatar: user.photoURL || null, isGuest: user.isGuest === true, elo: user.elo, wins: user.wins, losses: user.losses, draws: user.draws, streak: user.streak }
    : { uid: `guest_${TAB_ID}`, name: 'Guest', avatar: null, isGuest: true };

export const send = (conn: DataConnection, message: unknown) => {
  try {
    if (conn.open) void conn.send(message);
  } catch {
    // A closing channel drops the message; the close handler deals with the rest.
  }
};

export const closeConn = (conn: DataConnection) => {
  try {
    conn.close({ flush: true });
  } catch {
    try { conn.close(); } catch { /* Already closed. */ }
  }
};

export const mergeChat = (current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] => {
  const seen = new Set(current.map((message) => message.id));
  return [...current, ...incoming.filter((message) => !seen.has(message.id))]
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(-CHAT_KEEP);
};

const loadImage = (src: string): Promise<HTMLImageElement> => new Promise((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = reject;
  image.src = src;
});

export const shrinkImage = async (dataUrl: string, maxChars: number): Promise<string | null> => {
  if (dataUrl.length <= maxChars) return dataUrl;
  if (dataUrl.startsWith('data:image/gif')) return null;
  try {
    const image = await loadImage(dataUrl);
    let width = image.width;
    let height = image.height;
    let quality = 0.8;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      width = Math.max(1, Math.round(width * 0.75));
      height = Math.max(1, Math.round(height * 0.75));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) return null;
      context.drawImage(image, 0, 0, width, height);
      const result = canvas.toDataURL('image/jpeg', quality);
      if (result.length <= maxChars) return result;
      quality = Math.max(0.5, quality - 0.1);
    }
  } catch {
    // Not an image this browser can decode.
  }
  return null;
};

const REJECTION_TEXT: Partial<Record<RejectReason, string>> = {
  seat_taken: 'Someone else took that seat.', same_account: 'That account is already sitting in the other seat.', gave_up_seat: 'You gave up a seat in this game, so someone else has to take it.', countdown: 'Wait for the count-in to finish.', time_out: 'Too late: the clock ran out.', locked: 'The rules are locked during a game.', too_long: 'That message is too long.', bad_image: 'That image is too large to send. Try a smaller screenshot.', undo_off: 'Take-backs are turned off for this game.', undo_pending: 'A take-back is already waiting for an answer.', offer_pending: 'A rematch offer is already waiting for an answer.', seat_empty: 'Both seats need a player first.', not_host: 'Only the host can do that.',
};

export const rejectionText = (payload: HostMessagePayloads['REJECTED']): string | null => {
  const seconds = payload.retryInMs ? Math.ceil(payload.retryInMs / 1000) : null;
  if (payload.reason === 'cooldown') return `Give it ${seconds ?? 'a few'} more second${seconds === 1 ? '' : 's'} before teasing again.`;
  if (payload.reason === 'too_soon') return `Give the viewers a moment to take the seat first (${seconds ?? 15}s).`;
  if (payload.reason === 'rate_limited') return payload.type === 'CHAT' ? 'Slow down a little.' : null;
  if (payload.type === 'RATING_REPORT' || payload.type === 'PONG' || payload.type === 'STATE_REQUEST') return null;
  return REJECTION_TEXT[payload.reason] ?? null;
};

export const signed = (value: number) => `${value >= 0 ? '+' : '−'}${Math.abs(value)}`;
