import React from 'react';
import { Hand as HandIcon, Scissors } from 'lucide-react';
import { useTheme } from '../theme/ThemeContext';
import { pieceColor } from '../theme/types';
import { useT } from '../i18n/language';
import type { BoardProps } from './BoardTypes';

/**
 * Orca style (PR 5) dress for the board's own overlays: the result toast, the
 * paused card and the count-in with its coin / rock-paper-scissors reveal.
 * Board decides when each one shows; these only draw them. The Default style
 * keeps its own markup in Board.tsx.
 */

type RpsHand = 'rock' | 'paper' | 'scissors';

/** PR 5's hand glyphs: lucide Hand / Scissors and a faceted stone for rock. */
export const RpsGlyph: React.FC<{ hand: RpsHand; size?: number; className?: string }> = ({ hand, size = 16, className }) => {
  if (hand === 'paper') return <HandIcon size={size} strokeWidth={1.75} className={className} aria-hidden="true" />;
  if (hand === 'scissors') return <Scissors size={size} strokeWidth={1.75} className={className} aria-hidden="true" />;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <polygon points="8 3 16 3 21 8 21 16 16 21 8 21 3 16 3 8" />
      <path d="M8 3 10 10 3 8M16 3 14 10 21 8M10 10h4v4h-4zM10 14 8 21M14 14l2 7" />
    </svg>
  );
};

export const BoardResultToastOrca: React.FC<{
  winnerPiece: 'X' | 'O' | 'T' | null;
  headline: string;
  tone: string;
  resultReason?: string;
  ratingNote?: string | null;
}> = ({ winnerPiece, headline, tone, resultReason, ratingNote }) => {
  const { theme } = useTheme();
  const color = winnerPiece ? pieceColor(theme, winnerPiece) : undefined;
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none absolute top-3 left-1/2 z-20 w-[min(22rem,calc(100%-1.5rem))] -translate-x-1/2 rounded-lg border border-line-strong bg-surface/95 px-4 py-2.5 text-center font-sans shadow-e2 backdrop-blur-md animate-pop-in"
    >
      <div className="flex items-center justify-center gap-2">
        <span
          className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-line-strong bg-surface-2 font-mono text-xs font-semibold leading-none tabular-nums"
          style={color ? { borderColor: color, color } : undefined}
        >
          {winnerPiece === 'T' ? '△' : (winnerPiece ?? '=')}
        </span>
        <p className={`font-sans text-sm font-semibold tracking-tight ${tone}`}>{headline}</p>
      </div>
      {resultReason && <p className="mt-1 text-xs text-muted">{resultReason}</p>}
      {ratingNote && <p className="mt-0.5 font-mono text-[11px] tabular-nums text-subtle">{ratingNote}</p>}
    </div>
  );
};

export const BoardPausedOrca: React.FC<{ paused: NonNullable<BoardProps['paused']> }> = ({ paused }) => (
  <div className="absolute inset-0 z-[25] flex items-center justify-center rounded-lg bg-[var(--ui-scrim)] p-4 backdrop-blur-[2px]">
    <div
      role="status"
      aria-live="polite"
      className="w-[min(23rem,100%)] rounded-lg border border-line-strong bg-surface/95 p-5 text-center font-sans shadow-e2 backdrop-blur-md"
    >
      <p className="font-sans text-base font-semibold tracking-tight text-ink">{paused.title}</p>
      {paused.body && <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{paused.body}</p>}
      {paused.actions && <div className="mt-4 flex flex-col gap-2">{paused.actions}</div>}
    </div>
  </div>
);

export const BoardCountdownOrca: React.FC<{
  countdown: number;
  title: string;
  caption: string;
  coinFlip: BoardProps['coinFlip'];
  rpsReveal: BoardProps['rpsReveal'];
}> = ({ countdown, title, caption, coinFlip, rpsReveal }) => {
  const t = useT();
  const { theme } = useTheme();
  const coinColor = coinFlip ? pieceColor(theme, coinFlip.winner) : undefined;
  return (
    <div
      role="status"
      aria-live="assertive"
      className="absolute inset-0 z-30 flex items-center justify-center rounded-lg bg-[var(--ui-scrim)] p-4 backdrop-blur-[2px]"
    >
      <div className="rounded-lg border border-line-strong bg-surface/95 px-7 py-5 text-center font-sans shadow-e2 backdrop-blur-md">
        {coinFlip && (
          <div className="mx-auto mb-3 flex justify-center">
            <span
              className="grid h-11 w-11 place-items-center rounded-full border border-line-strong bg-surface-2 font-mono text-base font-semibold tabular-nums"
              style={{ borderColor: coinColor, color: coinColor }}
            >
              {coinFlip.winner === 'T' ? '△' : coinFlip.winner}
            </span>
          </div>
        )}
        {rpsReveal && (
          <div
            className="mb-3 inline-flex items-center gap-2.5 rounded-md border border-line bg-surface-2 px-3 py-1.5 text-ink"
            aria-label={t('game.handsRevealed', {
              x: t(`game.${rpsReveal.X}`),
              o: t(`game.${rpsReveal.O}`),
              winner: rpsReveal.winner,
            })}
          >
            <span className="inline-flex items-center gap-1 font-mono text-xs font-semibold" style={{ color: theme.xColor }}>
              X <RpsGlyph hand={rpsReveal.X} />
            </span>
            <span className="font-mono text-[10px] font-medium text-subtle">VS</span>
            <span className="inline-flex items-center gap-1 font-mono text-xs font-semibold" style={{ color: theme.oColor }}>
              <RpsGlyph hand={rpsReveal.O} /> O
            </span>
          </div>
        )}
        <p className="font-mono text-4xl font-semibold leading-none tabular-nums text-ink">{countdown}</p>
        <p className="mt-2.5 text-[13px] font-semibold tracking-tight text-ink">{title}</p>
        <p className="mt-0.5 text-xs text-muted">{caption}</p>
      </div>
    </div>
  );
};
