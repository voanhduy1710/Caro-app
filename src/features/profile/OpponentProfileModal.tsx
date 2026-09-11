import React from 'react';
import { X, Flame } from 'lucide-react';
import type { UserProfile } from '../auth/AuthContext';
import { useModalChrome } from '../../shared/hooks/useModalChrome';
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
  const dialogProps = useModalChrome(isOpen, onClose, 'opponent-profile-modal-title');

  if (!isOpen || !opponent) return null;

  const rank = getRankTitle(opponent.elo || 1200);
  const wins = opponent.wins || 0;
  const losses = opponent.losses || 0;
  const draws = opponent.draws || 0;
  const totalGames = wins + losses + draws;
  const winRate = totalGames > 0 ? Math.round((wins / totalGames) * 100) : 0;
  const usernameHandle = opponent.username || opponent.displayName.toLowerCase().replace(/\s+/g, '');

  return (
    <div
      {...dialogProps}
      className="modal-scrim"
    >
      <div className="modal-panel max-w-md relative p-6 space-y-5">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-line pb-3">
          <div>
            <h2 id="opponent-profile-modal-title" className="text-xl font-semibold text-ink tracking-tight">
              Opponent Profile
            </h2>
          </div>
          <button
            onClick={onClose}
            className="btn btn-ghost btn-icon"
           aria-label="Close">
            <X size={18} strokeWidth={2.25} aria-hidden="true" />
          </button>
        </div>

        {/* Profile Card Header */}
        <div className="bg-surface-2 border border-line p-4 rounded-lg flex items-center gap-4 shadow-xs">
          <div className="relative shrink-0">
            <img
              src={getAvatarPublicUrl(opponent.photoURL)}
              alt={opponent.displayName}
              onError={(e) => {
                e.currentTarget.onerror = null;
                e.currentTarget.src = getAvatarPublicUrl();
              }}
              className="w-16 h-16 rounded-full border-2 border-accent bg-surface p-0.5 shadow-sm object-contain"
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold text-ink truncate">{opponent.displayName}</h3>
              <span className={`text-[10px] font-mono font-medium px-2 py-0.5 rounded-sm border bg-surface ${rank.color}`}>
                {rank.title}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[11px] font-mono font-semibold text-muted">
                @{usernameHandle}
              </span>
              <span className="text-xs font-mono font-medium text-accent-text">
                · {opponent.elo || 1200} ELO
              </span>
            </div>
          </div>
        </div>

        {/* Player Detailed Performance Metrics */}
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted">
            Match Statistics & Win Rate
          </div>
          <div className="grid grid-cols-4 gap-2 text-center bg-surface-2 p-3.5 rounded-lg border border-line">
            <div>
              <div className="text-subtle text-[11px]">Wins</div>
              <div className="text-accent-text font-semibold text-lg mt-0.5">{wins}</div>
            </div>
            <div>
              <div className="text-subtle text-[11px]">Losses</div>
              <div className="text-danger font-semibold text-lg mt-0.5">{losses}</div>
            </div>
            <div>
              <div className="text-subtle text-[11px]">Draws</div>
              <div className="text-warning font-semibold text-lg mt-0.5">{draws}</div>
            </div>
            <div>
              <div className="text-subtle text-[11px]">Win Rate</div>
              <div className="text-ink font-semibold text-lg mt-0.5">{winRate}%</div>
            </div>
          </div>
        </div>

        {/* Additional Player Meta */}
        <div className="p-3 bg-accent-soft border border-accent rounded-md flex items-center justify-between text-xs font-mono">
          <span className="text-accent-text font-medium">Current Win Streak</span>
          <span className="font-semibold text-accent-text text-sm"><Flame size={14} strokeWidth={2.25} className="inline shrink-0 mr-1 -mt-0.5" aria-hidden="true" />{opponent.streak || 0} games</span>
        </div>

        {/* Close Action */}
        <button
          onClick={onClose}
          className="btn btn-inverse btn-lg w-full"
        >
          Close Profile
        </button>
      </div>
    </div>
  );
};
