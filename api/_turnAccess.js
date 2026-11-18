/**
 * Who may get TURN credentials from /api/turn. Pure helpers, kept apart from
 * the route so vitest can test them (_turnAccess.test.js). The leading
 * underscore keeps Vercel from serving this file as a route.
 *
 * - A caller with a valid Supabase session (Authorization: Bearer <access
 *   token>) gets credentials for SIGNED_IN_TTL_SECONDS.
 * - Guests have no Supabase session at all (they live in localStorage), so a
 *   caller without one is accepted only from the app's own pages: an Origin in
 *   TURN_ALLOWED_ORIGINS (comma separated; when unset, the request's own host),
 *   or, for a same-origin GET that carries no Origin, Sec-Fetch-Site:
 *   same-origin or a Referer from an allowed origin. These headers stop other
 *   web pages from using the relay; a script outside a browser can forge them,
 *   which is why guests get a shorter TTL and every caller is rate limited.
 */

export const SIGNED_IN_TTL_SECONDS = 60 * 60;
export const GUEST_TTL_SECONDS = 30 * 60;
/** Per client IP, per warm function instance: a brake, not a guarantee. */
export const RATE_LIMIT_MAX = 20;
export const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

export const bearerToken = (header) => {
  if (typeof header !== 'string') return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match ? match[1] : null;
};

const originOf = (value) => {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
};

export const parseAllowList = (value) =>
  (typeof value === 'string' ? value : '')
    .split(',')
    .map((entry) => originOf(entry.trim()))
    .filter(Boolean);

/**
 * @param {{ origin?: string|null, secFetchSite?: string|null, referer?: string|null, host?: string|null, allowList: string[] }} request
 */
export const isAllowedPageRequest = ({ origin, secFetchSite, referer, host, allowList }) => {
  const allowed = (candidate) => {
    const o = candidate ? originOf(candidate) : null;
    if (!o) return false;
    if (allowList.length > 0) return allowList.includes(o);
    return Boolean(host) && new URL(o).host === host;
  };
  if (origin) return allowed(origin);
  if (secFetchSite === 'same-origin') return true;
  if (referer) return allowed(referer);
  return false;
};

/** A fixed-window counter per key. */
export const createRateLimiter = (max = RATE_LIMIT_MAX, windowMs = RATE_LIMIT_WINDOW_MS) => {
  const hits = new Map();
  return (key, now = Date.now()) => {
    const entry = hits.get(key);
    if (!entry || now - entry.start >= windowMs) {
      if (hits.size > 5000) hits.clear();
      hits.set(key, { start: now, count: 1 });
      return true;
    }
    entry.count += 1;
    return entry.count <= max;
  };
};

export const clientIp = (headers) => {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return headers.get('x-real-ip') || 'unknown';
};
