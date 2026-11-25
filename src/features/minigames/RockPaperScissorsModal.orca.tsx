import React, { useId, useState } from 'react';
import { Check } from 'lucide-react';
import { useSheetAwareSound } from '../game/sheet/useSheetAwareSound';
import { RpsGlyph } from '../game/BoardOverlays.orca';
import { useT } from '../i18n/language';
import { useTheme } from '../theme/ThemeContext';
import type { RockPaperScissorsModalProps } from './RockPaperScissorsModal';

type Hand = 'rock' | 'paper' | 'scissors';

const HANDS: readonly Hand[] = ['rock', 'paper', 'scissors'];

const beats = (a: Hand, b: Hand): boolean =>
  (a === 'rock' && b === 'scissors') || (a === 'paper' && b === 'rock') || (a === 'scissors' && b === 'paper');

/**
 * Orca style (PR 5) rock-paper-scissors: a plain dialog with who is ready and
 * one row of three hand buttons (the only keyboard-reachable set), then an
 * X-vs-O reveal. Same props and room logic as the default; the opponent's
 * hand is never shown before both are in.
 */
export const RockPaperScissorsModalOrca: React.FC<RockPaperScissorsModalProps> = ({ myChoice, choices, isPlayer, winnerName, onChoose }) => {
  const t = useT();
  const { theme } = useTheme();
  const { playClickSound } = useSheetAwareSound();
  const titleId = useId();
  const [hasSubmittedOnce, setHasSubmittedOnce] = useState(false);

  const resolved = Boolean(choices.X && choices.O);
  // A tie sends both choices back to null while the opening phase goes on.
  const tiedNotice = hasSubmittedOnce && myChoice === null && !resolved;

  const subtitle = resolved
    ? winnerName
      ? t('game.movesFirst', { name: winnerName })
      : t('game.minigame.orcaRpsTie')
    : myChoice
    ? t('game.minigame.orcaRpsLocked')
    : isPlayer
    ? t('game.minigame.orcaRpsPick')
    : t('game.minigame.orcaRpsWatching');

  if (resolved) {
    const xHand = choices.X as Hand;
    const oHand = choices.O as Hand;
    const xWins = beats(xHand, oHand);
    const oWins = beats(oHand, xHand);
    const winnerSeat: 'X' | 'O' = xWins ? 'X' : 'O';
    const handCard = (seat: 'X' | 'O', hand: Hand, wins: boolean) => (
      <div
        className={`flex flex-col items-center gap-2 rounded-lg border p-4 transition-colors ${
          wins ? 'border-success/45 bg-success-soft text-ink' : 'border-line bg-surface-2/60 text-muted'
        }`}
      >
        <span className="font-mono text-xs font-semibold tabular-nums" style={{ color: seat === 'X' ? theme.xColor : theme.oColor }}>
          {t('room.seatLabel', { seat })}
        </span>
        <RpsGlyph hand={hand} size={28} className="text-ink" />
        <span className="text-xs font-medium capitalize">{t(`game.${hand}`)}</span>
      </div>
    );

    return (
      <div className="modal-scrim" role="status" aria-live="assertive" aria-labelledby={titleId}>
        <div className="modal-panel max-w-md border border-line-strong bg-surface p-6 font-sans text-ink">
          <div className="flex items-center justify-between gap-3">
            <h2 id={titleId} className="text-base font-semibold tracking-tight text-ink">
              {t('settings.rockPaperScissors')}
            </h2>
            <span
              className="inline-flex items-center gap-1 rounded-md border border-line-strong bg-surface-2 px-2 py-0.5 font-mono text-xs font-semibold tabular-nums"
              style={{ color: winnerSeat === 'X' ? theme.xColor : theme.oColor }}
            >
              {winnerSeat}
            </span>
          </div>
          <div
            className="mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-3 animate-pop-in"
            aria-label={t('game.handsRevealed', { x: t(`game.${xHand}`), o: t(`game.${oHand}`), winner: winnerSeat })}
          >
            {handCard('X', xHand, xWins)}
            <span className="select-none font-mono text-xs font-semibold text-subtle">VS</span>
            {handCard('O', oHand, oWins)}
          </div>
          <div className="mt-4 flex items-center justify-center gap-1.5 rounded-lg border border-line-strong bg-surface-2 px-4 py-2.5 text-center text-xs font-medium text-ink">
            <Check size={14} strokeWidth={2} className="shrink-0 text-success" aria-hidden="true" />
            <span>{subtitle}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-scrim" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div className="modal-panel max-w-md border border-line-strong bg-surface p-6 font-sans text-ink">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold tracking-tight text-ink">
              {t('settings.rockPaperScissors')}
            </h2>
            <p className="mt-1 text-xs text-muted">{subtitle}</p>
          </div>
          {tiedNotice && (
            <span className="inline-flex shrink-0 items-center rounded-md border border-warning/35 bg-warning-soft px-2 py-0.5 text-[11px] font-medium text-warning">
              {t('game.minigame.orcaTieRetry')}
            </span>
          )}
        </div>

        {/* Who is ready; never which hand. */}
        <div className="mt-4 grid grid-cols-2 gap-2.5">
          {(['X', 'O'] as const).map((seat) => {
            const isReady = choices[seat] !== null;
            return (
              <div
                key={seat}
                className={`flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-xs ${
                  isReady ? 'border-success/35 bg-success-soft text-ink' : 'border-line bg-surface-2 text-muted'
                }`}
              >
                <span className="font-mono font-semibold tabular-nums" style={{ color: seat === 'X' ? theme.xColor : theme.oColor }}>
                  {t('room.seatLabel', { seat })}
                </span>
                <span className="inline-flex items-center gap-1 font-medium">
                  {isReady ? (
                    <>
                      <Check size={13} strokeWidth={2} className="text-success" aria-hidden="true" />
                      <span className="text-ink">{t('game.minigame.orcaReady')}</span>
                    </>
                  ) : (
                    <>
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-subtle" aria-hidden="true" />
                      <span>{t('game.minigame.orcaChoosing')}</span>
                    </>
                  )}
                </span>
              </div>
            );
          })}
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2.5">
          {HANDS.map((hand) => {
            const selected = myChoice === hand;
            const canSelect = isPlayer && !myChoice;
            return (
              <button
                key={hand}
                type="button"
                disabled={!canSelect}
                aria-pressed={selected}
                onClick={() => {
                  setHasSubmittedOnce(true);
                  playClickSound();
                  onChoose?.(hand);
                }}
                className={`flex flex-col items-center gap-2 rounded-lg border p-3.5 transition-colors duration-150 ${
                  selected
                    ? 'border-accent bg-accent-soft text-ink ring-1 ring-inset ring-accent/40'
                    : canSelect
                    ? 'border-line-strong bg-surface-2 text-ink hover:border-ink/30 hover:bg-surface-3'
                    : 'border-line bg-surface-2/50 text-muted opacity-50'
                }`}
              >
                <RpsGlyph hand={hand} size={24} />
                <span className="text-xs font-medium capitalize">{t(`game.${hand}`)}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
