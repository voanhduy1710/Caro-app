import type { RoomSettings } from '../settings/types';
import { PROTOCOL_VERSION, isAllowedSettings, sanitizeProfile } from './protocol';
import type { HostMessage, Intent } from './protocol';
import { GRACE_MS, LOST_AFTER_MS, MALFORMED_KICK_COUNT, MALFORMED_WINDOW_MS, STALE_MOVER_MS } from './roomEngineTypes';
import type { EngineEnv, EngineResult, EngineState, RoomState } from './roomEngineTypes';
import { bothSeatedAndConnected, findMember, liveClocksAt, nextSeat, occupant, otherSeat, seatOf } from './roomEngineHelpers';
import { abortCountdown, bankClocks, cloneState, endGame, expiredClock, finalize, newCtx, pause, reject, removeMember, sendEvent, vacateSeat } from './roomEngineLifecycle';
import { handleBuzz, handleChat, handleClaimDisconnectWin, handleClearSeat, handleCoinCall, handleDiscard, handleFirstMoveChoice, handleHello, handleLeaveRoom, handleMove, handleRatingReport, handleRematchAnswer, handleRematchOffer, handleResign, handleTakeSeat, handleTease, handleUndoAnswer, handleUndoRequest, handleUpdateSettings, refundedBankAt } from './roomEngineHandlers';
export * from './roomEngineTypes';
export * from './roomEngineHelpers';

const randomBytes = (count: number): Uint8Array => {
  const bytes = new Uint8Array(count);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
};

export const cryptoEnv: EngineEnv = {
  randomId: (length) => Array.from(randomBytes(length), (b) => (b % 36).toString(36)).join(''),
  randomToken: () => Array.from(randomBytes(16), (b) => b.toString(16).padStart(2, '0')).join(''),
};

export interface CreateRoomOptions {
  roomId: string;
  isPublic: boolean;
  settings: RoomSettings;
  hostProfile: unknown;
  hostTabId?: string;
}

export const createRoom = (opts: CreateRoomOptions, now: number, env: EngineEnv = cryptoEnv): EngineState => {
  const profile = sanitizeProfile(opts.hostProfile);
  if (!profile) throw new Error('createRoom: the host profile has no usable uid');
  if (!isAllowedSettings(opts.settings)) throw new Error('createRoom: settings outside the allowed options');
  const hostId = env.randomId(10);
  return {
    room: {
      v: PROTOCOL_VERSION, roomId: opts.roomId, rev: 1, isPublic: opts.isPublic, createdAt: now,
      settings: { ...opts.settings, playerMode: opts.settings.playerMode ?? 'oneVsOne' },
      members: [{ id: hostId, profile, isHost: true, connected: true, graceMsLeft: null, joinedAt: now }],
      seats: { X: hostId, O: null, T: null }, phase: 'waiting', countdown: null, autoStartArmed: true,
      game: null, results: [], gamesPlayed: 0, score: { pair: '', X: 0, O: 0, T: 0 }, sentAt: now,
    },
    host: {
      hostMemberId: hostId, tokens: {}, tabIds: opts.hostTabId ? { [hostId]: opts.hostTabId } : {},
      lastSeenAt: {}, graceEndsAt: {}, runningSince: null, countdownEndsAt: null, teaseBySender: {},
      teaseByPair: {}, lastChatAt: {}, lastImageAt: null, lastBuzzAt: {}, malformedAt: {},
      chatBacklog: [], heldImages: [],
    },
  };
};

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

export const clockSync = (state: EngineState, now: number): HostMessage | null => {
  const clocks = liveClocksAt(state, now);
  const { game } = state.room;
  return game && clocks && state.room.phase === 'playing'
    ? { type: 'CLOCK_SYNC', payload: { gameId: game.id, clocks, rev: state.room.rev } }
    : null;
};

export interface HostSnapshot { state: EngineState; savedAt: number }

export const snapshot = (state: EngineState, now: number): HostSnapshot => {
  const d = cloneState(state);
  bankClocks(d, now);
  d.host.heldImages = [];
  return { state: structuredClone(d), savedAt: now };
};

export const restore = (snap: HostSnapshot, now: number): EngineState => {
  const d = cloneState(snap.state);
  const { room, host } = d;
  room.settings.playerMode ??= 'oneVsOne';
  room.settings.firstMoveMethod ??= 'default';
  room.seats.T ??= null;
  room.score.T ??= 0;
  if (room.game) {
    room.game.settings.playerMode ??= 'oneVsOne';
    room.game.settings.firstMoveMethod ??= 'default';
    room.game.firstMove ??= { method: 'default', winner: room.game.openingSeat };
    room.game.clocks.T ??= room.game.clocks.X;
    room.game.startedWith.T ??= room.game.startedWith.X;
    room.game.vacatedAt.T ??= null;
  }
  for (const result of room.results) result.players.T ??= result.players.X;
  room.rev += 1;
  for (const member of room.members) {
    if (member.isHost) { member.connected = true; member.graceMsLeft = null; continue; }
    member.connected = false;
    member.graceMsLeft = GRACE_MS;
    host.graceEndsAt[member.id] = now + GRACE_MS;
  }
  host.lastSeenAt = {}; host.lastChatAt = {}; host.lastBuzzAt = {}; host.malformedAt = {};
  host.lastImageAt = null; host.heldImages = [];
  const game = room.game;
  if (game) {
    game.clocks.running = false; host.runningSince = null; game.undo = null;
    if (room.phase === 'playing') room.phase = 'paused';
    if (room.phase === 'countdown') {
      if (room.countdown?.resuming) room.phase = 'paused';
      else { room.game = null; room.phase = 'waiting'; room.autoStartArmed = true; }
      room.countdown = null;
    }
  }
  host.countdownEndsAt = null;
  return d;
};

const loseConnection = (d: EngineState, memberId: string, ctx: ReturnType<typeof newCtx>): void => {
  const m = findMember(d, memberId);
  if (!m || m.isHost || !m.connected) return;
  m.connected = false;
  m.graceMsLeft = GRACE_MS;
  d.host.graceEndsAt[m.id] = ctx.now + GRACE_MS;
  const seat = seatOf(d, m.id);
  if (!seat) return;
  const { room } = d;
  if (room.phase === 'playing' && room.game) {
    const bankAt = room.game.turn === seat ? refundedBankAt(d, d.host.lastSeenAt[m.id] ?? ctx.now, ctx.now) : ctx.now;
    pause(d, ctx, bankAt);
  } else if (room.phase === 'countdown') abortCountdown(d);
  else if (room.phase === 'opening') { room.game = null; room.phase = 'waiting'; room.autoStartArmed = true; }
};

const expireGrace = (d: EngineState, memberId: string, ctx: ReturnType<typeof newCtx>): void => {
  const m = findMember(d, memberId);
  const endsAt = d.host.graceEndsAt[memberId];
  if (!m || m.connected || endsAt === undefined || ctx.now < endsAt) return;
  const seat = seatOf(d, memberId);
  const game = d.room.game;
  if (seat && game && game.settings.playerMode === 'oneVsOne' && game.moves.length > 0 && (d.room.phase === 'playing' || d.room.phase === 'paused')) {
    endGame(d, otherSeat(seat), 'disconnected', null, ctx);
  }
  if (seat) vacateSeat(d, seat, 'dropped', ctx);
  removeMember(d, memberId, ctx);
};

const completeCountdown = (d: EngineState, ctx: ReturnType<typeof newCtx>): void => {
  const { room, host } = d;
  if (room.phase !== 'countdown' || host.countdownEndsAt === null || ctx.now < host.countdownEndsAt) return;
  if (!room.game || !bothSeatedAndConnected(d)) { abortCountdown(d); return; }
  room.phase = 'playing'; room.countdown = null; host.countdownEndsAt = null;
  room.game.clocks.running = true; host.runningSince = ctx.now;
};

export const applyIntent = (state: EngineState, intent: Intent, fromMemberId: string | null, now: number, env: EngineEnv = cryptoEnv): EngineResult => {
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
  const prevSeen = d.host.lastSeenAt[m.id];
  if (!m.isHost) d.host.lastSeenAt[m.id] = now;
  if (!m.connected) {
    reject(ctx, m.id, intent.type, 'not_connected');
    return finalize(state, d, ctx);
  }
  switch (intent.type) {
    case 'TAKE_SEAT': handleTakeSeat(d, m, intent.payload.seat, ctx); break;
    case 'LEAVE_SEAT': {
      const seat = seatOf(d, m.id);
      if (seat) vacateSeat(d, seat, 'stood', ctx);
      else reject(ctx, m.id, 'LEAVE_SEAT', 'not_seated');
      break;
    }
    case 'MOVE': handleMove(d, m, intent.payload, prevSeen, ctx); break;
    case 'UNDO_REQUEST': handleUndoRequest(d, m, intent.payload, ctx); break;
    case 'UNDO_ANSWER': handleUndoAnswer(d, m, intent.payload, ctx); break;
    case 'REMATCH_OFFER': handleRematchOffer(d, m, intent.payload, ctx); break;
    case 'REMATCH_ANSWER': handleRematchAnswer(d, m, intent.payload, ctx); break;
    case 'RESIGN': handleResign(d, m, intent.payload, ctx); break;
    case 'CLAIM_DISCONNECT_WIN': handleClaimDisconnectWin(d, m, intent.payload, ctx); break;
    case 'DISCARD_GAME': handleDiscard(d, m, intent.payload, ctx); break;
    case 'CLEAR_SEAT': handleClearSeat(d, m, intent.payload.seat, ctx); break;
    case 'UPDATE_SETTINGS': handleUpdateSettings(d, m, intent.payload, ctx); break;
    case 'FIRST_MOVE_CHOICE': handleFirstMoveChoice(d, m, intent.payload, ctx); break;
    case 'COIN_CALL': handleCoinCall(d, m, intent.payload, ctx); break;
    case 'CHAT': handleChat(d, m, intent.payload, ctx); break;
    case 'BUZZ': handleBuzz(d, m, ctx); break;
    case 'TEASE': handleTease(d, m, intent.payload, ctx); break;
    case 'RATING_REPORT': handleRatingReport(d, m, intent.payload, ctx); break;
    case 'STATE_REQUEST': ctx.replies.push({ to: m.id, message: { type: 'ROOM_STATE', payload: { state: toWire(d, now) } } }); break;
    case 'PONG': break;
    case 'LEAVE_ROOM': handleLeaveRoom(d, m, ctx); break;
  }
  return finalize(state, d, ctx);
};

export const onConnectionLost = (state: EngineState, memberId: string, now: number, env: EngineEnv = cryptoEnv): EngineResult => {
  const d = cloneState(state);
  const ctx = newCtx(now, env);
  loseConnection(d, memberId, ctx);
  return finalize(state, d, ctx);
};

export const onGraceExpired = (state: EngineState, memberId: string, now: number, env: EngineEnv = cryptoEnv): EngineResult => {
  const d = cloneState(state);
  const ctx = newCtx(now, env);
  expireGrace(d, memberId, ctx);
  return finalize(state, d, ctx);
};

export const onCountdownDone = (state: EngineState, now: number, env: EngineEnv = cryptoEnv): EngineResult => {
  const d = cloneState(state);
  const ctx = newCtx(now, env);
  completeCountdown(d, ctx);
  return finalize(state, d, ctx);
};

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
  for (const m of [...d.room.members]) if (!m.connected) expireGrace(d, m.id, ctx);
  const expired = d.room.phase === 'playing' ? expiredClock(d, now) : null;
  const current = d.room.game;
  if (expired && current) {
    const moverId = d.room.seats[current.turn];
    const mover = findMember(d, moverId);
    const seen = moverId === null ? now : (host.lastSeenAt[moverId] ?? now);
    if (mover && !mover.isHost && now - seen > STALE_MOVER_MS) {
      loseConnection(d, mover.id, ctx);
      ctx.events.push({ kind: 'close', memberId: mover.id });
    } else endGame(d, nextSeat(current.turn, current.settings), expired, null, ctx);
  }
  return finalize(state, d, ctx);
};

export const noteMalformed = (state: EngineState, memberId: string, now: number): { state: EngineState; kick: boolean } => {
  const d = cloneState(state);
  const recent = (d.host.malformedAt[memberId] ?? []).filter((t) => now - t < MALFORMED_WINDOW_MS);
  recent.push(now);
  d.host.malformedAt[memberId] = recent;
  return { state: d, kick: recent.length >= MALFORMED_KICK_COUNT };
};
