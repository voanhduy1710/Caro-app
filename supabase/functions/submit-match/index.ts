import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

/**
 * Records a finished match and updates both players' ratings.
 *
 * Ratings are computed here from the values already stored in the database, so
 * a client cannot decide its own ELO. The caller must also be one of the two
 * players, proven by their own session. Version 1 trusted any caller, which let
 * anyone holding the public anon key post fabricated results against any
 * registered player and walk their rating down to the floor, without ever
 * playing them. Games between two guests are unrated and stay on the players'
 * devices, since no guest has a session to prove who they are.
 *
 * verify_jwt stays off at the gateway: the anon key is itself a valid JWT, so
 * the gateway check would admit every caller anyway. The real check is the user
 * lookup below.
 */

const K_FACTOR = 32;
const SAFE_UID = /^[A-Za-z0-9_-]{1,128}$/;
const DUPLICATE_WINDOW_MS = 5000;

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

  // Reject an accidental double submission of the same game.
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

  const elo1 = ratings.get(player1Uid)?.elo ?? 1200;
  const elo2 = ratings.get(player2Uid)?.elo ?? 1200;

  const score1 = winnerUid === 'DRAW' ? 0.5 : winnerUid === player1Uid ? 1 : 0;
  const score2 = 1 - score1;

  const delta1 = Math.round(K_FACTOR * (score1 - expectedScore(elo1, elo2)));
  const delta2 = Math.round(K_FACTOR * (score2 - expectedScore(elo2, elo1)));

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
    })
    .select('id')
    .single();

  if (insertError) {
    return json({ error: 'Could not record the match', detail: insertError.message }, 500);
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
