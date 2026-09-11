import { supabase, isSupabaseConfigured } from '../../config/supabase';
import type { MatchRecord } from './types';

const LOCAL_HISTORY_KEY = 'caro_app_match_history';

export interface SaveMatchOutcome {
  eloDeltaPlayer1: number;
  eloDeltaPlayer2: number;
}

/**
 * Records a finished match.
 *
 * The write goes through the submit-match edge function, which recomputes the
 * ratings from the values already in the database. The client used to insert the
 * row and its own ELO numbers directly, so any player could award themselves any
 * rating they liked.
 */
export const saveMatchRecord = async (
  record: Omit<MatchRecord, 'id' | 'timestamp'>,
  options: { localOnly?: boolean } = {}
): Promise<SaveMatchOutcome | null> => {
  const timestamp = Date.now();
  const fullRecord: MatchRecord = {
    ...record,
    id: 'match_' + Math.random().toString(36).substring(2, 9),
    timestamp,
  };

  // Always keep a local copy so history works offline too.
  try {
    const existing = localStorage.getItem(LOCAL_HISTORY_KEY);
    const historyList: MatchRecord[] = existing ? JSON.parse(existing) : [];
    historyList.unshift(fullRecord);
    localStorage.setItem(LOCAL_HISTORY_KEY, JSON.stringify(historyList.slice(0, 50)));
  } catch (e) {
    console.warn('Failed to save match history to localStorage:', e);
  }

  // Practice games have no second player and no rating at stake, so there is
  // nothing for the server to verify. They live on this device only.
  if (options.localOnly) return { eloDeltaPlayer1: 0, eloDeltaPlayer2: 0 };

  if (!isSupabaseConfigured || !supabase) return null;

  try {
    const { data, error } = await supabase.functions.invoke('submit-match', {
      body: {
        mode: record.mode ?? 'pvp',
        boardSize: record.boardSize,
        winnerUid: record.winnerUid,
        player1Uid: record.player1Uid,
        player1Name: record.player1Name,
        player2Uid: record.player2Uid,
        player2Name: record.player2Name,
        ...(record.gameId ? { gameId: record.gameId } : {}),
        ...(record.seatLog !== undefined ? { seatLog: record.seatLog } : {}),
      },
    });

    if (error) {
      console.error('submit-match failed:', error.message);
      return null;
    }
    if (data?.error) {
      console.error('submit-match rejected the result:', data.error);
      return null;
    }

    return {
      eloDeltaPlayer1: data?.player1?.delta ?? 0,
      eloDeltaPlayer2: data?.player2?.delta ?? 0,
    };
  } catch (err) {
    console.error('submit-match request threw:', err);
    return null;
  }
};

/** PostgREST filters are comma and dot delimited, so only these may be inlined. */
const SAFE_UID = /^[A-Za-z0-9_-]{1,128}$/;

/** Records stored on this device that belong to the player who is asking. */
const readLocalHistory = (userUid: string): MatchRecord[] => {
  try {
    const existing = localStorage.getItem(LOCAL_HISTORY_KEY);
    const all: MatchRecord[] = existing ? JSON.parse(existing) : [];
    if (!Array.isArray(all)) return [];
    // Several accounts can share one browser, so a record only belongs to the
    // current player if their id is actually on it.
    return all.filter((m) => m.player1Uid === userUid || m.player2Uid === userUid);
  } catch {
    return [];
  }
};

export const fetchUserMatchHistory = async (userUid: string): Promise<MatchRecord[]> => {
  const local = readLocalHistory(userUid);

  // Check Supabase if configured
  if (isSupabaseConfigured && supabase && userUid && SAFE_UID.test(userUid) && !userUid.startsWith('guest_')) {
    const sb = supabase;
    try {
      const { data, error } = await sb
        .from('gomoku_matches')
        .select('*')
        .or(`player1_uid.eq.${userUid},player2_uid.eq.${userUid}`)
        .order('timestamp', { ascending: false })
        .limit(20);

      if (error) {
        console.warn('Supabase fetch match history error:', error);
      } else if (data) {
        const records: MatchRecord[] = data.map((row) => ({
          id: row.id,
          boardSize: row.board_size ?? 15,
          mode: row.mode ?? 'pvp',
          timerConfig: 'Blitz (15s)',
          winnerUid: row.winner_uid,
          winnerName: row.winner_uid === row.player1_uid ? row.player1_name : (row.winner_uid === row.player2_uid ? row.player2_name : 'DRAW'),
          player1Uid: row.player1_uid,
          player1Name: row.player1_name,
          player2Uid: row.player2_uid,
          player2Name: row.player2_name,
          eloDeltaPlayer1: row.elo_delta_player1 ?? 0,
          eloDeltaPlayer2: row.elo_delta_player2 ?? 0,
          timestamp: new Date(row.timestamp).getTime(),
          gameId: row.game_id ?? undefined,
        }));

        // Practice games are never sent to the server, and an online game whose
        // rating could not be recorded only exists here, so both are merged in.
        // A game the server does have is shown once, from the server.
        const onServer = new Set(records.map((r) => r.gameId).filter(Boolean));
        const localOnly = local.filter((m) => m.mode === 'ai' || (m.gameId !== undefined && !onServer.has(m.gameId)));
        return [...records, ...localOnly].sort((a, b) => b.timestamp - a.timestamp);
      }
    } catch (e) {
      console.warn('Supabase fetch match history exception, returning local history:', e);
    }
  }

  return local.sort((a, b) => b.timestamp - a.timestamp);
};

/* -------------------------------------------------------------------------
   Rated results from a room (room v2)

   submit-match records a result at once when it comes from the player it does
   not favour. From the player it favours it is only a claim, recorded ten
   minutes later unless disputed, and only when both players hold a seat ticket
   for the game. Both seated registered players therefore always submit, and a
   client that cannot confirm the result on its own copy of the game disputes it.
   ------------------------------------------------------------------------- */

/** The body a room sends to submit-match. */
export interface RatedResultBody {
  mode: 'pvp';
  boardSize: number;
  /** A player's uid, or 'DRAW'. */
  winnerUid: string;
  player1Uid: string;
  player1Name: string;
  player2Uid: string;
  player2Name: string;
  gameId: string;
  seatLog?: unknown;
  dispute?: boolean;
}

export type RatedSubmitOutcome =
  | { status: 'saved'; deltas: { player1: number; player2: number } }
  | { status: 'duplicate' }
  | { status: 'pending_claim'; confirmAfter: string | null }
  | { status: 'disputed' }
  | { status: 'refused'; code: string }
  | { status: 'failed'; why: string }
  | { status: 'network' };

const PENDING_RATINGS_KEY = 'caro_pending_ratings';
/** Long enough to outlive a closed laptop, short enough that nothing stale is replayed. */
const PENDING_MAX_AGE_MS = 24 * 60 * 60 * 1000;

interface PendingRatedResult {
  body: RatedResultBody;
  createdAt: number;
}

const pendingKey = (body: RatedResultBody) => `${body.gameId}:${body.dispute ? 'dispute' : 'result'}`;

const readPending = (): PendingRatedResult[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem(PENDING_RATINGS_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((e) => e && e.body && typeof e.body.gameId === 'string') : [];
  } catch {
    return [];
  }
};

const writePending = (entries: PendingRatedResult[]) => {
  try {
    if (entries.length) localStorage.setItem(PENDING_RATINGS_KEY, JSON.stringify(entries));
    else localStorage.removeItem(PENDING_RATINGS_KEY);
  } catch {
    // Storage full or blocked: the submission is still attempted, just not kept.
  }
};

const rememberPending = (body: RatedResultBody) => {
  const key = pendingKey(body);
  writePending([...readPending().filter((e) => pendingKey(e.body) !== key), { body, createdAt: Date.now() }]);
};

const forgetPending = (body: RatedResultBody) => {
  const key = pendingKey(body);
  writePending(readPending().filter((e) => pendingKey(e.body) !== key));
};

/** Signed out mid-flight: worth sending again once the player is back. */
const worthKeeping = (outcome: RatedSubmitOutcome) =>
  outcome.status === 'network' || (outcome.status === 'refused' && outcome.code === 'http_401');

const postRatedResult = async (body: RatedResultBody): Promise<RatedSubmitOutcome> => {
  if (!isSupabaseConfigured || !supabase) return { status: 'failed', why: 'not_configured' };
  try {
    const { data, error } = await supabase.functions.invoke('submit-match', { body });
    if (error) {
      // An HTTP error carries the Response; a fetch error means none arrived.
      const response = (error as { context?: unknown }).context as Response | undefined;
      if (!response || typeof response.status !== 'number') return { status: 'network' };
      let payload: { code?: string; error?: string } = {};
      try {
        payload = await response.json();
      } catch {
        // No JSON body: the status alone has to do.
      }
      if (response.status >= 500) return { status: 'failed', why: payload.error || `HTTP ${response.status}` };
      return { status: 'refused', code: payload.code || `http_${response.status}` };
    }
    if (data?.disputed) return { status: 'disputed' };
    if (data?.pending) return { status: 'pending_claim', confirmAfter: data.confirmAfter ?? null };
    if (data?.duplicate) return { status: 'duplicate' };
    if (data?.ok) {
      return { status: 'saved', deltas: { player1: data.player1?.delta ?? 0, player2: data.player2?.delta ?? 0 } };
    }
    return { status: 'failed', why: data?.error || 'unexpected_response' };
  } catch {
    return { status: 'network' };
  }
};

/**
 * Sends a rated result or a dispute. It is written to this device first, so a
 * tab closed mid-request is sent again the next time the player opens the app:
 * an accidental close costs nobody a rating, in either direction.
 */
export const submitRatedResult = async (body: RatedResultBody): Promise<RatedSubmitOutcome> => {
  rememberPending(body);
  const outcome = await postRatedResult(body);
  if (!worthKeeping(outcome)) forgetPending(body);
  return outcome;
};

let resending: Promise<void> | null = null;

/** Sends whatever an earlier session could not. Safe to call repeatedly. */
export const resendPendingRatedResults = (): Promise<void> => {
  if (resending) return resending;
  resending = (async () => {
    const now = Date.now();
    const fresh = readPending().filter((e) => now - e.createdAt < PENDING_MAX_AGE_MS);
    writePending(fresh);
    for (const entry of fresh) {
      const outcome = await postRatedResult(entry.body);
      if (!worthKeeping(outcome)) forgetPending(entry.body);
    }
  })().finally(() => {
    resending = null;
  });
  return resending;
};

/**
 * Records that this signed-in player sits in a game, so a win against them can
 * be claimed if they walk away. Quietly retried; a guest simply has no ticket.
 */
export const requestSeatTicket = async (gameId: string, seat: 'X' | 'O', roomId: string): Promise<boolean> => {
  if (!isSupabaseConfigured || !supabase) return false;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const { error } = await supabase.functions.invoke('seat-ticket', { body: { gameId, seat, roomId } });
      if (!error) return true;
      const status = ((error as { context?: unknown }).context as Response | undefined)?.status;
      // A guest, a bad request or a missing session: retrying cannot change it.
      if (typeof status === 'number' && status < 500) return false;
    } catch {
      // Network trouble: fall through to the retry.
    }
    await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
  }
  return false;
};

/**
 * Records any claims whose ten minutes are up. The database does this every
 * minute anyway; calling it before showing ratings just means the leaderboard
 * and history never lag behind a claim that is already due.
 */
export const finalizeDueClaims = async (): Promise<void> => {
  if (!isSupabaseConfigured || !supabase) return;
  try {
    await supabase.rpc('finalize_due_match_claims');
  } catch {
    // The scheduler will settle them; nothing to show the player.
  }
};
