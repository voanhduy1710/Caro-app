import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from './AuthContext';

const EyeIcon: React.FC<{ visible: boolean }> = ({ visible }) => (
  visible ? (
    <svg className="w-4 h-4 text-slate-600 hover:text-slate-900 transition" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  ) : (
    <svg className="w-4 h-4 text-slate-400 hover:text-slate-700 transition" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858-5.908a10.025 10.025 0 014.122-.963c4.478 0 8.268 2.943 9.542 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21M3 3l18 18" />
    </svg>
  )
);

export const AuthModal: React.FC = () => {
  const {
    showAuthModal,
    setShowAuthModal,
    authModalTab,
    setAuthModalTab,
    signInWithCredentials,
    createLocalAccount,
    authError,
    setAuthError,
  } = useAuth();

  // Sign in state
  const [signInUsername, setSignInUsername] = useState('');
  const [signInPassword, setSignInPassword] = useState('');
  const [showSignInPassword, setShowSignInPassword] = useState(false);

  // Create account state
  const [createUsername, setCreateUsername] = useState('');
  const [createDisplayName, setCreateDisplayName] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [retypePassword, setRetypePassword] = useState('');
  const [showCreatePassword, setShowCreatePassword] = useState(false);
  const [showRetypePassword, setShowRetypePassword] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const backdropRef = useRef<HTMLDivElement>(null);

  const completeClose = () => {
    setShowAuthModal(false);
    setAuthError(null);
    setCreateError(null);
  };

  const handleClose = () => {
    if (!isSubmitting) completeClose();
  };

  useEffect(() => {
    if (!showAuthModal) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSubmitting) completeClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [showAuthModal, isSubmitting, completeClose]);

  if (!showAuthModal) return null;

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === backdropRef.current) {
      handleClose();
    }
  };

  const handleSignInSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    if (signInUsername.trim() && signInPassword && !isSubmitting) {
      setIsSubmitting(true);
      const success = await signInWithCredentials(signInUsername.trim(), signInPassword);
      setIsSubmitting(false);
      if (success) {
        setSignInPassword('');
        completeClose();
      }
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setCreateError(null);

    if (!createUsername.trim() || !createPassword || isSubmitting) return;

    if (createPassword !== retypePassword) {
      setCreateError('Passwords do not match.');
      return;
    }

    if (createPassword.length < 8) {
      setCreateError('Password must be at least 8 characters long.');
      return;
    }

    setIsSubmitting(true);
    const success = await createLocalAccount(createUsername.trim(), createPassword, createDisplayName.trim() || createUsername.trim());
    setIsSubmitting(false);
    if (success) {
      setCreatePassword('');
      setRetypePassword('');
      completeClose();
    }
  };

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-md transition-opacity"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      <div className="bg-white text-slate-800 w-full max-w-md rounded-2xl p-6 relative border border-slate-200 space-y-4">
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 text-2xl font-bold p-1 leading-none"
        >
          ×
        </button>

        <div className="border-b border-slate-100 pb-3">
          <span className="text-[10px] font-mono font-bold tracking-widest text-emerald-700 uppercase">
            Account & Security
          </span>
          <h2 id="auth-modal-title" className="text-xl font-extrabold text-slate-900 tracking-tight mt-0.5">
            {authModalTab === 'signin' ? 'Sign In to Account' : 'Create New Account'}
          </h2>
        </div>

        {/* 2 Tabs: Sign In vs Create Account */}
        <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-xl text-xs font-bold">
          <button
            type="button"
            onClick={() => {
              setAuthError(null);
              setCreateError(null);
              setAuthModalTab('signin');
            }}
            className={`py-2 rounded-lg transition ${
              authModalTab === 'signin'
                ? 'bg-white text-slate-900 border border-slate-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setAuthError(null);
              setCreateError(null);
              setAuthModalTab('create');
            }}
            className={`py-2 rounded-lg transition ${
              authModalTab === 'create'
                ? 'bg-white text-slate-900 border border-slate-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Create Account
          </button>
        </div>

        {/* Auth Errors Banner */}
        {(authError || createError) && (
          <div className="bg-rose-50 border border-rose-200 p-2.5 rounded-xl text-rose-800 text-xs font-bold">
            ⚠️ {authError || createError}
          </div>
        )}

        {/* SIGN IN FORM */}
        {authModalTab === 'signin' && (
          <form onSubmit={handleSignInSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Username</label>
              <input
                type="text"
                value={signInUsername}
                onChange={(e) => setSignInUsername(e.target.value)}
                placeholder="Enter your username..."
                autoComplete="username"
                required
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 focus:outline-none focus:border-emerald-600 font-bold"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Password</label>
              <div className="relative">
                <input
                  type={showSignInPassword ? 'text' : 'password'}
                  value={signInPassword}
                  onChange={(e) => setSignInPassword(e.target.value)}
                  placeholder="Enter your password..."
                  autoComplete="current-password"
                  required
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-3.5 pr-10 py-2.5 text-xs text-slate-800 focus:outline-none focus:border-emerald-600 font-bold"
                />
                <button
                  type="button"
                  onClick={() => setShowSignInPassword(!showSignInPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 focus:outline-none"
                  title={showSignInPassword ? 'Hide Password' : 'Show Password'}
                >
                  <EyeIcon visible={showSignInPassword} />
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={!signInUsername.trim() || !signInPassword || isSubmitting}
              className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs transition"
            >
              {isSubmitting ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        )}

        {/* CREATE ACCOUNT FORM */}
        {authModalTab === 'create' && (
          <form onSubmit={handleCreateSubmit} className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Username (Account ID for login)</label>
              <input
                type="text"
                value={createUsername}
                onChange={(e) => setCreateUsername(e.target.value.toLowerCase())}
                placeholder="Choose a username, e.g. gomoku_player"
                autoComplete="username"
                minLength={3}
                maxLength={24}
                pattern="[a-z0-9_]+"
                required
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 focus:outline-none focus:border-emerald-600 font-bold"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Display Name (Public Name)</label>
              <input
                type="text"
                value={createDisplayName}
                onChange={(e) => setCreateDisplayName(e.target.value)}
                placeholder="Your public in-game name"
                autoComplete="nickname"
                maxLength={40}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 focus:outline-none focus:border-emerald-600 font-bold"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Password</label>
              <div className="relative">
                <input
                  type={showCreatePassword ? 'text' : 'password'}
                  value={createPassword}
                  onChange={(e) => setCreatePassword(e.target.value)}
                  placeholder="Create a password..."
                  autoComplete="new-password"
                  minLength={8}
                  required
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-3.5 pr-10 py-2.5 text-xs text-slate-800 focus:outline-none focus:border-emerald-600 font-bold"
                />
                <button
                  type="button"
                  onClick={() => setShowCreatePassword(!showCreatePassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 focus:outline-none"
                  title={showCreatePassword ? 'Hide Password' : 'Show Password'}
                >
                  <EyeIcon visible={showCreatePassword} />
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Retype Password</label>
              <div className="relative">
                <input
                  type={showRetypePassword ? 'text' : 'password'}
                  value={retypePassword}
                  onChange={(e) => setRetypePassword(e.target.value)}
                  placeholder="Retype your password..."
                  autoComplete="new-password"
                  minLength={8}
                  required
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-3.5 pr-10 py-2.5 text-xs text-slate-800 focus:outline-none focus:border-emerald-600 font-bold"
                />
                <button
                  type="button"
                  onClick={() => setShowRetypePassword(!showRetypePassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 focus:outline-none"
                  title={showRetypePassword ? 'Hide Password' : 'Show Password'}
                >
                  <EyeIcon visible={showRetypePassword} />
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={!createUsername.trim() || !createPassword || !retypePassword || isSubmitting}
              className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs transition"
            >
              {isSubmitting ? 'Creating account…' : 'Create Account'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
