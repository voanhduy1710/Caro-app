import React, { useEffect, useId, useState } from 'react';
import { Check, Sparkles } from 'lucide-react';
import { useSheetAwareSound } from '../game/sheet/useSheetAwareSound';
import { useT } from '../i18n/language';
import { useTheme } from '../theme/ThemeContext';
import { pieceColor } from '../theme/types';
import type { CoinTossModalProps } from './CoinTossModal';

type CoinFace = 'X' | 'O';

/** PR 5's flat coin face: a ringed disc with the seat's mark in its colour. */
const CoinFaceArt: React.FC<{ face: CoinFace; className?: string }> = ({ face, className = 'h-full w-full' }) => {
  const t = useT();
  const { theme } = useTheme();
  const stroke = pieceColor(theme, face);
  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-label={t('game.minigame.coinFace', { face })}>
      <circle cx="32" cy="32" r="29.5" fill="var(--ui-surface-2)" stroke="var(--ui-border-strong)" strokeWidth="1.5" />
      <circle cx="32" cy="32" r="23.5" fill="none" stroke="var(--ui-border)" strokeWidth="1" strokeDasharray="3 3" />
      {face === 'X' ? (
        <g stroke={stroke} strokeWidth="4" strokeLinecap="round">
          <line x1="22" y1="22" x2="42" y2="42" />
          <line x1="42" y1="22" x2="22" y2="42" />
        </g>
      ) : (
        <circle cx="32" cy="32" r="11" fill="none" stroke={stroke} strokeWidth="4" />
      )}
    </svg>
  );
};

/**
 * Orca style (PR 5) coin toss: a plain dialog with a 3D-flipping flat coin
 * and two side buttons. Same props and room logic as the default.
 */
export const CoinTossModalOrca: React.FC<CoinTossModalProps> = ({ chooserName, canCall, call, face, callerName, winnerName, onCall }) => {
  const t = useT();
  const { theme } = useTheme();
  const { playClickSound } = useSheetAwareSound();
  const titleId = useId();

  const isFlipping = face !== null;
  const choseCorrectly = call !== null && face !== null && call === face;
  const [animState, setAnimState] = useState<{ face: CoinFace; deg: number; settled: boolean } | null>(null);

  useEffect(() => {
    if (face === null) return;
    const reducedMotion =
      typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const targetDeg = reducedMotion ? (face === 'X' ? 0 : 180) : face === 'X' ? 1080 : 1260;
    const raf = window.requestAnimationFrame(() => setAnimState({ face, deg: targetDeg, settled: reducedMotion }));
    if (reducedMotion) return () => window.cancelAnimationFrame(raf);
    const timer = window.setTimeout(() => setAnimState({ face, deg: targetDeg, settled: true }), 760);
    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
  }, [face]);

  const rotationDeg = face !== null && animState?.face === face ? animState.deg : 0;
  const settled = face !== null && animState?.face === face ? animState.settled : false;

  const subtitle = call
    ? t('game.minigame.orcaCoinCalled', { name: callerName ?? chooserName, face: call })
    : canCall
    ? t('game.minigame.orcaCoinPick')
    : t('game.minigame.orcaCoinWaiting', { name: chooserName });

  return (
    <div
      className="modal-scrim"
      role={isFlipping ? 'status' : 'dialog'}
      aria-modal={!isFlipping ? 'true' : undefined}
      aria-live={isFlipping ? 'assertive' : undefined}
      aria-labelledby={titleId}
    >
      <div className="modal-panel max-w-md border border-line-strong bg-surface p-6 font-sans text-ink">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold tracking-tight text-ink">
              {t('settings.coinFlip')}
            </h2>
            <p className="mt-1 text-xs text-muted">{subtitle}</p>
          </div>
          {call && (
            <span
              className="inline-flex shrink-0 items-center gap-1 rounded-md border border-line-strong bg-surface-2 px-2 py-1 font-mono text-xs font-semibold tabular-nums"
              style={{ color: pieceColor(theme, call) }}
            >
              {call}
            </span>
          )}
        </div>

        <div
          className="my-6 flex flex-col items-center justify-center"
          aria-label={face ? t('game.minigame.coinLanded', { face }) : undefined}
          style={{ perspective: '720px' }}
        >
          <div
            className="relative h-22 w-22"
            style={{
              transformStyle: 'preserve-3d',
              transform: `rotateY(${rotationDeg}deg)`,
              transition: isFlipping ? 'transform 760ms cubic-bezier(0.22, 1, 0.36, 1)' : 'none',
            }}
          >
            <div className="absolute inset-0" style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}>
              <CoinFaceArt face="X" />
            </div>
            <div
              className="absolute inset-0"
              style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
            >
              <CoinFaceArt face="O" />
            </div>
          </div>
        </div>

        {!isFlipping ? (
          <div className="grid grid-cols-2 gap-3">
            {(['X', 'O'] as const).map((side) => {
              const selected = call === side;
              const isInteractive = canCall && call === null;
              return (
                <button
                  key={side}
                  type="button"
                  disabled={!isInteractive}
                  onClick={() => {
                    playClickSound();
                    onCall?.(side);
                  }}
                  className={`flex flex-col items-center gap-2 rounded-lg border p-3.5 transition-colors duration-150 ${
                    selected
                      ? 'border-accent bg-accent-soft text-ink ring-1 ring-inset ring-accent/40'
                      : isInteractive
                      ? 'border-line-strong bg-surface-2 text-ink hover:border-ink/30 hover:bg-surface-3'
                      : 'border-line bg-surface-2/60 text-muted opacity-55'
                  }`}
                >
                  <CoinFaceArt face={side} className="h-11 w-11" />
                  <span className="font-mono text-xs font-semibold tabular-nums">{t('room.seatLabel', { seat: side })}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <div
            className={`rounded-lg border px-4 py-3 text-center transition-opacity duration-200 ${settled ? 'opacity-100' : 'opacity-80'} ${
              choseCorrectly ? 'border-success/35 bg-success-soft' : 'border-line-strong bg-surface-2'
            }`}
          >
            <div className="flex items-center justify-center gap-1.5 text-sm font-semibold text-ink">
              {choseCorrectly ? (
                <Check size={15} strokeWidth={2} className="text-success" aria-hidden="true" />
              ) : (
                <Sparkles size={14} strokeWidth={1.75} className="text-muted" aria-hidden="true" />
              )}
              <span>{t('room.coinChose', { seat: face })}</span>
            </div>
            {winnerName && <p className="mt-1 text-xs text-muted">{t('game.movesFirst', { name: winnerName })}</p>}
          </div>
        )}
      </div>
    </div>
  );
};
