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
import type { UserProfile } from '../auth/AuthContext';
import type { ChatMessage } from '../webrtc/types';
import type { DataConnection } from 'peerjs';
import { PROTOCOL_VERSION, TEASE_PHRASE } from './protocol';
import type {
  HostMessage,
  HostMessagePayloads,
  Intent,
  IntentPayloads,
  RoomChatMessage,
} from './protocol';
import {
  applyIntent,
  cryptoEnv,
  DOUBLE_DOWN_ANSWER_MOVES,
  DOUBLE_DOWN_BONUS,
  liveClocks,
  pieceAt,
  seatOf,
  snapshot,
} from './roomEngine';
import type { Clocks, EngineState, Game, RoomState } from './roomEngine';
import { createRoomActions } from './useRoomActions';
import { createRoomHost } from './useRoomHost';
import { createRoomLifecycle } from './useRoomLifecycle';
import { createRoomRatings } from './useRoomRatings';
import { useRoomTiming } from './useRoomTiming';
import {
  TAB_ID,
  CHAT_KEEP,
  HANDLED_RESULTS_KEY,
  clearLastRoom,
  closeConn,
  isRoomState,
  isRecord,
  mergeChat,
  profileClaim,
  readHandled,
  rejectionText,
  rememberToken,
  send,
  writeHostBackup,
  writeJson,
} from './useRoomUtilities';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type { ClosedReason, CreateRoomInput, LastRoom, RoomHandlers, RoomStatus, SeatOpenedNotice, TeaseNotice } from './useRoomTypes';
import type { ClosedReason, RoomHandlers, RoomStatus, SeatOpenedNotice, TeaseNotice } from './useRoomTypes';
export { LAST_ROOM_TTL_MS, clearLastRoom, readLastRoom } from './useRoomUtilities';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PEER_PREFIX = 'caro_room_';
const SESSION_KEY = 'caro_room_v2';
const HOST_SNAPSHOT_KEY = 'caro_room_host_snapshot';

const TICK_MS = 250;
const CLOCK_SYNC_MS = 3_000;
const SNAPSHOT_EVERY_MS = 1_000;
/** A connection must say HELLO this soon after opening, or it is closed. */
const HELLO_TIMEOUT_MS = 5_000;
/** After a refresh the old peer id lingers on the signalling server for a while. */
const ID_RETRY_MS = 2_000;
const ID_RETRY_WINDOW_MS = 90_000;
/** The host pings every 2 s, so this much silence means it is gone. */
const HOST_SILENT_MS = 8_000;
const HOST_RETRY_MS = 2_000;
const HOST_LOST_GIVE_UP_MS = 5 * 60 * 60_000;
const PEER_RECONNECT_DELAYS_MS = [1_000, 2_000, 4_000, 8_000];
/** A first join that has not been welcomed retries this often, then gives up. */
const JOIN_RETRY_MS = 8_000;
const JOIN_GIVE_UP_MS = 30_000;
/** A fresh join to a room that is not there keeps trying this long, in case its host is reloading. */
const JOIN_NOT_FOUND_GRACE_MS = 15_000;

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
      joinStartedAt: 0,
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

    /** Turns an answered double-down offer into a chat line everyone in the room sees. */
    const announceDoubleDown = (prev: RoomState | null, next: RoomState) => {
      const before = prev?.game?.doubleDown;
      const after = next.game?.doubleDown;
      if (!prev || !before?.pending || !after || after.pending || prev.game?.id !== next.game?.id) return;
      // An offer dropped because someone stood up was never answered.
      if (prev.seats.X !== next.seats.X || prev.seats.O !== next.seats.O) return;
      const answerer = next.members.find((m) => m.id === next.seats[before.pending === 'X' ? 'O' : 'X']);
      const name = answerer?.profile.name ?? 'The opponent';
      if (after.accepted) systemLine(`${name} accepted the Double down. This game is worth ±${DOUBLE_DOWN_BONUS} extra points.`);
      else if (after.expired) systemLine(`The Double down offer was automatically rejected after ${DOUBLE_DOWN_ANSWER_MOVES} moves.`);
      else if (next.phase === 'playing' || next.phase === 'paused') systemLine(`${name} rejected the Double down.`);
    };

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
      announceDoubleDown(prev, next);
      if (next.game) {
        r.games.set(next.game.id, next.game);
        if (r.games.size > 4) r.games.delete(r.games.keys().next().value as string);
      }
      r.mirror = next;
      r.receivedAt = performance.now();
      setState(next);
    };

    let receive: (message: HostMessage) => void = () => {};
    const host = createRoomHost({
      state: r,
      setMirror,
      receive: (message) => receive(message),
      writeSnapshot: (engine, now) => {
        const snap = snapshot(engine, now);
        writeJson(sessionStorage, HOST_SNAPSHOT_KEY, snap);
        writeHostBackup(engine.room.roomId, snap);
      },
      helloTimeoutMs: HELLO_TIMEOUT_MS,
      clockSyncMs: CLOCK_SYNC_MS,
      snapshotEveryMs: SNAPSHOT_EVERY_MS,
    });
    const hostApply = host.apply;
    const hostLoop = host.loop;
    const publishHost = host.publish;
    const saveSnapshot = host.saveSnapshot;
    const acceptConnection = host.acceptConnection;
    const announce = host.announce;

    let finish: (reason: ClosedReason | null, message: string) => void = () => {};
    let usableMemberPeer: () => Peer | null = () => null;

    // ---------------------------------------------------------------- member

    const memberLoop = () => {
      if (r.role !== 'member' || r.terminal) return;
      const now = Date.now();
      // A data channel that never opens fires no event at all (typical behind
      // a VPN such as Cloudflare WARP, or a strict NAT with no reachable TURN
      // relay), so the first join needs its own deadline.
      if (!r.welcomed && r.hostLostSince === null && r.connectAttempts > 0) {
        if (now - r.joinStartedAt > JOIN_GIVE_UP_MS) {
          finish(
            null,
            `Could not reach the host of room ${r.roomId}. A VPN (such as Cloudflare 1.1.1.1 / WARP) or a strict network can block direct game connections. Turn the VPN off on both devices, or try another network, then join again.`,
          );
          return;
        }
        if (now - r.lastRetryAt >= JOIN_RETRY_MS) connectToHost();
        return;
      }
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
      if (r.terminal || !r.roomId) return;
      // A peer that lost the signalling server cannot dial; this gets it back,
      // and its 'open' event dials once it is.
      const peer = usableMemberPeer();
      if (!peer) return;
      const previous = r.hostConn;
      r.hostConn = null;
      if (previous) {
        try {
          previous.close();
        } catch {
          // A half-open attempt may already be gone.
        }
      }
      if (r.connectAttempts === 0) r.joinStartedAt = Date.now();
      r.connectAttempts += 1;
      r.lastRetryAt = Date.now();
      let conn: DataConnection | undefined;
      try {
        conn = peer.connect(PEER_PREFIX + r.roomId, { reliable: true, metadata: { caro: PROTOCOL_VERSION } });
      } catch {
        conn = undefined;
      }
      // PeerJS returns nothing when the peer dropped off the server in between;
      // the loop dials again on its next turn.
      if (!conn) return;
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

    receive = (message: HostMessage) => {
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
          if (message.payload.reason === 'kicked') {
            finish('kicked', `${message.payload.hostName} removed you from room ${r.roomId}. You can join again with the invite link.`);
            return;
          }
          finish('host_left', `${message.payload.hostName} was hosting and left, so the game ended for everyone.`);
          return;
        case 'SUPERSEDED':
          finish('superseded', 'This room is open in another tab.');
          return;
      }
    };

    const ratings = createRoomRatings({
      state: r,
      userRef,
      handlersRef,
      sendIntent,
      setRatingNotes,
      writeHandled: (handled) => writeJson(sessionStorage, HANDLED_RESULTS_KEY, handled),
    });

    const lifecycle = createRoomLifecycle({
      state: r,
      userRef,
      sessionKey: SESSION_KEY,
      snapshotKey: HOST_SNAPSHOT_KEY,
      peerPrefix: PEER_PREFIX,
      idRetryMs: ID_RETRY_MS,
      idRetryWindowMs: ID_RETRY_WINDOW_MS,
      peerReconnectDelaysMs: PEER_RECONNECT_DELAYS_MS,
      joinNotFoundGraceMs: JOIN_NOT_FOUND_GRACE_MS,
      joinRetryMs: JOIN_RETRY_MS,
      hostLoop,
      memberLoop,
      connectToHost,
      startHostLost,
      acceptConnection,
      announce,
      publishHost,
      saveSnapshot,
      setStatus,
      setRoomId,
      setIsHost,
      setMemberId,
      setState,
      setChatMessages,
      setError,
      setClosedReason,
      setHostLostSince,
      setPendingMove,
      setTease,
      setSeatOpened,
    });
    finish = lifecycle.finish;
    usableMemberPeer = lifecycle.usableMemberPeer;

    const actions = createRoomActions({
      state: r,
      sendIntent,
      appendChat,
      notice,
      setPendingMove,
      setChatMessages,
    });

    return {
      r,
      actions,
       createRoom: lifecycle.createRoom,
       joinRoom: lifecycle.joinRoom,
       leaveRoom: lifecycle.leaveRoom,
       reset: lifecycle.reset,
       resumeFromUrl: lifecycle.resumeFromUrl,
       processResults: ratings.processResults,
       requestTickets: ratings.requestTickets,
       dispose: lifecycle.dispose,
       onPageHide: lifecycle.onPageHide,
       nudge: lifecycle.nudge,
    };
  }, []);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') core.nudge();
    };
    window.addEventListener('pagehide', core.onPageHide);
    window.addEventListener('online', core.nudge);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('pagehide', core.onPageHide);
      window.removeEventListener('online', core.nudge);
      document.removeEventListener('visibilitychange', onVisible);
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

  const {
    clocksNow,
    countdownSecondsLeft,
    graceSecondsLeft,
    hostNow,
    hostGraceSecondsLeft,
  } = useRoomTiming(core.r, state, hostLostSince, HOST_LOST_GIVE_UP_MS);

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
