/**
 * useRoom: a v2 room as a React hook.
 *
 * One hook plays both parts. In the host's tab it is the hub: it owns the room
 * engine, accepts every member's connection, runs each intent through
 * applyIntent and carries out what comes back. In every other tab it is a
 * member: one connection to the host, a mirror of the state the host sends,
 * and intents going the other way. The host's own actions take the same path
 * through the engine as anyone else's, so one set of rules applies to all.
 *
 * Nothing here decides a rule. Timing, transport, persistence and the rating
 * submission live here; everything about who may do what lives in roomEngine.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Peer from 'peerjs';
import type { DataConnection } from 'peerjs';
import type { UserProfile } from '../auth/AuthContext';
import type { RoomSettings } from '../settings/types';
import type { ChatMessage } from '../webrtc/types';
import { supabase } from '../../config/supabase';
import { roomDiscoveryManager } from '../webrtc/roomDiscoveryService';
import type { HostedRoomInfo } from '../webrtc/roomDiscoveryService';
import { requestSeatTicket, resendPendingRatedResults, saveMatchRecord, submitRatedResult } from '../history/historyService';
import type { RatedSubmitOutcome } from '../history/historyService';
import { PROTOCOL_VERSION, TEASE_PHRASE, parseIntent, parseRoomCode } from './protocol';
import type {
  HostMessage,
  HostMessagePayloads,
  Intent,
  IntentPayloads,
  RatingReportStatus,
  RejectReason,
  RoomChatMessage,
  Seat,
  MoveCorner,
} from './protocol';
import {
  CHAT_IMAGE_MAX,
  CHAT_TEXT_MAX,
  MAX_MEMBERS,
  PING_INTERVAL_MS,
  SEATS,
  activeSeats,
  applyIntent,
  checkInvariants,
  clockSync,
  createRoom as createEngineRoom,
  cryptoEnv,
  liveClocks,
  noteMalformed,
  onConnectionLost,
  pieceAt,
  restore,
  seatOf,
  snapshot,
  tick,
  toWire,
} from './roomEngine';
import type { Clocks, EngineResult, EngineState, Game, GameResult, HostSnapshot, RoomState } from './roomEngine';
import { buildRatedBody, noteRequestedMove, noteResigned, verifyResult } from './ratingCheck';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type RoomStatus = 'idle' | 'opening' | 'joining' | 'connected' | 'host_lost' | 'closed' | 'error';

/** Why a room ended for this tab, when it did not end by this player's choice. */
export type ClosedReason = 'host_left' | 'host_lost' | 'full' | 'superseded' | 'old_version' | 'not_found' | 'id_taken';

export interface TeaseNotice {
  fromMemberId: string;
  fromName: string;
  at: number;
}

export interface SeatOpenedNotice {
  seat: Seat;
  at: number;
}

/** What the home screen needs to offer a way back into a room this player left. */
export interface LastRoom {
  roomId: string;
  hostName: string;
  leftAt: number;
  reason: 'left' | 'dropped';
}

export interface RoomHandlers {
  onNotice?: (text: string) => void;
  onMoveApplied?: () => void;
  onBuzzed?: () => void;
  onTeased?: () => void;
  /** A rating this player is part of was recorded: time to re-read their profile. */
  onRated?: () => void;
}

export interface CreateRoomInput {
  code?: string;
  isPublic: boolean;
  settings: RoomSettings;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PEER_PREFIX = 'caro_room_';
const SESSION_KEY = 'caro_room_v2';
const HOST_SNAPSHOT_KEY = 'caro_room_host_snapshot';
const TOKENS_KEY = 'caro_room_tokens';
const LAST_ROOM_KEY = 'caro_last_room';
const HANDLED_RESULTS_KEY = 'caro_room_handled_results';
/**
 * A resume token also lives briefly in localStorage. sessionStorage dies with
 * the tab, and reopening a closed tab within the grace period should still get
 * the seat back.
 */
const TOKEN_TTL_MS = 2 * 60_000;
export const LAST_ROOM_TTL_MS = 15 * 60_000;

const TICK_MS = 250;
const CLOCK_SYNC_MS = 3_000;
const SNAPSHOT_EVERY_MS = 1_000;
/** A connection must say HELLO this soon after opening, or it is closed. */
const HELLO_TIMEOUT_MS = 5_000;
const MAX_PENDING = 4;
/** After a refresh the old peer id lingers on the signalling server for a while. */
const ID_RETRY_MS = 2_000;
const ID_RETRY_WINDOW_MS = 20_000;
/** The host pings every 2 s, so this much silence means it is gone. */
const HOST_SILENT_MS = 8_000;
const HOST_RETRY_MS = 2_000;
const HOST_LOST_GIVE_UP_MS = 35_000;
const PEER_RECONNECT_DELAYS_MS = [1_000, 2_000, 4_000, 8_000];
const CHAT_KEEP = 200;
const ROOM_CODE_LENGTH = 6;
const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Random per page load and never stored. It tells a reconnect from this tab,
 * which closes the old connection quietly, from a duplicated tab, which gets
 * SUPERSEDED: the token alone cannot, because a duplicated tab copies
 * sessionStorage.
 */
const TAB_ID = cryptoEnv.randomId(12);

// ---------------------------------------------------------------------------
// Storage helpers. Storage is a convenience: every failure is survivable.
// ---------------------------------------------------------------------------

const readJson = <T,>(storage: Storage, key: string): T | null => {
  try {
    const raw = storage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
};

const writeJson = (storage: Storage, key: string, value: unknown) => {
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // Full or blocked storage only costs the ability to resume.
  }
};

const removeKey = (storage: Storage, key: string) => {
  try {
    storage.removeItem(key);
  } catch {
    // Nothing to clean up.
  }
};

interface SavedSession {
  roomId: string;
  isHost: boolean;
  memberId?: string;
  token?: string;
}

type SavedTokens = Record<string, { memberId: string; token: string; savedAt: number }>;

const rememberToken = (roomId: string, memberId: string, token: string) => {
  const now = Date.now();
  const all = readJson<SavedTokens>(localStorage, TOKENS_KEY) ?? {};
  const fresh: SavedTokens = {};
  for (const [id, entry] of Object.entries(all)) {
    if (entry && now - entry.savedAt < TOKEN_TTL_MS) fresh[id] = entry;
  }
  fresh[roomId] = { memberId, token, savedAt: now };
  writeJson(localStorage, TOKENS_KEY, fresh);
};

const readToken = (roomId: string): { memberId: string; token: string } | null => {
  const entry = readJson<SavedTokens>(localStorage, TOKENS_KEY)?.[roomId];
  if (!entry || Date.now() - entry.savedAt >= TOKEN_TTL_MS) return null;
  return typeof entry.memberId === 'string' && typeof entry.token === 'string'
    ? { memberId: entry.memberId, token: entry.token }
    : null;
};

const forgetToken = (roomId: string | null) => {
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

const writeLastRoom = (last: LastRoom) => writeJson(localStorage, LAST_ROOM_KEY, last);

const readHandled = (): string[] => {
  const list = readJson<unknown>(sessionStorage, HANDLED_RESULTS_KEY);
  return Array.isArray(list) ? list.filter((id): id is string => typeof id === 'string').slice(-50) : [];
};

const setUrlRoom = (code: string | null) => {
  try {
    window.history.replaceState(window.history.state, '', code ? `?room=${code}` : window.location.pathname);
  } catch {
    // The URL is only for sharing and for resuming after a refresh.
  }
};

const randomCode = (): string => {
  const bytes = new Uint8Array(ROOM_CODE_LENGTH);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ROOM_CODE_ALPHABET[b % ROOM_CODE_ALPHABET.length]).join('');
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Enough of a shape check that a garbled message cannot crash the render. */
const isRoomState = (value: unknown): value is RoomState =>
  isRecord(value) &&
  value.v === PROTOCOL_VERSION &&
  typeof value.roomId === 'string' &&
  typeof value.rev === 'number' &&
  Array.isArray(value.members) &&
  isRecord(value.seats) &&
  Array.isArray(value.results) &&
  isRecord(value.settings);

/** The profile a member claims. The host sanitises it; nothing here is trusted by anyone. */
const profileClaim = (user: UserProfile | null) =>
  user
    ? {
        uid: user.uid,
        name: user.displayName,
        avatar: user.photoURL || null,
        isGuest: user.isGuest === true,
        elo: user.elo,
        wins: user.wins,
        losses: user.losses,
        draws: user.draws,
        streak: user.streak,
      }
    : { uid: `guest_${TAB_ID}`, name: 'Guest', avatar: null, isGuest: true };

const send = (conn: DataConnection, message: unknown) => {
  try {
    if (conn.open) void conn.send(message);
  } catch {
    // A closing channel drops the message; the close handler deals with the rest.
  }
};

/** Flush first, so a terminal message such as ROOM_CLOSED actually arrives. */
const closeConn = (conn: DataConnection) => {
  try {
    conn.close({ flush: true });
  } catch {
    try {
      conn.close();
    } catch {
      // Already closed.
    }
  }
};

const mergeChat = (current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] => {
  const seen = new Set(current.map((m) => m.id));
  const merged = [...current, ...incoming.filter((m) => !seen.has(m.id))];
  return merged.sort((a, b) => a.timestamp - b.timestamp).slice(-CHAT_KEEP);
};

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

/**
 * Shrinks a pasted screenshot until it fits the room's image limit. Images
 * share one ordered channel with the moves, so the limit is small on purpose.
 */
const shrinkImage = async (dataUrl: string, maxChars: number): Promise<string | null> => {
  if (dataUrl.length <= maxChars) return dataUrl;
  // Canvas compression turns an animated GIF into one still JPEG frame. GIFs
  // stay local data URLs and are rejected if they exceed the P2P chat limit.
  if (dataUrl.startsWith('data:image/gif')) return null;
  try {
    const img = await loadImage(dataUrl);
    let width = img.width;
    let height = img.height;
    let quality = 0.8;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      width = Math.max(1, Math.round(width * 0.75));
      height = Math.max(1, Math.round(height * 0.75));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(img, 0, 0, width, height);
      const out = canvas.toDataURL('image/jpeg', quality);
      if (out.length <= maxChars) return out;
      quality = Math.max(0.5, quality - 0.1);
    }
  } catch {
    // Not an image this browser can decode.
  }
  return null;
};

const REJECTION_TEXT: Partial<Record<RejectReason, string>> = {
  seat_taken: 'Someone else took that seat.',
  same_account: 'That account is already sitting in the other seat.',
  gave_up_seat: 'You gave up a seat in this game, so someone else has to take it.',
  countdown: 'Wait for the count-in to finish.',
  time_out: 'Too late: the clock ran out.',
  locked: 'The rules are locked during a game.',
  too_long: 'That message is too long.',
  bad_image: 'That image is too large to send. Try a smaller screenshot.',
  undo_off: 'Take-backs are turned off for this game.',
  undo_pending: 'A take-back is already waiting for an answer.',
  offer_pending: 'A rematch offer is already waiting for an answer.',
  seat_empty: 'Both seats need a player first.',
  not_host: 'Only the host can do that.',
};

const rejectionText = (payload: HostMessagePayloads['REJECTED']): string | null => {
  const seconds = payload.retryInMs ? Math.ceil(payload.retryInMs / 1000) : null;
  if (payload.reason === 'cooldown') return `Give it ${seconds ?? 'a few'} more second${seconds === 1 ? '' : 's'} before teasing again.`;
  if (payload.reason === 'too_soon') return `Give the viewers a moment to take the seat first (${seconds ?? 15}s).`;
  if (payload.reason === 'rate_limited') return payload.type === 'CHAT' ? 'Slow down a little.' : null;
  // Moves out of turn and reports that arrive after the fact are not news.
  if (payload.type === 'RATING_REPORT' || payload.type === 'PONG' || payload.type === 'STATE_REQUEST') return null;
  return REJECTION_TEXT[payload.reason] ?? null;
};

const signed = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n)}`;

// ---------------------------------------------------------------------------
// The hook
// ---------------------------------------------------------------------------

export const useRoom = (user: UserProfile | null, handlers: RoomHandlers = {}) => {
  const [status, setStatus] = useState<RoomStatus>('idle');
  const [roomId, setRoomId] = useState<string | null>(null);
  const [isHost, setIsHost] = useState(false);
  const [memberId, setMemberId] = useState<string | null>(null);
  const [state, setState] = useState<RoomState | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [closedReason, setClosedReason] = useState<ClosedReason | null>(null);
  const [pendingMove, setPendingMove] = useState<[number, number] | null>(null);
  const [hostLostSince, setHostLostSince] = useState<number | null>(null);
  const [tease, setTease] = useState<TeaseNotice | null>(null);
  const [seatOpened, setSeatOpened] = useState<SeatOpenedNotice | null>(null);
  /** Rating news this device learned from the server, by game id. */
  const [ratingNotes, setRatingNotes] = useState<Record<string, string>>({});
  /** Re-renders a few times a second while something on screen counts down. */
  const [, setFrame] = useState(0);

  const userRef = useRef(user);
  const handlersRef = useRef(handlers);
  useEffect(() => {
    userRef.current = user;
    handlersRef.current = handlers;
  });

  const core = useMemo(() => {
    const r = {
      role: null as 'host' | 'member' | null,
      peer: null as Peer | null,
      roomId: null as string | null,
      engine: null as EngineState | null,
      conns: new Map<string, DataConnection>(),
      connMember: new Map<DataConnection, string>(),
      pending: new Map<DataConnection, number>(),
      hostConn: null as DataConnection | null,
      memberId: null as string | null,
      token: null as string | null,
      welcomed: false,
      terminal: false,
      mirror: null as RoomState | null,
      receivedAt: 0,
      lastHeard: 0,
      hostLostSince: null as number | null,
      lastRetryAt: 0,
      connectAttempts: 0,
      lastRejected: null as HostMessagePayloads['REJECTED'] | null,
      loop: null as ReturnType<typeof setInterval> | null,
      retryTimer: null as ReturnType<typeof setTimeout> | null,
      peerAttempt: 0,
      idRetryUntil: 0,
      lastPingAt: 0,
      lastClockSyncAt: 0,
      lastSnapshotAt: 0,
      lastChatEcho: null as string | null,
      games: new Map<string, Game>(),
      resultClocks: new Map<string, Clocks | null>(),
      handled: new Set<string>(readHandled()),
      tickets: new Set<string>(),
      /** Requests in flight; a failed request is deliberately not considered a ticket. */
      ticketRequests: new Set<string>(),
      ratedRefreshed: new Set<string>(),
    };

    const notice = (text: string) => handlersRef.current.onNotice?.(text);

    const appendChat = (message: ChatMessage) => {
      setChatMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message].slice(-CHAT_KEEP)));
    };

    const systemLine = (text: string) =>
      appendChat({ id: cryptoEnv.randomId(10), sender: 'System', text, timestamp: Date.now(), system: true });

    /** Replaces the mirror, noting what the ending game's clocks looked like here. */
    const setMirror = (next: RoomState) => {
      const prev = r.mirror;
      if (prev?.game) {
        const prevGame = prev.game;
        for (const result of next.results) {
          if (result.gameId !== prevGame.id || r.resultClocks.has(result.gameId)) continue;
          const shown =
            prev.phase === 'playing' ? liveClocks(prevGame, performance.now() - r.receivedAt) : prevGame.clocks;
          r.resultClocks.set(result.gameId, prev.phase === 'playing' ? shown : null);
        }
      }
      if (next.game) {
        r.games.set(next.game.id, next.game);
        if (r.games.size > 4) r.games.delete(r.games.keys().next().value as string);
      }
      r.mirror = next;
      r.receivedAt = performance.now();
      setState(next);
    };

    // ------------------------------------------------------------------ host

    const unbind = (memberId: string) => {
      const conn = r.conns.get(memberId);
      r.conns.delete(memberId);
      if (conn) r.connMember.delete(conn);
    };

    const bindConn = (memberId: string, supersede: boolean, conn: DataConnection) => {
      const old = r.conns.get(memberId);
      if (old && old !== conn) {
        r.connMember.delete(old);
        if (supersede) send(old, { v: PROTOCOL_VERSION, type: 'SUPERSEDED', payload: {} });
        closeConn(old);
      }
      r.conns.set(memberId, conn);
      r.connMember.set(conn, memberId);
      r.pending.delete(conn);
    };

    const wire = (message: HostMessage) => ({ v: PROTOCOL_VERSION, ...message });

    const hostDeliver = (to: string | null, message: HostMessage, origin: DataConnection | null) => {
      if (to === null) {
        if (origin) send(origin, wire(message));
        return;
      }
      if (to === r.engine?.host.hostMemberId) {
        receive(message);
        return;
      }
      const conn = r.conns.get(to);
      if (conn) send(conn, wire(message));
    };

    const saveSnapshot = (now: number) => {
      if (!r.engine) return;
      r.lastSnapshotAt = now;
      writeJson(sessionStorage, HOST_SNAPSHOT_KEY, snapshot(r.engine, now));
    };

    /** Keeps the public list in step with the room, while it has room for one more. */
    const announce = () => {
      const room = r.engine?.room;
      if (!room || !room.isPublic) return;
      if (room.members.length >= MAX_MEMBERS) {
        roomDiscoveryManager.stopHostingRoom(room.roomId);
        return;
      }
      const seatsFilled = activeSeats(room.settings).filter((s) => room.seats[s] !== null).length;
      const host = room.members[0];
      const info: HostedRoomInfo = {
        hostName: host.profile.name,
        hostAvatar: host.profile.avatar ?? undefined,
        boardSize: room.settings.boardSize,
        createdAt: room.createdAt,
        seatsFilled: seatsFilled as 0 | 1 | 2,
        viewers: room.members.length - seatsFilled,
        members: room.members.length,
        capacity: MAX_MEMBERS,
        status: room.phase === 'countdown' || room.phase === 'opening' ? 'playing' : room.phase,
        openSeat: seatsFilled < activeSeats(room.settings).length && room.phase !== 'countdown' && room.phase !== 'opening',
      };
      roomDiscoveryManager.hostRoom(room.roomId, info);
    };

    const publishHost = (now: number, force = false) => {
      const engine = r.engine;
      if (!engine) return;
      if (!force && r.mirror && r.mirror.rev === engine.room.rev) return;
      setMirror(toWire(engine, now));
      saveSnapshot(now);
      announce();
      if (import.meta.env.DEV) {
        const problems = checkInvariants(engine);
        if (problems.length) console.error('Room invariants broken:', problems);
      }
    };

    /**
     * Carries out an engine result. Binds come first, because a WELCOME reply
     * is addressed to the member the bind creates; then the replies; then
     * every other event, so a closing connection still flushes its reply.
     */
    const hostApply = (result: EngineResult, origin: DataConnection | null) => {
      r.engine = result.state;
      const now = Date.now();
      const hostId = result.state.host.hostMemberId;
      for (const ev of result.events) {
        if (ev.kind === 'bind' && origin) bindConn(ev.memberId, ev.supersede, origin);
      }
      for (const reply of result.replies) hostDeliver(reply.to, reply.message, origin);
      for (const ev of result.events) {
        if (ev.kind === 'room_state') {
          const message = wire({ type: 'ROOM_STATE', payload: { state: toWire(result.state, now) } });
          for (const [id, conn] of r.conns) if (!ev.except.includes(id)) send(conn, message);
        } else if (ev.kind === 'broadcast') {
          const message = wire(ev.message);
          for (const [id, conn] of r.conns) if (!ev.except.includes(id)) send(conn, message);
          if (!ev.except.includes(hostId)) receive(ev.message);
        } else if (ev.kind === 'close') {
          const conn = ev.memberId === null ? origin : (r.conns.get(ev.memberId) ?? null);
          if (ev.memberId !== null) unbind(ev.memberId);
          if (conn) {
            r.pending.delete(conn);
            closeConn(conn);
          }
        } else if (ev.kind === 'member_removed') {
          const conn = r.conns.get(ev.memberId);
          unbind(ev.memberId);
          if (conn) closeConn(conn);
        }
      }
      publishHost(now);
    };

    const onMemberData = (conn: DataConnection, raw: unknown) => {
      const engine = r.engine;
      if (!engine) return;
      const now = Date.now();
      const from = r.connMember.get(conn) ?? null;
      const intent = parseIntent(raw);
      if (!intent) {
        if (from === null) {
          r.pending.delete(conn);
          closeConn(conn);
          return;
        }
        const noted = noteMalformed(engine, from, now);
        r.engine = noted.state;
        if (noted.kick) {
          unbind(from);
          closeConn(conn);
          hostApply(onConnectionLost(noted.state, from, now), null);
        }
        return;
      }
      if (from === null && intent.type !== 'HELLO') {
        r.pending.delete(conn);
        closeConn(conn);
        return;
      }
      hostApply(applyIntent(engine, intent, from, now), conn);
    };

    const onMemberGone = (conn: DataConnection) => {
      r.pending.delete(conn);
      const id = r.connMember.get(conn);
      if (!id) return;
      r.connMember.delete(conn);
      // A connection replaced by a newer one from the same member is not a loss.
      if (r.conns.get(id) !== conn) return;
      r.conns.delete(id);
      if (r.engine) hostApply(onConnectionLost(r.engine, id, Date.now()), null);
    };

    const acceptConnection = (conn: DataConnection) => {
      if (!r.engine) {
        conn.on('open', () => closeConn(conn));
        return;
      }
      const meta = conn.metadata as { caro?: unknown } | undefined;
      if (meta?.caro !== PROTOCOL_VERSION) {
        // An older client. Its own "they left" handling stops it retrying, and
        // a refresh brings it the new version.
        conn.on('open', () => {
          send(conn, { type: 'LEAVE_ROOM', payload: {} });
          closeConn(conn);
        });
        return;
      }
      conn.on('open', () => {
        if (r.pending.size >= MAX_PENDING) {
          closeConn(conn);
          return;
        }
        r.pending.set(conn, Date.now());
      });
      conn.on('data', (raw) => onMemberData(conn, raw));
      conn.on('close', () => onMemberGone(conn));
      conn.on('error', () => onMemberGone(conn));
    };

    const hostLoop = () => {
      const engine = r.engine;
      if (!engine) return;
      const now = Date.now();
      for (const [conn, openedAt] of r.pending) {
        if (now - openedAt > HELLO_TIMEOUT_MS) {
          r.pending.delete(conn);
          closeConn(conn);
        }
      }
      hostApply(tick(engine, now), null);
      if (now - r.lastPingAt >= PING_INTERVAL_MS) {
        r.lastPingAt = now;
        const ping = wire({ type: 'PING', payload: { t: now } });
        for (const conn of r.conns.values()) send(conn, ping);
      }
      if (now - r.lastClockSyncAt >= CLOCK_SYNC_MS && r.engine) {
        r.lastClockSyncAt = now;
        const sync = clockSync(r.engine, now);
        if (sync) for (const conn of r.conns.values()) send(conn, wire(sync));
      }
      if (r.engine?.room.phase === 'playing' && now - r.lastSnapshotAt >= SNAPSHOT_EVERY_MS) saveSnapshot(now);
    };

    // ---------------------------------------------------------------- member

    const memberLoop = () => {
      if (r.role !== 'member' || r.terminal) return;
      const now = Date.now();
      if (r.hostLostSince === null && r.hostConn?.open && now - r.lastHeard > HOST_SILENT_MS) {
        startHostLost();
      }
      if (r.hostLostSince === null) return;
      if (now - r.hostLostSince > HOST_LOST_GIVE_UP_MS) {
        finish('host_lost', 'The host disconnected and did not come back, so the game ended for everyone.');
      } else if (now - r.lastRetryAt >= HOST_RETRY_MS) {
        r.lastRetryAt = now;
        connectToHost();
      }
    };

    const startLoop = (fn: () => void, ms: number) => {
      if (r.loop) clearInterval(r.loop);
      r.loop = setInterval(fn, ms);
    };

    const startHostLost = () => {
      if (r.hostLostSince !== null || r.terminal) return;
      r.hostLostSince = Date.now();
      r.lastRetryAt = Date.now();
      setHostLostSince(r.hostLostSince);
      setStatus('host_lost');
      setPendingMove(null);
    };

    const sendHello = (conn: DataConnection) => {
      const payload: IntentPayloads['HELLO'] = { profile: profileClaim(userRef.current), tabId: TAB_ID };
      if (r.memberId && r.token) payload.resume = { memberId: r.memberId, token: r.token };
      send(conn, { v: PROTOCOL_VERSION, type: 'HELLO', payload });
    };

    const connectToHost = () => {
      const peer = r.peer;
      if (!peer || peer.destroyed || r.terminal || !r.roomId) return;
      const previous = r.hostConn;
      r.hostConn = null;
      if (previous) {
        try {
          previous.close();
        } catch {
          // A half-open attempt may already be gone.
        }
      }
      r.connectAttempts += 1;
      const conn = peer.connect(PEER_PREFIX + r.roomId, { reliable: true, metadata: { caro: PROTOCOL_VERSION } });
      r.hostConn = conn;
      conn.on('open', () => {
        if (r.hostConn !== conn) return;
        r.lastHeard = Date.now();
        sendHello(conn);
      });
      conn.on('data', (raw) => onHostData(conn, raw));
      conn.on('close', () => onHostConnGone(conn));
      conn.on('error', () => onHostConnGone(conn));
    };

    const onHostConnGone = (conn: DataConnection) => {
      if (conn !== r.hostConn || r.terminal || r.role !== 'member') return;
      startHostLost();
    };

    const onHostData = (conn: DataConnection, raw: unknown) => {
      if (conn !== r.hostConn || r.terminal) return;
      r.lastHeard = Date.now();
      if (!isRecord(raw) || raw.v !== PROTOCOL_VERSION || typeof raw.type !== 'string' || !isRecord(raw.payload)) {
        if (!r.welcomed) {
          // A host on the old version talks first and without a version.
          // Tell it we left, so it does not wait 30 seconds for us.
          send(conn, { type: 'LEAVE_ROOM', payload: {} });
          closeConn(conn);
          finish(
            'old_version',
            'This room was opened with an older version of Caro. Ask the host to refresh their page, then join again.',
          );
        }
        return;
      }
      receive({ type: raw.type, payload: raw.payload } as HostMessage);
    };

    /** Sends an intent: straight into the engine on the host, down the wire on a member. */
    const sendIntent = (intent: Intent): boolean => {
      if (r.role === 'host' && r.engine) {
        hostApply(applyIntent(r.engine, intent, r.engine.host.hostMemberId, Date.now()), null);
        return true;
      }
      if (r.role === 'member' && r.welcomed && r.hostConn?.open && r.hostLostSince === null) {
        send(r.hostConn, { v: PROTOCOL_VERSION, ...intent });
        return true;
      }
      return false;
    };

    const applyMoveToMirror = (p: HostMessagePayloads['MOVE_APPLIED']) => {
      const cur = r.mirror;
      const game = cur?.game;
      if (!cur || !game || game.id !== p.gameId || game.moves.length !== p.n) {
        sendIntent({ type: 'STATE_REQUEST', payload: {} });
        return;
      }
      const by = cur.seats[pieceAt(p.n, game.openingSeat, game.settings)] ?? '';
      setMirror({
        ...cur,
        rev: p.rev,
        game: {
          ...game,
          moves: [...game.moves, [p.row, p.col]],
          moveBy: [...game.moveBy, by],
          moveCorners: [...(game.moveCorners ?? []), p.corner ?? 'center'],
          turn: p.turn,
          clocks: p.clocks,
          lastMove: { by, at: Date.now() },
        },
      });
    };

    // ------------------------------------------------------------- messages

    const receive = (message: HostMessage) => {
      const hostSide = r.role === 'host';
      switch (message.type) {
        case 'WELCOME': {
          if (hostSide) return;
          const p = message.payload;
          if (!isRoomState(p.state) || typeof p.memberId !== 'string' || typeof p.token !== 'string') return;
          r.welcomed = true;
          r.memberId = p.memberId;
          r.token = p.token;
          r.hostLostSince = null;
          if (r.roomId) {
            rememberToken(r.roomId, p.memberId, p.token);
            writeJson(sessionStorage, SESSION_KEY, { roomId: r.roomId, isHost: false, memberId: p.memberId, token: p.token });
          }
          clearLastRoom();
          setHostLostSince(null);
          setMemberId(p.memberId);
          setMirror(p.state);
          const backlog = Array.isArray(p.chatBacklog) ? p.chatBacklog : [];
          setChatMessages((prev) => mergeChat(p.resumed ? prev : [], backlog));
          setStatus('connected');
          if (p.expired) notice('You were away too long, so your seat was given up.');
          return;
        }
        case 'ROOM_STATE': {
          if (hostSide) return;
          const next = message.payload.state;
          const cur = r.mirror;
          if (!isRoomState(next)) return;
          if (cur && next.createdAt === cur.createdAt && next.rev < cur.rev) return;
          setMirror(next);
          return;
        }
        case 'MOVE_APPLIED':
          if (!hostSide) applyMoveToMirror(message.payload);
          setPendingMove(null);
          handlersRef.current.onMoveApplied?.();
          return;
        case 'CLOCK_SYNC': {
          const cur = r.mirror;
          if (hostSide || !cur?.game || cur.game.id !== message.payload.gameId) return;
          setMirror({ ...cur, game: { ...cur.game, clocks: message.payload.clocks } });
          return;
        }
        case 'REJECTED': {
          const p = message.payload;
          r.lastRejected = p;
          if (p.type === 'MOVE') setPendingMove(null);
          if (p.type === 'CHAT' && r.lastChatEcho) {
            const echo = r.lastChatEcho;
            setChatMessages((prev) => prev.filter((m) => m.id !== echo));
          }
          const text = rejectionText(p);
          if (text) notice(text);
          return;
        }
        case 'EVENT': {
          const p = message.payload;
          if (p.kind === 'seat_opened') {
            if (p.seat) setSeatOpened({ seat: p.seat, at: Date.now() });
            return;
          }
          const texts: Record<string, string> = {
            undo_declined: 'Your opponent declined the take-back.',
            undo_expired: 'Your take-back request expired.',
            rematch_declined:
              p.why === 'rules_changed'
                ? 'The rules changed, so the rematch offer was withdrawn.'
                : 'Your opponent declined the rematch.',
            rematch_expired: 'Your rematch offer expired.',
          };
          if (texts[p.kind]) notice(texts[p.kind]);
          return;
        }
        case 'CHAT':
          if (isRecord(message.payload.message)) appendChat(message.payload.message as RoomChatMessage);
          return;
        case 'BUZZ': {
          const p = message.payload;
          systemLine(`🔔 ${p.fromName} buzzed`);
          const mine = r.mirror ? seatOf(r.mirror, r.memberId) : null;
          if (mine && mine !== p.fromSeat) handlersRef.current.onBuzzed?.();
          return;
        }
        case 'TEASE': {
          const p = message.payload;
          systemLine(`😡 ${p.fromName} → ${p.toName}: ${TEASE_PHRASE}!`);
          if (p.toMemberId === r.memberId) {
            setTease({ fromMemberId: p.fromMemberId, fromName: p.fromName, at: Date.now() });
            handlersRef.current.onTeased?.();
          }
          return;
        }
        case 'PING':
          if (!hostSide && r.hostConn) send(r.hostConn, { v: PROTOCOL_VERSION, type: 'PONG', payload: { t: message.payload.t } });
          return;
        case 'ROOM_FULL':
          finish('full', `Room ${r.roomId} is full (${message.payload.capacity} of ${message.payload.capacity}).`);
          return;
        case 'ROOM_CLOSED':
          finish('host_left', `${message.payload.hostName} was hosting and left, so the game ended for everyone.`);
          return;
        case 'SUPERSEDED':
          finish('superseded', 'This room is open in another tab.');
          return;
      }
    };

    // --------------------------------------------------------------- ratings

    const setRatingNote = (gameId: string, text: string) =>
      setRatingNotes((prev) => (prev[gameId] === text ? prev : { ...prev, [gameId]: text }));

    const report = (gameId: string, status: RatingReportStatus, why?: string, deltas?: { X: number; O: number }) => {
      const payload: IntentPayloads['RATING_REPORT'] = { gameId, status };
      if (why) payload.why = why.slice(0, 200);
      if (deltas) payload.deltas = deltas;
      sendIntent({ type: 'RATING_REPORT', payload });
    };

    const writeLocalHistory = (result: GameResult) => {
      const { X, O } = result.players;
      const winner = result.winner === 'DRAW' ? null : result.players[result.winner];
      void saveMatchRecord(
        {
          mode: 'pvp',
          player1Uid: X.uid,
          player2Uid: O.uid,
          player1Name: X.name,
          player2Name: O.name,
          winnerUid: winner ? winner.uid : 'DRAW',
          winnerName: winner ? winner.name : 'DRAW',
          boardSize: result.settings.boardSize,
          timerConfig: `${result.settings.totalTimeMinutes}m / ${result.settings.turnTimeSeconds}s`,
          eloDeltaPlayer1: 0,
          eloDeltaPlayer2: 0,
          gameId: result.gameId,
        },
        { localOnly: true },
      );
    };

    /**
     * Every registered player seated at the end submits: the loser's
     * submission records the game at once, the winner's files the claim that
     * records it anyway if the loser never does. Only the engine's designated
     * submitters report back to the room.
     */
    const submitFor = async (result: GameResult, seat: Seat) => {
      const player = result.players[seat];
      const rating = result.rating;
      if (rating.status === 'unrated') return;
      const isSubmitter = rating.status === 'pending' && rating.submitters.includes(seat);
      const u = userRef.current;
      if (!u || u.isGuest || u.uid !== player.uid || !player.rated || !supabase) {
        if (isSubmitter) report(result.gameId, 'skipped', 'no_session');
        return;
      }
      let sessionUid: string | null = null;
      try {
        const { data } = await supabase.auth.getSession();
        sessionUid = data.session?.user.id ?? null;
      } catch {
        sessionUid = null;
      }
      if (sessionUid !== player.uid) {
        if (isSubmitter) report(result.gameId, 'skipped', 'no_session');
        return;
      }
      const game = r.games.get(result.gameId) ?? null;
      const verdict = verifyResult(result, game, player.memberId, seat, r.resultClocks.get(result.gameId) ?? null);
      if (verdict === 'unverifiable') {
        setRatingNote(result.gameId, 'Not rated: the result could not be confirmed on this device.');
        if (isSubmitter) report(result.gameId, 'skipped', 'unverified');
        return;
      }
      const body = buildRatedBody(result, game);
      if (verdict === 'contradicted') body.dispute = true;

      let outcome: RatedSubmitOutcome = await submitRatedResult(body);
      for (let attempt = 1; outcome.status === 'network' && attempt < 3; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
        outcome = await submitRatedResult(body);
      }

      switch (outcome.status) {
        case 'saved': {
          const mine = seat === 'X' ? outcome.deltas.player1 : outcome.deltas.player2;
          setRatingNote(result.gameId, `Rating ${signed(mine)}`);
          if (isSubmitter) report(result.gameId, 'saved', undefined, { X: outcome.deltas.player1, O: outcome.deltas.player2 });
          handlersRef.current.onRated?.();
          return;
        }
        case 'duplicate':
          if (isSubmitter) report(result.gameId, 'saved');
          handlersRef.current.onRated?.();
          return;
        case 'pending_claim':
          setRatingNote(result.gameId, 'Rating pending: recorded in 10 minutes unless disputed.');
          if (isSubmitter) report(result.gameId, 'skipped', 'claim_pending');
          return;
        case 'disputed':
          setRatingNote(result.gameId, 'Not rated: the result was disputed.');
          if (isSubmitter) report(result.gameId, 'skipped', 'disputed');
          return;
        case 'refused':
          // The player a result favours is refused when there is nothing to
          // claim yet. That is the normal path, not a failure.
          if (outcome.code !== 'caller_would_gain' && outcome.code !== 'already_recorded') {
            setRatingNote(result.gameId, 'Not rated.');
          }
          if (outcome.code === 'caller_would_gain' && !isSubmitter) {
            setRatingNote(result.gameId, 'Rating pending: confirming both players were seated…');
          }
          if (isSubmitter) report(result.gameId, 'skipped', outcome.code);
          return;
        case 'failed':
          setRatingNote(result.gameId, 'The rating could not be saved.');
          if (isSubmitter) report(result.gameId, 'failed', outcome.why);
          return;
        case 'network':
          setRatingNote(result.gameId, 'No connection. The rating will be sent when you are back online.');
          if (isSubmitter) report(result.gameId, 'unknown', 'network');
          return;
      }
    };

    const processResults = () => {
      const room = r.mirror;
      const me = r.memberId;
      if (!room || !me) return;
      for (const result of room.results) {
        const seat = SEATS.find((s) => result.players[s].memberId === me);
        if (!seat) continue;
        if (result.rating.status === 'saved' && !r.ratedRefreshed.has(result.gameId)) {
          r.ratedRefreshed.add(result.gameId);
          handlersRef.current.onRated?.();
        }
        if (r.handled.has(result.gameId)) continue;
        r.handled.add(result.gameId);
        writeJson(sessionStorage, HANDLED_RESULTS_KEY, Array.from(r.handled).slice(-50));
        writeLocalHistory(result);
        void submitFor(result, seat);
      }
    };

    /** A signed-in player sitting in a game proves it to the server, once per game and seat. */
    const requestTickets = () => {
      const room = r.mirror;
      const me = r.memberId;
      const u = userRef.current;
      const game = room?.game;
      if (!room || !game || !me || !u || u.isGuest) return;
      if (room.phase !== 'opening' && room.phase !== 'countdown' && room.phase !== 'playing' && room.phase !== 'paused') return;
      const seat = seatOf(room, me);
      const member = room.members.find((m) => m.id === me);
      if (!seat || !member?.profile.rated) return;
      const key = `${game.id}:${seat}`;
      if (r.tickets.has(key) || r.ticketRequests.has(key) || seat === 'T') return;
      r.ticketRequests.add(key);
      void requestSeatTicket(game.id, seat, room.roomId)
        .then((saved) => {
          if (saved) {
            r.tickets.add(key);
            // A winning player may have submitted their protected claim before
            // the other seat's ticket finished. Replay that preserved claim as
            // soon as both accounts can be proved to have played.
            return resendPendingRatedResults().then(() => handlersRef.current.onRated?.());
          }
          return undefined;
        })
        .finally(() => {
          r.ticketRequests.delete(key);
          // The ticket endpoint already retries transient errors three times.
          // Keep trying in the background while the same room/game is live;
          // previously the first failed request permanently lost the claim.
          if (!r.tickets.has(key) && r.mirror?.game?.id === game.id && !r.terminal) {
            window.setTimeout(requestTickets, 5_000);
          }
        });
    };

    // ------------------------------------------------------------- lifecycle

    const stopTimers = () => {
      if (r.loop) clearInterval(r.loop);
      r.loop = null;
      if (r.retryTimer) clearTimeout(r.retryTimer);
      r.retryTimer = null;
    };

    const dropPeer = () => {
      const peer = r.peer;
      r.peer = null;
      // A moment's grace so the last flushed message leaves before the peer goes.
      if (peer) setTimeout(() => peer.destroy(), 300);
    };

    /** Forgets the room entirely. `clearUi` also resets what the screen shows. */
    const teardown = (clearUi: boolean) => {
      stopTimers();
      dropPeer();
      r.conns.clear();
      r.connMember.clear();
      r.pending.clear();
      r.hostConn = null;
      r.engine = null;
      r.role = null;
      r.roomId = null;
      r.memberId = null;
      r.token = null;
      r.welcomed = false;
      r.terminal = false;
      r.hostLostSince = null;
      r.mirror = null;
      r.peerAttempt = 0;
      removeKey(sessionStorage, SESSION_KEY);
      if (!clearUi) return;
      setUrlRoom(null);
      setStatus('idle');
      setRoomId(null);
      setIsHost(false);
      setMemberId(null);
      setState(null);
      setChatMessages([]);
      setPendingMove(null);
      setHostLostSince(null);
      setTease(null);
      setSeatOpened(null);
    };

    /** The room ended for this tab without this player choosing it. Nothing retries. */
    const finish = (reason: ClosedReason | null, message: string) => {
      const wasHost = r.role === 'host';
      const code = r.roomId;
      r.terminal = true;
      stopTimers();
      dropPeer();
      r.hostConn = null;
      removeKey(sessionStorage, SESSION_KEY);
      if (wasHost) removeKey(sessionStorage, HOST_SNAPSHOT_KEY);
      forgetToken(code);
      setUrlRoom(null);
      setStatus(reason ? 'closed' : 'error');
      setClosedReason(reason);
      setError(message);
      setHostLostSince(null);
      setPendingMove(null);
    };

    /** Signalling dropped. Data channels survive it, so only the socket is retried. */
    const reconnectPeer = (peer: Peer) => {
      if (r.peer !== peer || peer.destroyed || r.terminal) return;
      const delay = PEER_RECONNECT_DELAYS_MS[Math.min(r.peerAttempt, PEER_RECONNECT_DELAYS_MS.length - 1)];
      r.peerAttempt += 1;
      setTimeout(() => {
        if (r.peer === peer && peer.disconnected && !peer.destroyed) {
          try {
            peer.reconnect();
          } catch {
            // The next 'disconnected' schedules another try.
          }
        }
      }, delay);
    };

    const openHostPeer = (code: string) => {
      const peer = new Peer(PEER_PREFIX + code, { debug: 1 });
      r.peer = peer;
      peer.on('open', () => {
        if (r.peer !== peer) return;
        r.peerAttempt = 0;
        setStatus('connected');
        startLoop(hostLoop, TICK_MS);
        announce();
      });
      peer.on('connection', (conn) => {
        if (r.peer === peer) acceptConnection(conn);
      });
      peer.on('disconnected', () => reconnectPeer(peer));
      peer.on('error', (err) => {
        if (r.peer !== peer) return;
        const type = (err as { type?: string }).type;
        if (type === 'unavailable-id') {
          if (Date.now() < r.idRetryUntil) {
            r.peer = null;
            peer.destroy();
            r.retryTimer = setTimeout(() => {
              if (r.role === 'host' && r.roomId === code && !r.terminal) openHostPeer(code);
            }, ID_RETRY_MS);
            return;
          }
          finish('id_taken', 'This room is already open in another tab.');
          return;
        }
        if (!peer.open) finish(null, `Could not open the room. ${err.message}`);
      });
    };

    const createRoom = (input: CreateRoomInput) => {
      const code = (input.code && parseRoomCode(input.code)) || randomCode();
      const saved = readJson<SavedSession>(sessionStorage, SESSION_KEY);
      const snap = readJson<HostSnapshot>(sessionStorage, HOST_SNAPSHOT_KEY);
      teardown(false);
      r.role = 'host';
      r.roomId = code;
      const now = Date.now();
      const canRestore = Boolean(saved?.isHost && saved.roomId === code && snap?.state?.room?.roomId === code);
      let engine: EngineState;
      try {
        engine = canRestore && snap
          ? restore(snap, now)
          : createEngineRoom(
              { roomId: code, isPublic: input.isPublic, settings: input.settings, hostProfile: profileClaim(userRef.current), hostTabId: TAB_ID },
              now,
            );
      } catch {
        engine = createEngineRoom(
          { roomId: code, isPublic: input.isPublic, settings: input.settings, hostProfile: profileClaim(userRef.current), hostTabId: TAB_ID },
          now,
        );
      }
      r.engine = engine;
      r.memberId = engine.host.hostMemberId;
      r.idRetryUntil = canRestore ? now + ID_RETRY_WINDOW_MS : 0;
      writeJson(sessionStorage, SESSION_KEY, { roomId: code, isHost: true, memberId: r.memberId });
      setUrlRoom(code);
      setRoomId(code);
      setIsHost(true);
      setMemberId(r.memberId);
      setError(null);
      setClosedReason(null);
      setHostLostSince(null);
      setChatMessages(canRestore ? [...engine.host.chatBacklog] : []);
      setStatus('opening');
      publishHost(now, true);
      openHostPeer(code);
      return code;
    };

    const joinRoom = (input: string): string | null => {
      const code = parseRoomCode(input);
      if (!code) {
        setError('That does not look like a room code. Enter the code your friend sent, or paste their invite link.');
        return null;
      }
      const saved = readJson<SavedSession>(sessionStorage, SESSION_KEY);
      const resume =
        saved && !saved.isHost && saved.roomId === code && saved.memberId && saved.token
          ? { memberId: saved.memberId, token: saved.token }
          : readToken(code);
      teardown(false);
      r.role = 'member';
      r.roomId = code;
      r.memberId = resume?.memberId ?? null;
      r.token = resume?.token ?? null;
      r.connectAttempts = 0;
      setUrlRoom(code);
      setRoomId(code);
      setIsHost(false);
      setMemberId(null);
      setState(null);
      setChatMessages([]);
      setError(null);
      setClosedReason(null);
      setHostLostSince(null);
      setStatus('joining');

      const peer = new Peer({ debug: 1 });
      r.peer = peer;
      peer.on('open', () => {
        if (r.peer === peer) connectToHost();
      });
      peer.on('disconnected', () => reconnectPeer(peer));
      peer.on('error', (err) => {
        if (r.peer !== peer || r.terminal) return;
        const type = (err as { type?: string }).type;
        if (type === 'peer-unavailable') {
          // With a token this is a refresh on one side or the other, and the
          // host may be on its way back: keep trying for the grace period.
          if (r.welcomed || r.token) {
            startHostLost();
            return;
          }
          finish('not_found', `Room ${code} is not open. Check the code with your friend, or ask them to create the room again.`);
          return;
        }
        if (!r.welcomed && r.hostLostSince === null) finish(null, `Could not join room ${code}. ${err.message}`);
      });
      startLoop(memberLoop, 1000);
      return code;
    };

    const leaveRoom = () => {
      if (r.role === 'host' && r.engine) {
        const room = r.engine.room;
        const closed = wire({ type: 'ROOM_CLOSED', payload: { reason: 'host_left', hostName: room.members[0].profile.name } });
        for (const conn of r.conns.values()) {
          send(conn, closed);
          closeConn(conn);
        }
        roomDiscoveryManager.stopHostingRoom(room.roomId);
        removeKey(sessionStorage, HOST_SNAPSHOT_KEY);
      } else if (r.role === 'member') {
        if (r.welcomed && r.hostConn?.open) {
          send(r.hostConn, { v: PROTOCOL_VERSION, type: 'LEAVE_ROOM', payload: {} });
          closeConn(r.hostConn);
        }
        if (r.welcomed && r.roomId) {
          writeLastRoom({ roomId: r.roomId, hostName: r.mirror?.members[0]?.profile.name ?? '', leftAt: Date.now(), reason: 'left' });
        }
        forgetToken(r.roomId);
      }
      teardown(true);
    };

    /** Clears a closed or failed room from the screen. */
    const reset = () => {
      teardown(true);
      setError(null);
      setClosedReason(null);
    };

    /**
     * Picks up the room in the URL after a load: the host reopens it from its
     * snapshot, anyone else rejoins it. Keys from the previous version are
     * cleared on the way, and a host of an old-version room reopens it fresh.
     */
    const resumeFromUrl = (settings: RoomSettings): boolean => {
      let code: string | null = null;
      try {
        code = parseRoomCode(new URLSearchParams(window.location.search).get('room') ?? '');
      } catch {
        code = null;
      }
      let oldHost = false;
      const old = readJson<{ roomId?: string; isHost?: boolean }>(sessionStorage, 'caro_active_session');
      if (old?.isHost && old.roomId === code) oldHost = true;
      removeKey(sessionStorage, 'caro_active_session');
      removeKey(sessionStorage, 'caro_game_snapshot');
      if (!code) return false;
      const saved = readJson<SavedSession>(sessionStorage, SESSION_KEY);
      if ((saved?.isHost && saved.roomId === code) || oldHost) createRoom({ code, isPublic: true, settings });
      else joinRoom(code);
      return true;
    };

    // --------------------------------------------------------------- actions

    const gameId = () => r.mirror?.game?.id ?? null;

    const actions = {
      takeSeat: (seat: Seat) => sendIntent({ type: 'TAKE_SEAT', payload: { seat } }),
      becomeViewer: () => sendIntent({ type: 'LEAVE_SEAT', payload: {} }),
      clearSeat: (seat: Seat) => sendIntent({ type: 'CLEAR_SEAT', payload: { seat } }),
      move: (row: number, col: number, corner?: MoveCorner) => {
        const room = r.mirror;
        const game = room?.game;
        if (!room || !game || room.phase !== 'playing' || seatOf(room, r.memberId) !== game.turn) return false;
        const n = game.moves.length;
        noteRequestedMove(game.id, n, row, col);
        setPendingMove([row, col]);
        const sent = sendIntent({ type: 'MOVE', payload: { gameId: game.id, n, row, col, corner } });
        if (!sent) setPendingMove(null);
        return sent;
      },
      requestUndo: () => {
        const id = gameId();
        return id ? sendIntent({ type: 'UNDO_REQUEST', payload: { gameId: id } }) : false;
      },
      answerUndo: (accept: boolean) => {
        const id = gameId();
        return id ? sendIntent({ type: 'UNDO_ANSWER', payload: { gameId: id, accept } }) : false;
      },
      offerRematch: () => {
        const id = gameId();
        return id ? sendIntent({ type: 'REMATCH_OFFER', payload: { gameId: id } }) : false;
      },
      answerRematch: (accept: boolean) => {
        const id = gameId();
        return id ? sendIntent({ type: 'REMATCH_ANSWER', payload: { gameId: id, accept } }) : false;
      },
      resign: () => {
        const id = gameId();
        if (!id) return false;
        noteResigned(id);
        return sendIntent({ type: 'RESIGN', payload: { gameId: id } });
      },
      discardGame: () => {
        const id = gameId();
        return id ? sendIntent({ type: 'DISCARD_GAME', payload: { gameId: id } }) : false;
      },
      updateSettings: (settings: RoomSettings) => sendIntent({ type: 'UPDATE_SETTINGS', payload: { settings } }),
      chooseFirstMove: (choice: 'rock' | 'paper' | 'scissors') => {
        const id = gameId();
        return id ? sendIntent({ type: 'FIRST_MOVE_CHOICE', payload: { gameId: id, choice } }) : false;
      },
      callCoin: (call: 'X' | 'O') => {
        const id = gameId();
        return id ? sendIntent({ type: 'COIN_CALL', payload: { gameId: id, call } }) : false;
      },
      buzz: () => sendIntent({ type: 'BUZZ', payload: {} }),
      tease: (targetMemberId: string) => sendIntent({ type: 'TEASE', payload: { targetMemberId } }),
      sendChat: async (text: string, image?: string) => {
        const trimmed = text.trim();
        if (!trimmed && !image) return;
        if (Array.from(trimmed).length > CHAT_TEXT_MAX) {
          notice(`That message is too long. Keep it under ${CHAT_TEXT_MAX} characters.`);
          return;
        }
        let picture: string | undefined;
        if (image) {
          picture = (await shrinkImage(image, CHAT_IMAGE_MAX)) ?? undefined;
          if (!picture) {
            notice('That image is too large to send. Try a smaller screenshot.');
            return;
          }
        }
        const id = cryptoEnv.randomId(10);
        const me = r.mirror?.members.find((m) => m.id === r.memberId);
        const echo: ChatMessage = {
          id,
          senderId: r.memberId ?? undefined,
          sender: me?.profile.name ?? 'You',
          senderAvatar: me?.profile.avatar ?? null,
          text: trimmed,
          ...(picture ? { image: picture } : {}),
          timestamp: Date.now(),
        };
        // The echo goes in first: on the host a refusal comes back before
        // sendIntent returns, and it has to find the echo to take it out.
        r.lastChatEcho = id;
        appendChat(echo);
        const sent = sendIntent({ type: 'CHAT', payload: { id, text: trimmed, ...(picture ? { image: picture } : {}) } });
        if (!sent) {
          setChatMessages((prev) => prev.filter((m) => m.id !== id));
          notice('Not connected to the room right now.');
        }
      },
    };

    const dispose = () => {
      if (r.role) teardown(false);
    };

    const onPageHide = () => {
      if (r.role === 'host') saveSnapshot(Date.now());
    };

    return {
      r,
      actions,
      createRoom,
      joinRoom,
      leaveRoom,
      reset,
      resumeFromUrl,
      processResults,
      requestTickets,
      dispose,
      onPageHide,
    };
  }, []);

  useEffect(() => {
    window.addEventListener('pagehide', core.onPageHide);
    return () => {
      window.removeEventListener('pagehide', core.onPageHide);
      core.dispose();
    };
  }, [core]);

  // Results and seat tickets follow the mirror and the signed-in account.
  useEffect(() => {
    core.processResults();
    core.requestTickets();
  }, [core, state, user]);

  // A few frames a second while anything on screen counts down.
  const needsFrames =
    status === 'host_lost' ||
    (state !== null &&
      (state.phase === 'countdown' || state.phase === 'playing' || state.members.some((m) => !m.connected)));
  useEffect(() => {
    if (!needsFrames) return;
    const timer = setInterval(() => setFrame((f) => (f + 1) % 1_000_000), TICK_MS);
    return () => clearInterval(timer);
  }, [needsFrames]);

  const mySeat = state && memberId ? seatOf(state, memberId) : null;

  /** The clocks as they stand now: extrapolated while running and reachable, frozen otherwise. */
  const clocksNow = useCallback((): Clocks | null => {
    const room = core.r.mirror;
    const game = room?.game;
    if (!room || !game) return null;
    const live = room.phase === 'playing' && core.r.hostLostSince === null;
    return live ? liveClocks(game, performance.now() - core.r.receivedAt) : game.clocks;
  }, [core]);

  const msSinceState = () => performance.now() - core.r.receivedAt;

  const countdownSecondsLeft =
    state?.countdown ? Math.max(0, Math.ceil((state.countdown.msLeft - msSinceState()) / 1000)) : null;

  const graceSecondsLeft = useCallback(
    (id: string): number | null => {
      const member = core.r.mirror?.members.find((m) => m.id === id);
      if (!member || member.connected || member.graceMsLeft === null) return null;
      return Math.max(0, Math.ceil((member.graceMsLeft - (performance.now() - core.r.receivedAt)) / 1000));
    },
    [core],
  );

  /** The host's clock now, as best this tab can tell: for deadlines the host stamped. */
  const hostNow = useCallback((): number => {
    const room = core.r.mirror;
    return room ? room.sentAt + (performance.now() - core.r.receivedAt) : Date.now();
  }, [core]);

  const hostGraceSecondsLeft =
    hostLostSince !== null ? Math.max(0, Math.ceil((HOST_LOST_GIVE_UP_MS - (Date.now() - hostLostSince)) / 1000)) : null;

  const dismissTease = useCallback(() => setTease(null), []);
  const dismissSeatOpened = useCallback(() => setSeatOpened(null), []);
  const clearError = useCallback(() => setError(null), []);

  // The browser tests drive rooms through this handle. It never ships.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const w = window as unknown as { __caro?: Record<string, unknown> };
    w.__caro = {
      ...w.__caro,
      get: () => ({
        status,
        closedReason,
        memberId: core.r.memberId,
        mySeat: core.r.mirror ? seatOf(core.r.mirror, core.r.memberId) : null,
        state: core.r.mirror,
        chatMessages,
        connectAttempts: core.r.connectAttempts,
        lastRejected: core.r.lastRejected,
        ratingNotes,
      }),
      act: {
        ...core.actions,
        createRoom: core.createRoom,
        joinRoom: core.joinRoom,
        leaveRoom: core.leaveRoom,
      },
    };
  });

  return {
    status,
    roomId,
    isHost,
    memberId,
    mySeat,
    state,
    chatMessages,
    error,
    closedReason,
    pendingMove,
    hostGraceSecondsLeft,
    hostNow,
    countdownSecondsLeft,
    teaseNotice: tease,
    seatOpened,
    ratingNotes,
    clocksNow,
    graceSecondsLeft,
    dismissTease,
    dismissSeatOpened,
    clearError,
    createRoom: core.createRoom,
    joinRoom: core.joinRoom,
    leaveRoom: core.leaveRoom,
    reset: core.reset,
    resumeFromUrl: core.resumeFromUrl,
    ...core.actions,
  };
};

export type RoomApi = ReturnType<typeof useRoom>;
