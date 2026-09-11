import React from 'react';
import { useAuth } from '../../features/auth/AuthContext';
import { getRankTitle } from '../utils/eloCalculator';

interface NavbarProps {
  onOpenLeaderboard: () => void;
  onOpenHistory: () => void;
  onOpenSettingsAndTheme: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  onOpenLeaderboard,
  onOpenHistory,
  onOpenSettingsAndTheme,
}) => {
  const { user, openAuthModal, openProfileModal, signOut } = useAuth();
  const rank = user ? getRankTitle(user.elo) : getRankTitle(1200);

  return (
    <header className="w-full bg-white border-b border-slate-200 sticky top-0 z-40 px-3 sm:px-6 py-2.5">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-2">
        {/* Branding Logo & Title */}
        <div className="flex items-center gap-2 select-none shrink-0">
          <img src="/Logo.svg" alt="Caro Gomoku Logo" className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg border border-slate-200" />
          <div className="flex items-center gap-1.5">
            <span className="text-base sm:text-xl font-black tracking-tight text-slate-900">
              Not Pickleball<span className="hidden xs:inline"> App</span><span className="text-emerald-600">.</span>
            </span>
          </div>
        </div>

        {/* Navigation Actions */}
        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          {/* User Profile Badge (Compact Avatar on Mobile) */}
          {user && (
            <div
              onClick={openProfileModal}
              className="flex items-center gap-2 px-2 sm:px-3 py-1 sm:py-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 cursor-pointer transition"
              title="Click to edit profile & change avatar"
            >
              <img
                src={user.photoURL}
                alt={user.displayName}
                className="w-6 h-6 sm:w-7 sm:h-7 rounded-full border border-emerald-500/40 bg-white shrink-0"
              />
              <div className="hidden md:block text-left leading-none">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-slate-800">{user.displayName}</span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded border ${rank.color} font-bold font-mono bg-white`}>
                    {rank.title}
                  </span>
                </div>
                <div className="text-[10px] text-emerald-700 font-mono mt-1 font-bold">
                  {user.elo} ELO {user.isGuest && '(Guest)'}
                </div>
              </div>
            </div>
          )}

          {/* Leaderboard */}
          <button
            onClick={onOpenLeaderboard}
            className="p-2 sm:px-3 sm:py-1.5 rounded-xl border border-slate-200 hover:border-emerald-500 bg-white hover:bg-emerald-50 text-xs font-bold text-slate-700 hover:text-emerald-700 transition flex items-center gap-1.5"
            title="Leaderboard"
          >
            <svg className="w-4 h-4 shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15l-4 3 1-4.5L5.5 10l4.6-.4L12 5.5l1.9 4.1 4.6.4-3.5 3.5 1 4.5z" />
            </svg>
            <span className="hidden sm:inline">Leaderboard</span>
          </button>

          {/* Match History */}
          <button
            onClick={onOpenHistory}
            className="p-2 sm:px-3 sm:py-1.5 rounded-xl border border-slate-200 hover:border-emerald-500 bg-white hover:bg-emerald-50 text-xs font-bold text-slate-700 hover:text-emerald-700 transition flex items-center gap-1.5"
            title="History"
          >
            <svg className="w-4 h-4 shrink-0 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="hidden sm:inline">History</span>
          </button>

          {/* Settings & Themes */}
          <button
            onClick={onOpenSettingsAndTheme}
            className="p-2 sm:px-3.5 sm:py-1.5 rounded-xl border border-slate-300 hover:border-emerald-600 bg-slate-50 hover:bg-emerald-50 text-xs font-bold text-slate-800 hover:text-emerald-700 transition flex items-center gap-1.5"
            title="Settings & Themes"
          >
            <svg className="w-4 h-4 shrink-0 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="hidden sm:inline">Settings & Themes</span>
          </button>

          {/* Auth Button */}
          {user && !user.isGuest ? (
            <button
              onClick={signOut}
              className="p-2 sm:px-3 sm:py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 text-xs font-bold transition flex items-center gap-1.5"
              title="Logout"
            >
              <svg className="w-4 h-4 shrink-0 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              <span className="hidden sm:inline">Logout</span>
            </button>
          ) : (
            <button
              onClick={() => openAuthModal('signin')}
              className="p-2 sm:px-3.5 sm:py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition flex items-center gap-1.5"
              title="Sign In"
            >
              <svg className="w-4 h-4 shrink-0 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h6a3 3 0 013 3v1" />
              </svg>
              <span className="hidden sm:inline">Sign In</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
