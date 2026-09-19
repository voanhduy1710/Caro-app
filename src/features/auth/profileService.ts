import type { User as SupabaseAuthUser } from '@supabase/supabase-js';
import { supabase } from '../../config/supabase';
import { getChampionIdForSeed } from '../avatar/avatarService';
import type { UserProfile } from './authTypes';

export const fetchOrCreateProfile = async (authUser: SupabaseAuthUser): Promise<UserProfile> => {
    if (!supabase) throw new Error('Supabase not initialized');

    try {
      const { data, error } = await supabase
        .from('gomoku_users')
        // Named columns, never *. The address comes from the session below, so
        // the table's copy never has to be readable, and a select * would
        // break the moment that column is locked down.
        .select('uid, username, display_name, photo_url, elo, wins, losses, draws, streak')
        .eq('uid', authUser.id)
        .maybeSingle();

      if (error) {
        console.warn('Supabase fetch profile error:', error);
      }

      if (data) {
        return {
          uid: data.uid,
          username: data.username || authUser.user_metadata?.username,
          displayName: data.display_name || authUser.user_metadata?.full_name || 'Gomoku Master',
          // Keep the stored avatar key intact. In particular, a Ragnarok GIF is
          // saved as `ragnarok:<filename>`; resolving it to its public Storage
          // URL here loses that collection identity and made refresh fall back
          // to the default LoL avatar.
          photoURL: data.photo_url || authUser.user_metadata?.avatar_url || getChampionIdForSeed(authUser.id),
          email: authUser.email || '',
          elo: data.elo ?? 1200,
          wins: data.wins ?? 0,
          losses: data.losses ?? 0,
          draws: data.draws ?? 0,
          streak: data.streak ?? 0,
          isGuest: false,
        };
      }

      const newProfile: UserProfile = {
        uid: authUser.id,
        username: authUser.user_metadata?.username,
        displayName: authUser.user_metadata?.full_name || authUser.email?.split('@')[0] || 'Gomoku Master',
        photoURL: authUser.user_metadata?.avatar_url || getChampionIdForSeed(authUser.id),
        email: authUser.email || '',
        elo: 1200,
        wins: 0,
        losses: 0,
        draws: 0,
        streak: 0,
        isGuest: false,
      };

      // Ratings are owned by the server; the client never sends them. A missing
      // row is normally created by the on_auth_user_created trigger, so this is
      // only a fallback for accounts that predate it.
      await supabase.from('gomoku_users').upsert({
        uid: newProfile.uid,
        username: newProfile.username,
        display_name: newProfile.displayName,
        photo_url: newProfile.photoURL,
        email: newProfile.email,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'uid', ignoreDuplicates: true });

      return newProfile;
    } catch (err) {
      console.error('Error fetching or creating user profile in Supabase:', err);
      return {
        uid: authUser.id,
        displayName: authUser.user_metadata?.full_name || 'Gomoku Master',
        photoURL: authUser.user_metadata?.avatar_url || getChampionIdForSeed(authUser.id),
        email: authUser.email || '',
        elo: 1200,
        wins: 0,
        losses: 0,
        draws: 0,
        streak: 0,
        isGuest: false,
      };
    }
  };
