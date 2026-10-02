import React, { useState } from 'react';
import { ArrowLeft, X } from 'lucide-react';
import { RANK_TIERS } from '../../shared/utils/eloCalculator';
import type { RankTier } from '../../shared/utils/eloCalculator';
import { useModalChrome } from '../../shared/hooks/useModalChrome';

interface RankGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const RankGuideModal: React.FC<RankGuideModalProps> = ({ isOpen, onClose }) => {
  const [selectedTier, setSelectedTier] = useState<RankTier | null>(null);
  const dialogProps = useModalChrome(isOpen && selectedTier === null, onClose, 'rank-guide-modal-title');

  if (!isOpen) return null;
  if (selectedTier) return <RankBadgePreviewModal tier={selectedTier} onClose={() => setSelectedTier(null)} />;

  return (
    <div {...dialogProps} className="modal-scrim">
      <div className="modal-panel max-w-lg max-h-[calc(100dvh-2rem)] p-3 sm:p-4 flex flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-line pb-2 mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <button onClick={onClose} className="btn btn-ghost btn-icon" aria-label="Back to leaderboard">
              <ArrowLeft size={18} aria-hidden="true" />
            </button>
            <h2 id="rank-guide-modal-title" className="text-xl text-ink">Rank guide</h2>
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-icon" aria-label="Close rank guide">
            <X size={18} strokeWidth={2.25} aria-hidden="true" />
          </button>
        </div>

        <p className="text-xs text-muted mb-2">Ranks are based on your Elo rating.</p>
        <div className="flex-1 overflow-y-auto space-y-1">
          {RANK_TIERS.map((tier, index) => {
            const nextMinElo = RANK_TIERS[index - 1]?.minElo;
            const eloRange = tier.minElo === null
              ? `Below ${nextMinElo} Elo`
              : typeof nextMinElo !== 'number'
                ? `${tier.minElo}+ Elo`
                : `${tier.minElo}–${nextMinElo - 1} Elo`;

            return (
              <div key={tier.title} className="flex items-center gap-2 rounded-md border border-line bg-surface-2 px-2.5 py-1">
                <button
                  onClick={() => setSelectedTier(tier)}
                  aria-label={`View ${tier.title} badge`}
                  className="shrink-0 rounded-md p-1 hover:bg-surface-3 focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <img src={tier.badge} alt="" width={40} height={40} loading="lazy" className="h-10 w-10 object-contain" />
                </button>
                <div className="min-w-0 flex-1">
                  <div className={`font-semibold ${tier.color.split(' ')[0]}`}>{tier.title}</div>
                  <div className="font-mono text-xs text-muted">{eloRange}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const RankBadgePreviewModal: React.FC<{ tier: RankTier; onClose: () => void }> = ({ tier, onClose }) => {
  const dialogProps = useModalChrome(true, onClose, 'rank-badge-preview-title');

  return (
    <div {...dialogProps} className="modal-scrim">
      <div className="modal-panel max-w-md max-h-[90vh] p-4 sm:p-6 flex flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-line pb-3 mb-3">
          <button onClick={onClose} className="btn btn-ghost btn-icon" aria-label="Back to rank guide">
            <ArrowLeft size={18} aria-hidden="true" />
          </button>
          <h2 id="rank-badge-preview-title" className={`text-xl font-semibold ${tier.color.split(' ')[0]}`}>
            {tier.title}
          </h2>
          <button onClick={onClose} className="btn btn-ghost btn-icon" aria-label="Close badge preview">
            <X size={18} strokeWidth={2.25} aria-hidden="true" />
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto text-center">
          <img
            src={tier.badge}
            alt={`${tier.title} rank badge`}
            width={320}
            height={364}
            className="mx-auto w-[min(75vw,320px)] h-auto max-h-[65vh] object-contain"
          />
        </div>
      </div>
    </div>
  );
};
