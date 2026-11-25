import React from 'react';
import { BellRing, MessageSquare } from 'lucide-react';
import { getAvatarPublicUrl } from '../avatar/avatarService';
import { useTheme } from '../theme/ThemeContext';
import { pieceColor } from '../theme/types';
import { RankBadge } from '../../shared/components/RankBadge';
import { Button, IconButton } from '../../shared/ui/primitives';
import { cn } from '../../shared/ui/cn';
import { formatReconnectDuration } from '../../shared/utils/formatDuration';
import { useT } from '../i18n/language';
import type { MatchHeaderProps, SeatView } from './MatchHeader';

/**
 * Orca style (PR 5) match header: a session score bar over one crisp 1px card
 * per seat, stacked in the 248px match sidebar. The phone layout does not use
 * it (GameControls draws compact strips from the same seats there).
 */

const formatClock = (seconds: number) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const mm = m.toString().padStart(2, '0');
  const ss = s.toString().padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
};

type TimerInfo = NonNullable<MatchHeaderProps['playerTimers']>[number];

interface PlayerCardProps {
  seat: SeatView;
  color: string;
  elo: number | null;
  isGuest: boolean;
  timerInfo?: TimerInfo;
  onNudge?: () => void;
  nudgeDisabled?: boolean;
}

const PlayerCard: React.FC<PlayerCardProps> = ({ seat, color, elo, isGuest, timerInfo, onNudge, nudgeDisabled = false }) => {
  const t = useT();
  const { name, photoURL, piece, clock, moveClock, isTurn, tag, bubble, onClick, title, empty = false, reconnectingSeconds = null, action } = seat;

  const hasMoveClock = moveClock > 0;
  const isUrgent = hasMoveClock && moveClock <= 5;
  const away = reconnectingSeconds !== null;
  const thinking = t('game.thinking');
  const displayClock = clock > 0 ? clock : timerInfo ? timerInfo.seconds : null;
  const showStatusRow =
    !empty && (away || isTurn || tag === thinking || hasMoveClock || displayClock !== null || timerInfo !== undefined);

  return (
    <div
      className={cn(
        'flex flex-col rounded-[8px] border p-2 transition-colors duration-150',
        empty
          ? 'border-dashed border-line-strong bg-surface/50'
          : isTurn
          ? 'border-line-strong bg-surface-2/85'
          : 'border-line bg-surface hover:border-line-strong',
      )}
    >
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={onClick}
          disabled={!onClick}
          title={title}
          className={cn(
            'flex min-w-0 flex-1 items-center gap-2 rounded-[5px] text-left transition-opacity',
            onClick ? 'hover:opacity-90' : 'cursor-default',
          )}
        >
          <span
            className="grid h-5 w-5 shrink-0 place-items-center rounded-[5px] border font-mono text-[11px] font-semibold leading-none"
            style={
              isTurn && !empty
                ? { backgroundColor: `${color}28`, color, borderColor: `${color}70` }
                : { backgroundColor: `${color}14`, color, borderColor: `${color}3d` }
            }
          >
            {piece === 'T' ? '△' : piece}
          </span>

          {empty ? (
            <span className="h-7 w-7 shrink-0 rounded-full border border-dashed border-line-strong bg-surface-2" aria-hidden="true" />
          ) : (
            <img
              src={getAvatarPublicUrl(photoURL)}
              alt=""
              aria-hidden="true"
              onError={(e) => {
                e.currentTarget.onerror = null;
                e.currentTarget.src = getAvatarPublicUrl();
              }}
              className={cn(
                'h-7 w-7 shrink-0 rounded-full border border-line bg-surface-2 object-contain p-0.5',
                away && 'opacity-45 grayscale',
              )}
            />
          )}

          <span className="flex min-w-0 flex-1 flex-col">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className={cn('min-w-0 truncate text-[12.5px] font-semibold leading-4', empty ? 'text-subtle' : 'text-ink')}>{name}</span>
              {tag && tag !== thinking && (
                <span className="shrink-0 rounded-[4px] border border-line bg-surface-2 px-1 py-0 text-[10px] font-medium leading-4 text-muted">
                  {tag}
                </span>
              )}
            </span>
            {!empty && elo !== null && !isGuest ? (
              <span className="mt-0.5 flex items-center gap-1 font-mono text-[11px] leading-4 text-muted tabular-nums">
                <RankBadge elo={elo} size={14} />
                <span>{elo} ELO</span>
              </span>
            ) : empty ? (
              <span className="mt-0.5 truncate text-[11px] leading-4 text-subtle">{title}</span>
            ) : null}
          </span>
        </button>

        {onNudge && (
          <IconButton
            size="sm"
            onClick={onNudge}
            disabled={nudgeDisabled}
            title={t('game.buzzTitle')}
            aria-label={`${t('game.buzzTitle')} (${name})`}
            className="text-muted hover:text-warning"
          >
            <BellRing size={13} strokeWidth={1.75} aria-hidden="true" />
          </IconButton>
        )}
      </div>

      {showStatusRow && (
        <div className="mt-1.5 flex items-center justify-between gap-1.5 border-t border-line pt-1.5">
          <div className="min-w-0 truncate">
            {away ? (
              <span className="font-mono text-[11px] font-medium text-warning tabular-nums">
                {t('game.reconnecting', { time: formatReconnectDuration(reconnectingSeconds) })}
              </span>
            ) : tag === thinking ? (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
                <span>{tag}</span>
              </span>
            ) : isTurn ? (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-ink">
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
                <span>{t('game.playing')}</span>
              </span>
            ) : timerInfo ? (
              <span className="font-mono text-[11px] text-subtle tabular-nums">
                {timerInfo.moves} {timerInfo.moves === 1 ? t('game.moveOne') : t('game.moveMany')}
              </span>
            ) : null}
          </div>

          {!away && (hasMoveClock || displayClock !== null) && (
            <div className="flex shrink-0 items-center gap-1 font-mono tabular-nums">
              {hasMoveClock && (
                <span
                  className={cn(
                    'rounded-[4px] border px-1.5 py-0.5 text-[11px] font-semibold leading-none',
                    isUrgent ? 'animate-pulse border-danger/50 bg-danger-solid text-danger-fg' : 'border-accent/30 bg-accent-soft text-accent-text',
                  )}
                >
                  {moveClock}s<span className="sr-only">{t('game.leftForMove')}</span>
                </span>
              )}
              {displayClock !== null && (
                <span
                  className={cn(
                    'rounded-[4px] border px-1.5 py-0.5 text-[11.5px] font-semibold leading-none',
                    isTurn ? 'border-line-strong bg-surface-2 text-ink' : 'border-line bg-surface-2/60 text-muted',
                  )}
                >
                  {formatClock(displayClock)}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {bubble && (
        <div
          role="status"
          className="mt-1.5 flex items-center gap-1.5 rounded-[5px] border border-line-strong bg-surface-2 px-2 py-1 text-[11.5px] font-medium text-ink"
        >
          <MessageSquare size={12} strokeWidth={1.75} className="shrink-0 text-accent-text" aria-hidden="true" />
          <span className="min-w-0 truncate">{bubble}</span>
        </div>
      )}

      {action && (
        <div className="mt-1.5">
          <Button
            variant={action.tone === 'primary' ? 'primary' : 'secondary'}
            size="sm"
            onClick={action.onClick}
            className="h-7 w-full justify-center text-xs"
          >
            {action.label}
          </Button>
        </div>
      )}
    </div>
  );
};

export const MatchHeaderOrca: React.FC<MatchHeaderProps> = ({
  seats,
  score,
  announcement,
  scoreLabel,
  playerTimers,
  myUser = null,
  opponent = null,
  isAiMode = false,
  role = 'player',
  onNudgeOpponent,
  nudgeDisabled = false,
}) => {
  const { theme } = useTheme();
  const isThree = seats.length === 3;

  // A seat's rating: the caller's when it gave one, else the signed-in user
  // for the first seat and the known opponent for theirs.
  const ratingOf = (seat: SeatView, index: number): { elo: number | null; isGuest: boolean } => {
    if (seat.elo !== undefined) return { elo: seat.elo, isGuest: Boolean(seat.isGuest) };
    if (seat.empty) return { elo: null, isGuest: false };
    if (role === 'player' && index === 0 && myUser) {
      return { elo: myUser.isGuest ? null : myUser.elo, isGuest: Boolean(myUser.isGuest) };
    }
    if (opponent && ((role === 'player' && index === 1 && !isThree) || seat.name === opponent.displayName)) {
      return { elo: opponent.isGuest ? null : opponent.elo, isGuest: Boolean(opponent.isGuest) };
    }
    return { elo: null, isGuest: false };
  };

  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex items-center justify-between gap-2 rounded-[6px] border border-line bg-surface-2/75 px-2.5 py-1.5">
        <div className="flex items-center gap-1.5 font-mono text-[11px] font-medium text-muted">
          {isThree && (
            <span className="rounded-[4px] border border-accent/30 bg-accent-soft px-1.5 py-0 text-[10px] font-semibold text-accent-text">1v1v1</span>
          )}
          <span>{seats.map((s) => (s.piece === 'T' ? '△' : s.piece)).join(' · ')}</span>
        </div>
        <div className="flex items-center gap-1 font-mono text-[13px] font-semibold leading-none text-ink tabular-nums">
          <span>{score[0] ?? 0}</span>
          <span aria-hidden="true" className="text-subtle">–</span>
          <span>{score[1] ?? 0}</span>
          {isThree && (
            <>
              <span aria-hidden="true" className="text-subtle">–</span>
              <span>{score[2] ?? 0}</span>
            </>
          )}
          <span className="sr-only">{scoreLabel}</span>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        {seats.map((seat, index) => {
          const rating = ratingOf(seat, index);
          // The buzz lives on the other seats' cards, for a seated player only.
          const nudge = !isAiMode && role === 'player' && index > 0 && !seat.empty ? onNudgeOpponent : undefined;
          return (
            <PlayerCard
              key={`${seat.piece}-${index}`}
              seat={seat}
              color={pieceColor(theme, seat.piece)}
              elo={rating.elo}
              isGuest={rating.isGuest}
              timerInfo={playerTimers?.find((pt) => pt.piece === seat.piece)}
              onNudge={nudge}
              nudgeDisabled={nudgeDisabled}
            />
          );
        })}
      </div>

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
};
