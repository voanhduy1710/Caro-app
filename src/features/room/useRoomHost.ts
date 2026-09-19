import type { DataConnection } from 'peerjs';
import { roomDiscoveryManager } from '../webrtc/roomDiscoveryService';
import type { HostedRoomInfo } from '../webrtc/roomDiscoveryService';
import { MAX_MEMBERS, PING_INTERVAL_MS, activeSeats, applyIntent, checkInvariants, clockSync, noteMalformed, onConnectionLost, tick, toWire } from './roomEngine';
import type { EngineResult, EngineState, RoomState } from './roomEngine';
import { PROTOCOL_VERSION, parseIntent } from './protocol';
import type { HostMessage } from './protocol';
import { closeConn, send } from './useRoomUtilities';

export interface RoomHostState {
  engine: EngineState | null;
  conns: Map<string, DataConnection>;
  connMember: Map<DataConnection, string>;
  pending: Map<DataConnection, number>;
  mirror: RoomState | null;
  lastSnapshotAt: number;
  lastPingAt: number;
  lastClockSyncAt: number;
}

interface CreateRoomHostOptions {
  state: RoomHostState;
  setMirror: (room: RoomState) => void;
  receive: (message: HostMessage) => void;
  writeSnapshot: (state: EngineState, now: number) => void;
  helloTimeoutMs: number;
  clockSyncMs: number;
  snapshotEveryMs: number;
}

export const createRoomHost = ({ state, setMirror, receive, writeSnapshot, helloTimeoutMs, clockSyncMs, snapshotEveryMs }: CreateRoomHostOptions) => {
  const unbind = (memberId: string) => {
    const connection = state.conns.get(memberId);
    state.conns.delete(memberId);
    if (connection) state.connMember.delete(connection);
  };

  const bindConnection = (memberId: string, supersede: boolean, connection: DataConnection) => {
    const previous = state.conns.get(memberId);
    if (previous && previous !== connection) {
      state.connMember.delete(previous);
      if (supersede) send(previous, { v: PROTOCOL_VERSION, type: 'SUPERSEDED', payload: {} });
      closeConn(previous);
    }
    state.conns.set(memberId, connection);
    state.connMember.set(connection, memberId);
    state.pending.delete(connection);
  };

  const wire = (message: HostMessage) => ({ v: PROTOCOL_VERSION, ...message });

  const deliver = (target: string | null, message: HostMessage, origin: DataConnection | null) => {
    if (target === null) { if (origin) send(origin, wire(message)); return; }
    if (target === state.engine?.host.hostMemberId) { receive(message); return; }
    const connection = state.conns.get(target);
    if (connection) send(connection, wire(message));
  };

  const saveSnapshot = (now: number) => {
    if (!state.engine) return;
    state.lastSnapshotAt = now;
    writeSnapshot(state.engine, now);
  };

  const announce = () => {
    const room = state.engine?.room;
    if (!room || !room.isPublic) return;
    if (room.members.length >= MAX_MEMBERS) { roomDiscoveryManager.stopHostingRoom(room.roomId); return; }
    const seatsFilled = activeSeats(room.settings).filter((seat) => room.seats[seat] !== null).length;
    const host = room.members[0];
    const info: HostedRoomInfo = {
      hostName: host.profile.name, hostAvatar: host.profile.avatar ?? undefined, boardSize: room.settings.boardSize,
      createdAt: room.createdAt, seatsFilled: seatsFilled as 0 | 1 | 2, viewers: room.members.length - seatsFilled,
      members: room.members.length, capacity: MAX_MEMBERS, status: room.phase === 'countdown' || room.phase === 'opening' ? 'playing' : room.phase,
      openSeat: seatsFilled < activeSeats(room.settings).length && room.phase !== 'countdown' && room.phase !== 'opening',
    };
    roomDiscoveryManager.hostRoom(room.roomId, info);
  };

  const publish = (now: number, force = false) => {
    const engine = state.engine;
    if (!engine || (!force && state.mirror?.rev === engine.room.rev)) return;
    setMirror(toWire(engine, now));
    saveSnapshot(now);
    announce();
    if (import.meta.env.DEV) {
      const problems = checkInvariants(engine);
      if (problems.length) console.error('Room invariants broken:', problems);
    }
  };

  const apply = (result: EngineResult, origin: DataConnection | null) => {
    state.engine = result.state;
    const now = Date.now();
    const hostId = result.state.host.hostMemberId;
    for (const event of result.events) if (event.kind === 'bind' && origin) bindConnection(event.memberId, event.supersede, origin);
    for (const reply of result.replies) deliver(reply.to, reply.message, origin);
    for (const event of result.events) {
      if (event.kind === 'room_state') {
        const message = wire({ type: 'ROOM_STATE', payload: { state: toWire(result.state, now) } });
        for (const [id, connection] of state.conns) if (!event.except.includes(id)) send(connection, message);
      } else if (event.kind === 'broadcast') {
        const message = wire(event.message);
        for (const [id, connection] of state.conns) if (!event.except.includes(id)) send(connection, message);
        if (!event.except.includes(hostId)) receive(event.message);
      } else if (event.kind === 'close') {
        const connection = event.memberId === null ? origin : (state.conns.get(event.memberId) ?? null);
        if (event.memberId !== null) unbind(event.memberId);
        if (connection) { state.pending.delete(connection); closeConn(connection); }
      } else if (event.kind === 'member_removed') {
        const connection = state.conns.get(event.memberId);
        unbind(event.memberId);
        if (connection) closeConn(connection);
      }
    }
    publish(now);
  };

  const onMemberData = (connection: DataConnection, raw: unknown) => {
    const engine = state.engine;
    if (!engine) return;
    const now = Date.now();
    const memberId = state.connMember.get(connection) ?? null;
    const intent = parseIntent(raw);
    if (!intent) {
      if (memberId === null) { state.pending.delete(connection); closeConn(connection); return; }
      const noted = noteMalformed(engine, memberId, now);
      state.engine = noted.state;
      if (noted.kick) { unbind(memberId); closeConn(connection); apply(onConnectionLost(noted.state, memberId, now), null); }
      return;
    }
    if (memberId === null && intent.type !== 'HELLO') { state.pending.delete(connection); closeConn(connection); return; }
    apply(applyIntent(engine, intent, memberId, now), connection);
  };

  const onMemberGone = (connection: DataConnection) => {
    state.pending.delete(connection);
    const memberId = state.connMember.get(connection);
    if (!memberId) return;
    state.connMember.delete(connection);
    if (state.conns.get(memberId) !== connection) return;
    state.conns.delete(memberId);
    if (state.engine) apply(onConnectionLost(state.engine, memberId, Date.now()), null);
  };

  const acceptConnection = (connection: DataConnection) => {
    if (!state.engine) { connection.on('open', () => closeConn(connection)); return; }
    const metadata = connection.metadata as { caro?: unknown } | undefined;
    if (metadata?.caro !== PROTOCOL_VERSION) {
      connection.on('open', () => { send(connection, { type: 'LEAVE_ROOM', payload: {} }); closeConn(connection); });
      return;
    }
    connection.on('open', () => {
      if (state.pending.size >= 4) { closeConn(connection); return; }
      state.pending.set(connection, Date.now());
    });
    connection.on('data', (raw) => onMemberData(connection, raw));
    connection.on('close', () => onMemberGone(connection));
    connection.on('error', () => onMemberGone(connection));
  };

  const loop = () => {
    const engine = state.engine;
    if (!engine) return;
    const now = Date.now();
    for (const [connection, openedAt] of state.pending) {
      if (now - openedAt > helloTimeoutMs) { state.pending.delete(connection); closeConn(connection); }
    }
    apply(tick(engine, now), null);
    if (now - state.lastPingAt >= PING_INTERVAL_MS) {
      state.lastPingAt = now;
      const ping = wire({ type: 'PING', payload: { t: now } });
      for (const connection of state.conns.values()) send(connection, ping);
    }
    if (now - state.lastClockSyncAt >= clockSyncMs && state.engine) {
      state.lastClockSyncAt = now;
      const sync = clockSync(state.engine, now);
      if (sync) for (const connection of state.conns.values()) send(connection, wire(sync));
    }
    if (state.engine?.room.phase === 'playing' && now - state.lastSnapshotAt >= snapshotEveryMs) saveSnapshot(now);
  };

  return { acceptConnection, apply, loop, publish, saveSnapshot, announce };
};
