import type { DataConnection } from 'peerjs';
import type { UserProfile } from '../auth/AuthContext';
import type { ChatMessage } from '../webrtc/types';
import { PROTOCOL_VERSION, parseRoomCode } from './protocol';
import type { HostMessagePayloads, RejectReason } from './protocol';
import { cryptoEnv } from './roomEngine';
import type { HostSnapshot, RoomState } from './roomEngine';
import type { LastRoom } from './useRoomTypes';

const TOKENS_KEY = 'caro_room_tokens';
const LAST_ROOM_KEY = 'caro_last_room';
export const HANDLED_RESULTS_KEY = 'caro_room_handled_results';
// A player may close and reopen their tab during the five-hour reconnect grace.
const TOKEN_TTL_MS = 5 * 60 * 60_000;
export const LAST_ROOM_TTL_MS = 15 * 60_000;
export const CHAT_KEEP = 200;
const ROOM_CODE_LENGTH = 6;
const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Identifies this page load without persisting across tabs. */
export const TAB_ID = cryptoEnv.randomId(12);

/**
 * ICE servers for every peer. Players behind strict NATs or on mobile data
 * cannot reach each other directly and need a TURN relay; PeerJS's free relay
 * is often overloaded, so a deployment can supply its own through
 * VITE_TURN_URLS (comma separated), VITE_TURN_USERNAME and VITE_TURN_CREDENTIAL.
 */
const iceServers = (): RTCIceServer[] => {
  const env = import.meta.env;
  const servers: RTCIceServer[] = [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] },
  ];
  const turnUrls = String(env.VITE_TURN_URLS ?? '').split(',').map((url) => url.trim()).filter(Boolean);
  if (turnUrls.length > 0) {
    servers.push({ urls: turnUrls, username: env.VITE_TURN_USERNAME ?? '', credential: env.VITE_TURN_CREDENTIAL ?? '' });
  }
  if (relayed && relayed.servers.length > 0) {
    servers.push(...relayed.servers);
  } else if (turnUrls.length === 0) {
    // Last resort: PeerJS's free relay, often overloaded or unreachable.
    servers.push({
      urls: ['turn:eu-0.turn.peerjs.com:3478', 'turn:us-0.turn.peerjs.com:3478'],
      username: 'peerjs',
      credential: 'peerjsp',
    });
  }
  return servers;
};

/** Short-lived TURN credentials from /api/turn, refreshed well before they expire. */
let relayed: { servers: RTCIceServer[]; at: number } | null = null;
let relayedRequest: Promise<void> | null = null;
const RELAY_FRESH_MS = 60 * 60_000;
const RELAY_TIMEOUT_MS = 4_000;

/** Resolves once relay credentials are loaded, or after a short timeout without them. */
export const loadIceServers = (): Promise<void> => {
  if (relayed && Date.now() - relayed.at < RELAY_FRESH_MS) return Promise.resolve();
  if (relayedRequest) return relayedRequest;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RELAY_TIMEOUT_MS);
  relayedRequest = fetch('/api/turn', { signal: controller.signal })
    .then(async (res) => {
      if (!res.ok) return;
      const data: unknown = await res.json();
      const list = isRecord(data) && Array.isArray(data.iceServers) ? data.iceServers : [];
      const servers = list.filter((s): s is RTCIceServer => isRecord(s) && (typeof s.urls === 'string' || Array.isArray(s.urls)));
      // STUN entries are already in the base list.
      const turn = servers.filter((s) => [s.urls].flat().some((url) => /^turns?:/.test(String(url))));
      if (turn.length > 0) relayed = { servers: turn, at: Date.now() };
    })
    .catch(() => {
      // No relay endpoint (local dev) or it is down: fall back to the defaults.
    })
    .finally(() => {
      clearTimeout(timer);
      relayedRequest = null;
    });
  return relayedRequest;
};

export const peerOptions = () => ({ debug: 1, config: { iceServers: iceServers() } });

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

// ---------------------------------------------------------------------------
// Host backup
// ---------------------------------------------------------------------------

/**
 * The host's room, kept in localStorage as well as the tab's sessionStorage.
 * sessionStorage dies with the tab, so a host who closed the tab, had it
 * killed by a phone, or opened the invite link in a new tab used to come back
 * as a member of their own room, which no longer existed. With this copy any
 * tab of the same browser can take the room back, seats and all.
 */
const HOST_BACKUP_KEY = 'caro_room_host_backup';
/** A live host tab writes this every second, so a second tab does not steal the room. */
const HOST_ALIVE_KEY = 'caro_room_host_alive';
/** Matches the room engine's seat grace: after that there is nothing left to resume. */
const HOST_BACKUP_TTL_MS = 5 * 60 * 60_000;
const HOST_ALIVE_FRESH_MS = 3_000;

interface HostBackup {
  roomId: string;
  savedAt: number;
  snap: HostSnapshot;
}

export const writeHostBackup = (roomId: string, snap: HostSnapshot) =>
  writeJson(localStorage, HOST_BACKUP_KEY, { roomId, savedAt: Date.now(), snap } satisfies HostBackup);

/** The backed-up room for this code, unless it is stale or belongs to another signed-in account. */
export const readHostBackup = (roomId: string, user: UserProfile | null): HostSnapshot | null => {
  const backup = readJson<HostBackup>(localStorage, HOST_BACKUP_KEY);
  if (!backup || backup.roomId !== roomId || Date.now() - backup.savedAt > HOST_BACKUP_TTL_MS) return null;
  const host = backup.snap?.state?.room?.members?.[0]?.profile;
  if (!host || backup.snap.state.room.roomId !== roomId) return null;
  if (user && !user.isGuest && !host.guest && host.uid !== user.uid) return null;
  return backup.snap;
};

export const forgetHostBackup = (roomId: string | null) => {
  if (!roomId || readJson<HostBackup>(localStorage, HOST_BACKUP_KEY)?.roomId !== roomId) return;
  removeKey(localStorage, HOST_BACKUP_KEY);
  removeKey(localStorage, HOST_ALIVE_KEY);
};

export const beatHostAlive = (roomId: string) =>
  writeJson(localStorage, HOST_ALIVE_KEY, { roomId, tabId: TAB_ID, at: Date.now() });

/** A closing host tab says so, so a tab opened right after does not wait for the beat to go stale. */
export const endHostAlive = (roomId: string) => {
  const alive = readJson<{ roomId?: string; tabId?: string }>(localStorage, HOST_ALIVE_KEY);
  if (alive?.roomId === roomId && alive.tabId === TAB_ID) removeKey(localStorage, HOST_ALIVE_KEY);
};

/** How long a tab waits for a host beat to go stale before deciding another tab really hosts the room. */
export const HOST_ALIVE_STALE_WAIT_MS = HOST_ALIVE_FRESH_MS + 500;

/** Whether another tab of this browser is hosting the room right now. */
export const hostLiveElsewhere = (roomId: string): boolean => {
  const alive = readJson<{ roomId?: string; tabId?: string; at?: number }>(localStorage, HOST_ALIVE_KEY);
  return Boolean(alive && alive.roomId === roomId && alive.tabId !== TAB_ID && typeof alive.at === 'number' && Date.now() - alive.at < HOST_ALIVE_FRESH_MS);
};

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
  if (payload.reason === 'reconnect_grace') return `You can claim the win in ${seconds ?? 'a moment'} second${seconds === 1 ? '' : 's'}.`;
  if (payload.type === 'RATING_REPORT' || payload.type === 'PONG' || payload.type === 'STATE_REQUEST') return null;
  return REJECTION_TEXT[payload.reason] ?? null;
};

export const signed = (value: number) => `${value >= 0 ? '+' : '−'}${Math.abs(value)}`;
