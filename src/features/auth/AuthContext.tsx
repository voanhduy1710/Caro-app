import React, { createContext, useContext, useState, useEffect } from 'react';
import type { User as SupabaseAuthUser } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../../config/supabase';

export interface UserProfile {
  uid: string;
  username?: string;
  displayName: string;
  photoURL: string;
  email: string;
  elo: number;
  wins: number;
  losses: number;
  draws: number;
  streak: number;
  isGuest?: boolean;
}

interface AuthContextType {
  user: UserProfile | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  loginAsGuest: (customName?: string) => void;
  loginWithProfile: (name: string, avatarSeed?: string) => Promise<void>;
  signInWithCredentials: (username: string, password: string) => Promise<boolean>;
  createLocalAccount: (username: string, password: string, displayName?: string) => Promise<boolean>;
  updateLocalGuestName: (newName: string) => void;
  showConfigGuide: boolean;
  setShowConfigGuide: (show: boolean) => void;
  showAuthModal: boolean;
  setShowAuthModal: (show: boolean) => void;
  authModalTab: 'signin' | 'create';
  setAuthModalTab: (tab: 'signin' | 'create') => void;
  openAuthModal: (tab?: 'signin' | 'create') => void;
  showProfileModal: boolean;
  setShowProfileModal: (show: boolean) => void;
  openProfileModal: () => void;
  updateUserProfile: (updates: { displayName?: string; photoURL?: string }) => Promise<void>;
  changePassword: (newPassword: string) => Promise<{ success: boolean; message?: string }>;
  authError: string | null;
  setAuthError: (err: string | null) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const GUEST_STORAGE_KEY = 'caro_app_guest_user';
const SAVED_PROFILE_KEY = 'caro_app_user_profile';
const ACCOUNTS_STORAGE_KEY = 'caro_app_accounts';

interface LocalAccount {
  username: string;
  password: string;
  profile: UserProfile;
}

const USERNAME_PATTERN = /^[a-z0-9_]{3,24}$/;

const normalizeUsername = (value: string) => value.trim().toLowerCase();

const usernameToEmail = (username: string) => `${username}@gomoku.app`;

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [showConfigGuide, setShowConfigGuide] = useState<boolean>(false);
  const [showAuthModal, setShowAuthModal] = useState<boolean>(false);
  const [showProfileModal, setShowProfileModal] = useState<boolean>(false);
  const [authModalTab, setAuthModalTab] = useState<'signin' | 'create'>('signin');
  const [authError, setAuthError] = useState<string | null>(null);

  const openAuthModal = (tab: 'signin' | 'create' = 'signin') => {
    setAuthError(null);
    setAuthModalTab(tab);
    setShowAuthModal(true);
  };

  const openProfileModal = () => {
    setShowProfileModal(true);
  };

  const getInitialGuest = (name = 'Guest Player'): UserProfile => {
    try {
      const savedProfile = localStorage.getItem(SAVED_PROFILE_KEY);
      if (savedProfile) return JSON.parse(savedProfile);

      const savedGuest = localStorage.getItem(GUEST_STORAGE_KEY);
      if (savedGuest) return JSON.parse(savedGuest);
    } catch (e) {
      console.warn('Failed to parse user from localStorage:', e);
    }

    const guestId = 'guest_' + Math.random().toString(36).substring(2, 9);
    const guestUser: UserProfile = {
      uid: guestId,
      displayName: name,
      photoURL: '/Avatar/Zerom.gif',
      email: '',
      elo: 1200,
      wins: 0,
      losses: 0,
      draws: 0,
      streak: 0,
      isGuest: true,
    };
    try {
      localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(guestUser));
    } catch (e) {
      console.warn('Failed to save guest user to localStorage:', e);
    }
    return guestUser;
  };

  const fetchOrCreateProfile = async (authUser: SupabaseAuthUser): Promise<UserProfile> => {
    if (!supabase) throw new Error('Supabase not initialized');

    try {
      const { data, error } = await supabase
        .from('gomoku_users')
        .select('*')
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
          photoURL: data.photo_url || authUser.user_metadata?.avatar_url || '/Avatar/Zerom.gif',
          email: data.email || authUser.email || '',
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
        photoURL: authUser.user_metadata?.avatar_url || '/Avatar/Zerom.gif',
        email: authUser.email || '',
        elo: 1200,
        wins: 0,
        losses: 0,
        draws: 0,
        streak: 0,
        isGuest: false,
      };

      await supabase.from('gomoku_users').upsert({
        uid: newProfile.uid,
        username: newProfile.username,
        display_name: newProfile.displayName,
        photo_url: newProfile.photoURL,
        email: newProfile.email,
        elo: newProfile.elo,
        wins: newProfile.wins,
        losses: newProfile.losses,
        draws: newProfile.draws,
        streak: newProfile.streak,
        updated_at: new Date().toISOString(),
      });

      return newProfile;
    } catch (err) {
      console.error('Error fetching or creating user profile in Supabase:', err);
      return {
        uid: authUser.id,
        displayName: authUser.user_metadata?.full_name || 'Gomoku Master',
        photoURL: authUser.user_metadata?.avatar_url || '/Avatar/Zerom.gif',
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

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setUser(getInitialGuest());
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        const profile = await fetchOrCreateProfile(session.user);
        setUser(profile);
      } else {
        setUser(getInitialGuest());
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        const profile = await fetchOrCreateProfile(session.user);
        setUser(profile);
      } else {
        setUser(getInitialGuest());
      }
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const signInWithGoogle = async () => {
    if (!isSupabaseConfigured || !supabase) {
      setAuthError('Google sign-in is not available right now.');
      return;
    }
    setAuthError(null);
    try {
      setLoading(true);
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
        },
      });
      if (error) {
        console.warn('Supabase Google Sign-In error:', error.message);
        setAuthError('Google sign-in could not be started.');
      }
    } catch (error: any) {
      console.error('Google Sign-In exception:', error);
      setAuthError('Google sign-in could not be started.');
    } finally {
      setLoading(false);
    }
  };

  const loginWithProfile = async (name: string, avatarSeed?: string) => {
    const seed = avatarSeed || 'Zerom.gif';
    const uid = 'user_' + Math.random().toString(36).substring(2, 9);
    const newProfile: UserProfile = {
      uid,
      displayName: name,
      photoURL: seed.startsWith('/Avatar/') ? seed : `/Avatar/${seed}`,
      email: `${name.toLowerCase().replace(/\s+/g, '')}@gomoku.app`,
      elo: 1200,
      wins: 0,
      losses: 0,
      draws: 0,
      streak: 0,
      isGuest: false,
    };

    setUser(newProfile);
    try {
      localStorage.setItem(SAVED_PROFILE_KEY, JSON.stringify(newProfile));
    } catch (e) {
      console.warn('Failed to save profile to localStorage:', e);
    }

    if (supabase && isSupabaseConfigured) {
      try {
        await supabase.from('gomoku_users').upsert({
          uid: newProfile.uid,
          display_name: newProfile.displayName,
          photo_url: newProfile.photoURL,
          email: newProfile.email,
          elo: newProfile.elo,
          wins: 0,
          losses: 0,
          draws: 0,
          streak: 0,
          updated_at: new Date().toISOString(),
        });
      } catch (err) {
        console.warn('Failed to sync custom profile to Supabase:', err);
      }
    }
  };

  const getLocalAccounts = (): LocalAccount[] => {
    try {
      const stored = localStorage.getItem(ACCOUNTS_STORAGE_KEY);
      const accounts = stored ? JSON.parse(stored) : [];
      return Array.isArray(accounts) ? accounts : [];
    } catch (error) {
      console.warn('Failed to load local accounts:', error);
      return [];
    }
  };

  const saveLocalAccounts = (accounts: LocalAccount[]) => {
    try {
      localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(accounts));
    } catch (error) {
      console.warn('Failed to save local account:', error);
    }
  };

  const createLocalAccount = async (usernameInput: string, password: string, customDisplayName?: string): Promise<boolean> => {
    const username = normalizeUsername(usernameInput);
    const displayName = customDisplayName?.trim() || username;

    if (!USERNAME_PATTERN.test(username)) {
      setAuthError('Username must be 3–24 characters: lowercase letters, numbers, or underscores.');
      return false;
    }
    if (password.length < 8) {
      setAuthError('Password must be at least 8 characters long.');
      return false;
    }
    if (displayName.length > 40) {
      setAuthError('Display name must be 40 characters or fewer.');
      return false;
    }

    const email = usernameToEmail(username);

    if (supabase && isSupabaseConfigured) {
      try {
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              username,
              full_name: displayName,
            },
          },
        });

        if (authError) {
          setAuthError(authError.message.toLowerCase().includes('already registered')
            ? 'That username is already registered. Please sign in instead.'
            : authError.message);
          return false;
        }

        if (authData?.user) {
          const profile: UserProfile = {
            uid: authData.user.id,
            username,
            displayName,
            photoURL: '/Avatar/Zerom.gif',
            email,
            elo: 1200,
            wins: 0,
            losses: 0,
            draws: 0,
            streak: 0,
            isGuest: false,
          };

          await supabase.from('gomoku_users').upsert(
            {
              uid: profile.uid,
              username: profile.username,
              display_name: profile.displayName,
              photo_url: profile.photoURL,
              email: profile.email,
              elo: profile.elo,
              wins: 0,
              losses: 0,
              draws: 0,
              streak: 0,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'uid' }
          );

          // A confirmed-email project has a session immediately. For confirmation
          // flows, do not pretend the user is signed in before they verify email.
          if (authData.session) {
            setUser(profile);
            localStorage.setItem(SAVED_PROFILE_KEY, JSON.stringify(profile));
          }
          setAuthError(null);
          return true;
        }
      } catch (err: any) {
        console.warn('Supabase Auth signup error:', err);
        setAuthError(err?.message || 'Account creation failed. Please try again.');
      }

      return false;
    }

    // Offline/local-only mode: accounts stay entirely in this browser.
    const accounts = getLocalAccounts();
    if (accounts.some((account) => normalizeUsername(account.username) === username)) {
      setAuthError('That username is already registered. Please sign in instead.');
      return false;
    }

    const uid = `user_${username}`;
    const profile: UserProfile = {
      uid,
      username,
      displayName,
      photoURL: '/Avatar/Zerom.gif',
      email,
      elo: 1200,
      wins: 0,
      losses: 0,
      draws: 0,
      streak: 0,
      isGuest: false,
    };

    saveLocalAccounts([...accounts, { username, password, profile }]);
    localStorage.setItem(SAVED_PROFILE_KEY, JSON.stringify(profile));
    setAuthError(null);
    setUser(profile);
    return true;
  };

  const signInWithCredentials = async (username: string, password: string): Promise<boolean> => {
    const normalizedUsername = normalizeUsername(username);
    if (!USERNAME_PATTERN.test(normalizedUsername)) {
      setAuthError('Enter the username used when you created your account.');
      return false;
    }
    const email = usernameToEmail(normalizedUsername);

    // 1. Try standard Supabase Auth first
    if (supabase && isSupabaseConfigured) {
      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (!error && data?.user) {
          const profile = await fetchOrCreateProfile(data.user);
          setUser(profile);
          localStorage.setItem(SAVED_PROFILE_KEY, JSON.stringify(profile));
          setAuthError(null);
          return true;
        }
        setAuthError(error?.message === 'Invalid login credentials'
          ? 'Incorrect username or password.'
          : error?.message || 'Sign-in failed. Please try again.');
      } catch (err) {
        console.warn('Supabase Auth sign-in exception:', err);
        setAuthError('Sign-in failed. Please try again.');
      }
      return false;
    }

    // Local-only sign-in is intentionally used only when Supabase is not configured.
    const accounts = getLocalAccounts();
    const account = accounts.find((item) => normalizeUsername(item.username) === normalizedUsername && item.password === password);

    if (!account) {
      setAuthError('Incorrect username or password.');
      return false;
    }

    localStorage.setItem(SAVED_PROFILE_KEY, JSON.stringify(account.profile));
    setAuthError(null);
    setUser(account.profile);
    return true;
  };

  const signOut = async () => {
    if (supabase && isSupabaseConfigured) {
      await supabase.auth.signOut();
    }
    try {
      localStorage.removeItem(SAVED_PROFILE_KEY);
      localStorage.removeItem(GUEST_STORAGE_KEY);
    } catch (e) {
      console.warn('Failed to clear localStorage on signout:', e);
    }
    const freshGuest = getInitialGuest('Guest Player');
    setUser(freshGuest);
  };

  const loginAsGuest = (customName = 'Guest Player') => {
    const guestUser = getInitialGuest(customName);
    setUser(guestUser);
  };

  const updateUserProfile = async (updates: { displayName?: string; photoURL?: string }) => {
    if (!user) return;
    const updated: UserProfile = {
      ...user,
      displayName: updates.displayName !== undefined ? updates.displayName.trim() : user.displayName,
      photoURL: updates.photoURL !== undefined ? updates.photoURL : user.photoURL,
    };
    setUser(updated);

    try {
      localStorage.setItem(SAVED_PROFILE_KEY, JSON.stringify(updated));
      if (updated.isGuest) {
        localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(updated));
      }
    } catch (e) {
      console.warn('Failed to update profile in localStorage:', e);
    }

    const accounts = getLocalAccounts();
    const accIdx = accounts.findIndex(
      (a) => a.profile.uid === user.uid || (user.username && a.username.toLowerCase() === user.username.toLowerCase())
    );
    if (accIdx >= 0) {
      accounts[accIdx].profile = updated;
      saveLocalAccounts(accounts);
    }

    if (supabase && isSupabaseConfigured && !updated.isGuest) {
      try {
        await supabase.from('gomoku_users').upsert(
          {
            uid: updated.uid,
            display_name: updated.displayName,
            photo_url: updated.photoURL,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'uid' }
        );
      } catch (err) {
        console.warn('Failed to sync profile update to Supabase:', err);
      }
    }
  };

  const updateLocalGuestName = (newName: string) => {
    updateUserProfile({ displayName: newName });
  };

  const changePassword = async (newPassword: string): Promise<{ success: boolean; message?: string }> => {
    if (!newPassword || newPassword.length < 6) {
      return { success: false, message: 'Password must be at least 6 characters long.' };
    }

    if (supabase && isSupabaseConfigured && user && !user.isGuest) {
      try {
        const { error } = await supabase.auth.updateUser({ password: newPassword });
        if (error) {
          console.warn('Supabase change password error:', error.message);
          return { success: false, message: error.message };
        }
      } catch (err: any) {
        console.warn('Supabase change password exception:', err);
        return { success: false, message: err?.message || 'Failed to update password.' };
      }
    }

    if (user && user.username) {
      const accounts = getLocalAccounts();
      const accIdx = accounts.findIndex(
        (a) => a.username.toLowerCase() === user.username?.toLowerCase() || a.profile.uid === user.uid
      );
      if (accIdx >= 0) {
        accounts[accIdx].password = newPassword;
        saveLocalAccounts(accounts);
      }
    }

    return { success: true, message: 'Password updated successfully!' };
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        signInWithGoogle,
        signOut,
        loginAsGuest,
        loginWithProfile,
        signInWithCredentials,
        createLocalAccount,
        updateLocalGuestName,
        updateUserProfile,
        changePassword,
        showConfigGuide,
        setShowConfigGuide,
        showAuthModal,
        setShowAuthModal,
        showProfileModal,
        setShowProfileModal,
        openProfileModal,
        authModalTab,
        setAuthModalTab,
        openAuthModal,
        authError,
        setAuthError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
