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
        }));

        // Practice games are never sent to the server, so the two sources have
        // to be merged or half the player's history would silently disappear.
        const practice = local.filter((m) => m.mode === 'ai');
        return [...records, ...practice].sort((a, b) => b.timestamp - a.timestamp);
      }
    } catch (e) {
      console.warn('Supabase fetch match history exception, returning local history:', e);
    }
  }

  return local.sort((a, b) => b.timestamp - a.timestamp);
};
