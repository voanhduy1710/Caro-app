/*
 * Orca style (PR 5) match history: a dialog for use mid-match, or, with
 * `embedded`, the History page of the Orca workspace. Data and its guards come
 * from useMatchHistory (shared with the Default dialog).
 */
import React, { useState } from 'react';
import { Bot, Globe, RefreshCw, Search, X } from 'lucide-react';
import { ListSkeleton } from '../../shared/components/ListSkeleton';
import { Badge } from '../../shared/ui/primitives';
import { useAuth } from '../auth/AuthContext';
import { useModalChrome } from '../../shared/hooks/useModalChrome';
import { useT } from '../i18n/language';
import { useMatchHistory } from './useMatchHistory';

type Translate = ReturnType<typeof useT>;

/** "5m ago" for recent matches, the date for older ones. */
const formatWhen = (timestamp: number, t: Translate): string => {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return '';
  const minutes = Math.floor((Date.now() - timestamp) / 60_000);
  if (minutes < 1) return t('home.orca.history.justNow');
  if (minutes < 60) return t('home.orca.history.minutesAgo', { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('home.orca.history.hoursAgo', { n: hours });
  const days = Math.floor(hours / 24);
  if (days < 7) return t('home.orca.history.daysAgo', { n: days });
  return new Date(timestamp).toLocaleDateString();
};

export interface HistoryModalOrcaProps {
  isOpen: boolean;
  onClose: () => void;
  /** Closes the dialog and drops the player straight into a practice game. */
  onPlayNow: () => void;
  /** The workspace page: no scrim, no close button, no focus trap. */
  embedded?: boolean;
}

export const HistoryModalOrca: React.FC<HistoryModalOrcaProps> = ({ isOpen, onClose, onPlayNow, embedded = false }) => {
  const t = useT();
  const { user } = useAuth();
  const dialogProps = useModalChrome(!embedded && isOpen, onClose, 'history-modal-title');
  const { loading, history, reload } = useMatchHistory(isOpen, user?.uid);
  const [search, setSearch] = useState('');

  if (!isOpen) return null;

  const query = search.trim().toLowerCase();
  const filteredHistory = query
    ? history.filter(
        (m) =>
          m.player1Name.toLowerCase().includes(query) ||
          m.player2Name.toLowerCase().includes(query) ||
          (m.mode ?? '').toLowerCase().includes(query),
      )
    : history;

  const header = (
    <div className="flex items-center justify-between gap-2 border-b border-line pb-3">
      <div>
        <h2 id="history-modal-title" className="text-sm font-semibold text-ink">
          Match history
        </h2>
        <p className="text-xs text-muted">{t('home.orca.history.subtitle')}</p>
      </div>
      <div className="flex items-center gap-1.5">
        <button type="button" onClick={reload} disabled={loading} className="btn btn-ghost btn-sm">
          <RefreshCw size={13.5} strokeWidth={1.75} className={loading ? 'animate-spin' : ''} aria-hidden="true" />
          Refresh
        </button>
        {!embedded && (
          <button type="button" onClick={onClose} className="orca-icon-btn" aria-label="Close">
            <X size={15} strokeWidth={1.75} aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );

  const searchBar = (
    <div className="relative">
      <Search
        size={14}
        strokeWidth={1.75}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle"
        aria-hidden="true"
      />
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t('home.orca.history.searchPlaceholder')}
        aria-label={t('home.orca.history.searchLabel')}
        className="field-input h-8 pl-8 pr-8 text-xs"
      />
      {search && (
        <button
          type="button"
          onClick={() => setSearch('')}
          aria-label="Clear search"
          className="orca-icon-btn absolute right-1 top-1/2 h-6 w-6 -translate-y-1/2"
        >
          <X size={13} strokeWidth={1.75} aria-hidden="true" />
        </button>
      )}
    </div>
  );

  /* "Nothing yet" and "nothing matched your search" are different problems,
     so they get different ways out. */
  const listContent = loading ? (
    <ListSkeleton rows={4} />
  ) : history.length === 0 ? (
    <div className="space-y-3 rounded-md border border-line bg-surface py-12 text-center">
      <p className="text-xs text-muted">You have not finished a match yet.</p>
      <button type="button" onClick={onPlayNow} className="btn btn-primary btn-sm">
        {t('home.orca.history.playBot')}
      </button>
    </div>
  ) : filteredHistory.length === 0 ? (
    <div className="space-y-3 rounded-md border border-line bg-surface py-12 text-center">
      <p className="text-xs text-muted">No match involves a player called &ldquo;{search}&rdquo;.</p>
      <button type="button" onClick={() => setSearch('')} className="btn btn-secondary btn-sm">
        Clear search
      </button>
    </div>
  ) : (
    <div className="divide-y divide-line overflow-hidden rounded-md border border-line bg-surface">
      {filteredHistory.map((m) => {
        const isP1 = user?.uid === m.player1Uid;
        const isWin = m.winnerUid === user?.uid;
        const isDraw = m.winnerUid === 'DRAW';
        const opponentName = isP1 ? m.player2Name : m.player1Name;
        const delta = isP1 ? m.eloDeltaPlayer1 : m.eloDeltaPlayer2;
        const isPractice = m.mode === 'ai';
        const clockText = m.timerConfig && m.timerConfig !== '0m / 0s' ? m.timerConfig : null;

        return (
          <div
            key={m.id}
            className="flex items-center justify-between gap-3 px-3.5 py-2.5 transition-colors hover:bg-surface-2/60"
          >
            <div className="flex min-w-0 items-center gap-3">
              <Badge
                tone={isDraw ? 'warning' : isWin ? 'success' : 'danger'}
                className="w-12 justify-center font-mono text-[10.5px] font-semibold uppercase tracking-wide"
              >
                {isDraw ? 'DRAW' : isWin ? 'WIN' : 'LOSS'}
              </Badge>

              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5 text-[13px] text-ink">
                  <span className="text-muted">vs</span>
                  <span className="truncate font-medium text-ink">{opponentName}</span>
                  <span className="inline-flex items-center gap-1 rounded-[4px] border border-line bg-surface-2 px-1.5 font-mono text-[10px] text-muted">
                    {isPractice ? (
                      <Bot size={11} strokeWidth={1.75} aria-hidden="true" />
                    ) : (
                      <Globe size={11} strokeWidth={1.75} aria-hidden="true" />
                    )}
                    {t(isPractice ? 'home.orca.history.modeBot' : 'home.orca.history.modeOnline')}
                  </span>
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5 font-mono text-[11px] tabular-nums text-muted">
                  <span>
                    {m.boardSize}×{m.boardSize}
                  </span>
                  {clockText && (
                    <>
                      <span className="text-subtle">·</span>
                      <span>{clockText}</span>
                    </>
                  )}
                  <span className="text-subtle">·</span>
                  <span className="text-subtle" title={new Date(m.timestamp).toLocaleString()}>
                    {formatWhen(m.timestamp, t)}
                  </span>
                </div>
              </div>
            </div>

            <div className="shrink-0 text-right font-mono tabular-nums">
              {/* Practice never touches the rating, so "0 ELO" would read as a
                  result rather than as not applicable. */}
              {isPractice ? (
                <span className="text-xs font-medium text-subtle">No rating</span>
              ) : (
                <span
                  className={`text-xs font-semibold ${delta > 0 ? 'text-success' : delta < 0 ? 'text-danger' : 'text-muted'}`}
                >
                  {delta > 0 ? `+${delta}` : delta} ELO
                </span>
              )}
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
        {searchBar}
        {listContent}
      </div>
    );
  }

  return (
    <div {...dialogProps} className="modal-scrim">
      <div className="modal-panel relative flex max-h-[85dvh] max-w-2xl flex-col overflow-hidden p-4 sm:p-5">
        {header}
        <div className="mt-3">{searchBar}</div>
        <div className="scrollbar-orca mt-3 flex-1 overflow-y-auto pr-0.5">{listContent}</div>
      </div>
    </div>
  );
};
