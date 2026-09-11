import React, { useEffect, useState } from 'react';
import { fetchTopLeaderboard } from './leaderboardService';
import type { UserProfile } from '../auth/AuthContext';
import { getRankTitle } from '../../shared/utils/eloCalculator';
import { getAvatarPublicUrl } from '../avatar/avatarService';

interface LeaderboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPlayer?: (player: UserProfile) => void;
}

export const LeaderboardModal: React.FC<LeaderboardModalProps> = ({ isOpen, onClose, onSelectPlayer }) => {
  const [players, setPlayers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  const loadLeaderboard = async () => {
    setLoading(true);
    const data = await fetchTopLeaderboard(25);
    setPlayers(data);
    setLoading(false);
  };

  useEffect(() => {
    if (isOpen) {
      loadLeaderboard();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
      <div className="bg-white text-slate-800 w-full max-w-lg max-h-[85vh] rounded-2xl p-6 relative border border-slate-200 shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-lg font-extrabold text-slate-900 tracking-tight">Global Leaderboard</h2>
            <p className="text-[11px] text-slate-500 font-medium">Top rankings sorted by player ELO score</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadLeaderboard}
              className="px-2.5 py-1 rounded bg-emerald-50 border border-emerald-300 text-[11px] font-mono text-emerald-800 font-bold hover:bg-emerald-100"
            >
              Refresh
            </button>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-700 text-xl font-bold p-1 ml-1"
            >
              ×
            </button>
          </div>
        </div>

        {/* Leaderboard Table Content */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {loading ? (
            <div className="py-12 text-center text-slate-500 text-xs font-mono">Loading rankings...</div>
          ) : players.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-xs">No rankings recorded yet.</div>
          ) : (
            players.map((p, idx) => {
              const rankInfo = getRankTitle(p.elo);
              const totalGames = (p.wins || 0) + (p.losses || 0) + (p.draws || 0);
              const winRate = totalGames > 0 ? Math.round(((p.wins || 0) / totalGames) * 100) : 0;
              const formattedRank = (idx + 1).toString().padStart(2, '0');

              return (
                <div
                  key={p.uid || idx}
                  onClick={() => onSelectPlayer && onSelectPlayer(p)}
                  title="Click to view full player profile"
                  className={`p-3 rounded-xl flex items-center justify-between transition border cursor-pointer hover:scale-[1.01] ${
                    idx === 0
                      ? 'bg-amber-50/80 border-amber-300 shadow-sm hover:bg-amber-100'
                      : 'bg-slate-50 border-slate-200 hover:border-emerald-400 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs font-bold text-emerald-700 w-6">
                      #{formattedRank}
                    </span>
                    <img
                      src={getAvatarPublicUrl(p.photoURL)}
                      alt={p.displayName}
                      onError={(e) => {
                        e.currentTarget.src = '/Avatar/Zerom.gif';
                      }}
                      className="w-8 h-8 rounded-full border border-emerald-400 bg-white object-contain p-0.5 shadow-xs"
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-800">{p.displayName}</span>
                        <span className={`text-[9px] px-1.5 py-0.2 rounded border ${rankInfo.color} font-mono font-bold bg-white`}>
                          {rankInfo.title}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                        {p.wins || 0}W - {p.losses || 0}L ({winRate}% Win)
                      </div>
                    </div>
                  </div>

                  <div className="text-right font-mono">
                    <div className="text-sm font-extrabold text-emerald-700">{p.elo} ELO</div>
                    <div className="text-[10px] text-slate-500">Streak: {p.streak || 0}</div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
