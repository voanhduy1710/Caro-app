/*
 * Orca style (PR 5) leaderboard: a hairline table of the top players, a
 * dialog mid-match or, with `embedded`, the Leaderboard page of the Orca
 * workspace. Data comes from useLeaderboard (shared with the Default dialog).
 */
import React, { useState } from 'react';
import { Award, RefreshCw, X } from 'lucide-react';
import { ListSkeleton } from '../../shared/components/ListSkeleton';
import type { UserProfile } from '../auth/AuthContext';
import { RankBadge } from '../../shared/components/RankBadge';
import { getRankTitle } from '../../shared/utils/rankTiers';
import { getAvatarPublicUrl } from '../avatar/avatarService';
import { useModalChrome } from '../../shared/hooks/useModalChrome';
import { useT } from '../i18n/language';
import { RankGuideModalOrca } from './RankGuideModal.orca';
import { useLeaderboard } from './useLeaderboard';

export interface LeaderboardModalOrcaProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPlayer?: (player: UserProfile) => void;
  /** The workspace page: no scrim, no close button, no focus trap. */
  embedded?: boolean;
}

/** Gold, silver and bronze for the podium; everyone else is plain. */
const rankPillClasses = (idx: number): string => {
  if (idx === 0) return 'border-amber-500/40 bg-amber-500/15 text-amber-500 font-semibold';
  if (idx === 1) return 'border-slate-400/40 bg-slate-400/15 text-slate-300 font-semibold';
  if (idx === 2) return 'border-amber-700/40 bg-amber-700/15 text-amber-600 font-semibold';
  return 'border-transparent bg-transparent text-subtle font-medium';
};

export const LeaderboardModalOrca: React.FC<LeaderboardModalOrcaProps> = (props) =>
  props.isOpen ? <OpenLeaderboardOrca {...props} /> : null;

const OpenLeaderboardOrca: React.FC<LeaderboardModalOrcaProps> = ({ isOpen, onClose, onSelectPlayer, embedded = false }) => {
  const t = useT();
  const [showRankGuide, setShowRankGuide] = useState(false);
  const closeLeaderboard = () => {
    setShowRankGuide(false);
    onClose();
  };
  const dialogProps = useModalChrome(!embedded && isOpen && !showRankGuide, closeLeaderboard, 'leaderboard-modal-title');
  const { players, loading, reload } = useLeaderboard(isOpen);

  if (showRankGuide) {
    return <RankGuideModalOrca isOpen onClose={() => setShowRankGuide(false)} embedded={embedded} />;
  }

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
      <div>
        <h2 id="leaderboard-modal-title" className="text-sm font-semibold text-ink">
          Leaderboard
        </h2>
        <p className="text-xs text-muted">{t('home.orca.leaderboard.subtitle')}</p>
      </div>
      <div className="flex items-center gap-1.5">
        <button type="button" onClick={() => setShowRankGuide(true)} className="btn btn-secondary btn-sm">
          <Award size={14} strokeWidth={1.75} aria-hidden="true" />
          Rank guide
        </button>
        <button type="button" onClick={reload} disabled={loading} className="btn btn-ghost btn-sm">
          <RefreshCw size={13.5} strokeWidth={1.75} className={loading ? 'animate-spin' : ''} aria-hidden="true" />
          Refresh
        </button>
        {!embedded && (
          <button type="button" onClick={closeLeaderboard} className="orca-icon-btn ml-0.5" aria-label="Close">
            <X size={15} strokeWidth={1.75} aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );

  const listContent = loading ? (
    <ListSkeleton rows={6} round />
  ) : players.length === 0 ? (
    <div className="rounded-md border border-line bg-surface py-12 text-center text-xs text-muted">
      No rankings recorded yet.
    </div>
  ) : (
    <div className="divide-y divide-line overflow-hidden rounded-md border border-line bg-surface">
      {players.map((p, idx) => {
        const rankInfo = getRankTitle(p.elo);
        const wins = p.wins || 0;
        const losses = p.losses || 0;
        const draws = p.draws || 0;
        const totalGames = wins + losses + draws;
        const winRate = totalGames > 0 ? Math.round((wins / totalGames) * 100) : 0;
        const streak = p.streak || 0;
        const isHotStreak = streak > 2;
        const isColdStreak = streak < -2;

        return (
          <div
            key={p.uid || idx}
            role="button"
            tabIndex={0}
            onClick={() => onSelectPlayer?.(p)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelectPlayer?.(p);
              }
            }}
            title="Click to view player profile"
            className="flex cursor-pointer items-center justify-between gap-3 px-3.5 py-2.5 transition-colors hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none"
          >
            <div className="flex min-w-0 items-center gap-3">
              <span
                className={`inline-flex h-6 w-8 shrink-0 items-center justify-center rounded-[4px] border font-mono text-xs tabular-nums ${rankPillClasses(idx)}`}
              >
                #{idx + 1}
              </span>
              <img
                src={getAvatarPublicUrl(p.photoURL)}
                alt={p.displayName}
                onError={(e) => {
                  e.currentTarget.onerror = null;
                  e.currentTarget.src = getAvatarPublicUrl();
                }}
                className="h-8 w-8 shrink-0 rounded-full border border-line bg-surface-2 object-cover"
              />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <RankBadge elo={p.elo} size={20} />
                  <span className="truncate text-[13px] font-medium text-ink">{p.displayName}</span>
                  <span className={`rounded-[4px] border bg-surface-2 px-1.5 font-mono text-[10px] font-medium ${rankInfo.color}`}>
                    {rankInfo.title}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center gap-2 font-mono text-[11px] tabular-nums text-muted">
                  <span>
                    {wins}W · {losses}L ({winRate}%)
                  </span>
                  {streak !== 0 && (
                    <span
                      className={`inline-flex items-center gap-1 ${
                        isHotStreak ? 'text-danger' : isColdStreak ? 'text-info' : 'text-subtle'
                      }`}
                    >
                      <span>· {streak > 0 ? `+${streak}W` : `${streak}L`}</span>
                      {isHotStreak && <img src="/Fire_streak.gif" alt="On fire" className="h-3.5 w-3.5 object-contain" />}
                      {isColdStreak && <img src="/lose.gif" alt="Losing streak" className="h-3.5 w-3.5 object-contain" />}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="shrink-0 text-right font-mono tabular-nums">
              <div className="text-[13px] font-semibold text-ink">{p.elo}</div>
              <div className="text-[10px] uppercase tracking-wider text-subtle">ELO</div>
            </div>
          </div>
        );
      })}
    </div>
  );

  if (embedded) {
    return (
      <div className="mx-auto w-full max-w-4xl space-y-5 px-4 py-5 sm:px-6">
        {header}
        {listContent}
      </div>
    );
  }

  return (
    <div {...dialogProps} className="modal-scrim">
      <div className="modal-panel relative flex max-h-[85dvh] max-w-2xl flex-col overflow-hidden p-4 sm:p-5">
        {header}
        <div className="scrollbar-orca mt-3 flex-1 overflow-y-auto pr-0.5">{listContent}</div>
      </div>
    </div>
  );
};
