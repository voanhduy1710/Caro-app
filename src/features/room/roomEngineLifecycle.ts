import type { RoomSettings } from '../settings/types';
import type { EventKind, IntentType, RejectReason, Seat } from './protocol';
import { COUNTDOWN_MS, RESULTS_CEILING, RESULTS_KEPT, SEAT_LOG_CAP } from './roomEngineTypes';
import type { Clocks, EngineEnv, EngineEvent, EngineResult, EngineState, Game, GameResult, Member, RatingOutcome, RatingState, Reply, ResultReason, SeatChange } from './roomEngineTypes';
import { activeSeats, bankLimitMs, bothSeatedAndConnected, findMember, liveClocks, liveClocksAt, occupant, playerRef, ratingDecision, turnLimitMs } from './roomEngineHelpers';
import { toWire } from './roomEngineCore';

export interface Ctx {
  now: number;
  env: EngineEnv;
  events: EngineEvent[];
  replies: Reply[];
  /** Set by a move that did not end the game: MOVE_APPLIED replaces ROOM_STATE. */
  moveApplied: { n: number; row: number; col: number; corner?: import('./protocol').MoveCorner } | null;
  welcome: { memberId: string; token: string; resumed: boolean; expired: boolean } | null;
}

export const newCtx = (now: number, env: EngineEnv): Ctx => ({
  now,
  env,
  events: [],
  replies: [],
  moveApplied: null,
  welcome: null,
});

/**
 * A working copy. The room is small, so it is cloned outright; the book is
 * copied one level deep, and the chat arrays share their (never mutated)
 * messages so large held images are not copied four times a second by tick().
 */
export const cloneState = (state: EngineState): EngineState => {
  const h = state.host;
  const malformedAt: Record<string, number[]> = {};
  for (const [id, times] of Object.entries(h.malformedAt)) malformedAt[id] = [...times];
  return {
    room: structuredClone(state.room),
    host: {
      ...h,
      tokens: { ...h.tokens },
      tabIds: { ...h.tabIds },
      lastSeenAt: { ...h.lastSeenAt },
      graceEndsAt: { ...h.graceEndsAt },
      teaseBySender: { ...h.teaseBySender },
      teaseByPair: { ...h.teaseByPair },
      lastChatAt: { ...h.lastChatAt },
      lastBuzzAt: { ...h.lastBuzzAt },
      malformedAt,
      chatBacklog: [...h.chatBacklog],
      heldImages: [...h.heldImages],
    },
  };
};

export const reject = (
  ctx: Ctx,
  to: string | null,
  type: IntentType,
  reason: RejectReason,
  retryInMs?: number,
): void => {
  const payload = retryInMs === undefined ? { type, reason } : { type, reason, retryInMs };
  ctx.replies.push({ to, message: { type: 'REJECTED', payload } });
};

export const sendEvent = (ctx: Ctx, to: Member | undefined, kind: EventKind, extra: { seat?: Seat; why?: string } = {}) => {
  if (to) ctx.replies.push({ to: to.id, message: { type: 'EVENT', payload: { kind, ...extra } } });
};

/** Moves the running clocks' used time into the banks, as of `at`. */
export const bankClocks = (d: EngineState, at: number): void => {
  const { game } = d.room;
  const since = d.host.runningSince;
  if (!game || since === null || !game.clocks.running) return;
  game.clocks = liveClocks(game, Math.max(0, at - since));
  d.host.runningSince = Math.max(since, at);
};

export const stopClocks = (d: EngineState, at: number): void => {
  bankClocks(d, at);
  if (d.room.game) d.room.game.clocks.running = false;
  d.host.runningSince = null;
};

export const fullClocks = (settings: RoomSettings): Clocks => ({
  X: bankLimitMs(settings),
  O: bankLimitMs(settings),
  T: bankLimitMs(settings),
  turn: turnLimitMs(settings),
  elapsed: 0,
  elapsedBySeat: { X: 0, O: 0, T: 0 },
  running: false,
});

export const appendSeatChange = (game: Game, change: SeatChange): void => {
  // Keep the first half (who started) and the most recent half (who finished);
  // the middle of a long casual game matters least and the server caps it anyway.
  if (game.seatLog.length >= SEAT_LOG_CAP) {
    game.seatLog.splice(SEAT_LOG_CAP / 2, 1);
    game.seatLogDropped += 1;
  }
  game.seatLog.push(change);
};

export const startCountdown = (d: EngineState, resuming: boolean, now: number): void => {
  d.room.phase = 'countdown';
  d.room.countdown = { msLeft: COUNTDOWN_MS, resuming };
  d.host.countdownEndsAt = now + COUNTDOWN_MS;
};

export const startNewGame = (d: EngineState, ctx: Ctx): void => {
  const x = occupant(d, 'X');
  const o = occupant(d, 'O');
  const t = occupant(d, 'T');
  if (!x || !o || (d.room.settings.playerMode === 'oneVsOneVsOne' && !t)) return;
  const settings = {
    ...d.room.settings,
    placementMode: d.room.settings.placementMode ?? 'normal',
    playerMode: d.room.settings.playerMode ?? 'oneVsOne',
    firstMoveMethod: d.room.settings.firstMoveMethod,
  };
  // The host occupies X in a fresh room, so X opens game one. Every completed
  // game flips the opening seat: O opens game two, X game three, and so on.
  // `gamesPlayed` only increments in endGame, so an aborted count-in does not
  // accidentally consume a player's turn to open.
  const useRps = settings.playerMode === 'oneVsOne' && settings.firstMoveMethod === 'rockPaperScissors';
  const useCoinCall = settings.playerMode === 'oneVsOne' && settings.firstMoveMethod === 'coinFlip';
  const openingSeat = useRps || useCoinCall ? 'X' : activeSeats(settings)[d.room.gamesPlayed % activeSeats(settings).length];
  d.room.game = {
    id: ctx.env.randomId(16),
    number: d.room.gamesPlayed + 1,
    settings,
    moves: [],
    moveCorners: [],
    moveBy: [],
    turn: openingSeat,
    openingSeat,
    firstMove: useRps
      ? { method: 'rockPaperScissors', winner: null, choices: { X: null, O: null } }
      : useCoinCall
      ? { method: 'coinFlip', winner: null, call: null, face: null, callerMemberId: null }
      : { method: 'default', winner: openingSeat },
    clocks: fullClocks(settings),
    startedWith: { X: playerRef(x), O: playerRef(o), T: playerRef(t ?? x) },
    seatLog: [],
    seatLogDropped: 0,
    gaveUp: [],
    vacatedAt: { X: null, O: null, T: null },
    lastMove: null,
    undo: null,
    rematch: null,
  };
  d.host.runningSince = null;
  d.room.autoStartArmed = false;
  if (useRps || useCoinCall) {
    d.room.phase = 'opening';
    d.room.countdown = null;
    d.host.countdownEndsAt = null;
  } else {
    startCountdown(d, false, ctx.now);
  }
};

/**
 * A count-in cannot survive a missing player. A fresh game has no moves to
 * keep, so it is dropped and the room waits again; a resuming game goes back
 * to paused exactly as it was.
 */
export const abortCountdown = (d: EngineState): void => {
  const { room } = d;
  if (room.countdown?.resuming) {
    room.phase = 'paused';
  } else {
    room.game = null;
    room.phase = 'waiting';
    room.autoStartArmed = true;
  }
  room.countdown = null;
  d.host.countdownEndsAt = null;
};

/** Stops play. A pending take-back cannot outlive a pause, so it expires with notice. */
export const pause = (d: EngineState, ctx: Ctx, bankAt: number): void => {
  const { game } = d.room;
  if (!game) return;
  stopClocks(d, bankAt);
  d.room.phase = 'paused';
  if (game.undo) {
    const requester = occupant(d, game.undo.from);
    game.undo = null;
    sendEvent(ctx, requester, 'undo_expired');
  }
};

export const vacate = (d: EngineState, seat: Seat, reason: SeatChange['reason'], ctx: Ctx): void => {
  const { room } = d;
  const member = occupant(d, seat);
  room.seats[seat] = null;
  const { game } = room;
  if (game) {
    game.undo = null;
    game.rematch = null;
    if (member && (room.phase === 'countdown' || room.phase === 'playing' || room.phase === 'paused')) {
      appendSeatChange(game, {
        seat,
        from: playerRef(member),
        to: null,
        atMove: game.moves.length,
        reason,
        at: ctx.now,
      });
      game.vacatedAt[seat] = ctx.now;
      // Standing up freezes both clocks. Without this, a player short of time
      // could stand, think for free, and sit again with the same clocks. Only
      // the player's own choice bars them: a drop is not a choice, and neither
      // is the host's Remove, which is mostly used on someone still stuck
      // reconnecting who should be free to sit again once they are back.
      const choseToGo = reason === 'stood' || reason === 'left';
      if (choseToGo && !game.gaveUp.includes(member.profile.uid)) game.gaveUp.push(member.profile.uid);
    }
  }
  if (room.phase === 'waiting' || room.phase === 'ended') room.autoStartArmed = true;
  ctx.events.push({ kind: 'broadcast', message: { type: 'EVENT', payload: { kind: 'seat_opened', seat } }, except: [] });
};

/** Empties a seat, then does what the phase demands: pause a game, or abort a count-in. */
export const vacateSeat = (d: EngineState, seat: Seat, reason: SeatChange['reason'], ctx: Ctx): void => {
  switch (d.room.phase) {
    case 'playing':
      vacate(d, seat, reason, ctx);
      pause(d, ctx, ctx.now);
      break;
    case 'countdown':
      abortCountdown(d);
      vacate(d, seat, reason, ctx);
      break;
    default:
      vacate(d, seat, reason, ctx);
  }
};

export const settleRating = (result: GameResult): void => {
  const rating = result.rating;
  if (rating.status !== 'pending') return;
  const outcomes = rating.submitters.map((seat) => rating.reports[seat]);
  if (outcomes.some((o) => o === undefined)) return;
  const done = outcomes as RatingOutcome[];
  // Prefer the outcome that tells people the most: "may have been saved"
  // beats "could not be saved", which beats "not rated".
  const pick =
    done.find((o) => o.status === 'unknown') ?? done.find((o) => o.status === 'failed') ?? done[0];
  result.rating = { status: pick.status, why: pick.why };
};

/**
 * A submitter who leaves while their result is pending may still have a
 * request in flight, so the outcome is unknown rather than failed.
 */
export const markSubmitterGone = (d: EngineState, memberId: string): void => {
  for (const result of d.room.results) {
    const rating = result.rating;
    if (rating.status !== 'pending') continue;
    for (const seat of rating.submitters) {
      if (result.players[seat].memberId === memberId && !rating.reports[seat]) {
        rating.reports[seat] = { status: 'unknown', why: 'submitter_left' };
      }
    }
    settleRating(result);
  }
};

export const removeMember = (d: EngineState, memberId: string, ctx: Ctx): void => {
  const { host } = d;
  d.room.members = d.room.members.filter((m) => m.id !== memberId);
  delete host.tokens[memberId];
  delete host.tabIds[memberId];
  delete host.lastSeenAt[memberId];
  delete host.graceEndsAt[memberId];
  delete host.teaseBySender[memberId];
  delete host.lastChatAt[memberId];
  delete host.lastBuzzAt[memberId];
  delete host.malformedAt[memberId];
  for (const key of Object.keys(host.teaseByPair)) {
    const [from, to] = key.split('>');
    if (from === memberId || to === memberId) delete host.teaseByPair[key];
  }
  host.heldImages = host.heldImages.filter((h) => h.to !== memberId);
  markSubmitterGone(d, memberId);
  ctx.events.push({ kind: 'member_removed', memberId });
};

/**
 * Which clock ran out for the side to move, if one did. When both did, the one
 * with less time left when last banked ran out first.
 */
export const expiredClock = (d: EngineState, now: number): 'turn_timeout' | 'total_time_out' | null => {
  const { game } = d.room;
  const live = liveClocksAt(d, now);
  if (!game || !live || !game.clocks.running) return null;
  const bankOut = game.settings.totalTimeMinutes > 0 && live[game.turn] <= 0;
  const turnOut = game.settings.turnTimeSeconds > 0 && live.turn <= 0;
  if (bankOut && turnOut) return game.clocks[game.turn] <= game.clocks.turn ? 'total_time_out' : 'turn_timeout';
  if (bankOut) return 'total_time_out';
  if (turnOut) return 'turn_timeout';
  return null;
};

export const endGame = (
  d: EngineState,
  winner: Seat | 'DRAW',
  reason: ResultReason,
  line: Array<[number, number]> | null,
  ctx: Ctx,
): void => {
  const { room } = d;
  const game = room.game;
  const x = occupant(d, 'X');
  const o = occupant(d, 'O');
  const t = occupant(d, 'T');
  if (!game || !x || !o || (game.settings.playerMode === 'oneVsOneVsOne' && !t)) return;
  stopClocks(d, ctx.now);
  game.undo = null;
  game.rematch = null;
  room.phase = 'ended';
  room.countdown = null;
  d.host.countdownEndsAt = null;
  const pair = `${x.id}|${o.id}`;
  if (room.score.pair !== pair) room.score = { pair, X: 0, O: 0, T: 0 };
  if (winner !== 'DRAW') room.score[winner] += 1;
  const players = { X: playerRef(x), O: playerRef(o), T: playerRef(t ?? x) };
  let rating: RatingState;
  if (game.settings.playerMode === 'oneVsOneVsOne') {
    rating = { status: 'unrated', why: 'three_player', guestSeats: [] };
  } else {
    const decision = ratingDecision({ winner, players: { X: players.X, O: players.O, T: players.T } });
    if (decision.rated === false) {
      rating = { status: 'unrated', why: decision.why, guestSeats: decision.guestSeats };
    } else {
      rating = { status: 'pending', submitters: decision.submitters, reports: {} };
    }
  }
  room.results.push({
    gameId: game.id,
    number: game.number,
    settings: { ...game.settings },
    movesLength: game.moves.length,
    winner,
    line,
    reason,
    players,
    rating,
    endedAt: ctx.now,
  });
  // Evict the oldest settled results first. A pending one is kept: its
  // submitter may still be working on it, and a quick rematch must not make
  // the rating report bounce. The result just pushed is never a candidate,
  // because the result card shows the newest entry and it must be this game.
  // Past the ceiling the oldest pending result goes too; only a submitter who
  // has not reported for that many games gets there, and the server still
  // holds whatever they did send, so the room merely stops showing it.
  while (room.results.length > RESULTS_KEPT) {
    const newest = room.results.length - 1;
    let i = room.results.findIndex((r, k) => k < newest && r.rating.status !== 'pending');
    if (i === -1) {
      if (room.results.length <= RESULTS_CEILING) break;
      i = 0;
    }
    room.results.splice(i, 1);
  }
  room.gamesPlayed += 1;
};

/** The two rules that start play on their own, checked after every mutation. */
export const runStartChecks = (d: EngineState, ctx: Ctx): void => {
  const { room } = d;
  if (!bothSeatedAndConnected(d)) return;
  if (room.phase === 'paused') {
    startCountdown(d, true, ctx.now);
  } else if ((room.phase === 'waiting' || room.phase === 'ended') && room.autoStartArmed) {
    startNewGame(d, ctx);
  }
};

export const finalize = (before: EngineState, d: EngineState, ctx: Ctx): EngineResult => {
  runStartChecks(d, ctx);

  // Images held back from the players during a game go out as soon as play stops.
  if (d.room.phase !== 'playing' && d.host.heldImages.length > 0) {
    for (const held of d.host.heldImages) {
      if (findMember(d, held.to)) ctx.replies.push({ to: held.to, message: { type: 'CHAT', payload: { message: held.message } } });
    }
    d.host.heldImages = [];
  }

  const changed = JSON.stringify(before.room) !== JSON.stringify(d.room);
  if (changed) d.room.rev = before.room.rev + 1;

  const { game } = d.room;
  if (ctx.moveApplied && game) {
    ctx.events.push({
      kind: 'broadcast',
      message: {
        type: 'MOVE_APPLIED',
        payload: { ...ctx.moveApplied, gameId: game.id, turn: game.turn, clocks: { ...game.clocks }, rev: d.room.rev },
      },
      except: [],
    });
  } else if (changed) {
    ctx.events.push({ kind: 'room_state', except: ctx.welcome ? [ctx.welcome.memberId] : [] });
  }

  if (ctx.welcome) {
    const { memberId, token, resumed, expired } = ctx.welcome;
    ctx.replies.push({
      to: memberId,
      message: {
        type: 'WELCOME',
        payload: {
          memberId,
          token,
          resumed,
          ...(expired ? { expired: true } : {}),
          state: toWire(d, ctx.now),
          chatBacklog: [...d.host.chatBacklog],
        },
      },
    });
  }
  return { state: d, events: ctx.events, replies: ctx.replies };
};
