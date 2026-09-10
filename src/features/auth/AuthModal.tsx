import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X, Eye, EyeOff, Check } from 'lucide-react';
import { useAuth } from './AuthContext';
import { useBackdropDismiss } from '../../shared/hooks/useBackdropDismiss';

const EyeIcon: React.FC<{ visible: boolean }> = ({ visible }) => {
  const Glyph = visible ? Eye : EyeOff;
  return (
    <Glyph
      size={16}
      strokeWidth={1.75}
      className="text-muted transition-colors hover:text-ink"
      aria-hidden="true"
    />
  );
};

const USERNAME_RULE = '3-24 characters. Lowercase letters, numbers and underscores only.';
const PASSWORD_RULE = 'At least 8 characters. There is no reset yet, so keep it somewhere safe.';

/** What an account actually buys, limited to what the app really does today. */
const ACCOUNT_BENEFITS = [
  'Your rating and win record follow you to any device',
  'You appear on the leaderboard',
  'Your match history is kept, not just this browser session',
];

type FieldErrors = {
  username?: string;
  password?: string;
  retype?: string;
  displayName?: string;
};

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
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  /** Set when the account exists but the player still has to confirm an email. */
  const [verificationNotice, setVerificationNotice] = useState<string | null>(null);

  const firstFieldRef = useRef<HTMLInputElement>(null);
  /** Where focus was before the dialog opened, so the keyboard path can return. */
  const openerRef = useRef<Element | null>(null);

  // Any value the player has already typed. Used to protect a half-filled form.
  const hasUnsavedInput = Boolean(
    signInUsername ||
    signInPassword ||
    createUsername ||
    createDisplayName ||
    createPassword ||
    retypePassword
  );

  const completeClose = useCallback(() => {
    setShowAuthModal(false);
    setAuthError(null);
    setFieldErrors({});
    setVerificationNotice(null);
    // Hand the keyboard back to whatever opened the dialog.
    const opener = openerRef.current;
    if (opener instanceof HTMLElement) opener.focus();
  }, [setShowAuthModal, setAuthError]);

  const handleClose = useCallback(() => {
    if (!isSubmitting) completeClose();
  }, [isSubmitting, completeClose]);

  const { backdropProps } = useBackdropDismiss(handleClose);

  useEffect(() => {
    if (!showAuthModal) return;
    openerRef.current = document.activeElement;
    const frame = requestAnimationFrame(() => firstFieldRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [showAuthModal, authModalTab]);

  useEffect(() => {
    if (!showAuthModal) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || isSubmitting) return;
      // Escape also dismisses the browser's own validation popup. Closing the
      // dialog on that keystroke threw away a partly filled sign-up form, so a
      // touched form is only closed deliberately (backdrop or the X button).
      if (hasUnsavedInput) return;
      completeClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [showAuthModal, isSubmitting, hasUnsavedInput, completeClose]);

  if (!showAuthModal) return null;

  const switchTab = (tab: 'signin' | 'create') => {
    setAuthError(null);
    setFieldErrors({});
    setVerificationNotice(null);
    setAuthModalTab(tab);
  };

  const handleSignInSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setFieldErrors({});

    const nextErrors: FieldErrors = {};
    if (!signInUsername.trim()) nextErrors.username = 'Enter your username.';
    if (!signInPassword) nextErrors.password = 'Enter your password.';
    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      return;
    }
    if (isSubmitting) return;

    setIsSubmitting(true);
    const success = await signInWithCredentials(signInUsername.trim(), signInPassword);
    setIsSubmitting(false);
    if (success) {
      setSignInPassword('');
      completeClose();
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setVerificationNotice(null);

    // Validate everything at once and pin each message to its own field, so a
    // long form does not have to be resubmitted one mistake at a time.
    const username = createUsername.trim();
    const nextErrors: FieldErrors = {};
    if (!/^[a-z0-9_]{3,24}$/.test(username)) nextErrors.username = USERNAME_RULE;
    if (createPassword.length < 8) nextErrors.password = 'Use at least 8 characters.';
    if (!retypePassword) nextErrors.retype = 'Type the password again.';
    else if (createPassword !== retypePassword) nextErrors.retype = 'The two passwords do not match.';
    if (createDisplayName.trim().length > 40) {
      nextErrors.displayName = 'Keep the display name to 40 characters or fewer.';
    }

    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0 || isSubmitting) return;

    setIsSubmitting(true);
    const result = await createLocalAccount(
      username,
      createPassword,
      createDisplayName.trim() || username
    );
    setIsSubmitting(false);
    if (!result.ok) return;

    setCreatePassword('');
    setRetypePassword('');
    if (result.signedIn) {
      completeClose();
      return;
    }
    // Account made, but no session: say exactly that instead of closing as if
    // the player were already playing under their new name.
    setVerificationNotice(
      `Account "${username}" was created. Check your inbox and confirm your email address, then sign in.`
    );
  };

  const signInBody = (
    <form id="auth-form" onSubmit={handleSignInSubmit} className="space-y-4">
      <div className="field">
        <label htmlFor="signin-username" className="field-label">Username</label>
        <input
          ref={firstFieldRef}
          id="signin-username"
          type="text"
          value={signInUsername}
          onChange={(e) => setSignInUsername(e.target.value)}
          placeholder="gomoku_player"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          aria-invalid={Boolean(fieldErrors.username)}
          aria-describedby={fieldErrors.username ? 'signin-username-error' : undefined}
          className="field-input"
        />
        {fieldErrors.username && (
          <p id="signin-username-error" className="field-error">{fieldErrors.username}</p>
        )}
      </div>

      <div className="field">
        <label htmlFor="signin-password" className="field-label">Password</label>
        <div className="relative">
          <input
            id="signin-password"
            type={showSignInPassword ? 'text' : 'password'}
            value={signInPassword}
            onChange={(e) => setSignInPassword(e.target.value)}
            placeholder="Your password"
            autoComplete="current-password"
            aria-invalid={Boolean(fieldErrors.password)}
            aria-describedby={fieldErrors.password ? 'signin-password-error' : undefined}
            className="field-input pr-11"
          />
          <button
            type="button"
            onClick={() => setShowSignInPassword(!showSignInPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 focus:outline-none"
            aria-label={showSignInPassword ? 'Hide password' : 'Show password'}
          >
            <EyeIcon visible={showSignInPassword} />
          </button>
        </div>
        {fieldErrors.password && (
          <p id="signin-password-error" className="field-error">{fieldErrors.password}</p>
        )}
      </div>

      {/* No "forgot password" link: nothing behind it would work yet, and a
          dead link costs more trust than the missing feature does. */}
      <p className="field-hint">
        Passwords cannot be reset from here yet. If you have lost yours, create a new
        account or keep playing as a guest.
      </p>
    </form>
  );

  const createBody = (
    <form id="auth-form" onSubmit={handleCreateSubmit} className="space-y-4">
      <div className="card-inset p-3">
        <p className="text-xs font-medium text-ink">Why create an account?</p>
        <ul className="mt-1.5 space-y-1">
          {ACCOUNT_BENEFITS.map((benefit) => (
            <li key={benefit} className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted">
              <Check size={13} strokeWidth={2} className="mt-0.5 shrink-0 text-accent-text" aria-hidden="true" />
              <span>{benefit}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="field">
        <label htmlFor="create-username" className="field-label">Username</label>
        <input
          ref={firstFieldRef}
          id="create-username"
          type="text"
          value={createUsername}
          onChange={(e) => setCreateUsername(e.target.value.toLowerCase())}
          placeholder="gomoku_player"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={24}
          aria-invalid={Boolean(fieldErrors.username)}
          aria-describedby={fieldErrors.username ? 'create-username-error' : 'create-username-hint'}
          className="field-input"
        />
        {fieldErrors.username ? (
          <p id="create-username-error" className="field-error">{fieldErrors.username}</p>
        ) : (
          <p id="create-username-hint" className="field-hint">{USERNAME_RULE} This is what you log in with.</p>
        )}
      </div>

      <div className="field">
        <label htmlFor="create-display-name" className="field-label">
          Display name <span className="font-normal text-muted">(optional)</span>
        </label>
        <input
          id="create-display-name"
          type="text"
          value={createDisplayName}
          onChange={(e) => setCreateDisplayName(e.target.value)}
          placeholder="The name other players see"
          autoComplete="nickname"
          maxLength={40}
          aria-invalid={Boolean(fieldErrors.displayName)}
          aria-describedby={fieldErrors.displayName ? 'create-display-name-error' : 'create-display-name-hint'}
          className="field-input"
        />
        {fieldErrors.displayName ? (
          <p id="create-display-name-error" className="field-error">{fieldErrors.displayName}</p>
        ) : (
          <p id="create-display-name-hint" className="field-hint">
            Leave this empty to use your username. You can change it later.
          </p>
        )}
      </div>

      <div className="field">
        <label htmlFor="create-password" className="field-label">Password</label>
        <div className="relative">
          <input
            id="create-password"
            type={showCreatePassword ? 'text' : 'password'}
            value={createPassword}
            onChange={(e) => setCreatePassword(e.target.value)}
            placeholder="At least 8 characters"
            autoComplete="new-password"
            aria-invalid={Boolean(fieldErrors.password)}
            aria-describedby={fieldErrors.password ? 'create-password-error' : 'create-password-hint'}
            className="field-input pr-11"
          />
          <button
            type="button"
            onClick={() => setShowCreatePassword(!showCreatePassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 focus:outline-none"
            aria-label={showCreatePassword ? 'Hide password' : 'Show password'}
          >
            <EyeIcon visible={showCreatePassword} />
          </button>
        </div>
        {fieldErrors.password ? (
          <p id="create-password-error" className="field-error">{fieldErrors.password}</p>
        ) : (
          <p id="create-password-hint" className="field-hint">{PASSWORD_RULE}</p>
        )}
      </div>

      <div className="field">
        <label htmlFor="create-retype" className="field-label">Retype password</label>
        <div className="relative">
          <input
            id="create-retype"
            type={showRetypePassword ? 'text' : 'password'}
            value={retypePassword}
            onChange={(e) => setRetypePassword(e.target.value)}
            placeholder="Type it once more"
            autoComplete="new-password"
            aria-invalid={Boolean(fieldErrors.retype)}
            aria-describedby={fieldErrors.retype ? 'create-retype-error' : undefined}
            className="field-input pr-11"
          />
          <button
            type="button"
            onClick={() => setShowRetypePassword(!showRetypePassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 focus:outline-none"
            aria-label={showRetypePassword ? 'Hide password' : 'Show password'}
          >
            <EyeIcon visible={showRetypePassword} />
          </button>
        </div>
        {fieldErrors.retype && (
          <p id="create-retype-error" className="field-error">{fieldErrors.retype}</p>
        )}
      </div>
    </form>
  );

  const isSignIn = authModalTab === 'signin';

  return (
    <div
      {...backdropProps}
      className="modal-scrim"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      {/* Header and submit button stay put while the fields scroll, so the way
          out and the way forward survive an open on-screen keyboard. */}
      <div className="modal-panel max-w-md relative flex max-h-[90dvh] flex-col">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line p-6 pb-4">
          <div>
            <h2 id="auth-modal-title" className="text-xl font-semibold tracking-tight text-ink">
              {isSignIn ? 'Sign in' : 'Create an account'}
            </h2>
            <p className="mt-1 text-xs text-muted">
              You can keep playing as a guest; an account only adds a saved rating.
            </p>
          </div>
          <button
            onClick={handleClose}
            className="btn btn-ghost btn-icon shrink-0"
            aria-label="Close"
          >
            <X size={18} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-6 space-y-4">
          <div className="grid grid-cols-2 gap-2 rounded-md bg-surface-3 p-1 text-xs font-medium">
            <button
              type="button"
              onClick={() => switchTab('signin')}
              aria-pressed={isSignIn}
              className={`py-2 rounded-sm transition ${
                isSignIn ? 'bg-surface text-ink border border-line' : 'text-muted hover:text-ink'
              }`}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => switchTab('create')}
              aria-pressed={!isSignIn}
              className={`py-2 rounded-sm transition ${
                !isSignIn ? 'bg-surface text-ink border border-line' : 'text-muted hover:text-ink'
              }`}
            >
              Create account
            </button>
          </div>

          {verificationNotice && (
            <div
              role="status"
              className="rounded-md border border-accent bg-accent-soft p-2.5 text-xs font-medium text-accent-text"
            >
              {verificationNotice}
            </div>
          )}

          {authError && (
            <div
              role="alert"
              className="rounded-md border border-danger bg-danger-soft p-2.5 text-xs font-medium text-danger"
            >
              {authError}
            </div>
          )}

          {isSignIn ? signInBody : createBody}
        </div>

        <div className="shrink-0 border-t border-line p-6 pt-4">
          <button
            type="submit"
            form="auth-form"
            disabled={isSubmitting}
            className="btn btn-primary btn-lg w-full"
          >
            {isSubmitting
              ? isSignIn ? 'Signing in…' : 'Creating account…'
              : isSignIn ? 'Sign in' : 'Create account'}
          </button>
        </div>
      </div>
    </div>
  );
};
