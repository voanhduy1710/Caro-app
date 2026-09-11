import { supabase, isSupabaseConfigured } from '../../config/supabase';
import type { MatchRecord } from './types';

const LOCAL_HISTORY_KEY = 'caro_app_match_history';

export const saveMatchRecord = async (record: Omit<MatchRecord, 'id' | 'timestamp'>): Promise<void> => {
  const timestamp = Date.now();
  const fullRecord: MatchRecord = {
    ...record,
    id: 'match_' + Math.random().toString(36).substring(2, 9),
    timestamp,
  };

  // Always save to localStorage as backup
  try {
    const existing = localStorage.getItem(LOCAL_HISTORY_KEY);
    const historyList: MatchRecord[] = existing ? JSON.parse(existing) : [];
    historyList.unshift(fullRecord);
    localStorage.setItem(LOCAL_HISTORY_KEY, JSON.stringify(historyList.slice(0, 50)));
  } catch (e) {
    console.warn('Failed to save match history to localStorage:', e);
  }

  // Save to Supabase DB if configured
  if (isSupabaseConfigured && supabase) {
    const sb = supabase;
    try {
      await sb.from('gomoku_matches').insert({
        board_size: record.boardSize,
        winner_uid: record.winnerUid,
        player1_uid: record.player1Uid,
        player1_name: record.player1Name,
        player2_uid: record.player2Uid,
        player2_name: record.player2Name,
        elo_delta_player1: record.eloDeltaPlayer1,
        elo_delta_player2: record.eloDeltaPlayer2,
        timestamp: new Date().toISOString(),
      });

      // Helper function to update player stats in Supabase gomoku_users for registered users
      const updatePlayerStats = async (uid: string, displayName: string, eloDelta: number, isWin: boolean, isDraw: boolean) => {
        if (!uid || uid.startsWith('guest_') || uid === 'ai_bot') return;

        const { data: userRow } = await sb
          .from('gomoku_users')
          .select('elo, wins, losses, draws, streak, photo_url')
          .eq('uid', uid)
          .maybeSingle();

        const currentElo = userRow?.elo ?? 1200;
        const currentWins = userRow?.wins ?? 0;
        const currentLosses = userRow?.losses ?? 0;
        const currentDraws = userRow?.draws ?? 0;
        const currentStreak = userRow?.streak ?? 0;

        await sb.from('gomoku_users').upsert({
          uid: uid,
          display_name: displayName,
          photo_url: userRow?.photo_url || '/Avatar/Zerom.gif',
          elo: currentElo + eloDelta,
          wins: currentWins + (isWin ? 1 : 0),
          losses: currentLosses + (!isWin && !isDraw ? 1 : 0),
          draws: currentDraws + (isDraw ? 1 : 0),
          streak: isWin ? currentStreak + 1 : 0,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'uid' });
      };

      await updatePlayerStats(
        record.player1Uid,
        record.player1Name,
        record.eloDeltaPlayer1,
        record.winnerUid === record.player1Uid,
        record.winnerUid === 'DRAW'
      );

      await updatePlayerStats(
        record.player2Uid,
        record.player2Name,
        record.eloDeltaPlayer2,
        record.winnerUid === record.player2Uid,
        record.winnerUid === 'DRAW'
      );
    } catch (err) {
      console.error('Supabase saveMatchRecord error:', err);
    }
  }
};

export const fetchUserMatchHistory = async (userUid: string): Promise<MatchRecord[]> => {
  // Check Supabase if configured
  if (isSupabaseConfigured && supabase && userUid && !userUid.startsWith('guest_')) {
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
      } else if (data && data.length > 0) {
        const records: MatchRecord[] = data.map((row) => ({
          id: row.id,
          boardSize: row.board_size ?? 15,
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
        return records;
      }
    } catch (e) {
      console.warn('Supabase fetch match history exception, returning local history:', e);
    }
  }

  // Fallback to local storage history
  try {
    const existing = localStorage.getItem(LOCAL_HISTORY_KEY);
    return existing ? JSON.parse(existing) : [];
  } catch {
    return [];
  }
};
