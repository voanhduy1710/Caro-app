/**
 * GET /api/turn — short-lived ICE servers for room peers.
 *
 * Players behind a VPN such as Cloudflare 1.1.1.1 / WARP, or a strict NAT,
 * cannot reach each other directly and need a TURN relay, ideally over TLS on
 * port 443. Cloudflare's TURN service issues per-request credentials, so the
 * key's API token stays here on the server and never ships in the bundle.
 *
 * Who gets credentials, and for how long, is in _turnAccess.js: a signed-in
 * player (Authorization: Bearer <Supabase access token>) for 1 hour; a guest,
 * who has no session, only from the app's own pages and for 30 minutes. The
 * response carries `ttlSeconds` so the client knows when to fetch again.
 *
 * Server env (Vercel project, not exposed to the bundle):
 *   CLOUDFLARE_TURN_KEY_ID     the TURN key id from the Cloudflare dashboard
 *   CLOUDFLARE_TURN_API_TOKEN  that key's API token
 *   TURN_ALLOWED_ORIGINS       optional, comma separated, e.g.
 *                              https://caro-app.vercel.app; unset = this host
 *   SUPABASE_URL / SUPABASE_ANON_KEY, or the VITE_ ones the deploy script
 *                              already syncs: used to check a session
 */
import {
  GUEST_TTL_SECONDS,
  SIGNED_IN_TTL_SECONDS,
  bearerToken,
  clientIp,
  createRateLimiter,
  isAllowedPageRequest,
  parseAllowList,
} from './_turnAccess.js';

const allowRequest = createRateLimiter();

/** True when the token is a live Supabase session. Any failure counts as no session. */
const hasSupabaseSession = async (token) => {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!token || !url || !anonKey) return false;
  try {
    const res = await fetch(`${url.replace(/\/+$/, '')}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return false;
    const user = await res.json();
    return typeof user?.id === 'string' && user.id.length > 0;
  } catch {
    return false;
  }
};

const noStore = { 'Cache-Control': 'private, no-store' };

export async function GET(request) {
  const headers = request.headers;
  // An expired or bad token falls back to the guest rules rather than failing:
  // a guest-rules caller from the app's own page still gets a relay.
  const signedIn = await hasSupabaseSession(bearerToken(headers.get('authorization')));
  if (!signedIn) {
    const pageRequest = isAllowedPageRequest({
      origin: headers.get('origin'),
      secFetchSite: headers.get('sec-fetch-site'),
      referer: headers.get('referer'),
      host: headers.get('x-forwarded-host') || headers.get('host'),
      allowList: parseAllowList(process.env.TURN_ALLOWED_ORIGINS),
    });
    if (!pageRequest) return Response.json({ iceServers: [] }, { status: 403, headers: noStore });
  }
  if (!allowRequest(clientIp(headers))) {
    return Response.json({ iceServers: [] }, { status: 429, headers: { ...noStore, 'Retry-After': '600' } });
  }

  const keyId = process.env.CLOUDFLARE_TURN_KEY_ID;
  const token = process.env.CLOUDFLARE_TURN_API_TOKEN;
  if (!keyId || !token) return Response.json({ iceServers: [] }, { status: 503, headers: noStore });
  const ttlSeconds = signedIn ? SIGNED_IN_TTL_SECONDS : GUEST_TTL_SECONDS;
  try {
    const res = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${keyId}/credentials/generate-ice-servers`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ttl: ttlSeconds }),
    });
    if (!res.ok) return Response.json({ iceServers: [] }, { status: 502, headers: noStore });
    const data = await res.json();
    const iceServers = Array.isArray(data.iceServers) ? data.iceServers : data.iceServers ? [data.iceServers] : [];
    return Response.json({ iceServers, ttlSeconds }, { headers: noStore });
  } catch {
    return Response.json({ iceServers: [] }, { status: 502, headers: noStore });
  }
}
