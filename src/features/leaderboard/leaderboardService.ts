import { supabase, isSupabaseConfigured } from '../../config/supabase';
import type { UserProfile } from '../auth/AuthContext';
import { getAvatarPublicUrl } from '../avatar/avatarService';

const MOCK_LEADERBOARD: UserProfile[] = [];

export const fetchTopLeaderboard = async (topLimit = 20): Promise<UserProfile[]> => {
  if (isSupabaseConfigured && supabase) {
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
      } else if (data && data.length > 0) {
        const uniqueProfilesMap = new Map<string, UserProfile>();
        data.forEach((row) => {
          const key = (row.uid || row.username || row.display_name).toString().toLowerCase();
          if (!uniqueProfilesMap.has(key)) {
            uniqueProfilesMap.set(key, {
              uid: row.uid,
              username: row.username || row.display_name,
              displayName: row.display_name || row.username,
              photoURL: getAvatarPublicUrl(row.photo_url),
              email: '',
              elo: row.elo ?? 1200,
              wins: row.wins ?? 0,
              losses: row.losses ?? 0,
              draws: row.draws ?? 0,
              streak: row.streak ?? 0,
            });
          }
        });
        return Array.from(uniqueProfilesMap.values());
      }
    } catch (e) {
      console.warn('Supabase fetch leaderboard failed:', e);
    }
  }

  return MOCK_LEADERBOARD;
};
