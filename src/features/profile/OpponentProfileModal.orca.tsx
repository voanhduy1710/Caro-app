import React from 'react';
import { Flame, X } from 'lucide-react';
import { useModalChrome } from '../../shared/hooks/useModalChrome';
import { RankBadge } from '../../shared/components/RankBadge';
import { getRankTitle } from '../../shared/utils/rankTiers';
import { DEFAULT_ELO } from '../../shared/constants';
import { useT } from '../i18n/language';
import { getAvatarPublicUrl } from '../avatar/avatarService';
import type { OpponentProfileModalProps } from './OpponentProfileModal';

/** Orca style (PR 5) look of another player's profile card. */
export const OpponentProfileModalOrca: React.FC<OpponentProfileModalProps> = ({
  opponent,
  isOpen,
  onClose,
}) => {
  const t = useT();
  const dialogProps = useModalChrome(isOpen, onClose, 'opponent-profile-modal-title');

  if (!isOpen || !opponent) return null;

  const elo = opponent.elo || DEFAULT_ELO;
  const rank = getRankTitle(elo);
  const wins = opponent.wins || 0;
  const losses = opponent.losses || 0;
  const draws = opponent.draws || 0;
  const totalGames = wins + losses + draws;
  const winRate = totalGames > 0 ? Math.round((wins / totalGames) * 100) : 0;
  const streak = opponent.streak || 0;
  const usernameHandle =
    opponent.username || opponent.displayName.toLowerCase().replace(/\s+/g, '');

  return (
    <div {...dialogProps} className="modal-scrim">
      <div className="modal-panel relative flex max-w-md flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <div>
            <h2 id="opponent-profile-modal-title" className="text-sm font-semibold text-ink">
              {t('profile.orca.opponentTitle')}
            </h2>
            <p className="text-xs text-muted">{t('profile.orca.opponentSubtitle')}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="orca-icon-btn"
            aria-label="Close"
          >
            <X size={15} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          {/* Profile Card Header */}
          <div className="flex items-center gap-3.5 rounded-md border border-line bg-surface-2 p-3.5">
            <div className="relative shrink-0">
              <img
                src={getAvatarPublicUrl(opponent.photoURL)}
                alt={opponent.displayName}
                onError={(e) => {
                  e.currentTarget.onerror = null;
                  e.currentTarget.src = getAvatarPublicUrl();
                }}
                className="h-14 w-14 rounded-full border border-line-strong bg-surface object-cover"
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <h3 className="truncate text-sm font-semibold text-ink">
                  {opponent.displayName}
                </h3>
                <RankBadge elo={elo} size={24} />
                <span
                  className={`rounded-[4px] border bg-surface px-1.5 font-mono text-[10px] font-medium ${rank.color}`}
                >
                  {rank.title}
                </span>
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-2 font-mono text-xs tabular-nums">
                <span className="text-muted">@{usernameHandle}</span>
                <span className="text-subtle">·</span>
                <span className="font-semibold text-accent-text">{elo} ELO</span>
              </div>
            </div>
          </div>

          {/* Player Detailed Performance Metrics */}
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted">Match Statistics &amp; Win Rate</div>
            <div className="grid grid-cols-4 divide-x divide-line overflow-hidden rounded-md border border-line bg-surface text-center">
              <div className="px-2 py-2.5">
                <div className="text-[11px] text-subtle">Wins</div>
                <div className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-success">
                  {wins}
                </div>
              </div>
              <div className="px-2 py-2.5">
                <div className="text-[11px] text-subtle">Losses</div>
                <div className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-danger">
                  {losses}
                </div>
              </div>
              <div className="px-2 py-2.5">
                <div className="text-[11px] text-subtle">Draws</div>
                <div className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-warning">
                  {draws}
                </div>
              </div>
              <div className="px-2 py-2.5">
                <div className="text-[11px] text-subtle">Win Rate</div>
                <div className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-ink">
                  {winRate}%
                </div>
              </div>
            </div>
          </div>

          {/* Streak Meta */}
          {streak < 0 ? (
            <div className="flex items-center justify-between rounded-md border border-info/30 bg-info-soft px-3.5 py-2.5 font-mono text-xs tabular-nums">
              <span className="font-medium text-info">Current Loss Streak</span>
              <span className="inline-flex items-center gap-1 font-semibold text-info">
                <img
                  src="/lose.gif"
                  alt=""
                  className="h-4 w-4 object-contain"
                  aria-hidden="true"
                />
                {-streak} games
              </span>
            </div>
          ) : (
            <div className="flex items-center justify-between rounded-md border border-accent/30 bg-accent-soft px-3.5 py-2.5 font-mono text-xs tabular-nums">
              <span className="font-medium text-accent-text">Current Win Streak</span>
              <span className="inline-flex items-center gap-1 font-semibold text-accent-text">
                <Flame size={14} strokeWidth={1.75} className="shrink-0" aria-hidden="true" />
                {streak} games
              </span>
            </div>
          )}
        </div>

        <div className="border-t border-line px-5 py-3.5">
          <button type="button" onClick={onClose} className="btn btn-secondary w-full">
            Close Profile
          </button>
        </div>
      </div>
    </div>
  );
};
