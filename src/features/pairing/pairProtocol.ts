/**
 * Wire protocol between a paired phone and the desktop that hosts the game.
 * Both sides talk over one private Realtime broadcast channel per pairing
 * session; every message carries the phoneId so a desktop can tell the phone
 * it paired with from a stale or replaced one. Anything arriving on the wire
 * is untrusted, so parsePairMessage rebuilds a typed message from known
 * fields only and returns null for anything else — it never throws.
 */

export type PairRejectReason = 'expired' | 'used';
export type PairEndReason = 'replaced' | 'game_ended' | 'unpaired' | 'desktop_closed';
export type PairSnapshotKind = 'room' | 'practice';

export type PairMessage =
  // phone → desktop
  | { t: 'hello'; phoneId: string; secret: string }
  | { t: 'call'; phoneId: string; method: string; args: unknown[] }
  | { t: 'ping'; phoneId: string }
  | { t: 'bye'; phoneId: string }
  // desktop → phone
  | { t: 'welcome'; phoneId: string }
  | { t: 'reject'; phoneId: string; reason: PairRejectReason }
  | { t: 'snapshot'; phoneId: string; seq: number; kind: PairSnapshotKind; data: unknown }
  | { t: 'chatImage'; phoneId: string; id: string; image: string }
  | { t: 'end'; phoneId: string; reason: PairEndReason };

/** Largest accepted JSON size of a `call` message's args. */
const MAX_CALL_ARGS_JSON_LENGTH = 65536;

const REJECT_REASONS: readonly string[] = ['expired', 'used'];
const END_REASONS: readonly string[] = ['replaced', 'game_ended', 'unpaired', 'desktop_closed'];
const SNAPSHOT_KINDS: readonly string[] = ['room', 'practice'];

export const pairTopic = (uid: string, sessionId: string): string => `pair:${uid}:${sessionId}`;

const isString = (v: unknown): v is string => typeof v === 'string';

const argsWithinLimit = (args: unknown[]): boolean => {
  try {
    const json = JSON.stringify(args);
    return json !== undefined && json.length <= MAX_CALL_ARGS_JSON_LENGTH;
  } catch {
    // Cyclic or BigInt values cannot travel over the wire anyway.
    return false;
  }
};

export const parsePairMessage = (raw: unknown): PairMessage | null => {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const m = raw as Record<string, unknown>;
  const { phoneId } = m;
  if (!isString(phoneId)) return null;

  switch (m.t) {
    case 'hello':
      return isString(m.secret) ? { t: 'hello', phoneId, secret: m.secret } : null;
    case 'call':
      return isString(m.method) && Array.isArray(m.args) && argsWithinLimit(m.args)
        ? { t: 'call', phoneId, method: m.method, args: m.args }
        : null;
    case 'ping':
      return { t: 'ping', phoneId };
    case 'bye':
      return { t: 'bye', phoneId };
    case 'welcome':
      return { t: 'welcome', phoneId };
    case 'reject':
      return isString(m.reason) && REJECT_REASONS.includes(m.reason)
        ? { t: 'reject', phoneId, reason: m.reason as PairRejectReason }
        : null;
    case 'snapshot':
      return typeof m.seq === 'number' &&
        Number.isFinite(m.seq) &&
        isString(m.kind) &&
        SNAPSHOT_KINDS.includes(m.kind)
        ? { t: 'snapshot', phoneId, seq: m.seq, kind: m.kind as PairSnapshotKind, data: m.data }
        : null;
    case 'chatImage':
      return isString(m.id) && isString(m.image)
        ? { t: 'chatImage', phoneId, id: m.id, image: m.image }
        : null;
    case 'end':
      return isString(m.reason) && END_REASONS.includes(m.reason)
        ? { t: 'end', phoneId, reason: m.reason as PairEndReason }
        : null;
    default:
      return null;
  }
};
