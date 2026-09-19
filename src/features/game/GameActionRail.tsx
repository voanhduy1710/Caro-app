import React from 'react';
import { Armchair, Crosshair, Eraser, Flag, LogOut, RefreshCw, Settings, Undo2 } from 'lucide-react';
import { setDisplayPref } from './displayPrefs';
import type { DisplayPrefs } from './displayPrefs';
import { PREF_ROWS, RailButton } from './GameControlsShared';
import type { GameControlsProps } from './GameControlsShared';

export interface GameActionRailProps extends Pick<GameControlsProps, 'exitLabel' | 'isAiMode' | 'onExitMatch' | 'role' | 'openSeat' | 'onTakeSeat' | 'onProposeUndo' | 'allowUndo' | 'gameStatus' | 'canUndo' | 'undoPending' | 'onProposeRematch' | 'rematchPending' | 'onResign' | 'canResign'> {
  simulationCount: number; undoTitle: string; rematchDisabled: boolean; prefs: DisplayPrefs;
  gearRef: React.RefObject<HTMLButtonElement | null>; prefsRef: React.RefObject<HTMLDivElement | null>;
  isPrefsOpen: boolean; setIsPrefsOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

export const GameActionRail: React.FC<GameActionRailProps> = (props) => {
  const { exitLabel, isAiMode, onExitMatch, simulationCount, role, openSeat, onTakeSeat, undoTitle, onProposeUndo, allowUndo, gameStatus, canUndo, undoPending, onProposeRematch, rematchDisabled, rematchPending, onResign, canResign, gearRef, prefsRef, isPrefsOpen, setIsPrefsOpen, prefs } = props;
  return (
    <div className="flex flex-wrap items-center justify-center gap-0.5">
      <RailButton
        icon={<LogOut size={17} strokeWidth={2.25} aria-hidden="true" />}
        label={exitLabel}
        title={isAiMode ? 'go back to the home screen' : 'leave this room'}
        onClick={onExitMatch}
      />

      <span aria-hidden="true" className="mx-1 h-6 w-px bg-line" />

      <RailButton
        icon={<Eraser size={17} strokeWidth={2.25} aria-hidden="true" />}
        label="Clear simulations"
        title="Clear your local simulated moves"
        onClick={() => window.dispatchEvent(new Event('caro:clear-simulations'))}
        disabled={simulationCount === 0}
        tone={simulationCount > 0 ? 'warning' : 'default'}
      />

      <RailButton
        icon={<Crosshair size={17} strokeWidth={2.25} aria-hidden="true" />}
        label="Centre board"
        title="Centre the board"
        onClick={() => window.dispatchEvent(new Event('caro:center-board'))}
      />

      {role === 'viewer' ? (
        <RailButton
          icon={<Armchair size={17} strokeWidth={2.25} aria-hidden="true" />}
          label={openSeat ? `Take seat ${openSeat}` : 'Take seat'}
          title={openSeat ? 'sit down and play from this position' : 'Both seats are taken'}
          onClick={() => onTakeSeat?.()}
          disabled={!openSeat || !onTakeSeat}
          tone={openSeat ? 'primary' : 'default'}
        />
      ) : (
      <>
      <RailButton
        icon={<Undo2 size={17} strokeWidth={2.25} aria-hidden="true" />}
        label="Take back"
        title={undoTitle}
        onClick={onProposeUndo}
        disabled={!allowUndo || gameStatus !== 'playing' || !canUndo}
        pending={undoPending}
        tone="danger"
      />

      {/* Starting over is only the obvious next step once the game is over.
          Mid-match it is the destructive option, so it does not lead. */}
      <RailButton
        icon={<RefreshCw size={17} strokeWidth={2.25} aria-hidden="true" />}
        label={isAiMode ? 'New game' : 'Rematch'}
        title={
          isAiMode
            ? 'start a fresh game against the bot'
            : gameStatus === 'ended'
            ? 'offer your opponent another round'
            : 'available once this match has finished'
        }
        onClick={onProposeRematch}
        disabled={rematchDisabled}
        pending={rematchPending}
        tone={gameStatus === 'ended' ? 'primary' : 'default'}
      />

      {/* Conceding stays in the rail with everything else and is told apart by
          colour, not by being pushed out of the group. */}
      {!isAiMode && (
        <RailButton
          icon={<Flag size={17} strokeWidth={2.25} aria-hidden="true" />}
          label="Resign"
          title="give up this match and record it as a loss"
          onClick={onResign}
          disabled={canResign === undefined ? gameStatus !== 'playing' : !canResign}
          tone="danger"
        />
      )}

      </>
      )}

      {/* What this browser draws and plays, kept apart from the Settings
          dialog, which holds the rules both players are bound by. */}
      <div className="relative">
        <button
          ref={gearRef}
          type="button"
          onClick={() => setIsPrefsOpen((open) => !open)}
          aria-haspopup="true"
          aria-expanded={isPrefsOpen}
          title="Board display and sound"
          aria-label="Board display and sound"
          className="btn btn-ghost btn-icon h-10 w-10 rounded-full"
        >
          <Settings size={17} strokeWidth={2.25} aria-hidden="true" />
        </button>

        {isPrefsOpen && (
          <div
            ref={prefsRef}
            role="dialog"
            aria-label="Board display and sound"
            className="absolute right-0 top-12 z-30 w-60 rounded-lg border border-line bg-surface p-2 shadow-2xl"
          >
            <p className="px-2 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-[0.09em] text-muted">
              This device only
            </p>
            {PREF_ROWS.map((row) => (
              <button
                key={row.key}
                type="button"
                role="switch"
                aria-checked={prefs[row.key]}
                onClick={() => setDisplayPref(row.key, !prefs[row.key])}
                className="flex w-full items-center justify-between gap-3 rounded-md p-2 text-left text-[13px] font-medium transition-colors hover:bg-surface-2"
              >
                <span>{row.label}</span>
                <span
                  aria-hidden="true"
                  className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
                    prefs[row.key] ? 'bg-accent' : 'bg-surface-3'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-surface shadow transition-transform ${
                      prefs[row.key] ? 'translate-x-4' : ''
                    }`}
                  />
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
