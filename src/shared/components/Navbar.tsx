import React from 'react';
import { Trophy, History, Settings, LogIn, LogOut, UserPlus } from 'lucide-react';
import { useAuth } from '../../features/auth/AuthContext';
import { getRankTitle } from '../utils/eloCalculator';
import { getAvatarPublicUrl } from '../../features/avatar/avatarService';

interface NavbarProps {
  onOpenLeaderboard: () => void;
  onOpenHistory: () => void;
  onOpenSettingsAndTheme: () => void;
  /**
   * Goes to the home screen through the app's own exit flow. The brand used to
   * be an `<a href="/">`, which reloaded the page and dropped a live match
   * without asking.
   */
  onNavigateHome: () => void;
  /**
   * True while a match is on screen. Site navigation is not the task then, so
   * the secondary destinations drop their labels and stop competing with the
   * board for attention.
   */
  inMatch?: boolean;
}

/** One stroke weight across the whole app. */
const ICON = { size: 16, strokeWidth: 2.25 } as const;

export const Navbar: React.FC<NavbarProps> = ({
  inMatch = false,
  onOpenLeaderboard,
  onOpenHistory,
  onOpenSettingsAndTheme,
  onNavigateHome,
}) => {
  const { user, openAuthModal, openProfileModal, signOut } = useAuth();
  const rank = user ? getRankTitle(user.elo) : getRankTitle(1200);
  const isSignedIn = Boolean(user && !user.isGuest);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-line bg-surface/90 backdrop-blur-md">
      <div
        className={`mx-auto flex h-16 w-full items-center justify-between gap-2 px-4 sm:px-6 ${
          inMatch ? 'max-w-[1760px]' : 'max-w-7xl'
        }`}
      >
        {/* Brand */}
        <button
          type="button"
          onClick={onNavigateHome}
          title="Back to the home screen"
          aria-label="Home"
          className="flex shrink-0 items-center gap-2.5 select-none rounded-md px-1 py-1 transition-colors hover:bg-surface-2"
        >
          <img
            src="/Logo.svg"
            alt=""
            aria-hidden="true"
            className="h-8 w-8 rounded-sm"
          />
          <span className="hidden font-display text-[19px] font-extrabold leading-none tracking-[0.01em] text-ink sm:inline">
            Not Pickleball
          </span>
        </button>

        {/* Actions. Secondary items collapse to icons early so the account
            actions can keep their words, which is what a new player looks for. */}
        <nav className="flex min-w-0 shrink items-center gap-1.5">
          {user && (
            <button
              type="button"
              onClick={openProfileModal}
              className="mr-1 flex shrink-0 items-center gap-2 rounded-md border border-line bg-surface-2 p-1 transition-colors hover:bg-surface-3 md:pr-3"
              title={user.isGuest ? 'Guest profile: pick a name and avatar' : 'Edit profile and avatar'}
            >
              <img
                src={getAvatarPublicUrl(user.photoURL)}
                alt=""
                aria-hidden="true"
                onError={(e) => {
                  e.currentTarget.onerror = null;
                  e.currentTarget.src = getAvatarPublicUrl();
                }}
                className="h-7 w-7 shrink-0 rounded-full bg-surface object-cover"
              />
              <span className="hidden text-left leading-tight md:block">
                <span className="block text-[14px] font-semibold text-ink">
                  {user.displayName}
                </span>
                {/* "Guest Player" already says it; repeating it underneath
                    said the same thing twice. */}
                {!user.isGuest && (
                  <span className="block font-mono text-[11px] text-muted">
                    {user.elo} ELO · {rank.title}
                  </span>
                )}
              </span>
              {user.isGuest && (
                <span className="hidden rounded-sm bg-warning-soft px-2 py-0.5 text-[11px] font-semibold text-warning sm:inline md:hidden">
                  Guest
                </span>
              )}
            </button>
          )}

          <button
            type="button"
            onClick={onOpenLeaderboard}
            className="btn btn-ghost btn-sm max-lg:h-9 max-lg:w-9 max-lg:p-0"
            title="Leaderboard"
            aria-label="Leaderboard"
          >
            <Trophy {...ICON} aria-hidden="true" />
            <span className={inMatch ? 'hidden' : 'hidden lg:inline'}>Leaderboard</span>
          </button>

          <button
            type="button"
            onClick={onOpenHistory}
            className="btn btn-ghost btn-sm max-lg:h-9 max-lg:w-9 max-lg:p-0"
            title="Match history"
            aria-label="Match history"
          >
            <History {...ICON} aria-hidden="true" />
            <span className={inMatch ? 'hidden' : 'hidden lg:inline'}>History</span>
          </button>

          <button
            type="button"
            onClick={onOpenSettingsAndTheme}
            className="btn btn-ghost btn-sm max-lg:h-9 max-lg:w-9 max-lg:p-0"
            title="Match rules, appearance and themes"
            aria-label="Match rules, appearance and themes"
          >
            <Settings {...ICON} aria-hidden="true" />
            <span className={inMatch ? 'hidden' : 'hidden lg:inline'}>Settings</span>
          </button>

          {isSignedIn ? (
            <button
              type="button"
              onClick={signOut}
              className="btn btn-secondary btn-sm max-sm:h-9 max-sm:w-9 max-sm:p-0"
              title="Sign out"
              aria-label="Sign out"
            >
              <LogOut {...ICON} aria-hidden="true" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          ) : (
            <>
              {/* Creating an account used to live behind a tab inside Sign in,
                  so there was no way to find it from the home screen. */}
              <button
                type="button"
                onClick={() => openAuthModal('signin')}
                className="btn btn-ghost btn-sm max-sm:h-9 max-sm:w-9 max-sm:p-0"
                title="Sign in"
                aria-label="Sign in"
              >
                <LogIn {...ICON} aria-hidden="true" />
                <span className="hidden sm:inline">Sign in</span>
              </button>
              <button
                type="button"
                onClick={() => openAuthModal('create')}
                className="btn btn-primary btn-sm shrink-0"
                title="Create an account"
              >
                <UserPlus {...ICON} aria-hidden="true" />
                <span>Sign up</span>
              </button>
            </>
          )}
        </nav>
      </div>
    </header>
  );
};
