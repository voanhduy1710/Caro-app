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

export type CreateAccountResult =
  | { ok: false }
  | { ok: true; signedIn: boolean };

export type ProfileSaveResult = 'saved' | 'signed-out' | 'refused';

export interface LocalAccount {
  username: string;
  /** PBKDF2 record. Older installs may still hold clear text; see signIn. */
  password: string;
  profile: UserProfile;
}

export interface AuthContextType {
  user: UserProfile | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  loginAsGuest: (customName?: string) => void;
  signInWithCredentials: (username: string, password: string) => Promise<boolean>;
  createLocalAccount: (username: string, password: string, displayName?: string) => Promise<CreateAccountResult>;
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
  updateUserProfile: (updates: { displayName?: string; photoURL?: string }) => Promise<ProfileSaveResult>;
  refreshUserProfile: () => Promise<void>;
  changePassword: (newPassword: string) => Promise<{ success: boolean; message?: string }>;
  authError: string | null;
  setAuthError: (err: string | null) => void;
}
