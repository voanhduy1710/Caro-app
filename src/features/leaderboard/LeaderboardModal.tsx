import React, { useEffect, useState } from 'react';
import { ListSkeleton } from '../../shared/components/ListSkeleton';
import { X } from 'lucide-react';
import { fetchTopLeaderboard } from './leaderboardService';
import type { UserProfile } from '../auth/AuthContext';
import { getRankTitle } from '../../shared/utils/eloCalculator';
import { getAvatarPublicUrl } from '../avatar/avatarService';
import { useModalChrome } from '../../shared/hooks/useModalChrome';

interface LeaderboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPlayer?: (player: UserProfile) => void;
}

export const LeaderboardModal: React.FC<LeaderboardModalProps> = ({ isOpen, onClose, onSelectPlayer }) => {
  const dialogProps = useModalChrome(isOpen, onClose, 'leaderboard-modal-title');
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
    <div {...dialogProps} className="modal-scrim">
      <div className="modal-panel max-w-lg max-h-[85vh] relative p-6 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-4 border-b-2 border-line pb-3">
          <div>
            <h2 id="leaderboard-modal-title" className="text-lg font-semibold text-ink tracking-tight">Global Leaderboard</h2>
            <p className="text-[11px] text-muted font-medium">Top rankings sorted by player ELO score</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadLeaderboard}
              className="btn btn-tonal btn-sm"
            >
              Refresh
            </button>
            <button
              onClick={onClose}
              className="btn btn-ghost btn-icon ml-1"
             aria-label="Close">
            <X size={18} strokeWidth={2.25} aria-hidden="true" />
          </button>
          </div>
        </div>

        {/* Leaderboard Table Content */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {loading ? (
            <ListSkeleton rows={5} round />
          ) : players.length === 0 ? (
            <div className="py-12 text-center text-muted text-xs">No rankings recorded yet.</div>
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
                  className={`p-3 rounded-md flex items-center justify-between transition border cursor-pointer hover:scale-[1.01] ${
                    idx === 0
                      ? 'bg-warning-soft border-warning shadow-sm hover:bg-warning/20'
                      : 'bg-surface-2 border-line hover:border-accent hover:bg-surface-3'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs font-medium text-accent-text w-6">
                      #{formattedRank}
                    </span>
                    <img
                      src={getAvatarPublicUrl(p.photoURL)}
                      alt={p.displayName}
                      onError={(e) => {
                        e.currentTarget.src = '/Avatar/Zerom.gif';
                      }}
                      className="w-8 h-8 rounded-full border border-accent bg-surface object-contain p-0.5 shadow-xs"
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-ink">{p.displayName}</span>
                        <span className={`text-[9px] px-1.5 py-0.2 rounded-sm border ${rankInfo.color} font-mono font-medium bg-surface`}>
                          {rankInfo.title}
                        </span>
                      </div>
                      <div className="text-[10px] text-muted font-mono mt-0.5">
                        {p.wins || 0}W - {p.losses || 0}L ({winRate}% Win)
                      </div>
                    </div>
                  </div>

                  <div className="text-right font-mono">
                    <div className="text-sm font-semibold text-accent-text">{p.elo} ELO</div>
                    <div className="text-[10px] text-muted">Streak: {p.streak || 0}</div>
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
