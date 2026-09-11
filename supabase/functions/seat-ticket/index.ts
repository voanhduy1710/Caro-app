import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

/**
 * Records that the calling player sits in a game: a seat ticket.
 *
 * A winner can only record a result against a player who holds a ticket for
 * that game, so no result can ever be recorded against an account that did not
 * play it. The ticket is written through the player's own session, which is
 * the whole proof: nobody can write one on someone else's behalf.
 */

const GAME_ID = /^[A-Za-z0-9_-]{8,40}$/;
const ROOM_ID = /^[A-Z0-9]{4,12}$/;

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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Body must be JSON' }, 400);
  }

  const gameId = typeof body.gameId === 'string' && GAME_ID.test(body.gameId) ? body.gameId : null;
  const seat = body.seat === 'X' || body.seat === 'O' ? body.seat : null;
  const roomId = typeof body.roomId === 'string' && ROOM_ID.test(body.roomId) ? body.roomId : null;
  if (!gameId || !seat) return json({ error: 'A ticket needs a valid game id and seat' }, 400);

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  let callerId: string | null = null;
  if (token) {
    const { data } = await admin.auth.getUser(token);
    callerId = data.user?.id ?? null;
  }
  if (!callerId) return json({ error: 'Sign in to hold a seat ticket' }, 401);

  // Only registered players have a rating at stake, so only they need a ticket.
  const { data: profile } = await admin.from('gomoku_users').select('uid').eq('uid', callerId).maybeSingle();
  if (!profile) return json({ error: 'Only a registered player holds a seat ticket', code: 'caller_not_rated' }, 403);

  const { error } = await admin
    .from('gomoku_game_seats')
    .upsert({ game_id: gameId, uid: callerId, seat, room_id: roomId }, { onConflict: 'game_id,uid', ignoreDuplicates: true });
  if (error) return json({ error: 'Could not record the seat', detail: error.message }, 500);

  return json({ ok: true });
});
