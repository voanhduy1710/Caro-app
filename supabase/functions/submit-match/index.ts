import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

/**
 * Records a finished match and updates both players' ratings.
 *
 * Ratings are computed here from the values already stored in the database, so
 * a client cannot decide its own ELO. Who may record a result:
 *
 * - The caller must be one of the two players, proven by their own session,
 *   and must hold a rating of their own.
 * - A result that does not favour the caller is recorded at once: on a
 *   decisive result that is the loser, on a draw the player whose rating does
 *   not rise. Nobody fabricates a result against themselves.
 * - A result that favours the caller is only a claim. It is accepted when both
 *   players hold a seat ticket for the game (see the seat-ticket function), and
 *   it is recorded ten minutes later unless a player disputes it. A loser can no
 *   longer dodge by closing the tab before submitting, and a result can still
 *   never be recorded against an account that did not play the game.
 * - Either player may dispute a game they hold a ticket for. A disputed game
 *   counts for nobody, unless the loser later concedes it.
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

const K_FACTOR = 32;
const SAFE_UID = /^[A-Za-z0-9_-]{1,128}$/;
const GAME_ID = /^[A-Za-z0-9_-]{8,40}$/;
const DUPLICATE_WINDOW_MS = 5000;
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

const cleanName = (value: unknown, fallback: string) => {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim().slice(0, 40);
  return trimmed || fallback;
};

const expectedScore = (rating: number, opponentRating: number) =>
  1 / (1 + Math.pow(10, (opponentRating - rating) / 400));

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

  const rawGameId = body.gameId;
  const gameId = typeof rawGameId === 'string' && GAME_ID.test(rawGameId) ? rawGameId : null;
  if (rawGameId !== undefined && rawGameId !== null && gameId === null) {
    return json({ error: 'Invalid game id' }, 400);
  }
  const seatLog = body.seatLog === undefined ? null : cleanSeatLog(body.seatLog);

  const player1Name = cleanName(body.player1Name, 'Player 1');
  const player2Name = cleanName(body.player2Name, 'Player 2');

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

  // Record any claims whose window has closed before looking at this one, so a
  // quiet night without the scheduler still settles on the next game played.
  await admin.rpc('finalize_due_match_claims');

  const claimRow = (winner: string) => ({
    game_id: gameId,
    claimant_uid: callerId,
    mode,
    board_size: boardSize,
    winner_uid: winner,
    player1_uid: player1Uid,
    player1_name: player1Name,
    player2_uid: player2Uid,
    player2_name: player2Name,
    seat_log: seatLog,
  });

  // A dispute. Only a player who sat in the game may raise one, and only while
  // nothing has been recorded: the loser conceding is still honoured later.
  if (body.dispute === true) {
    if (!gameId) return json({ error: 'A dispute needs a game id' }, 400);
    const { data: ticket } = await admin
      .from('gomoku_game_seats')
      .select('uid')
      .eq('game_id', gameId)
      .eq('uid', callerId)
      .maybeSingle();
    if (!ticket) {
      return json({ error: 'Only a player who sat in this game can dispute it', code: 'no_seat_ticket' }, 403);
    }
    const { data: recorded } = await admin.from('gomoku_matches').select('id').eq('game_id', gameId).limit(1);
    if (recorded && recorded.length > 0) {
      return json({ error: 'This game is already on record', code: 'already_recorded' }, 409);
    }
    const { error: disputeError } = await admin
      .from('gomoku_match_claims')
      .upsert({ ...claimRow('DISPUTED'), status: 'disputed' }, { onConflict: 'game_id,claimant_uid' });
    if (disputeError) return json({ error: 'Could not record the dispute', detail: disputeError.message }, 500);
    await admin.from('gomoku_match_claims').update({ status: 'disputed' }).eq('game_id', gameId).eq('status', 'pending');
    return json({ ok: true, disputed: true });
  }

  // A repeat of a game already on record, checked before anything is computed:
  // both players may offer a draw, and a retry may follow a lost response.
  if (gameId) {
    const { data: existing } = await admin
      .from('gomoku_matches')
      .select('id')
      .eq('game_id', gameId)
      .limit(1);
    if (existing && existing.length > 0) {
      return json({ ok: true, duplicate: true, matchId: existing[0].id });
    }
  } else {
    // Clients that send no game id fall back to a short same-pair window.
    const since = new Date(Date.now() - DUPLICATE_WINDOW_MS).toISOString();
    const { data: recent } = await admin
      .from('gomoku_matches')
      .select('id')
      .eq('player1_uid', player1Uid)
      .eq('player2_uid', player2Uid)
      .gte('timestamp', since)
      .limit(1);
    if (recent && recent.length > 0) {
      return json({ ok: true, duplicate: true, matchId: recent[0].id });
    }
  }

  // Ratings come from the store, never from the request.
  const rated = [player1Uid, player2Uid].filter((uid) => !isGuest(uid));
  const ratings = new Map<string, { elo: number; wins: number; losses: number; draws: number; streak: number }>();

  if (rated.length > 0) {
    const { data: rows, error } = await admin
      .from('gomoku_users')
      .select('uid, elo, wins, losses, draws, streak')
      .in('uid', rated);

    if (error) return json({ error: 'Could not read ratings' }, 500);

    for (const row of rows ?? []) {
      ratings.set(row.uid, {
        elo: row.elo ?? 1200,
        wins: row.wins ?? 0,
        losses: row.losses ?? 0,
        draws: row.draws ?? 0,
        streak: row.streak ?? 0,
      });
    }
  }

  // The caller has to hold a rating of their own. Without one, "the result must
  // not raise the caller's rating" would be true of every result, and the rule
  // below would protect nobody.
  if (!ratings.has(callerId)) {
    return json({ error: 'Only a registered player can record a rated match', code: 'caller_not_rated' }, 403);
  }

  const elo1 = ratings.get(player1Uid)?.elo ?? 1200;
  const elo2 = ratings.get(player2Uid)?.elo ?? 1200;

  const score1 = winnerUid === 'DRAW' ? 0.5 : winnerUid === player1Uid ? 1 : 0;
  const score2 = 1 - score1;

  const delta1 = Math.round(K_FACTOR * (score1 - expectedScore(elo1, elo2)));
  const delta2 = Math.round(K_FACTOR * (score2 - expectedScore(elo2, elo1)));

  // A result that favours the caller is only ever a claim, and only against a
  // player who really sat in this game.
  const callerDelta = callerId === player1Uid ? delta1 : delta2;
  if (callerDelta > 0) {
    if (!gameId) {
      return json({ error: 'Only the player this result does not favour can record it', code: 'caller_would_gain' }, 403);
    }
    const { data: tickets } = await admin
      .from('gomoku_game_seats')
      .select('uid')
      .eq('game_id', gameId)
      .in('uid', [player1Uid, player2Uid]);
    if ((tickets ?? []).length < 2) {
      return json({ error: 'Both players need a seat ticket for this game', code: 'caller_would_gain' }, 403);
    }
    const { data: claim, error: claimError } = await admin
      .from('gomoku_match_claims')
      .upsert(claimRow(winnerUid), { onConflict: 'game_id,claimant_uid', ignoreDuplicates: true })
      .select('confirm_after');
    if (claimError) return json({ error: 'Could not record the claim', detail: claimError.message }, 500);
    return json({ ok: true, pending: true, confirmAfter: claim?.[0]?.confirm_after ?? null });
  }

  const { data: inserted, error: insertError } = await admin
    .from('gomoku_matches')
    .insert({
      mode,
      board_size: boardSize,
      winner_uid: winnerUid,
      player1_uid: player1Uid,
      player1_name: player1Name,
      player2_uid: player2Uid,
      player2_name: player2Name,
      elo_delta_player1: ratings.has(player1Uid) ? delta1 : 0,
      elo_delta_player2: ratings.has(player2Uid) ? delta2 : 0,
      timestamp: new Date().toISOString(),
      ...(gameId ? { game_id: gameId } : {}),
      ...(seatLog ? { seat_log: seatLog } : {}),
    })
    .select('id')
    .single();

  if (insertError) {
    // Two submissions of one game can both pass the check above; the unique
    // index lets exactly one of them in, and the ratings are applied only for it.
    if (insertError.code === '23505' && gameId) {
      const { data: first } = await admin.from('gomoku_matches').select('id').eq('game_id', gameId).limit(1);
      return json({ ok: true, duplicate: true, matchId: first?.[0]?.id });
    }
    return json({ error: 'Could not record the match', detail: insertError.message }, 500);
  }

  // The loser has conceded, so any claim still waiting on this game is settled.
  if (gameId) {
    await admin.from('gomoku_match_claims').update({ status: 'superseded' }).eq('game_id', gameId).eq('status', 'pending');
  }

  const applyStats = async (uid: string, delta: number) => {
    const current = ratings.get(uid);
    if (!current) return null;

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
        streak: won ? current.streak + 1 : 0,
        updated_at: new Date().toISOString(),
      })
      .eq('uid', uid);

    return nextElo;
  };

  const [newElo1, newElo2] = await Promise.all([
    applyStats(player1Uid, delta1),
    applyStats(player2Uid, delta2),
  ]);

  return json({
    ok: true,
    matchId: inserted?.id,
    player1: { delta: ratings.has(player1Uid) ? delta1 : 0, elo: newElo1 },
    player2: { delta: ratings.has(player2Uid) ? delta2 : 0, elo: newElo2 },
  });
});
