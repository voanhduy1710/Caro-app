/*
 * Orca style (PR 5) rank guide: every tier as a row of a hairline table, and a
 * badge preview dialog. With `embedded` it renders as part of the Orca
 * Leaderboard page instead of a dialog.
 */
import React, { useState } from 'react';
import { ArrowLeft, X } from 'lucide-react';
import { RANK_TIERS } from '../../shared/utils/rankTiers';
import type { RankTier } from '../../shared/utils/rankTiers';
import { useModalChrome } from '../../shared/hooks/useModalChrome';
import { useT } from '../i18n/language';
import { formatEloRange } from './rankRange';

export interface RankGuideModalOrcaProps {
  isOpen: boolean;
  onClose: () => void;
  embedded?: boolean;
}

export const RankGuideModalOrca: React.FC<RankGuideModalOrcaProps> = ({ isOpen, onClose, embedded = false }) => {
  const t = useT();
  const [selectedTier, setSelectedTier] = useState<RankTier | null>(null);
  const dialogProps = useModalChrome(!embedded && isOpen && selectedTier === null, onClose, 'rank-guide-modal-title');

  if (!isOpen) return null;
  if (selectedTier) return <RankBadgePreviewOrca tier={selectedTier} onClose={() => setSelectedTier(null)} />;

  const header = (
    <div className="flex items-center justify-between gap-3 border-b border-line pb-3">
      <div className="flex min-w-0 items-center gap-2">
        <button type="button" onClick={onClose} className="orca-icon-btn" aria-label="Back to leaderboard">
          <ArrowLeft size={15} strokeWidth={1.75} aria-hidden="true" />
        </button>
        <div>
          <h2 id="rank-guide-modal-title" className="text-sm font-semibold text-ink">
            Rank guide
          </h2>
          <p className="text-xs text-muted">{t('home.orca.rankGuide.subtitle', { n: RANK_TIERS.length })}</p>
        </div>
      </div>
      {!embedded && (
        <button type="button" onClick={onClose} className="orca-icon-btn" aria-label="Close rank guide">
          <X size={15} strokeWidth={1.75} aria-hidden="true" />
        </button>
      )}
    </div>
  );

  const tierList = (
    <div className="divide-y divide-line overflow-hidden rounded-md border border-line bg-surface">
      {RANK_TIERS.map((tier, index) => (
        <div
          key={tier.title}
          className="flex items-center justify-between gap-3 px-3.5 py-2 transition-colors hover:bg-surface-2/60"
        >
          <div className="flex min-w-0 items-center gap-3">
            <span className="w-6 shrink-0 font-mono text-[11px] tabular-nums text-subtle">
              #{String(index + 1).padStart(2, '0')}
            </span>
            <button
              type="button"
              onClick={() => setSelectedTier(tier)}
              aria-label={`View ${tier.title} badge`}
              className="shrink-0 rounded-[6px] border border-transparent p-1 transition-colors hover:border-line hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent"
            >
              <img src={tier.badge} alt="" width={36} height={36} loading="lazy" className="h-9 w-9 object-contain" />
            </button>
            <div className="min-w-0">
              <span
                className={`inline-flex items-center rounded-[4px] border bg-surface-2 px-1.5 py-0.5 font-mono text-xs font-medium ${tier.color}`}
              >
                {tier.title}
              </span>
            </div>
          </div>
          <div className="shrink-0 font-mono text-xs tabular-nums text-muted">{formatEloRange(tier, index)}</div>
        </div>
      ))}
    </div>
  );

  if (embedded) {
    return (
      <div className="mx-auto w-full max-w-4xl space-y-5 px-4 py-5 sm:px-6">
        {header}
        {tierList}
      </div>
    );
  }

  return (
    <div {...dialogProps} className="modal-scrim">
      <div className="modal-panel flex max-h-[85dvh] max-w-lg flex-col overflow-hidden p-4 sm:p-5">
        {header}
        <div className="scrollbar-orca mt-3 flex-1 overflow-y-auto pr-0.5">{tierList}</div>
      </div>
    </div>
  );
};

const RankBadgePreviewOrca: React.FC<{ tier: RankTier; onClose: () => void }> = ({ tier, onClose }) => {
  const dialogProps = useModalChrome(true, onClose, 'rank-badge-preview-title');
  const tierIndex = RANK_TIERS.findIndex((other) => other.title === tier.title);
  const eloRange = tierIndex >= 0 ? formatEloRange(tier, tierIndex) : '';

  return (
    <div {...dialogProps} className="modal-scrim">
      <div className="modal-panel flex max-h-[90dvh] max-w-sm flex-col overflow-hidden p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3 border-b border-line pb-3">
          <button type="button" onClick={onClose} className="orca-icon-btn" aria-label="Back to rank guide">
            <ArrowLeft size={15} strokeWidth={1.75} aria-hidden="true" />
          </button>
          <div className="text-center">
            <h2 id="rank-badge-preview-title" className={`text-sm font-semibold ${tier.color.split(' ')[0]}`}>
              {tier.title}
            </h2>
            {eloRange && <p className="font-mono text-[11px] tabular-nums text-muted">{eloRange}</p>}
          </div>
          <button type="button" onClick={onClose} className="orca-icon-btn" aria-label="Close badge preview">
            <X size={15} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto py-4 text-center">
          <img
            src={tier.badge}
            alt={`${tier.title} rank badge`}
            width={280}
            height={320}
            className="mx-auto h-auto max-h-[60vh] w-[min(70vw,280px)] object-contain"
          />
        </div>
      </div>
    </div>
  );
};
