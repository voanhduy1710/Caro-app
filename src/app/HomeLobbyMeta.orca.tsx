import React, { useMemo } from 'react';
import { AlertCircle, SlidersHorizontal } from 'lucide-react';
import { getWinRuleText } from '../features/settings/types';
import { useT } from '../features/i18n/language';
import { Button } from '../shared/ui/primitives';

import type { HomeLobbyMetaProps } from './HomeLobbyMeta';

/** Orca lobby header, error and rejoin strips (PR 5 HomeLobbyMeta). */
export const HomeLobbyMetaOrca: React.FC<HomeLobbyMetaProps> = ({
  user,
  error,
  onDismissError,
  lastRoom,
  onRejoin,
  onDismissLast,
  settings,
  onOpenRules,
}) => {
  const t = useT();

  const ruleSummary = useMemo(() => {
    const parts: string[] = [
      `${settings.boardSize}×${settings.boardSize}`,
      `${settings.totalTimeMinutes ? `${settings.totalTimeMinutes}m` : '∞'} / ${settings.turnTimeSeconds ? `${settings.turnTimeSeconds}s` : '∞'}`,
    ];
    if (settings.allowUndo) {
      parts.push(t('home.ruleUndo'));
    }
    if (settings.placementMode === 'lmao') {
      parts.push('LMAO');
    }
    if (settings.playerMode === 'oneVsOneVsOne') {
      parts.push('1v1v1');
    }
    return parts.join(' · ');
  }, [settings, t]);

  return (
    <div className="flex flex-col gap-3 text-left">
      {/* Workspace Header Strip */}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-ink sm:text-xl">
            {t('home.orcaTitle')}
          </h1>
          <p className="mt-0.5 text-xs text-muted">
            {!user || user.isGuest ? t('home.orcaNoAccount') : getWinRuleText()}
          </p>
        </div>

        {/* Inline interactive rule summary chip */}
        <div className="inline-flex items-center gap-2 self-start rounded-md border border-line bg-surface-2 px-2.5 py-1 text-xs text-muted sm:self-auto">
          <SlidersHorizontal size={14} strokeWidth={1.75} className="text-subtle shrink-0" aria-hidden="true" />
          <span className="font-mono tabular-nums text-ink">{ruleSummary}</span>
          <Button
            variant="ghost"
            size="xs"
            onClick={onOpenRules}
            className="h-5 px-1.5 text-xs text-accent-text hover:text-accent-text-hover hover:bg-surface-3"
          >
            {t('home.changeRules')}
          </Button>
        </div>
      </div>

      {/* Error alert banner */}
      {error && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-lg border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-xs font-medium text-danger"
        >
          <div className="flex items-center gap-2 min-w-0">
            <AlertCircle size={15} strokeWidth={1.75} className="shrink-0" aria-hidden="true" />
            <span className="truncate">{error}</span>
          </div>
          <Button
            variant="danger"
            size="xs"
            onClick={onDismissError}
            className="shrink-0"
          >
            {t('home.dismiss')}
          </Button>
        </div>
      )}

      {/* Rejoin banner */}
      {lastRoom && !error && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface px-3.5 py-2.5 text-xs shadow-xs"
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-ink">
              {t('home.leftRoomPre')}
              <span className="font-mono font-semibold text-accent-text tabular-nums">{lastRoom.roomId}</span>
              {lastRoom.hostName ? ` (${t('home.hostsRoom', { name: lastRoom.hostName })})` : ''}.
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Button
              variant="primary"
              size="sm"
              onClick={onRejoin}
            >
              {t('home.rejoin')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onDismissLast}
            >
              {t('home.dismiss')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
