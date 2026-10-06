import Peer from 'peerjs';
import type { DataConnection } from 'peerjs';
import { roomDiscoveryManager } from '../webrtc/roomDiscoveryService';
import type { UserProfile } from '../auth/AuthContext';
import type { RoomSettings } from '../settings/types';
import { createRoom as createEngineRoom, restore } from './roomEngine';
import type { EngineState, HostSnapshot, RoomState } from './roomEngine';
import { PROTOCOL_VERSION, parseRoomCode } from './protocol';
import type { ClosedReason, CreateRoomInput } from './useRoomTypes';
import { beatHostAlive, closeConn, endHostAlive, HOST_ALIVE_STALE_WAIT_MS, forgetHostBackup, forgetToken, hostLiveElsewhere, loadIceServers, peerOptions, profileClaim, randomCode, readHostBackup, readJson, readToken, removeKey, send, setUrlRoom, TAB_ID, writeJson, writeLastRoom } from './useRoomUtilities';
import type { SavedSession } from './useRoomUtilities';

export interface RoomLifecycleState {
  role: 'host' | 'member' | null; peer: Peer | null; roomId: string | null; engine: EngineState | null;
  conns: Map<string, DataConnection>; connMember: Map<DataConnection, string>; pending: Map<DataConnection, number>;
  hostConn: DataConnection | null; memberId: string | null; token: string | null; welcomed: boolean; terminal: boolean;
  mirror: RoomState | null; hostLostSince: number | null; peerAttempt: number; retryTimer: ReturnType<typeof setTimeout> | null;
  loop: ReturnType<typeof setInterval> | null; idRetryUntil: number; connectAttempts: number; joinStartedAt: number; lastRetryAt: number;
}

interface Options {
  state: RoomLifecycleState; userRef: { current: UserProfile | null }; sessionKey: string; snapshotKey: string;
  peerPrefix: string; idRetryMs: number; idRetryWindowMs: number; peerReconnectDelaysMs: readonly number[];
  /** How long a fresh join keeps knocking on a room that is not there yet, e.g. while its host reloads. */
  joinNotFoundGraceMs: number; joinRetryMs: number;
  hostLoop: () => void; memberLoop: () => void; connectToHost: () => void; startHostLost: () => void;
  acceptConnection: (connection: DataConnection) => void; announce: () => void; publishHost: (now: number, force?: boolean) => void; saveSnapshot: (now: number) => void;
  setStatus: (value: any) => void; setRoomId: (value: string | null) => void; setIsHost: (value: boolean) => void; setMemberId: (value: string | null) => void;
  setState: (value: RoomState | null) => void; setChatMessages: (value: any) => void; setError: (value: string | null) => void; setClosedReason: (value: ClosedReason | null) => void;
  setHostLostSince: (value: number | null) => void; setPendingMove: (value: [number, number] | null) => void; setTease: (value: null) => void; setSeatOpened: (value: null) => void;
}

/** Errors that mean the signalling server or the network blinked, not that the room is gone. */
const TRANSIENT_ERRORS = new Set(['network', 'server-error', 'socket-error', 'socket-closed', 'disconnected', 'webrtc']);
const HOST_ALIVE_EVERY_MS = 1_000;

export const createRoomLifecycle = (options: Options) => {
  const { state, userRef, sessionKey, snapshotKey, peerPrefix, idRetryMs, idRetryWindowMs, peerReconnectDelaysMs } = options;
  /** Peers that reached the signalling server at least once; their later errors are recoverable. */
  const opened = new WeakSet<Peer>();
  /** Peers with a reconnect already scheduled, so a burst of errors schedules one. */
  const reconnecting = new WeakSet<Peer>();
  let lastBeatAt = 0;
  const stopTimers = () => { if (state.loop) clearInterval(state.loop); state.loop = null; if (state.retryTimer) clearTimeout(state.retryTimer); state.retryTimer = null; };
  const dropPeer = () => { const peer = state.peer; state.peer = null; if (peer) setTimeout(() => peer.destroy(), 300); };
  const startLoop = (fn: () => void, ms: number) => { if (state.loop) clearInterval(state.loop); state.loop = setInterval(fn, ms); };
  const backoff = () => peerReconnectDelaysMs[Math.min(state.peerAttempt, peerReconnectDelaysMs.length - 1)];
  const teardown = (clearUi: boolean) => {
    stopTimers(); dropPeer(); state.conns.clear(); state.connMember.clear(); state.pending.clear(); state.hostConn = null; state.engine = null; state.role = null; state.roomId = null; state.memberId = null; state.token = null; state.welcomed = false; state.terminal = false; state.hostLostSince = null; state.mirror = null; state.peerAttempt = 0;
    removeKey(sessionStorage, sessionKey);
    if (!clearUi) return;
    setUrlRoom(null); options.setStatus('idle'); options.setRoomId(null); options.setIsHost(false); options.setMemberId(null); options.setState(null); options.setChatMessages([]); options.setPendingMove(null); options.setHostLostSince(null); options.setTease(null); options.setSeatOpened(null);
  };
  const finish = (reason: ClosedReason | null, message: string) => {
    const wasHost = state.role === 'host'; const code = state.roomId; state.terminal = true; stopTimers(); dropPeer(); state.hostConn = null; removeKey(sessionStorage, sessionKey); // id_taken means another tab is hosting this room: its backup is not ours to delete.
    if (wasHost && reason !== 'id_taken') { removeKey(sessionStorage, snapshotKey); forgetHostBackup(code); } forgetToken(code); setUrlRoom(null);
    options.setStatus(reason ? 'closed' : 'error'); options.setClosedReason(reason); options.setError(message); options.setHostLostSince(null); options.setPendingMove(null);
  };
  const stopAfterLocalClaim = () => {
    state.terminal = true;
    stopTimers();
    if (state.hostConn) closeConn(state.hostConn);
    state.hostConn = null;
    dropPeer();
    removeKey(sessionStorage, sessionKey);
    forgetToken(state.roomId);
    setUrlRoom(null);
  };

  /**
   * Gets a peer that lost the signalling server back onto it. The data
   * channels it already holds stay up meanwhile: a signalling blip must never
   * cost a game that is still flowing peer to peer.
   */
  const reconnectPeer = (peer: Peer) => {
    if (state.peer !== peer || peer.destroyed || state.terminal || reconnecting.has(peer)) return;
    reconnecting.add(peer);
    const delay = backoff(); state.peerAttempt += 1;
    setTimeout(() => {
      reconnecting.delete(peer);
      if (state.peer !== peer || peer.destroyed || state.terminal || !peer.disconnected) return;
      try { peer.reconnect(); } catch { reconnectPeer(peer); }
    }, delay);
  };

  /** A peer PeerJS destroyed for good is replaced by a fresh one, after the usual backoff. */
  const replacePeer = (peer: Peer, open: () => void) => {
    if (state.peer !== peer || state.terminal) return;
    state.peer = null;
    try { peer.destroy(); } catch { /* already gone */ }
    const delay = backoff(); state.peerAttempt += 1;
    if (state.retryTimer) clearTimeout(state.retryTimer);
    state.retryTimer = setTimeout(() => { state.retryTimer = null; if (!state.terminal && !state.peer) open(); }, delay);
  };

  // ----------------------------------------------------------------- host

  const hostTick = () => {
    options.hostLoop();
    const now = Date.now();
    if (state.roomId && state.peer && !state.peer.destroyed && now - lastBeatAt >= HOST_ALIVE_EVERY_MS) { lastBeatAt = now; beatHostAlive(state.roomId); }
  };

  const openHostPeer = (code: string) => {
    const reopen = () => { if (state.role === 'host' && state.roomId === code && !state.terminal) openHostPeer(code); };
    const peer = new Peer(peerPrefix + code, peerOptions()); state.peer = peer;
    peer.on('open', () => {
      if (state.peer !== peer) return;
      opened.add(peer); state.peerAttempt = 0; options.setStatus('connected');
      if (!state.loop) startLoop(hostTick, 250);
      options.announce();
    });
    peer.on('connection', (connection) => { if (state.peer === peer) options.acceptConnection(connection); });
    peer.on('disconnected', () => {
      // The old socket may linger on the server for up to a minute, during
      // which our own id reads as taken. Give the reconnect that long.
      state.idRetryUntil = Math.max(state.idRetryUntil, Date.now() + idRetryWindowMs);
      reconnectPeer(peer);
    });
    peer.on('error', (error) => {
      if (state.peer !== peer || state.terminal) return;
      const type = (error as { type?: string }).type ?? '';
      if (type === 'unavailable-id') {
        if (Date.now() < state.idRetryUntil) {
          // A peer that was open keeps its live data channels and retries in
          // place; one that never opened is replaced.
          if (opened.has(peer) && !peer.destroyed) { reconnectPeer(peer); return; }
          state.peer = null; peer.destroy();
          state.retryTimer = setTimeout(reopen, idRetryMs);
          return;
        }
        finish('id_taken', 'This room is already open in another tab.'); return;
      }
      if (peer.destroyed) { replacePeer(peer, reopen); return; }
      if (opened.has(peer) || TRANSIENT_ERRORS.has(type)) {
        if (peer.disconnected) reconnectPeer(peer);
        else if (!peer.open && !opened.has(peer)) replacePeer(peer, reopen);
        return;
      }
      finish(null, `Could not open the room. ${error.message}`);
    });
  };

  const createRoom = (input: CreateRoomInput) => {
    const code = (input.code && parseRoomCode(input.code)) || randomCode(); const saved = readJson<SavedSession>(sessionStorage, sessionKey); const session = readJson<HostSnapshot>(sessionStorage, snapshotKey); teardown(false);
    state.role = 'host'; state.roomId = code; const now = Date.now();
    const fromSession = saved?.isHost && saved.roomId === code && session?.state?.room?.roomId === code ? session : null;
    // A host that lost its tab still has the localStorage copy.
    const stored = fromSession ?? (input.code ? readHostBackup(code, userRef.current) : null);
    const fresh = () => createEngineRoom({ roomId: code, isPublic: input.isPublic, mode: input.mode, settings: input.settings, hostProfile: profileClaim(userRef.current), hostTabId: TAB_ID }, now);
    let engine: EngineState; let restored = false;
    try { engine = stored ? restore(stored, now) : fresh(); restored = Boolean(stored); } catch { engine = fresh(); }
    state.engine = engine; state.memberId = engine.host.hostMemberId; state.idRetryUntil = restored ? now + idRetryWindowMs : 0; writeJson(sessionStorage, sessionKey, { roomId: code, isHost: true, memberId: state.memberId });
    setUrlRoom(code); options.setRoomId(code); options.setIsHost(true); options.setMemberId(state.memberId); options.setError(null); options.setClosedReason(null); options.setHostLostSince(null); options.setChatMessages(restored ? [...engine.host.chatBacklog] : []); options.setStatus('opening'); options.publishHost(now, true);
    // A duplicated tab copies sessionStorage and would fight the live tab for the room id.
    if (input.code && hostLiveElsewhere(code)) { finish('id_taken', 'This room is already open in another tab.'); return code; }
    void loadIceServers().then(() => { if (state.role === 'host' && state.roomId === code && !state.terminal && !state.peer) openHostPeer(code); }); return code;
  };

  /** This browser hosted the room and no other tab is hosting it now: take it back instead of joining it. */
  const shouldResumeAsHost = (code: string): HostSnapshot | null => {
    if (hostLiveElsewhere(code)) return null;
    return readHostBackup(code, userRef.current);
  };

  // --------------------------------------------------------------- member

  const joinRoom = (input: string, recheck = false): string | null => {
    const code = parseRoomCode(input); if (!code) { options.setError('That does not look like a room code. Enter the code your friend sent, or paste their invite link.'); return null; }
    const backup = shouldResumeAsHost(code);
    if (backup) return createRoom({ code, isPublic: backup.state.room.isPublic, mode: backup.state.room.mode, settings: backup.state.room.settings });
    // This browser has the room, but a host beat is still fresh. It may be the
    // tab that was just closed without saying so: wait for the beat to go
    // stale and look again before settling for a guest seat.
    if (!recheck && readHostBackup(code, userRef.current) && hostLiveElsewhere(code)) {
      teardown(false); state.role = 'member'; state.roomId = code;
      setUrlRoom(code); options.setRoomId(code); options.setIsHost(false); options.setError(null); options.setClosedReason(null); options.setStatus('joining');
      state.retryTimer = setTimeout(() => { state.retryTimer = null; if (state.roomId === code && !state.terminal && !state.peer) joinRoom(code, true); }, HOST_ALIVE_STALE_WAIT_MS);
      return code;
    }
    const saved = readJson<SavedSession>(sessionStorage, sessionKey); const resume = saved && !saved.isHost && saved.roomId === code && saved.memberId && saved.token ? { memberId: saved.memberId, token: saved.token } : readToken(code);
    teardown(false); state.role = 'member'; state.roomId = code; state.memberId = resume?.memberId ?? null; state.token = resume?.token ?? null; state.connectAttempts = 0;
    setUrlRoom(code); options.setRoomId(code); options.setIsHost(false); options.setMemberId(null); options.setState(null); options.setChatMessages([]); options.setError(null); options.setClosedReason(null); options.setHostLostSince(null); options.setStatus('joining');
    void loadIceServers().then(() => { if (state.role === 'member' && state.roomId === code && !state.terminal && !state.peer) openMemberPeer(code); });
    startLoop(options.memberLoop, 1000); return code;
  };

  const openMemberPeer = (code: string) => {
    const reopen = () => { if (state.role === 'member' && state.roomId === code && !state.terminal) openMemberPeer(code); };
    const peer = new Peer(peerOptions()); state.peer = peer;
    peer.on('open', () => {
      if (state.peer !== peer) return;
      opened.add(peer); state.peerAttempt = 0;
      // Back on the signalling server. A data channel that kept working through
      // the blip is left alone; only a missing or lost one is redialled.
      if (!state.welcomed || state.hostLostSince !== null || !state.hostConn?.open) options.connectToHost();
    });
    peer.on('disconnected', () => reconnectPeer(peer));
    peer.on('error', (error) => {
      if (state.peer !== peer || state.terminal) return;
      const type = (error as { type?: string }).type ?? '';
      if (type === 'peer-unavailable') {
        if (state.welcomed || state.token) { options.startHostLost(); return; }
        // The host may be reloading: keep knocking for a little while first.
        if (Date.now() - state.joinStartedAt < options.joinNotFoundGraceMs) { state.lastRetryAt = Date.now() - options.joinRetryMs + 2_000; return; }
        finish('not_found', `Room ${code} is not open. Check the code with your friend, or ask them to create the room again.`); return;
      }
      if (peer.destroyed) { replacePeer(peer, reopen); return; }
      if (opened.has(peer) || TRANSIENT_ERRORS.has(type)) { if (peer.disconnected) reconnectPeer(peer); return; }
      if (!state.welcomed && state.hostLostSince === null) finish(null, type === 'negotiation-failed' ? `Could not connect to the host of room ${code}. A VPN (such as Cloudflare 1.1.1.1 / WARP) or a strict network can block game connections. Turn the VPN off on both devices, or try another network, then join again.` : `Could not join room ${code}. ${error.message}`);
    });
  };

  /**
   * Makes sure a member has a peer that can dial the host: a destroyed one is
   * replaced, a disconnected one is put back on the server. Returns the peer
   * when it can dial right now; otherwise its 'open' event dials later.
   */
  const usableMemberPeer = (): Peer | null => {
    const code = state.roomId;
    if (state.role !== 'member' || !code || state.terminal) return null;
    const peer = state.peer;
    if (!peer || peer.destroyed) { if (!state.retryTimer) { state.peer = null; openMemberPeer(code); } return null; }
    if (peer.disconnected) { reconnectPeer(peer); return null; }
    return peer.open ? peer : null;
  };

  // ------------------------------------------------------------ both sides

  /**
   * The network came back, or the page came back to the foreground (phones
   * freeze background tabs). Skip the backoff and reconnect now.
   */
  const nudge = () => {
    const peer = state.peer;
    if (!state.role || state.terminal) return;
    state.peerAttempt = 0;
    if (peer && !peer.destroyed && peer.disconnected) { try { peer.reconnect(); } catch { /* the next event retries */ } return; }
    if (state.role === 'member' && (state.hostLostSince !== null || !state.hostConn?.open)) options.connectToHost();
  };

  const leaveRoom = () => {
    if (state.role === 'host' && state.engine) { const room = state.engine.room; const closed = { v: PROTOCOL_VERSION, type: 'ROOM_CLOSED' as const, payload: { reason: 'host_left' as const, hostName: room.members[0].profile.name } }; for (const connection of state.conns.values()) { send(connection, closed); closeConn(connection); } roomDiscoveryManager.stopHostingRoom(room.roomId); removeKey(sessionStorage, snapshotKey); forgetHostBackup(room.roomId); }
    else if (state.role === 'member') { if (state.welcomed && state.hostConn?.open) { send(state.hostConn, { v: PROTOCOL_VERSION, type: 'LEAVE_ROOM', payload: {} }); closeConn(state.hostConn); } if (state.welcomed && state.roomId) writeLastRoom({ roomId: state.roomId, hostName: state.mirror?.members[0]?.profile.name ?? '', leftAt: Date.now(), reason: 'left' }); forgetToken(state.roomId); }
    teardown(true);
  };
  const reset = () => { teardown(true); options.setError(null); options.setClosedReason(null); };
  const resumeFromUrl = (settings: RoomSettings): boolean => {
    let code: string | null = null; try { code = parseRoomCode(new URLSearchParams(window.location.search).get('room') ?? ''); } catch { /* no URL */ }
    const old = readJson<{ roomId?: string; isHost?: boolean }>(sessionStorage, 'caro_active_session'); const oldHost = old?.isHost && old.roomId === code; removeKey(sessionStorage, 'caro_active_session'); removeKey(sessionStorage, 'caro_game_snapshot');
    if (!code) return false; const saved = readJson<SavedSession>(sessionStorage, sessionKey); if ((saved?.isHost && saved.roomId === code) || oldHost) createRoom({ code, isPublic: true, settings }); else joinRoom(code); return true;
  };
  return { teardown, finish, stopAfterLocalClaim, createRoom, joinRoom, leaveRoom, reset, resumeFromUrl, usableMemberPeer, nudge, dispose: () => { if (state.role) teardown(false); }, onPageHide: () => { if (state.role === 'host') { options.saveSnapshot(Date.now()); if (state.roomId) endHostAlive(state.roomId); } } };
};
