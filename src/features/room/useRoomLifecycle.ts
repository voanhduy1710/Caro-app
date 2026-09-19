import Peer from 'peerjs';
import type { DataConnection } from 'peerjs';
import { roomDiscoveryManager } from '../webrtc/roomDiscoveryService';
import type { UserProfile } from '../auth/AuthContext';
import type { RoomSettings } from '../settings/types';
import { createRoom as createEngineRoom, restore } from './roomEngine';
import type { EngineState, HostSnapshot, RoomState } from './roomEngine';
import { PROTOCOL_VERSION, parseRoomCode } from './protocol';
import type { ClosedReason, CreateRoomInput } from './useRoomTypes';
import { closeConn, forgetToken, profileClaim, randomCode, readJson, readToken, removeKey, send, setUrlRoom, TAB_ID, writeJson, writeLastRoom } from './useRoomUtilities';
import type { SavedSession } from './useRoomUtilities';

export interface RoomLifecycleState {
  role: 'host' | 'member' | null; peer: Peer | null; roomId: string | null; engine: EngineState | null;
  conns: Map<string, DataConnection>; connMember: Map<DataConnection, string>; pending: Map<DataConnection, number>;
  hostConn: DataConnection | null; memberId: string | null; token: string | null; welcomed: boolean; terminal: boolean;
  mirror: RoomState | null; hostLostSince: number | null; peerAttempt: number; retryTimer: ReturnType<typeof setTimeout> | null;
  loop: ReturnType<typeof setInterval> | null; idRetryUntil: number; connectAttempts: number;
}

interface Options {
  state: RoomLifecycleState; userRef: { current: UserProfile | null }; sessionKey: string; snapshotKey: string;
  peerPrefix: string; idRetryMs: number; idRetryWindowMs: number; peerReconnectDelaysMs: readonly number[];
  hostLoop: () => void; memberLoop: () => void; connectToHost: () => void; startHostLost: () => void;
  acceptConnection: (connection: DataConnection) => void; announce: () => void; publishHost: (now: number, force?: boolean) => void; saveSnapshot: (now: number) => void;
  setStatus: (value: any) => void; setRoomId: (value: string | null) => void; setIsHost: (value: boolean) => void; setMemberId: (value: string | null) => void;
  setState: (value: RoomState | null) => void; setChatMessages: (value: any) => void; setError: (value: string | null) => void; setClosedReason: (value: ClosedReason | null) => void;
  setHostLostSince: (value: number | null) => void; setPendingMove: (value: [number, number] | null) => void; setTease: (value: null) => void; setSeatOpened: (value: null) => void;
}

export const createRoomLifecycle = (options: Options) => {
  const { state, userRef, sessionKey, snapshotKey, peerPrefix, idRetryMs, idRetryWindowMs, peerReconnectDelaysMs } = options;
  const stopTimers = () => { if (state.loop) clearInterval(state.loop); state.loop = null; if (state.retryTimer) clearTimeout(state.retryTimer); state.retryTimer = null; };
  const dropPeer = () => { const peer = state.peer; state.peer = null; if (peer) setTimeout(() => peer.destroy(), 300); };
  const startLoop = (fn: () => void, ms: number) => { if (state.loop) clearInterval(state.loop); state.loop = setInterval(fn, ms); };
  const teardown = (clearUi: boolean) => {
    stopTimers(); dropPeer(); state.conns.clear(); state.connMember.clear(); state.pending.clear(); state.hostConn = null; state.engine = null; state.role = null; state.roomId = null; state.memberId = null; state.token = null; state.welcomed = false; state.terminal = false; state.hostLostSince = null; state.mirror = null; state.peerAttempt = 0;
    removeKey(sessionStorage, sessionKey);
    if (!clearUi) return;
    setUrlRoom(null); options.setStatus('idle'); options.setRoomId(null); options.setIsHost(false); options.setMemberId(null); options.setState(null); options.setChatMessages([]); options.setPendingMove(null); options.setHostLostSince(null); options.setTease(null); options.setSeatOpened(null);
  };
  const finish = (reason: ClosedReason | null, message: string) => {
    const wasHost = state.role === 'host'; const code = state.roomId; state.terminal = true; stopTimers(); dropPeer(); state.hostConn = null; removeKey(sessionStorage, sessionKey); if (wasHost) removeKey(sessionStorage, snapshotKey); forgetToken(code); setUrlRoom(null);
    options.setStatus(reason ? 'closed' : 'error'); options.setClosedReason(reason); options.setError(message); options.setHostLostSince(null); options.setPendingMove(null);
  };
  const reconnectPeer = (peer: Peer) => {
    if (state.peer !== peer || peer.destroyed || state.terminal) return;
    const delay = peerReconnectDelaysMs[Math.min(state.peerAttempt, peerReconnectDelaysMs.length - 1)]; state.peerAttempt += 1;
    setTimeout(() => { if (state.peer === peer && peer.disconnected && !peer.destroyed) try { peer.reconnect(); } catch { /* next event retries */ } }, delay);
  };
  const openHostPeer = (code: string) => {
    const peer = new Peer(peerPrefix + code, { debug: 1 }); state.peer = peer;
    peer.on('open', () => { if (state.peer !== peer) return; state.peerAttempt = 0; options.setStatus('connected'); startLoop(options.hostLoop, 250); options.announce(); });
    peer.on('connection', (connection) => { if (state.peer === peer) options.acceptConnection(connection); });
    peer.on('disconnected', () => reconnectPeer(peer));
    peer.on('error', (error) => {
      if (state.peer !== peer) return;
      const type = (error as { type?: string }).type;
      if (type === 'unavailable-id') {
        if (Date.now() < state.idRetryUntil) { state.peer = null; peer.destroy(); state.retryTimer = setTimeout(() => { if (state.role === 'host' && state.roomId === code && !state.terminal) openHostPeer(code); }, idRetryMs); return; }
        finish('id_taken', 'This room is already open in another tab.'); return;
      }
      if (!peer.open) finish(null, `Could not open the room. ${error.message}`);
    });
  };
  const createRoom = (input: CreateRoomInput) => {
    const code = (input.code && parseRoomCode(input.code)) || randomCode(); const saved = readJson<SavedSession>(sessionStorage, sessionKey); const stored = readJson<HostSnapshot>(sessionStorage, snapshotKey); teardown(false);
    state.role = 'host'; state.roomId = code; const now = Date.now(); const canRestore = Boolean(saved?.isHost && saved.roomId === code && stored?.state?.room?.roomId === code);
    let engine: EngineState;
    try { engine = canRestore && stored ? restore(stored, now) : createEngineRoom({ roomId: code, isPublic: input.isPublic, settings: input.settings, hostProfile: profileClaim(userRef.current), hostTabId: TAB_ID }, now); }
    catch { engine = createEngineRoom({ roomId: code, isPublic: input.isPublic, settings: input.settings, hostProfile: profileClaim(userRef.current), hostTabId: TAB_ID }, now); }
    state.engine = engine; state.memberId = engine.host.hostMemberId; state.idRetryUntil = canRestore ? now + idRetryWindowMs : 0; writeJson(sessionStorage, sessionKey, { roomId: code, isHost: true, memberId: state.memberId });
    setUrlRoom(code); options.setRoomId(code); options.setIsHost(true); options.setMemberId(state.memberId); options.setError(null); options.setClosedReason(null); options.setHostLostSince(null); options.setChatMessages(canRestore ? [...engine.host.chatBacklog] : []); options.setStatus('opening'); options.publishHost(now, true); openHostPeer(code); return code;
  };
  const joinRoom = (input: string): string | null => {
    const code = parseRoomCode(input); if (!code) { options.setError('That does not look like a room code. Enter the code your friend sent, or paste their invite link.'); return null; }
    const saved = readJson<SavedSession>(sessionStorage, sessionKey); const resume = saved && !saved.isHost && saved.roomId === code && saved.memberId && saved.token ? { memberId: saved.memberId, token: saved.token } : readToken(code);
    teardown(false); state.role = 'member'; state.roomId = code; state.memberId = resume?.memberId ?? null; state.token = resume?.token ?? null; state.connectAttempts = 0;
    setUrlRoom(code); options.setRoomId(code); options.setIsHost(false); options.setMemberId(null); options.setState(null); options.setChatMessages([]); options.setError(null); options.setClosedReason(null); options.setHostLostSince(null); options.setStatus('joining');
    const peer = new Peer({ debug: 1 }); state.peer = peer; peer.on('open', () => { if (state.peer === peer) options.connectToHost(); }); peer.on('disconnected', () => reconnectPeer(peer));
    peer.on('error', (error) => { if (state.peer !== peer || state.terminal) return; const type = (error as { type?: string }).type; if (type === 'peer-unavailable') { if (state.welcomed || state.token) { options.startHostLost(); return; } finish('not_found', `Room ${code} is not open. Check the code with your friend, or ask them to create the room again.`); return; } if (!state.welcomed && state.hostLostSince === null) finish(null, `Could not join room ${code}. ${error.message}`); });
    startLoop(options.memberLoop, 1000); return code;
  };
  const leaveRoom = () => {
    if (state.role === 'host' && state.engine) { const room = state.engine.room; const closed = { v: PROTOCOL_VERSION, type: 'ROOM_CLOSED' as const, payload: { reason: 'host_left' as const, hostName: room.members[0].profile.name } }; for (const connection of state.conns.values()) { send(connection, closed); closeConn(connection); } roomDiscoveryManager.stopHostingRoom(room.roomId); removeKey(sessionStorage, snapshotKey); }
    else if (state.role === 'member') { if (state.welcomed && state.hostConn?.open) { send(state.hostConn, { v: PROTOCOL_VERSION, type: 'LEAVE_ROOM', payload: {} }); closeConn(state.hostConn); } if (state.welcomed && state.roomId) writeLastRoom({ roomId: state.roomId, hostName: state.mirror?.members[0]?.profile.name ?? '', leftAt: Date.now(), reason: 'left' }); forgetToken(state.roomId); }
    teardown(true);
  };
  const reset = () => { teardown(true); options.setError(null); options.setClosedReason(null); };
  const resumeFromUrl = (settings: RoomSettings): boolean => {
    let code: string | null = null; try { code = parseRoomCode(new URLSearchParams(window.location.search).get('room') ?? ''); } catch { /* no URL */ }
    const old = readJson<{ roomId?: string; isHost?: boolean }>(sessionStorage, 'caro_active_session'); const oldHost = old?.isHost && old.roomId === code; removeKey(sessionStorage, 'caro_active_session'); removeKey(sessionStorage, 'caro_game_snapshot');
    if (!code) return false; const saved = readJson<SavedSession>(sessionStorage, sessionKey); if ((saved?.isHost && saved.roomId === code) || oldHost) createRoom({ code, isPublic: true, settings }); else joinRoom(code); return true;
  };
  return { teardown, finish, createRoom, joinRoom, leaveRoom, reset, resumeFromUrl, dispose: () => { if (state.role) teardown(false); }, onPageHide: () => { if (state.role === 'host') options.saveSnapshot(Date.now()); } };
};
