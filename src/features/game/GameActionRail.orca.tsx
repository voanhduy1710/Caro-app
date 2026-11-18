import React, { useContext, useEffect, useRef, useState } from 'react';
import {
  Armchair,
  Crosshair,
  Eraser,
  Flag,
  Flame,
  Lightbulb,
  Loader2,
  RefreshCw,
  Settings2,
  SlidersHorizontal,
  Smartphone,
  Undo2,
  Zap,
} from 'lucide-react';
import { setDisplayPref } from './displayPrefs';
import { PREF_ROWS } from './GameControlsShared';
import { OPEN_SETTINGS_EVENT } from './sheetBridge';
import { useT } from '../i18n/language';
import { useAuth } from '../auth/AuthContext';
import { BOT_HINT_EVENT, hasBotHint } from './botHint';
import { PairingContext } from '../pairing/PairingContext';
import { useIsDesktop } from '../../shared/hooks/useMediaQuery';
import { Button, IconButton } from '../../shared/ui/primitives';
import { cn } from '../../shared/ui/cn';
import type { GameActionRailProps } from './GameActionRail';

export interface GameActionRailOrcaProps extends GameActionRailProps {
  /** 'sidebar': the bottom of the desktop match sidebar. 'mobile': the phone's one-row icon strip. */
  variant: 'sidebar' | 'mobile';
}

/** How long the bot-hint button shows it is thinking. */
const HINT_INDICATOR_MS = 1050;

/**
 * Orca style (PR 5) match actions. The exit is not here: the sidebar's back
 * button and the phone's top-strip arrow carry it. Same rules as the default
 * rail (the caller computes every disabled flag).
 */
export const GameActionRailOrca: React.FC<GameActionRailOrcaProps> = (props) => {
  const t = useT();
  const { user } = useAuth();
  const pairing = useContext(PairingContext);
  const isDesktop = useIsDesktop();
  const {
    variant,
    isAiMode,
    simulationCount,
    role,
    openSeat,
    onTakeSeat,
    undoTitle,
    onProposeUndo,
    undoDisabled,
    gameStatus,
    undoPending,
    onProposeRematch,
    rematchDisabled,
    rematchPending,
    onResign,
    resignDisabled,
    gearRef,
    prefsRef,
    isPrefsOpen,
    setIsPrefsOpen,
    prefs,
    doubleDown,
    onOfferDoubleDown,
  } = props;

  // The hint arrives on the board almost at once; the button says "thinking" for a beat so the press reads.
  const [hintThinkingState, setHintThinkingState] = useState(false);
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hintThinking = gameStatus === 'playing' && hintThinkingState;
  useEffect(
    () => () => {
      if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    },
    [],
  );
  const triggerBotHint = () => {
    if (gameStatus !== 'playing' || hintThinking) return;
    setHintThinkingState(true);
    window.dispatchEvent(new Event(BOT_HINT_EVENT));
    if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    hintTimerRef.current = setTimeout(() => {
      setHintThinkingState(false);
      hintTimerRef.current = null;
    }, HINT_INDICATOR_MS);
  };

  const showBotHint = role !== 'viewer' && hasBotHint(user?.username);
  const rematchLabel = isAiMode ? t('game.newGame') : t('game.rematch');
  const rematchTitle = isAiMode
    ? t('game.newGameTitle')
    : gameStatus === 'ended'
    ? t('game.rematchOfferTitle')
    : t('game.rematchLaterTitle');
  const clearSimulations = () => window.dispatchEvent(new Event('caro:clear-simulations'));
  const centreBoard = () => window.dispatchEvent(new Event('caro:center-board'));
  const takeSeatLabel = openSeat ? t('game.takeSeatN', { seat: openSeat }) : t('game.takeSeat');

  if (variant === 'mobile') {
    return (
      <div className="flex items-center gap-0.5">
        {role === 'viewer' ? (
          <>
            <IconButton
              size="md"
              onClick={clearSimulations}
              disabled={simulationCount === 0}
              title={`${t('game.clearSimulations')} — ${t('game.clearSimulationsTitle')}`}
              aria-label={t('game.clearSimulations')}
              className={simulationCount > 0 ? 'border-warning/40 bg-warning-soft text-warning' : ''}
            >
              <Eraser size={15} strokeWidth={1.75} aria-hidden="true" />
            </IconButton>
            <IconButton size="md" onClick={centreBoard} title={`${t('game.centreBoard')} — ${t('game.centreBoardTitle')}`} aria-label={t('game.centreBoard')}>
              <Crosshair size={15} strokeWidth={1.75} aria-hidden="true" />
            </IconButton>
            <Button
              variant={openSeat ? 'primary' : 'secondary'}
              size="xs"
              onClick={() => onTakeSeat?.()}
              disabled={!openSeat || !onTakeSeat}
              title={openSeat ? t('game.takeSeatTitle') : t('game.seatsFull')}
              aria-label={takeSeatLabel}
              className="ml-0.5 h-7 px-2"
            >
              <Armchair size={14} strokeWidth={1.75} aria-hidden="true" />
              <span>{takeSeatLabel}</span>
            </Button>
          </>
        ) : (
          <>
            <IconButton
              size="md"
              onClick={onProposeUndo}
              disabled={undoDisabled || undoPending}
              title={`${t('game.takeBack')} — ${undoTitle}`}
              aria-label={t('game.takeBack')}
            >
              {undoPending ? (
                <Loader2 size={15} strokeWidth={1.75} className="animate-spin" aria-hidden="true" />
              ) : (
                <Undo2 size={15} strokeWidth={1.75} aria-hidden="true" />
              )}
            </IconButton>

            {showBotHint && (
              <IconButton
                size="md"
                onClick={triggerBotHint}
                disabled={gameStatus !== 'playing' || hintThinking}
                active={hintThinking}
                title={`${t('game.botHint')} — ${t('game.botHintTitle')}`}
                aria-label={t('game.botHint')}
              >
                {hintThinking ? (
                  <Loader2 size={15} strokeWidth={1.75} className="animate-spin text-accent-text" aria-hidden="true" />
                ) : (
                  <Lightbulb size={15} strokeWidth={1.75} aria-hidden="true" />
                )}
              </IconButton>
            )}

            {doubleDown && !isAiMode && <MobileDoubleDownButton doubleDown={doubleDown} onOffer={onOfferDoubleDown} />}

            <IconButton
              size="md"
              onClick={clearSimulations}
              disabled={simulationCount === 0}
              title={`${t('game.clearSimulations')} — ${t('game.clearSimulationsTitle')}`}
              aria-label={t('game.clearSimulations')}
              className={simulationCount > 0 ? 'border-warning/40 bg-warning-soft text-warning' : ''}
            >
              <Eraser size={15} strokeWidth={1.75} aria-hidden="true" />
            </IconButton>

            <IconButton size="md" onClick={centreBoard} title={`${t('game.centreBoard')} — ${t('game.centreBoardTitle')}`} aria-label={t('game.centreBoard')}>
              <Crosshair size={15} strokeWidth={1.75} aria-hidden="true" />
            </IconButton>

            <IconButton
              size="md"
              onClick={onProposeRematch}
              disabled={rematchDisabled || rematchPending}
              title={`${rematchLabel} — ${rematchTitle}`}
              aria-label={rematchLabel}
              className={gameStatus === 'ended' && !rematchDisabled ? 'border-primary bg-primary text-primary-fg hover:bg-primary-hover' : ''}
            >
              {rematchPending ? (
                <Loader2 size={15} strokeWidth={1.75} className="animate-spin" aria-hidden="true" />
              ) : (
                <RefreshCw size={15} strokeWidth={1.75} aria-hidden="true" />
              )}
            </IconButton>

            {!isAiMode && (
              <IconButton
                size="md"
                onClick={onResign}
                disabled={resignDisabled}
                title={`${t('game.resign')} — ${t('game.resignTitle')}`}
                aria-label={t('game.resign')}
                className="text-danger hover:bg-danger-soft hover:text-danger"
              >
                <Flag size={15} strokeWidth={1.75} aria-hidden="true" />
              </IconButton>
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 border-t border-line pt-2.5">
      {role === 'viewer' ? (
        <Button
          variant={openSeat ? 'primary' : 'secondary'}
          size="sm"
          onClick={() => onTakeSeat?.()}
          disabled={!openSeat || !onTakeSeat}
          title={openSeat ? t('game.takeSeatTitle') : t('game.seatsFull')}
          className="w-full justify-center"
        >
          <Armchair size={14} strokeWidth={1.75} aria-hidden="true" />
          <span>{takeSeatLabel}</span>
        </Button>
      ) : (
        <div className="grid grid-cols-2 gap-1.5">
          <Button
            variant="secondary"
            size="sm"
            onClick={onProposeUndo}
            disabled={undoDisabled || undoPending}
            title={`${t('game.takeBack')} — ${undoTitle}`}
            className="justify-start px-2 text-xs"
          >
            {undoPending ? (
              <Loader2 size={14} strokeWidth={1.75} className="shrink-0 animate-spin" aria-hidden="true" />
            ) : (
              <Undo2 size={14} strokeWidth={1.75} className="shrink-0" aria-hidden="true" />
            )}
            <span className="truncate">{t('game.takeBack')}</span>
          </Button>

          <Button
            variant={gameStatus === 'ended' ? 'primary' : 'secondary'}
            size="sm"
            onClick={onProposeRematch}
            disabled={rematchDisabled || rematchPending}
            title={`${rematchLabel} — ${rematchTitle}`}
            className="justify-start px-2 text-xs"
          >
            {rematchPending ? (
              <Loader2 size={14} strokeWidth={1.75} className="shrink-0 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw size={14} strokeWidth={1.75} className="shrink-0" aria-hidden="true" />
            )}
            <span className="truncate">{rematchLabel}</span>
          </Button>

          {showBotHint && (
            <Button
              variant={hintThinking ? 'tonal' : 'secondary'}
              size="sm"
              onClick={triggerBotHint}
              disabled={gameStatus !== 'playing' || hintThinking}
              title={`${t('game.botHint')} — ${t('game.botHintTitle')}`}
              className={cn('justify-start px-2 text-xs', isAiMode && 'col-span-2')}
            >
              {hintThinking ? (
                <Loader2 size={14} strokeWidth={1.75} className="shrink-0 animate-spin text-accent-text" aria-hidden="true" />
              ) : (
                <Lightbulb size={14} strokeWidth={1.75} className="shrink-0 text-accent-text" aria-hidden="true" />
              )}
              <span className="truncate">{hintThinking ? t('game.thinking') : t('game.botHint')}</span>
            </Button>
          )}

          {doubleDown && !isAiMode && <DesktopDoubleDownButton doubleDown={doubleDown} onOffer={onOfferDoubleDown} />}

          {!isAiMode && (
            <Button
              variant="danger"
              size="sm"
              onClick={onResign}
              disabled={resignDisabled}
              title={`${t('game.resign')} — ${t('game.resignTitle')}`}
              className={cn('justify-start px-2 text-xs', !doubleDown && !showBotHint && 'col-span-2')}
            >
              <Flag size={14} strokeWidth={1.75} className="shrink-0" aria-hidden="true" />
              <span className="truncate">{t('game.resign')}</span>
            </Button>
          )}
        </div>
      )}

      {/* Flat utility icons: clear sketches, centre, display & sound, rules, pair phone. */}
      <div className="flex items-center justify-between gap-1 pt-0.5">
        <div className="flex items-center gap-0.5">
          <IconButton
            size="md"
            onClick={clearSimulations}
            disabled={simulationCount === 0}
            title={`${t('game.clearSimulations')} — ${t('game.clearSimulationsTitle')}`}
            aria-label={t('game.clearSimulations')}
            className={cn('relative', simulationCount > 0 && 'border-warning/40 bg-warning-soft text-warning')}
          >
            <Eraser size={15} strokeWidth={1.75} aria-hidden="true" />
            {simulationCount > 0 && (
              <span className="absolute -right-1 -top-1 rounded-[3px] bg-warning-solid px-1 font-mono text-[9px] font-bold leading-3 text-warning-fg tabular-nums">
                {simulationCount}
              </span>
            )}
          </IconButton>

          <IconButton size="md" onClick={centreBoard} title={`${t('game.centreBoard')} — ${t('game.centreBoardTitle')}`} aria-label={t('game.centreBoard')}>
            <Crosshair size={15} strokeWidth={1.75} aria-hidden="true" />
          </IconButton>

          <div className="relative">
            <IconButton
              ref={gearRef}
              size="md"
              active={isPrefsOpen}
              onClick={() => setIsPrefsOpen((open) => !open)}
              aria-haspopup="dialog"
              aria-expanded={isPrefsOpen}
              title={t('game.displayAndSound')}
              aria-label={t('game.displayAndSound')}
            >
              <Settings2 size={15} strokeWidth={1.75} aria-hidden="true" />
            </IconButton>
            {isPrefsOpen && <PrefsPopover prefsRef={prefsRef} prefs={prefs} className="bottom-full left-0 z-40 mb-1.5" />}
          </div>

          <IconButton
            size="md"
            onClick={() => window.dispatchEvent(new Event(OPEN_SETTINGS_EVENT))}
            title={t('room.changeRules')}
            aria-label={t('room.changeRules')}
          >
            <SlidersHorizontal size={15} strokeWidth={1.75} aria-hidden="true" />
          </IconButton>
        </div>

        {pairing && isDesktop && (
          <Button
            variant={pairing.phoneConnected ? 'tonal' : 'ghost'}
            size="xs"
            onClick={pairing.openPairModal}
            disabled={!pairing.canPair}
            title={pairing.needsSignIn ? t('pair.signInFirst') : pairing.phoneConnected ? t('pair.connected') : t('pair.button')}
            aria-label={t('pair.button')}
            className={cn('h-7 px-2 text-[11px]', pairing.phoneConnected && 'border-success/30 bg-success-soft text-success hover:bg-success-soft')}
          >
            <Smartphone size={14} strokeWidth={1.75} aria-hidden="true" />
            <span className="max-w-[78px] truncate">{pairing.phoneConnected ? t('pair.connected') : t('pair.button')}</span>
          </Button>
        )}
      </div>
    </div>
  );
};

/** The "this device only" display & sound switches, as PR 5's popover. */
export const PrefsPopover: React.FC<{
  prefsRef: React.RefObject<HTMLDivElement | null>;
  prefs: GameActionRailProps['prefs'];
  /** Where it opens from the gear: above it in the sidebar, below it on the phone. */
  className: string;
}> = ({ prefsRef, prefs, className }) => {
  const t = useT();
  return (
    <div
      ref={prefsRef}
      role="dialog"
      aria-label={t('game.displayAndSound')}
      className={cn('absolute w-56 rounded-[8px] border border-line-strong bg-surface p-1.5 shadow-e2', className)}
    >
      <p className="px-2 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">{t('game.thisDeviceOnly')}</p>
      {PREF_ROWS.map((row) => (
        <button
          key={row.key}
          type="button"
          role="switch"
          aria-checked={prefs[row.key]}
          onClick={() => setDisplayPref(row.key, !prefs[row.key])}
          className="flex w-full items-center justify-between gap-2 rounded-[5px] px-2 py-1.5 text-left text-xs font-medium text-ink transition-colors hover:bg-surface-2"
        >
          <span className="truncate">{t(row.label)}</span>
          <span
            aria-hidden="true"
            className={cn(
              'relative h-4 w-7 shrink-0 rounded-full border transition-colors',
              prefs[row.key] ? 'border-accent bg-accent' : 'border-line-strong bg-surface-3',
            )}
          >
            <span
              className={cn(
                'absolute left-0.5 top-0.5 h-2.5 w-2.5 rounded-full bg-surface transition-transform',
                prefs[row.key] && 'translate-x-3',
              )}
            />
          </span>
        </button>
      ))}
    </div>
  );
};

type DoubleDown = NonNullable<GameActionRailProps['doubleDown']>;

const DesktopDoubleDownButton: React.FC<{ doubleDown: DoubleDown; onOffer?: () => void }> = ({ doubleDown, onOffer }) => {
  const t = useT();
  const { canOffer, pending, active, title } = doubleDown;
  const label = active ? t('game.doubleDownOn') : t('game.doubleDown');
  return (
    <button
      type="button"
      onClick={onOffer}
      disabled={!canOffer || pending || active || !onOffer}
      title={`${label} — ${title}`}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        'inline-flex h-7 items-center justify-start gap-1.5 whitespace-nowrap rounded-[6px] border px-2 text-xs font-medium transition-colors duration-150',
        active
          ? 'border-warning/40 bg-warning-soft text-warning disabled:cursor-default disabled:opacity-100'
          : canOffer && onOffer
          ? 'border-warning/30 bg-warning-soft/55 text-warning hover:bg-warning-soft'
          : 'border-line-strong bg-surface-2 text-muted disabled:cursor-not-allowed disabled:opacity-45',
      )}
    >
      {pending ? (
        <Loader2 size={14} strokeWidth={1.75} className="shrink-0 animate-spin text-warning" aria-hidden="true" />
      ) : active ? (
        <Flame size={14} strokeWidth={1.75} className="shrink-0 text-warning" aria-hidden="true" />
      ) : (
        <Zap size={14} strokeWidth={1.75} className="shrink-0 text-warning" aria-hidden="true" />
      )}
      <span className="truncate">{label}</span>
    </button>
  );
};

const MobileDoubleDownButton: React.FC<{ doubleDown: DoubleDown; onOffer?: () => void }> = ({ doubleDown, onOffer }) => {
  const t = useT();
  const { canOffer, pending, active, title } = doubleDown;
  const label = active ? t('game.doubleDownOn') : t('game.doubleDown');
  return (
    <IconButton
      size="md"
      onClick={onOffer}
      disabled={!canOffer || pending || active || !onOffer}
      title={`${label} — ${title}`}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        active
          ? 'border-warning/40 bg-warning-soft text-warning disabled:cursor-default disabled:opacity-100'
          : canOffer && onOffer
          ? 'text-warning hover:bg-warning-soft hover:text-warning'
          : '',
      )}
    >
      {pending ? (
        <Loader2 size={15} strokeWidth={1.75} className="animate-spin text-warning" aria-hidden="true" />
      ) : active ? (
        <Flame size={15} strokeWidth={1.75} className="text-warning" aria-hidden="true" />
      ) : (
        <Zap size={15} strokeWidth={1.75} aria-hidden="true" />
      )}
    </IconButton>
  );
};
