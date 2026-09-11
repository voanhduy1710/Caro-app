import React, { useRef } from 'react';
import type { UserProfile } from '../auth/AuthContext';
import { getRankTitle } from '../../shared/utils/eloCalculator';
import { getAvatarPublicUrl } from '../avatar/avatarService';

interface OpponentProfileModalProps {
  opponent: UserProfile | null;
  isOpen: boolean;
  onClose: () => void;
}

export const OpponentProfileModal: React.FC<OpponentProfileModalProps> = ({
  opponent,
  isOpen,
  onClose,
}) => {
  const backdropRef = useRef<HTMLDivElement>(null);

  if (!isOpen || !opponent) return null;

  const rank = getRankTitle(opponent.elo || 1200);
  const wins = opponent.wins || 0;
  const losses = opponent.losses || 0;
  const draws = opponent.draws || 0;
  const totalGames = wins + losses + draws;
  const winRate = totalGames > 0 ? Math.round((wins / totalGames) * 100) : 0;
  const usernameHandle = opponent.username || opponent.displayName.toLowerCase().replace(/\s+/g, '');

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === backdropRef.current) {
      onClose();
    }
  };

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-md transition-opacity animate-in fade-in duration-150"
    >
      <div className="bg-white text-slate-800 w-full max-w-md rounded-2xl p-6 relative border border-slate-200 shadow-2xl space-y-5">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <span className="text-[10px] font-mono font-bold tracking-widest text-emerald-700 uppercase">
              Player Card
            </span>
            <h2 className="text-xl font-black text-slate-900 tracking-tight">
              Opponent Profile
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 text-2xl font-bold p-1 leading-none transition"
          >
            ×
          </button>
        </div>

        {/* Profile Card Header */}
        <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl flex items-center gap-4 shadow-xs">
          <div className="relative shrink-0">
            <img
              src={getAvatarPublicUrl(opponent.photoURL)}
              alt={opponent.displayName}
              onError={(e) => {
                e.currentTarget.src = '/Avatar/Zerom.gif';
              }}
              className="w-16 h-16 rounded-full border-2 border-emerald-500 bg-white p-0.5 shadow-sm object-contain"
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-black text-slate-900 truncate">{opponent.displayName}</h3>
              <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border bg-white ${rank.color}`}>
                {rank.title}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[11px] font-mono font-semibold text-slate-500">
                @{usernameHandle}
              </span>
              <span className="text-xs font-mono font-bold text-emerald-700">
                · {opponent.elo || 1200} ELO
              </span>
            </div>
          </div>
        </div>

        {/* Player Detailed Performance Metrics */}
        <div className="space-y-2">
          <div className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider">
            Match Statistics & Win Rate
          </div>
          <div className="grid grid-cols-4 gap-2 text-center bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
            <div>
              <div className="text-slate-400 text-[10px] uppercase font-mono font-bold">Wins</div>
              <div className="text-emerald-700 font-black text-lg mt-0.5">{wins}</div>
            </div>
            <div>
              <div className="text-slate-400 text-[10px] uppercase font-mono font-bold">Losses</div>
              <div className="text-rose-600 font-black text-lg mt-0.5">{losses}</div>
            </div>
            <div>
              <div className="text-slate-400 text-[10px] uppercase font-mono font-bold">Draws</div>
              <div className="text-amber-600 font-black text-lg mt-0.5">{draws}</div>
            </div>
            <div>
              <div className="text-slate-400 text-[10px] uppercase font-mono font-bold">Win Rate</div>
              <div className="text-slate-900 font-black text-lg mt-0.5">{winRate}%</div>
            </div>
          </div>
        </div>

        {/* Additional Player Meta */}
        <div className="p-3 bg-emerald-50/60 border border-emerald-200/80 rounded-xl flex items-center justify-between text-xs font-mono">
          <span className="text-emerald-900 font-bold">Current Win Streak</span>
          <span className="font-extrabold text-emerald-700 text-sm">🔥 {opponent.streak || 0} Games</span>
        </div>

        {/* Close Action */}
        <button
          onClick={onClose}
          className="w-full py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition"
        >
          Close Profile
        </button>
      </div>
    </div>
  );
};
