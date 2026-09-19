import { checkWin } from '../../shared/utils/gomokuLogic';
import { cutToCodePoints, isAllowedSettings, MAX_NAME_CODE_POINTS, sanitizeProfile } from './protocol';
import type { IntentPayloads, RatingReportStatus, RoomChatMessage, Seat } from './protocol';
import { BUZZ_INTERVAL_MS, CHAT_BACKLOG_SIZE, CHAT_IMAGE_MAX, CHAT_MIN_INTERVAL_MS, CHAT_TEXT_MAX, DISCARD_GUARD_MS, HELD_IMAGES_PER_MEMBER, INSTANT_UNDO_MS, MAX_MEMBERS, OFFER_TTL_MS, RATING_DELTA_MAX, REFUND_AFTER_LAST_SEEN_MS, ROOM_IMAGE_INTERVAL_MS, STALE_MOVER_MS, TEASE_PAIR_COOLDOWN_MS, TEASE_SENDER_COOLDOWN_MS } from './roomEngineTypes';
import type { EngineEnv, EngineState, Member } from './roomEngineTypes';
import { activeSeats, boardFromMoves, bothSeatedAndConnected, findMember, nextSeat, occupant, otherSeat, pieceAt, playerRef, seatOf, turnLimitMs } from './roomEngineHelpers';
import { appendSeatChange, bankClocks, endGame, expiredClock, pause, reject, removeMember, sendEvent, settleRating, startCountdown, startNewGame, vacateSeat } from './roomEngineLifecycle';
import type { Ctx } from './roomEngineLifecycle';

export const uniqueMemberId = (d: EngineState, env: EngineEnv): string => {
  for (;;) {
    const id = env.randomId(10);
    if (!findMember(d, id)) return id;
  }
};

export const nameKey = (name: string): string => name.normalize('NFKC').toLowerCase();

/**
 * Names are self-chosen, so a viewer could call themselves after a seated
 * player and speak in chat as them. A clash gets " (2)", " (3)" and so on,
 * compared case-insensitively so "alice" cannot pass for "Alice".
 */
export const dedupeName = (name: string, taken: string[]): string => {
  const used = new Set(taken.map(nameKey));
  if (!used.has(nameKey(name))) return name;
  for (let k = 2; ; k += 1) {
    const suffix = ` (${k})`;
    const base = cutToCodePoints(name, MAX_NAME_CODE_POINTS - suffix.length).trimEnd();
    const candidate = `${base}${suffix}`;
    if (!used.has(nameKey(candidate))) return candidate;
  }
};

export const sameAccountInOtherSeat = (d: EngineState, seat: Seat, uid: string): boolean =>
  activeSeats(d.room.settings).some((other) => other !== seat && occupant(d, other)?.profile.uid === uid);

/**
 * Where to bank the clocks when the side to move turns out to have been
 * silent since `seen`: a second after that last sign of life, so the silence
 * is given back, but never before the clocks last started running.
 */
export const refundedBankAt = (d: EngineState, seen: number, now: number): number =>
  Math.max(d.host.runningSince ?? now, Math.min(now, seen + REFUND_AFTER_LAST_SEEN_MS));

// ---------------------------------------------------------------------------
// Intent handlers
// ---------------------------------------------------------------------------

export const handleHello = (d: EngineState, p: IntentPayloads['HELLO'], from: string | null, ctx: Ctx): void => {
  if (from !== null) {
    reject(ctx, from, 'HELLO', 'already_joined');
    return;
  }
  const profile = sanitizeProfile(p.profile);
  if (!profile) {
    reject(ctx, null, 'HELLO', 'bad_profile');
    ctx.events.push({ kind: 'close', memberId: null });
    return;
  }
  const { host, room } = d;
  if (p.resume) {
    const { memberId, token } = p.resume;
    const member = findMember(d, memberId);
    const known = host.tokens[memberId];
    if (member && known !== undefined && known === token) {
      const supersede = host.tabIds[memberId] !== p.tabId;
      member.connected = true;
      member.graceMsLeft = null;
      delete host.graceEndsAt[memberId];
      host.lastSeenAt[memberId] = ctx.now;
      host.tabIds[memberId] = p.tabId;
      ctx.events.push({ kind: 'bind', memberId, supersede });
      ctx.welcome = { memberId, token: known, resumed: true, expired: false };
      return;
    }
  }
  if (room.members.length >= MAX_MEMBERS) {
    ctx.replies.push({ to: null, message: { type: 'ROOM_FULL', payload: { capacity: MAX_MEMBERS } } });
    ctx.events.push({ kind: 'close', memberId: null });
    return;
  }
  const id = uniqueMemberId(d, ctx.env);
  const token = ctx.env.randomToken();
  const name = dedupeName(profile.name, room.members.map((m) => m.profile.name));
  const member: Member = {
    id,
    profile: { ...profile, name },
    isHost: false,
    connected: true,
    graceMsLeft: null,
    joinedAt: ctx.now,
  };
  room.members.push(member);
  host.tokens[id] = token;
  host.tabIds[id] = p.tabId;
  host.lastSeenAt[id] = ctx.now;
  // A friend opening the invite link to a fresh room plays at once. Later
  // arrivals watch, and one account never fills both seats.
  if (room.phase === 'waiting') {
    const seat = activeSeats(room.settings).find((s) => room.seats[s] === null && !sameAccountInOtherSeat(d, s, profile.uid));
    if (seat) room.seats[seat] = id;
  }
  ctx.events.push({ kind: 'bind', memberId: id, supersede: false });
  ctx.welcome = { memberId: id, token, resumed: false, expired: p.resume !== undefined };
};

export const handleTakeSeat = (d: EngineState, m: Member, seat: Seat, ctx: Ctx): void => {
  const { room } = d;
  if (seatOf(d, m.id)) return reject(ctx, m.id, 'TAKE_SEAT', 'already_seated');
  // seat_taken comes before the count-in check: the loser of a race for the
  // last seat arrives just after the winner's sit started a count-in, and
  // "someone else took that seat" is what actually happened to them.
  if (room.seats[seat] !== null) return reject(ctx, m.id, 'TAKE_SEAT', 'seat_taken');
  if (sameAccountInOtherSeat(d, seat, m.profile.uid)) return reject(ctx, m.id, 'TAKE_SEAT', 'same_account');
  if (room.phase === 'countdown') return reject(ctx, m.id, 'TAKE_SEAT', 'countdown');
  const { game } = room;
  if (room.phase === 'paused' && game?.gaveUp.includes(m.profile.uid)) {
    return reject(ctx, m.id, 'TAKE_SEAT', 'gave_up_seat');
  }
  room.seats[seat] = m.id;
  if (game && room.phase === 'paused') {
    appendSeatChange(game, { seat, from: null, to: playerRef(m), atMove: game.moves.length, reason: 'sat', at: ctx.now });
    game.vacatedAt[seat] = null;
  }
};

/** `prevSeen` is when the mover was last heard from before this MOVE arrived. */
export const handleMove = (
  d: EngineState,
  m: Member,
  p: IntentPayloads['MOVE'],
  prevSeen: number | undefined,
  ctx: Ctx,
): void => {
  const { room } = d;
  const game = room.game;
  if (room.phase !== 'playing' || !game) return reject(ctx, m.id, 'MOVE', 'not_playing');
  if (p.gameId !== game.id) return reject(ctx, m.id, 'MOVE', 'wrong_game');
  const seat = seatOf(d, m.id);
  if (!seat) return reject(ctx, m.id, 'MOVE', 'not_seated');
  if (seat !== game.turn) return reject(ctx, m.id, 'MOVE', 'not_your_turn');
  if (p.n !== game.moves.length) return reject(ctx, m.id, 'MOVE', 'stale_move');
  const size = game.settings.boardSize;
  if (p.row >= size || p.col >= size) return reject(ctx, m.id, 'MOVE', 'out_of_bounds');
  const board = boardFromMoves(game.moves, size, game.openingSeat, game.settings);
  if (board[p.row][p.col] !== null) return reject(ctx, m.id, 'MOVE', 'occupied');
  // A move that arrives after the mover's clock ran out is too late: the
  // watchdog only looks four times a second, and the gap must not save anyone.
  const expired = expiredClock(d, ctx.now);
  if (expired) {
    // The watchdog would not have timed out a mover who had been silent for
    // longer than STALE_MOVER_MS; it pauses with a refund instead. A late MOVE
    // is judged the same way, or the outcome would hang on where the 250 ms
    // tick (longer in a throttled background tab) happened to fall. The link
    // has just proved itself alive, so unlike the watchdog this keeps the
    // connection, and the resuming count-in starts straight away.
    if (!m.isHost && prevSeen !== undefined && ctx.now - prevSeen > STALE_MOVER_MS) {
      pause(d, ctx, refundedBankAt(d, prevSeen, ctx.now));
      return reject(ctx, m.id, 'MOVE', 'not_playing');
    }
    endGame(d, nextSeat(seat, game.settings), expired, null, ctx);
    return reject(ctx, m.id, 'MOVE', 'time_out');
  }
  bankClocks(d, ctx.now);
  game.moves.push([p.row, p.col]);
  (game.moveCorners ??= []).push(game.settings.placementMode === 'lmao' ? p.corner ?? 'center' : 'center');
  game.moveBy.push(m.id);
  game.lastMove = { by: m.id, at: ctx.now };
  board[p.row][p.col] = seat;
  const win = checkWin(board, p.row, p.col, size);
  if (win) return endGame(d, win.winner, '5_in_a_row', win.line, ctx);
  if (game.moves.length === size * size) return endGame(d, 'DRAW', 'board_full', null, ctx);
  game.turn = nextSeat(seat, game.settings);
  game.clocks.turn = turnLimitMs(game.settings);
  ctx.moveApplied = { n: p.n, row: p.row, col: p.col, corner: game.moveCorners[game.moveCorners.length - 1] };
};

/** Takes back moves from the end through `seat`'s most recent one, and gives `seat` the move. */
export const takeBack = (d: EngineState, seat: Seat, ctx: Ctx): void => {
  const game = d.room.game;
  if (!game) return;
  bankClocks(d, ctx.now);
  while (game.moves.length > 0) {
    const piece = pieceAt(game.moves.length - 1, game.openingSeat, game.settings);
    game.moves.pop();
    game.moveCorners?.pop();
    game.moveBy.pop();
    if (piece === seat) break;
  }
  game.turn = seat;
  game.clocks.turn = turnLimitMs(game.settings);
  game.lastMove = null;
  game.undo = null;
};

export const handleUndoRequest = (d: EngineState, m: Member, p: IntentPayloads['UNDO_REQUEST'], ctx: Ctx): void => {
  const { room } = d;
  const game = room.game;
  if (room.phase !== 'playing' || !game) return reject(ctx, m.id, 'UNDO_REQUEST', 'not_playing');
  if (p.gameId !== game.id) return reject(ctx, m.id, 'UNDO_REQUEST', 'wrong_game');
  if (game.settings.playerMode === 'oneVsOneVsOne') return reject(ctx, m.id, 'UNDO_REQUEST', 'undo_off');
  if (!game.settings.allowUndo) return reject(ctx, m.id, 'UNDO_REQUEST', 'undo_off');
  const seat = seatOf(d, m.id);
  if (!seat) return reject(ctx, m.id, 'UNDO_REQUEST', 'not_seated');
  if (!game.moves.some((_, i) => pieceAt(i, game.openingSeat, game.settings) === seat)) return reject(ctx, m.id, 'UNDO_REQUEST', 'no_move_to_undo');
  if (game.undo) return reject(ctx, m.id, 'UNDO_REQUEST', 'undo_pending');
  const last = game.moves.length - 1;
  // Instant only for the member who actually made that move: someone who has
  // just sat down must not quietly erase the previous occupant's stone.
  const instant =
    pieceAt(last, game.openingSeat, game.settings) === seat &&
    game.moveBy[last] === m.id &&
    game.lastMove !== null &&
    ctx.now - game.lastMove.at <= INSTANT_UNDO_MS;
  if (instant) return takeBack(d, seat, ctx);
  game.undo = { from: seat, expiresAt: ctx.now + OFFER_TTL_MS };
};

export const handleUndoAnswer = (d: EngineState, m: Member, p: IntentPayloads['UNDO_ANSWER'], ctx: Ctx): void => {
  const { room } = d;
  const game = room.game;
  if (room.phase !== 'playing' || !game) return reject(ctx, m.id, 'UNDO_ANSWER', 'not_playing');
  if (p.gameId !== game.id) return reject(ctx, m.id, 'UNDO_ANSWER', 'wrong_game');
  if (!game.undo) return reject(ctx, m.id, 'UNDO_ANSWER', 'no_undo');
  if (game.settings.playerMode === 'oneVsOneVsOne') return reject(ctx, m.id, 'UNDO_ANSWER', 'not_addressed');
  if (seatOf(d, m.id) !== otherSeat(game.undo.from)) return reject(ctx, m.id, 'UNDO_ANSWER', 'not_addressed');
  const from = game.undo.from;
  if (p.accept) return takeBack(d, from, ctx);
  game.undo = null;
  sendEvent(ctx, occupant(d, from), 'undo_declined');
};

export const handleRematchOffer = (d: EngineState, m: Member, p: IntentPayloads['REMATCH_OFFER'], ctx: Ctx): void => {
  const { room } = d;
  const game = room.game;
  if (room.phase !== 'ended' || !game) return reject(ctx, m.id, 'REMATCH_OFFER', 'not_ended');
  if (p.gameId !== game.id) return reject(ctx, m.id, 'REMATCH_OFFER', 'wrong_game');
  const seat = seatOf(d, m.id);
  if (!seat) return reject(ctx, m.id, 'REMATCH_OFFER', 'not_seated');
  if (!bothSeatedAndConnected(d)) return reject(ctx, m.id, 'REMATCH_OFFER', 'seat_empty');
  if (game.rematch) return reject(ctx, m.id, 'REMATCH_OFFER', 'offer_pending');
  game.rematch = { from: seat, expiresAt: ctx.now + OFFER_TTL_MS };
};

export const handleRematchAnswer = (d: EngineState, m: Member, p: IntentPayloads['REMATCH_ANSWER'], ctx: Ctx): void => {
  const { room } = d;
  const game = room.game;
  if (room.phase !== 'ended' || !game) return reject(ctx, m.id, 'REMATCH_ANSWER', 'not_ended');
  if (p.gameId !== game.id) return reject(ctx, m.id, 'REMATCH_ANSWER', 'wrong_game');
  if (!game.rematch) return reject(ctx, m.id, 'REMATCH_ANSWER', 'no_offer');
  if (game.settings.playerMode === 'oneVsOneVsOne') {
    if (seatOf(d, m.id) === game.rematch.from) return reject(ctx, m.id, 'REMATCH_ANSWER', 'not_addressed');
    if (!p.accept) {
      const offerer = occupant(d, game.rematch.from);
      game.rematch = null;
      sendEvent(ctx, offerer, 'rematch_declined');
      return;
    }
    if (!bothSeatedAndConnected(d)) return reject(ctx, m.id, 'REMATCH_ANSWER', 'seat_empty');
    startNewGame(d, ctx);
    return;
  }
  if (seatOf(d, m.id) !== otherSeat(game.rematch.from)) return reject(ctx, m.id, 'REMATCH_ANSWER', 'not_addressed');
  const offerer = occupant(d, game.rematch.from);
  if (!p.accept) {
    game.rematch = null;
    sendEvent(ctx, offerer, 'rematch_declined');
    return;
  }
  if (!bothSeatedAndConnected(d)) return reject(ctx, m.id, 'REMATCH_ANSWER', 'seat_empty');
  startNewGame(d, ctx);
};

export const handleResign = (d: EngineState, m: Member, p: IntentPayloads['RESIGN'], ctx: Ctx): void => {
  const { room } = d;
  const game = room.game;
  if (room.phase !== 'playing' || !game) return reject(ctx, m.id, 'RESIGN', 'not_playing');
  if (p.gameId !== game.id) return reject(ctx, m.id, 'RESIGN', 'wrong_game');
  const seat = seatOf(d, m.id);
  if (!seat) return reject(ctx, m.id, 'RESIGN', 'not_seated');
  endGame(d, game.settings.playerMode === 'oneVsOneVsOne' ? 'DRAW' : otherSeat(seat), 'resigned', null, ctx);
};

export const handleDiscard = (d: EngineState, m: Member, p: IntentPayloads['DISCARD_GAME'], ctx: Ctx): void => {
  const { room } = d;
  const game = room.game;
  if (room.phase !== 'paused' || !game) return reject(ctx, m.id, 'DISCARD_GAME', 'not_paused');
  if (p.gameId !== game.id) return reject(ctx, m.id, 'DISCARD_GAME', 'wrong_game');
  const empty = activeSeats(room.settings).find((s) => room.seats[s] === null);
  if (!empty) return reject(ctx, m.id, 'DISCARD_GAME', 'no_empty_seat');
  if (!m.isHost) {
    // The remaining player may end the game too, but only after the seat has
    // stood empty for a while, so a viewer gets a moment to take it first.
    const seat = seatOf(d, m.id);
    if (!seat || activeSeats(room.settings).some((other) => other !== seat && room.seats[other] !== null)) {
      return reject(ctx, m.id, 'DISCARD_GAME', 'not_host');
    }
    const since = game.vacatedAt[empty] ?? ctx.now;
    const waited = ctx.now - since;
    if (waited < DISCARD_GUARD_MS) return reject(ctx, m.id, 'DISCARD_GAME', 'too_soon', DISCARD_GUARD_MS - waited);
  }
  room.game = null;
  room.phase = 'waiting';
  room.autoStartArmed = true;
  d.host.runningSince = null;
};

export const handleClearSeat = (d: EngineState, m: Member, seat: Seat, ctx: Ctx): void => {
  const { room } = d;
  if (!m.isHost) return reject(ctx, m.id, 'CLEAR_SEAT', 'not_host');
  if (room.phase === 'countdown') return reject(ctx, m.id, 'CLEAR_SEAT', 'countdown');
  const id = room.seats[seat];
  if (id === null) return reject(ctx, m.id, 'CLEAR_SEAT', 'seat_empty');
  if (id === m.id) return reject(ctx, m.id, 'CLEAR_SEAT', 'own_seat');
  vacateSeat(d, seat, 'removed', ctx);
};

export const handleUpdateSettings = (d: EngineState, m: Member, p: IntentPayloads['UPDATE_SETTINGS'], ctx: Ctx): void => {
  const { room } = d;
  if (!m.isHost) return reject(ctx, m.id, 'UPDATE_SETTINGS', 'not_host');
  if (room.phase !== 'waiting' && room.phase !== 'ended') return reject(ctx, m.id, 'UPDATE_SETTINGS', 'locked');
  if (!isAllowedSettings(p.settings)) return reject(ctx, m.id, 'UPDATE_SETTINGS', 'bad_settings');
  const { boardSize, totalTimeMinutes, turnTimeSeconds, allowUndo } = p.settings;
  room.settings = {
    boardSize,
    totalTimeMinutes,
    turnTimeSeconds,
    allowUndo,
    placementMode: p.settings.placementMode ?? 'normal',
    playerMode: p.settings.playerMode ?? 'oneVsOne',
    firstMoveMethod: p.settings.firstMoveMethod ?? 'default',
  };
  // A rematch offer was made under the old rules; accepting it must not start
  // a game under rules the other player never saw.
  const game = room.game;
  if (game?.rematch) {
    const offerer = occupant(d, game.rematch.from);
    game.rematch = null;
    sendEvent(ctx, offerer, 'rematch_declined', { why: 'rules_changed' });
  }
};

export const handleFirstMoveChoice = (d: EngineState, m: Member, p: IntentPayloads['FIRST_MOVE_CHOICE'], ctx: Ctx): void => {
  const { room } = d;
  const game = room.game;
  if (room.phase !== 'opening' || !game || game.id !== p.gameId) return reject(ctx, m.id, 'FIRST_MOVE_CHOICE', 'not_playing');
  const seat = seatOf(d, m.id);
  if (seat !== 'X' && seat !== 'O' || game.firstMove.method !== 'rockPaperScissors' || !game.firstMove.choices) {
    return reject(ctx, m.id, 'FIRST_MOVE_CHOICE', 'not_seated');
  }
  if (game.firstMove.choices[seat] !== null) return;
  game.firstMove.choices[seat] = p.choice;
  const { X, O } = game.firstMove.choices;
  if (!X || !O) return;
  if (X === O) {
    game.firstMove.choices = { X: null, O: null };
    return;
  }
  const xWins = (X === 'rock' && O === 'scissors') || (X === 'paper' && O === 'rock') || (X === 'scissors' && O === 'paper');
  const winner: Seat = xWins ? 'X' : 'O';
  game.firstMove.winner = winner;
  game.openingSeat = winner;
  game.turn = winner;
  startCountdown(d, false, ctx.now);
};

export const handleCoinCall = (d: EngineState, m: Member, p: IntentPayloads['COIN_CALL'], ctx: Ctx): void => {
  const { room } = d;
  const game = room.game;
  if (room.phase !== 'opening' || !game || game.id !== p.gameId || game.firstMove.method !== 'coinFlip') {
    return reject(ctx, m.id, 'COIN_CALL', 'not_playing');
  }
  if (game.firstMove.call !== null) return reject(ctx, m.id, 'COIN_CALL', 'not_playing');
  const hostSeat = seatOf(d, m.id);
  if (hostSeat !== 'X' && hostSeat !== 'O') return reject(ctx, m.id, 'COIN_CALL', 'not_seated');
  const hostMember = findMember(d, d.host.hostMemberId);
  const hostPlayerSeat = hostMember ? seatOf(d, hostMember.id) : null;
  if (hostPlayerSeat !== 'X' && hostPlayerSeat !== 'O') return reject(ctx, m.id, 'COIN_CALL', 'not_seated');
  // The host calls the first toss. Each completed rematch switches the caller,
  // so both players get an equal turn at choosing the coin side.
  const callerSeat = game.number % 2 === 1 ? hostPlayerSeat : otherSeat(hostPlayerSeat);
  if (hostSeat !== callerSeat) return reject(ctx, m.id, 'COIN_CALL', 'not_host');
  const face: 'X' | 'O' = ctx.env.randomId(1).charCodeAt(0) % 2 === 0 ? 'X' : 'O';
  const winner: Seat = p.call === face ? hostSeat : otherSeat(hostSeat);
  game.firstMove.call = p.call;
  game.firstMove.face = face;
  game.firstMove.callerMemberId = m.id;
  game.firstMove.winner = winner;
  game.openingSeat = winner;
  game.turn = winner;
  startCountdown(d, false, ctx.now);
};

export const handleChat = (d: EngineState, m: Member, p: IntentPayloads['CHAT'], ctx: Ctx): void => {
  const { host, room } = d;
  const text = p.text.trim();
  const image = p.image;
  if (!text && !image) return reject(ctx, m.id, 'CHAT', 'empty');
  if (Array.from(text).length > CHAT_TEXT_MAX) return reject(ctx, m.id, 'CHAT', 'too_long');
  if (image !== undefined && (!image.startsWith('data:image/') || image.length > CHAT_IMAGE_MAX)) {
    return reject(ctx, m.id, 'CHAT', 'bad_image');
  }
  const lastChat = host.lastChatAt[m.id];
  if (lastChat !== undefined && ctx.now - lastChat < CHAT_MIN_INTERVAL_MS) {
    return reject(ctx, m.id, 'CHAT', 'rate_limited', CHAT_MIN_INTERVAL_MS - (ctx.now - lastChat));
  }
  if (image !== undefined && host.lastImageAt !== null && ctx.now - host.lastImageAt < ROOM_IMAGE_INTERVAL_MS) {
    return reject(ctx, m.id, 'CHAT', 'rate_limited', ROOM_IMAGE_INTERVAL_MS - (ctx.now - host.lastImageAt));
  }
  host.lastChatAt[m.id] = ctx.now;
  if (image !== undefined) host.lastImageAt = ctx.now;
  const message: RoomChatMessage = {
    id: p.id,
    senderId: m.id,
    sender: m.profile.name,
    senderAvatar: m.profile.avatar,
    text,
    ...(image !== undefined ? { image } : {}),
    timestamp: ctx.now,
  };
  if (image === undefined) {
    host.chatBacklog = [...host.chatBacklog, message].slice(-CHAT_BACKLOG_SIZE);
  }
  // Every message shares one ordered channel with the moves, so an image
  // relayed to a player mid-game would queue their opponent's move behind it
  // while the host's clock charges them. Players get images when play stops.
  const holdFor =
    image !== undefined && room.phase === 'playing'
      ? activeSeats(room.settings).map((s) => room.seats[s]).filter((id): id is string => id !== null && id !== m.id)
      : [];
  for (const to of holdFor) {
    const mine = host.heldImages.filter((h) => h.to === to);
    if (mine.length >= HELD_IMAGES_PER_MEMBER) {
      const oldest = mine[0];
      host.heldImages = host.heldImages.filter((h) => h !== oldest);
    }
    host.heldImages.push({ to, message });
  }
  ctx.events.push({ kind: 'broadcast', message: { type: 'CHAT', payload: { message } }, except: [m.id, ...holdFor] });
};

export const handleBuzz = (d: EngineState, m: Member, ctx: Ctx): void => {
  const seat = seatOf(d, m.id);
  if (!seat) return reject(ctx, m.id, 'BUZZ', 'not_seated');
  const last = d.host.lastBuzzAt[m.id];
  if (last !== undefined && ctx.now - last < BUZZ_INTERVAL_MS) {
    return reject(ctx, m.id, 'BUZZ', 'rate_limited', BUZZ_INTERVAL_MS - (ctx.now - last));
  }
  d.host.lastBuzzAt[m.id] = ctx.now;
  ctx.events.push({
    kind: 'broadcast',
    message: { type: 'BUZZ', payload: { fromSeat: seat, fromName: m.profile.name } },
    except: [],
  });
};

export const handleTease = (d: EngineState, m: Member, p: IntentPayloads['TEASE'], ctx: Ctx): void => {
  const { host } = d;
  const target = findMember(d, p.targetMemberId);
  if (!target) return reject(ctx, m.id, 'TEASE', 'no_target');
  if (target.id === m.id) return reject(ctx, m.id, 'TEASE', 'self');
  if (!target.connected) return reject(ctx, m.id, 'TEASE', 'target_away');
  const pairKey = `${m.id}>${target.id}`;
  const lastPair = host.teaseByPair[pairKey];
  const lastSender = host.teaseBySender[m.id];
  const pairWait = lastPair === undefined ? 0 : TEASE_PAIR_COOLDOWN_MS - (ctx.now - lastPair);
  const senderWait = lastSender === undefined ? 0 : TEASE_SENDER_COOLDOWN_MS - (ctx.now - lastSender);
  const wait = Math.max(pairWait, senderWait);
  if (wait > 0) return reject(ctx, m.id, 'TEASE', 'cooldown', wait);
  host.teaseByPair[pairKey] = ctx.now;
  host.teaseBySender[m.id] = ctx.now;
  ctx.events.push({
    kind: 'broadcast',
    message: {
      type: 'TEASE',
      payload: { fromMemberId: m.id, fromName: m.profile.name, toMemberId: target.id, toName: target.profile.name, at: ctx.now },
    },
    except: [],
  });
};

export const handleRatingReport = (d: EngineState, m: Member, p: IntentPayloads['RATING_REPORT'], ctx: Ctx): void => {
  const result = d.room.results.find((r) => r.gameId === p.gameId);
  if (!result) return reject(ctx, m.id, 'RATING_REPORT', 'no_result');
  const rating = result.rating;
  if (rating.status !== 'pending') return reject(ctx, m.id, 'RATING_REPORT', 'not_pending');
  const seat = rating.submitters.find((s) => result.players[s].memberId === m.id && !rating.reports[s]);
  if (!seat) return reject(ctx, m.id, 'RATING_REPORT', 'not_submitter');
  const { deltas } = p;
  if (
    deltas !== undefined &&
    ![deltas.X, deltas.O].every((v) => Number.isInteger(v) && Math.abs(v) <= RATING_DELTA_MAX)
  ) {
    return reject(ctx, m.id, 'RATING_REPORT', 'bad_deltas');
  }
  if (p.status === 'saved') {
    result.rating = { status: 'saved', by: seat, deltas: deltas ? { X: deltas.X, O: deltas.O } : null };
    return;
  }
  const status: Exclude<RatingReportStatus, 'saved'> = p.status;
  rating.reports[seat] = { status, why: p.why ?? null };
  settleRating(result);
};

export const handleLeaveRoom = (d: EngineState, m: Member, ctx: Ctx): void => {
  if (m.isHost) return reject(ctx, m.id, 'LEAVE_ROOM', 'host_cannot_leave');
  const seat = seatOf(d, m.id);
  // Leaving pauses the game and opens the seat. It never produces a result:
  // no path may hand a win to, or take one from, a player who walked away.
  if (seat) vacateSeat(d, seat, 'left', ctx);
  removeMember(d, m.id, ctx);
  ctx.events.push({ kind: 'close', memberId: m.id });
};

// ---------------------------------------------------------------------------
// Public transitions
// ---------------------------------------------------------------------------

/**
 * Applies one intent. `fromMemberId` is the member the host bound the
 * connection to, never anything claimed in the payload; it is null only for
 * a HELLO on a connection not yet bound.
 */
