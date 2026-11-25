import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { ratingDelta } from './elo.ts';
import {
  applyPairLimits,
  isGameTooShort,
  parseGameShape,
  shapesDisagree,
  storedName,
  ticketsOnOppositeSeats,
} from './rules.ts';
import type { GameShape, SeatTicket } from './rules.ts';

/**
 * Records a finished match and updates both players' ratings.
 *
 * Ratings are computed here from the values already stored in the database, so
 * a client cannot decide its own ELO. Who may record a result:
 *
 * - The caller must be one of the two players, proven by their own session,
 *   and must hold a rating of their own.
 * - Every result needs a gameId, and both players must hold a seat ticket for
 *   that game on opposite seats (see the seat-ticket function). Without them
 *   nothing is recorded: a throwaway account can no longer lose to a main
 *   account on its own say-so.
 * - The game must look like a game: at least MIN_RATED_SECONDS since the
 *   first ticket (server clock), and, when the client reports them, at least
 *   MIN_RATED_MOVES moves and MIN_RATED_SECONDS of play. When both players
 *   report the same game and their reports disagree, it is disputed.
 * - A result that does not favour the caller is recorded at once: on a
 *   decisive result that is the loser, on a draw the player whose rating does
 *   not rise. Nobody fabricates a result against themselves.
 * - A result that favours the caller is only a claim, recorded ten minutes
 *   later unless a player disputes it. A loser can no longer dodge by closing
 *   the tab before submitting.
 * - Per pair of accounts and UTC day: at most PAIR_DAILY_RATED_LIMIT rated
 *   games and at most PAIR_DAILY_GAIN_CAP Elo gained by either from the
 *   other. Over that, the game is recorded unrated (deltas 0, no W/L/D, no
 *   streak) and the response carries `unrated: true` and a `code`.
 * - Either player may dispute a game they and their opponent hold opposite
 *   tickets for. A disputed game counts for nobody, unless the loser later
 *   concedes it.
 * - Names on the record come from gomoku_users, never from the request.
 *
 * Claims are recorded by public.finalize_due_match_claims, which runs every
 * minute and also at the start of every call here.
 *
 * gameId makes a submission idempotent: a repeat of the same game returns the
 * first row and never applies the ratings twice.
 *
 * verify_jwt stays off at the gateway: the anon key is itself a valid JWT, so
 * the gateway check would admit every caller anyway. The real check is the user
 * lookup below.
 */

/** Extra rating a decisive game is worth when both players doubled down. */
const DOUBLE_DOWN_BONUS = 20;
const SAFE_UID = /^[A-Za-z0-9_-]{1,128}$/;
const GAME_ID = /^[A-Za-z0-9_-]{8,40}$/;
const MAX_SEAT_CHANGES = 32;
const SEAT_CHANGE_REASONS = new Set(['stood', 'left', 'dropped', 'sat', 'removed']);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

const isGuest = (uid: string) => uid.startsWith('guest_') || uid === 'ai_bot';

/**
 * Keeps whatever part of a seat log is well formed. A malformed or oversized
 * log is trimmed or dropped, and is never allowed to fail the rating it rides
 * along with: the log is a record for later, the result is what matters now.
 */
const cleanSeatLog = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object') return null;
  const log = value as { startedWith?: unknown; changes?: unknown };
  const started = log.startedWith as { X?: unknown; O?: unknown } | undefined;
  const startedWith =
    started && typeof started.X === 'string' && typeof started.O === 'string' &&
    SAFE_UID.test(started.X) && SAFE_UID.test(started.O)
      ? { X: started.X, O: started.O }
      : null;
  const raw = Array.isArray(log.changes) ? log.changes : [];
  const changes = raw
    .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
    .map((c) => ({
      seat: c.seat === 'X' || c.seat === 'O' ? c.seat : null,
      fromUid: typeof c.fromUid === 'string' && SAFE_UID.test(c.fromUid) ? c.fromUid : null,
      toUid: typeof c.toUid === 'string' && SAFE_UID.test(c.toUid) ? c.toUid : null,
      atMove: typeof c.atMove === 'number' && Number.isInteger(c.atMove) && c.atMove >= 0 && c.atMove <= 10000 ? c.atMove : null,
      reason: typeof c.reason === 'string' && SEAT_CHANGE_REASONS.has(c.reason) ? c.reason : null,
    }))
    .filter((c) => c.seat !== null && c.reason !== null && c.atMove !== null);
  const truncated = changes.length > MAX_SEAT_CHANGES || changes.length < raw.length;
  return { startedWith, changes: changes.slice(0, MAX_SEAT_CHANGES), ...(truncated ? { truncated: true } : {}) };
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Body must be JSON' }, 400);
  }

  const player1Uid = String(body.player1Uid ?? '');
  const player2Uid = String(body.player2Uid ?? '');
  const winnerUid = String(body.winnerUid ?? '');
  const boardSize = Number(body.boardSize ?? 15);
  const mode = typeof body.mode === 'string' && body.mode.length <= 20 ? body.mode : 'pvp';

  if (!SAFE_UID.test(player1Uid) || !SAFE_UID.test(player2Uid)) {
    return json({ error: 'Invalid player id' }, 400);
  }
  if (player1Uid === player2Uid) {
    return json({ error: 'A player cannot face themselves' }, 400);
  }
  if (winnerUid !== 'DRAW' && winnerUid !== player1Uid && winnerUid !== player2Uid) {
    return json({ error: 'Winner must be one of the two players, or DRAW' }, 400);
  }
  if (!Number.isInteger(boardSize) || boardSize < 5 || boardSize > 100) {
    return json({ error: 'Invalid board size' }, 400);
  }
  if (isGuest(player1Uid) || isGuest(player2Uid)) {
    return json({ error: 'A game with a guest is not rated', code: 'seat_tickets_missing' }, 403);
  }

  // No game id, no rating: without one there are no seat tickets to check.
  const rawGameId = body.gameId;
  if (rawGameId === undefined || rawGameId === null) {
    return json({ error: 'A rated result needs a game id', code: 'no_game_id' }, 400);
  }
  const gameId = typeof rawGameId === 'string' && GAME_ID.test(rawGameId) ? rawGameId : null;
  if (gameId === null) return json({ error: 'Invalid game id' }, 400);

  const shape = parseGameShape(body);
  if (shape === 'invalid') return json({ error: 'Invalid moveCount or durationMs' }, 400);
  const seatLog = body.seatLog === undefined ? null : cleanSeatLog(body.seatLog);

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Who is asking. supabase-js sends the signed-in player's access token, or the
  // anon key when nobody is signed in, and only a real session resolves to a
  // user. That user has to be in the result they are reporting.
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  let callerId: string | null = null;
  if (token) {
    const { data } = await admin.auth.getUser(token);
    callerId = data.user?.id ?? null;
  }
  if (!callerId) {
    return json({ error: 'Sign in to record a rated match' }, 401);
  }
  if (callerId !== player1Uid && callerId !== player2Uid) {
    return json({ error: 'Only a player in this match can record it' }, 403);
  }
  const opponentUid = callerId === player1Uid ? player2Uid : player1Uid;

  // Record any claims whose window has closed before looking at this one, so a
  // quiet night without the scheduler still settles on the next game played.
  await admin.rpc('finalize_due_match_claims');

  // At most two tickets exist per game: one per seat (unique game_id, seat).
  const { data: ticketRows, error: ticketError } = await admin
    .from('gomoku_game_seats')
    .select('uid, seat, double_down, created_at')
    .eq('game_id', gameId);
  if (ticketError) return json({ error: 'Could not read the seat tickets' }, 500);
  const tickets = (ticketRows ?? []) as Array<SeatTicket & { double_down: boolean; created_at: string }>;
  const seated = ticketsOnOppositeSeats(tickets, player1Uid, player2Uid);

  // A dispute. Only a player who sat in the game, opposite the player they
  // name, may raise one, and only while nothing has been recorded: the loser
  // conceding is still honoured later.
  if (body.dispute === true) {
    if (!seated) {
      return json({ error: 'Only the two players seated in this game can dispute it', code: 'no_seat_ticket' }, 403);
    }
    const { data: recorded } = await admin.from('gomoku_matches').select('id').eq('game_id', gameId).limit(1);
    if (recorded && recorded.length > 0) {
      return json({ error: 'This game is already on record', code: 'already_recorded' }, 409);
    }
    const { error: disputeError } = await admin
      .from('gomoku_match_claims')
      .upsert({
        game_id: gameId,
        claimant_uid: callerId,
        mode,
        board_size: boardSize,
        winner_uid: 'DISPUTED',
        player1_uid: player1Uid,
        player1_name: 'Player 1',
        player2_uid: player2Uid,
        player2_name: 'Player 2',
        seat_log: seatLog,
        move_count: shape.moveCount,
        duration_ms: shape.durationMs,
        status: 'disputed',
      }, { onConflict: 'game_id,claimant_uid' });
    if (disputeError) return json({ error: 'Could not record the dispute', detail: disputeError.message }, 500);
    await admin.from('gomoku_match_claims').update({ status: 'disputed' }).eq('game_id', gameId).eq('status', 'pending');
    return json({ ok: true, disputed: true });
  }

  // A repeat of a game already on record, checked before anything is computed:
  // both players may offer a draw, and a retry may follow a lost response.
  const { data: existing } = await admin
    .from('gomoku_matches')
    .select('id')
    .eq('game_id', gameId)
    .limit(1);
  if (existing && existing.length > 0) {
    return json({ ok: true, duplicate: true, matchId: existing[0].id });
  }

  // Ratings and names come from the store, never from the request.
  const { data: rows, error: ratingsError } = await admin
    .from('gomoku_users')
    .select('uid, display_name, elo, wins, losses, draws, streak')
    .in('uid', [player1Uid, player2Uid]);
  if (ratingsError) return json({ error: 'Could not read ratings' }, 500);
  const ratings = new Map<string, { name: string; elo: number; wins: number; losses: number; draws: number; streak: number }>();
  for (const row of rows ?? []) {
    ratings.set(row.uid, {
      name: storedName(row.display_name, row.uid === player1Uid ? 'Player 1' : 'Player 2'),
      elo: row.elo ?? 1200,
      wins: row.wins ?? 0,
      losses: row.losses ?? 0,
      draws: row.draws ?? 0,
      streak: row.streak ?? 0,
    });
  }

  // The caller has to hold a rating of their own. Without one, "the result must
  // not raise the caller's rating" would be true of every result, and the rule
  // below would protect nobody.
  if (!ratings.has(callerId)) {
    return json({ error: 'Only a registered player can record a rated match', code: 'caller_not_rated' }, 403);
  }
  if (!ratings.has(opponentUid)) {
    return json({ error: 'Both players need a rated account', code: 'seat_tickets_missing' }, 403);
  }
  const player1 = ratings.get(player1Uid)!;
  const player2 = ratings.get(player2Uid)!;

  const score1 = winnerUid === 'DRAW' ? 0.5 : winnerUid === player1Uid ? 1 : 0;
  const score2 = 1 - score1;

  // A double down counts only when both players consented through their own
  // session (see seat-ticket), so neither side can impose it on the other.
  const consents = tickets.filter((t) => t.double_down && (t.uid === player1Uid || t.uid === player2Uid));
  const bonus = winnerUid !== 'DRAW' && consents.length === 2 ? DOUBLE_DOWN_BONUS : 0;

  const delta1 = ratingDelta(score1, player1.elo, player2.elo) + (score1 === 1 ? bonus : -bonus);
  const delta2 = ratingDelta(score2, player2.elo, player1.elo) + (score2 === 1 ? bonus : -bonus);
  const callerDelta = callerId === player1Uid ? delta1 : delta2;

  // Every rated result, whichever way it goes, needs both players seated in
  // this game on opposite seats. A claim keeps its old code, which the
  // deployed client keeps and sends again once tickets arrive.
  if (!seated) {
    return json(
      {
        error: 'Both players need a seat ticket for this game, on opposite seats',
        code: callerDelta > 0 ? 'caller_would_gain' : 'seat_tickets_missing',
      },
      403,
    );
  }

  // The game has to look like one. The ticket clock is the server's own.
  const ticketTimes = tickets.map((t) => Date.parse(t.created_at)).filter((ms) => Number.isFinite(ms));
  const secondsSinceFirstTicket = ticketTimes.length ? (Date.now() - Math.min(...ticketTimes)) / 1000 : 0;
  if (isGameTooShort(shape, secondsSinceFirstTicket)) {
    return json({ error: 'Too short to be rated', code: 'game_too_short' }, 422);
  }

  // When the other player has already reported this game, both reports have
  // to describe the same game.
  const { data: otherClaims } = await admin
    .from('gomoku_match_claims')
    .select('move_count, duration_ms')
    .eq('game_id', gameId)
    .neq('claimant_uid', callerId);
  const mismatch = (otherClaims ?? []).some((c) =>
    shapesDisagree(shape, { moveCount: c.move_count ?? null, durationMs: c.duration_ms ?? null } as GameShape));
  if (mismatch) {
    await admin.from('gomoku_match_claims').update({ status: 'disputed' }).eq('game_id', gameId).eq('status', 'pending');
    return json({ error: 'The two players reported different games', code: 'shape_mismatch' }, 409);
  }

  // A result that favours the caller is only ever a claim. The finaliser
  // applies the pair limits when it records it.
  if (callerDelta > 0) {
    const { data: claim, error: claimError } = await admin
      .from('gomoku_match_claims')
      .upsert({
        game_id: gameId,
        claimant_uid: callerId,
        mode,
        board_size: boardSize,
        winner_uid: winnerUid,
        player1_uid: player1Uid,
        player1_name: player1.name,
        player2_uid: player2Uid,
        player2_name: player2.name,
        seat_log: seatLog,
        move_count: shape.moveCount,
        duration_ms: shape.durationMs,
      }, { onConflict: 'game_id,claimant_uid', ignoreDuplicates: true })
      .select('confirm_after');
    if (claimError) return json({ error: 'Could not record the claim', detail: claimError.message }, 500);
    return json({ ok: true, pending: true, confirmAfter: claim?.[0]?.confirm_after ?? null });
  }

  // Per-pair daily limits, counted by the same SQL the claim finaliser uses.
  const { data: statsRows, error: statsError } = await admin.rpc('gomoku_pair_day_stats', { uid_a: player1Uid, uid_b: player2Uid });
  if (statsError) return json({ error: 'Could not read the pair limits', detail: statsError.message }, 500);
  const stats = Array.isArray(statsRows) ? statsRows[0] : statsRows;
  const decision = applyPairLimits(delta1, delta2, {
    ratedGames: Number(stats?.rated_games ?? 0),
    gained1: Number(stats?.gained_a ?? 0),
    gained2: Number(stats?.gained_b ?? 0),
  });
  const final1 = decision.rated ? decision.delta1 : 0;
  const final2 = decision.rated ? decision.delta2 : 0;

  const { data: inserted, error: insertError } = await admin
    .from('gomoku_matches')
    .insert({
      mode,
      board_size: boardSize,
      winner_uid: winnerUid,
      player1_uid: player1Uid,
      player1_name: player1.name,
      player2_uid: player2Uid,
      player2_name: player2.name,
      elo_delta_player1: final1,
      elo_delta_player2: final2,
      timestamp: new Date().toISOString(),
      game_id: gameId,
      ...(seatLog ? { seat_log: seatLog } : {}),
      ...(shape.moveCount !== null ? { moves_count: shape.moveCount } : {}),
      ...(shape.durationMs !== null ? { duration_seconds: Math.round(shape.durationMs / 1000) } : {}),
      ...(decision.rated ? {} : { unrated_reason: decision.code }),
    })
    .select('id')
    .single();

  if (insertError) {
    // Two submissions of one game can both pass the check above; the unique
    // index lets exactly one of them in, and the ratings are applied only for it.
    if (insertError.code === '23505') {
      const { data: first } = await admin.from('gomoku_matches').select('id').eq('game_id', gameId).limit(1);
      return json({ ok: true, duplicate: true, matchId: first?.[0]?.id });
    }
    return json({ error: 'Could not record the match', detail: insertError.message }, 500);
  }

  // The loser has conceded, so any claim still waiting on this game is settled.
  await admin.from('gomoku_match_claims').update({ status: 'superseded' }).eq('game_id', gameId).eq('status', 'pending');

  // An unrated game is on record for history only: no Elo, and no W/L/D or
  // streak either, so the limits protect the win counts as well.
  const applyStats = async (uid: string, delta: number) => {
    const current = ratings.get(uid);
    if (!current) return null;
    if (!decision.rated) return current.elo;

    const won = winnerUid === uid;
    const drew = winnerUid === 'DRAW';
    const nextElo = Math.max(100, current.elo + delta);

    await admin
      .from('gomoku_users')
      .update({
        elo: nextElo,
        wins: current.wins + (won ? 1 : 0),
        losses: current.losses + (!won && !drew ? 1 : 0),
        draws: current.draws + (drew ? 1 : 0),
        // Signed: +N is N wins in a row, -N is N losses in a row; a draw resets it.
        streak: drew ? 0 : won ? Math.max(current.streak, 0) + 1 : Math.min(current.streak, 0) - 1,
        updated_at: new Date().toISOString(),
      })
      .eq('uid', uid);

    return nextElo;
  };

  const [newElo1, newElo2] = await Promise.all([
    applyStats(player1Uid, final1),
    applyStats(player2Uid, final2),
  ]);

  return json({
    ok: true,
    matchId: inserted?.id,
    ...(decision.rated ? {} : { unrated: true, code: decision.code }),
    player1: { delta: final1, elo: newElo1 },
    player2: { delta: final2, elo: newElo2 },
  });
});
