/**
 * GET /api/turn — short-lived ICE servers for room peers.
 *
 * Players behind a VPN such as Cloudflare 1.1.1.1 / WARP, or a strict NAT,
 * cannot reach each other directly and need a TURN relay, ideally over TLS on
 * port 443. Cloudflare's TURN service issues per-request credentials, so the
 * key's API token stays here on the server and never ships in the bundle.
 *
 * Server env (Vercel project, not VITE_*):
 *   CLOUDFLARE_TURN_KEY_ID     the TURN key id from the Cloudflare dashboard
 *   CLOUDFLARE_TURN_API_TOKEN  that key's API token
 */
const TTL_SECONDS = 6 * 60 * 60;

export async function GET() {
  const keyId = process.env.CLOUDFLARE_TURN_KEY_ID;
  const token = process.env.CLOUDFLARE_TURN_API_TOKEN;
  if (!keyId || !token) return Response.json({ iceServers: [] }, { status: 503 });
  try {
    const res = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${keyId}/credentials/generate-ice-servers`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ttl: TTL_SECONDS }),
    });
    if (!res.ok) return Response.json({ iceServers: [] }, { status: 502 });
    const data = await res.json();
    const iceServers = Array.isArray(data.iceServers) ? data.iceServers : data.iceServers ? [data.iceServers] : [];
    return Response.json({ iceServers }, { headers: { 'Cache-Control': 'private, max-age=600' } });
  } catch {
    return Response.json({ iceServers: [] }, { status: 502 });
  }
}
