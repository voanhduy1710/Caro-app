/**
 * Who may be rated, and how much, for a result submit-match is asked to
 * record. Pure and dependency-free so vitest can test it (see rules.test.ts);
 * index.ts does the database reads and writes.
 *
 * public.finalize_due_match_claims applies the same rules to claimed results
 * (migration 20261118000400_rated_match_limits.sql). Keep the constants there
 * in step with these.
 */

/** At most this many rated games per UTC day between the same two accounts, either order. */
export const PAIR_DAILY_RATED_LIMIT = 10;
/** At most this much Elo one account can gain from one opponent per UTC day. */
export const PAIR_DAILY_GAIN_CAP = 60;
/** A rated game has at least this many moves... */
export const MIN_RATED_MOVES = 9;
/** ...and lasts at least this long. */
export const MIN_RATED_SECONDS = 20;
/** How far two players' reports of the same game's duration may differ. */
export const DURATION_TOLERANCE_MS = 5_000;

/** Response codes the client can show. */
export type RatingCode =
  | 'no_game_id'
  | 'seat_tickets_missing'
  | 'game_too_short'
  | 'shape_mismatch'
  | 'pair_daily_limit'
  | 'pair_gain_cap';

export interface SeatTicket {
  uid: string;
  seat: string;
}

/** Both players hold a ticket for the game, and on opposite seats. */
export const ticketsOnOppositeSeats = (tickets: SeatTicket[], uidA: string, uidB: string): boolean => {
  if (uidA === uidB) return false;
  const a = tickets.find((t) => t.uid === uidA);
  const b = tickets.find((t) => t.uid === uidB);
  return !!a && !!b && (a.seat === 'X' || a.seat === 'O') && (b.seat === 'X' || b.seat === 'O') && a.seat !== b.seat;
};

/** What a client reports about the game's length. Missing on clients older than these fields. */
export interface GameShape {
  moveCount: number | null;
  durationMs: number | null;
}

const MAX_MOVES = 100 * 100;
const MAX_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Reads `moveCount` and `durationMs` from a request body. Absent (an older
 * client) is null; present but malformed is an error, so a bad value is never
 * mistaken for an old client.
 */
export const parseGameShape = (body: Record<string, unknown>): GameShape | 'invalid' => {
  const read = (value: unknown, max: number): number | null | 'invalid' => {
    if (value === undefined || value === null) return null;
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > max) return 'invalid';
    return value;
  };
  const moveCount = read(body.moveCount, MAX_MOVES);
  const durationMs = read(body.durationMs, MAX_DURATION_MS);
  if (moveCount === 'invalid' || durationMs === 'invalid') return 'invalid';
  return { moveCount, durationMs };
};

/**
 * Is the game long enough to be rated? `secondsSinceFirstTicket` is measured
 * on the server, from the earlier of the two players' seat tickets to now, so
 * it holds whatever the client says. The client's own move count and duration
 * are checked when sent; a client that sends neither (the build deployed
 * before these fields existed) is let through on the server's clock alone.
 */
export const isGameTooShort = (shape: GameShape, secondsSinceFirstTicket: number): boolean => {
  if (!(secondsSinceFirstTicket >= MIN_RATED_SECONDS)) return true;
  if (shape.moveCount !== null && shape.moveCount < MIN_RATED_MOVES) return true;
  if (shape.durationMs !== null && shape.durationMs < MIN_RATED_SECONDS * 1000) return true;
  return false;
};

/**
 * Two players' reports of the same game disagree. Both clients mirror the same
 * host, so an honest pair reports the same move count; only values both sent
 * are compared.
 */
export const shapesDisagree = (a: GameShape, b: GameShape): boolean => {
  if (a.moveCount !== null && b.moveCount !== null && a.moveCount !== b.moveCount) return true;
  if (a.durationMs !== null && b.durationMs !== null && Math.abs(a.durationMs - b.durationMs) > DURATION_TOLERANCE_MS) return true;
  return false;
};

/** Today's (UTC) rated games between the pair, and what each has gained from the other. */
export interface PairDayStats {
  ratedGames: number;
  gained1: number;
  gained2: number;
}

export type PairDecision =
  | { rated: true; delta1: number; delta2: number }
  | { rated: false; code: 'pair_daily_limit' | 'pair_gain_cap' };

/**
 * Applies the per-pair daily limits to a game's rating changes.
 *
 * - The 11th rated game of the day between two accounts is recorded unrated.
 * - A player whose gain would pass the daily cap against this opponent gets
 *   only what is left of it, and the opponent loses no more than that; with
 *   nothing left the game is recorded unrated.
 */
export const applyPairLimits = (delta1: number, delta2: number, stats: PairDayStats): PairDecision => {
  if (stats.ratedGames >= PAIR_DAILY_RATED_LIMIT) return { rated: false, code: 'pair_daily_limit' };
  let d1 = delta1;
  let d2 = delta2;
  if (d1 > 0) {
    const room = PAIR_DAILY_GAIN_CAP - stats.gained1;
    if (room <= 0) return { rated: false, code: 'pair_gain_cap' };
    if (d1 > room) {
      d1 = room;
      if (d2 < 0) d2 = Math.max(d2, -room);
    }
  }
  if (d2 > 0) {
    const room = PAIR_DAILY_GAIN_CAP - stats.gained2;
    if (room <= 0) return { rated: false, code: 'pair_gain_cap' };
    if (d2 > room) {
      d2 = room;
      if (d1 < 0) d1 = Math.max(d1, -room);
    }
  }
  return { rated: true, delta1: d1, delta2: d2 };
};

/** A display name from gomoku_users, made safe to store on a match row. */
export const storedName = (value: unknown, fallback: string): string => {
  if (typeof value !== 'string') return fallback;
  // deno-lint-ignore no-control-regex
  const trimmed = Array.from(value.replace(/[\u0000-\u001f\u007f]/g, '').trim()).slice(0, 40).join('').trim();
  return trimmed || fallback;
};
