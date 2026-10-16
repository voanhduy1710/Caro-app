import { supabase, isSupabaseConfigured } from '../../config/supabase';
import type { MatchRecord } from './types';

/**
 * Practice games against the bot, mirrored to gomoku_practice_matches.
 *
 * Every practice game is still written to localStorage first, so it shows up at
 * once and survives being offline. This module copies those local records to
 * the database for the signed-in player, including any played before the table
 * existed. The upload is keyed on (uid, client_id) and ignores duplicates, so it
 * is safe to run on every visit and after every game.
 */

export const LOCAL_HISTORY_KEY = 'caro_app_match_history';
export const AI_BOT_UID = 'ai_bot';

const SAFE_UID = /^[A-Za-z0-9_-]{1,128}$/;
/** The table accepts board sizes in this range; anything else is a corrupt record. */
const MIN_BOARD = 5;
const MAX_BOARD = 30;

interface PracticeRow {
  uid: string;
  client_id: string;
  player_name: string;
  result: 'win' | 'loss' | 'draw';
  board_size: number;
  timer_config: string | null;
  played_at: string;
}

const canSync = (uid: string) =>
  isSupabaseConfigured && !!supabase && SAFE_UID.test(uid) && !uid.startsWith('guest_');

const readLocalRecords = (): MatchRecord[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem(LOCAL_HISTORY_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

/** This player's local practice games, as table rows. Malformed records are skipped. */
export const localPracticeRows = (uid: string, records: MatchRecord[] = readLocalRecords()): PracticeRow[] => {
  const now = Date.now();
  return records.flatMap((m) => {
    if (!m || m.mode !== 'ai' || m.player1Uid !== uid) return [];
    if (typeof m.id !== 'string' || !m.id || m.id.length > 64) return [];
    if (typeof m.timestamp !== 'number' || !Number.isFinite(m.timestamp) || m.timestamp > now + 60_000) return [];
    const boardSize = Number(m.boardSize);
    if (!Number.isInteger(boardSize) || boardSize < MIN_BOARD || boardSize > MAX_BOARD) return [];
    const result = m.winnerUid === 'DRAW' || m.winnerUid == null ? 'draw' : m.winnerUid === uid ? 'win' : 'loss';
    return [{
      uid,
      client_id: m.id,
      player_name: String(m.player1Name || 'Player').slice(0, 64),
      result,
      board_size: boardSize,
      timer_config: m.timerConfig ? String(m.timerConfig).slice(0, 32) : null,
      played_at: new Date(m.timestamp).toISOString(),
    }];
  });
};

const inFlight = new Map<string, Promise<void>>();

/**
 * Uploads this player's local practice games. Concurrent calls for one player
 * share a single request. Failures are quiet: the records stay local and the
 * next call sends them again.
 */
export const syncPracticeHistory = (uid: string): Promise<void> => {
  if (!canSync(uid)) return Promise.resolve();
  const running = inFlight.get(uid);
  if (running) return running;

  const task = (async () => {
    const rows = localPracticeRows(uid);
    if (!rows.length || !supabase) return;
    // A session for another account cannot write these rows (RLS), so do not try.
    const { data } = await supabase.auth.getSession();
    if (data.session?.user.id !== uid) return;
    const { error } = await supabase
      .from('gomoku_practice_matches')
      .upsert(rows, { onConflict: 'uid,client_id', ignoreDuplicates: true });
    if (error) console.warn('Practice history sync failed:', error.message);
  })()
    .catch((e) => console.warn('Practice history sync threw:', e))
    .finally(() => inFlight.delete(uid));

  inFlight.set(uid, task);
  return task;
};

/** This player's practice games from the database, newest first. */
export const fetchPracticeHistory = async (uid: string, limit = 20): Promise<MatchRecord[] | null> => {
  if (!canSync(uid) || !supabase) return null;
  try {
    const { data, error } = await supabase
      .from('gomoku_practice_matches')
      .select('client_id, player_name, result, board_size, timer_config, played_at')
      .eq('uid', uid)
      .order('played_at', { ascending: false })
      .limit(limit);
    if (error) {
      console.warn('Supabase fetch practice history error:', error);
      return null;
    }
    return (data ?? []).map((row) => {
      const winnerUid = row.result === 'draw' ? 'DRAW' : row.result === 'win' ? uid : AI_BOT_UID;
      return {
        // The local id, so the same game held locally and remotely is shown once.
        id: row.client_id,
        mode: 'ai',
        player1Uid: uid,
        player1Name: row.player_name,
        player2Uid: AI_BOT_UID,
        player2Name: 'AI Bot',
        winnerUid,
        winnerName: row.result === 'draw' ? 'DRAW' : row.result === 'win' ? row.player_name : 'AI Bot',
        boardSize: row.board_size,
        timerConfig: row.timer_config ?? '',
        eloDeltaPlayer1: 0,
        eloDeltaPlayer2: 0,
        timestamp: new Date(row.played_at).getTime(),
      } satisfies MatchRecord;
    });
  } catch (e) {
    console.warn('Supabase fetch practice history exception:', e);
    return null;
  }
};
