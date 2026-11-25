import { supabase, isSupabaseConfigured } from '../../config/supabase';
import type { UserProfile } from '../auth/AuthContext';
import { getAvatarPublicUrl } from '../avatar/avatarService';
import { DEFAULT_ELO } from '../../shared/constants';

export const fetchTopLeaderboard = async (topLimit = 20): Promise<UserProfile[]> => {
  if (!isSupabaseConfigured || !supabase) return [];
  try {
    const { data, error } = await supabase
      .from('gomoku_users')
      // Named columns, never *. The leaderboard has no use for anyone's
      // email, and asking for it kept every player's address in the page's
      // memory for any visitor holding the public anon key.
      .select('uid, username, display_name, photo_url, elo, wins, losses, draws, streak')
      .order('elo', { ascending: false })
      .limit(topLimit);

    if (error) {
      console.warn('Supabase fetch leaderboard error:', error);
      return [];
    }
    return (data ?? []).map((row) => ({
      uid: row.uid,
      username: row.username || row.display_name,
      displayName: row.display_name || row.username,
      // The stored value, not a resolved URL: every view resolves it
      // with getAvatarPublicUrl, and resolving twice turns a Ragnarok
      // GIF's storage URL into the default (storage URLs count as dead).
      photoURL: row.photo_url || getAvatarPublicUrl(),
      email: '',
      elo: row.elo ?? DEFAULT_ELO,
      wins: row.wins ?? 0,
      losses: row.losses ?? 0,
      draws: row.draws ?? 0,
      streak: row.streak ?? 0,
    }));
  } catch (e) {
    console.warn('Supabase fetch leaderboard failed:', e);
    return [];
  }
};
