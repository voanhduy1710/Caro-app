import React from 'react';
import { X, Sun, Moon, Monitor } from 'lucide-react';
import type { RoomSettings } from './types';
import { useModalChrome } from '../../shared/hooks/useModalChrome';
import { useUiTheme } from '../../shared/hooks/useUiTheme';
import type { UiTheme } from '../../shared/hooks/useUiTheme';
import { useTheme } from '../theme/ThemeContext';
import type { BoardTheme, PieceTheme } from '../theme/types';

interface SettingsAndThemeModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: RoomSettings;
  onUpdateSettings: (newSettings: RoomSettings) => void;
  isHost: boolean;
  gameStatus: 'lobby' | 'playing' | 'ended';
}

const BOARD_THEMES: Array<{ id: BoardTheme; name: string }> = [
  { id: 'graph_paper', name: 'Graph paper' },
  { id: 'light_wood', name: 'Bamboo' },
  { id: 'laser_futuristic', name: 'Laser grid' },
  { id: 'classic_wood', name: 'Mahogany' },
];

const PIECE_THEMES: Array<{ id: PieceTheme; name: string }> = [
  { id: 'calligraphic', name: 'Brush' },
  { id: 'classic', name: 'Marker' },
  { id: 'laser', name: 'Neon' },
  { id: 'gomoku_3d', name: 'Go stones' },
];

const UI_THEMES: Array<{ id: UiTheme; label: string; icon: typeof Sun }> = [
  { id: 'light', label: 'Light', icon: Sun },
  { id: 'dark', label: 'Dark', icon: Moon },
  { id: 'system', label: 'System', icon: Monitor },
];

const X_PRESETS = ['#006699', '#2563eb', '#10b981', '#00f0ff', '#8b5cf6', '#f59e0b', '#0f172a'];
const O_PRESETS = ['#e11d24', '#dc2626', '#ef4444', '#ff007f', '#ec4899', '#f97316', '#ffffff'];
const SELF_SIM_PRESETS = ['#64748b', '#475569', '#334155', '#2563eb', '#10b981', '#0f172a'];
const OPPONENT_SIM_PRESETS = ['#64748b', '#b45309', '#d97706', '#c05621', '#dc2626', '#78350f'];

/**
 * Every setting in this dialog is the same question: pick one of these. It is
 * one control, so board size, clocks, take-backs, appearance, pieces and board
 * all read and behave identically instead of as six near-misses.
 */
const Choice: React.FC<{
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ selected, disabled, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-pressed={selected}
    className={`flex items-center justify-center gap-1.5 whitespace-nowrap rounded-sm px-2 py-2.5 font-display text-[13px] font-bold transition ${
      selected ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-ink'
    } ${
      disabled
        ? /* A guest opens this dialog to READ the rules binding them, so the
             chosen option keeps full contrast even when it cannot be changed.
             Only the options they cannot take are dimmed, and losing the
             extrusion is what says the whole group is inert. */
          `cursor-not-allowed ${selected ? '' : 'opacity-55'}`
        : `${selected
            ? 'shadow-[0_3px_0_var(--ui-accent-shadow)]'
            : 'shadow-[0_3px_0_var(--ui-border-strong)] hover:bg-surface-3'}`
    }`}
  >
    {children}
  </button>
);

const Group: React.FC<{ label: string; cols: 2 | 3 | 4; children: React.ReactNode }> = ({
  label,
  cols,
  children,
}) => (
  <div>
    <p className="field-label mb-2">{label}</p>
    <div
      className={`grid gap-2 ${
        cols === 2 ? 'grid-cols-2' : cols === 3 ? 'grid-cols-3' : 'grid-cols-4'
      }`}
    >
      {children}
    </div>
  </div>
);

/** A colour row: the presets, then a picker for anything they do not cover. */
const ColourPickerRow: React.FC<{
  label: string;
  value: string;
  presets: string[];
  onChange: (hex: string) => void;
}> = ({ label, value, presets, onChange }) => (
  <div>
    <div className="mb-2 flex items-center justify-between">
      <p className="field-label">{label}</p>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={`${label}: pick any colour`}
        className="h-7 w-9 cursor-pointer rounded-sm border-2 border-line-strong bg-transparent p-0"
      />
    </div>
    <div className="flex flex-wrap items-center gap-2">
      {presets.map((c) => (
        <button
          key={`${label}-${c}`}
          type="button"
          onClick={() => onChange(c)}
          aria-pressed={value === c}
          aria-label={c}
          title={c}
          className={`h-6 w-6 rounded-full border-2 transition hover:scale-110 ${
            value === c ? 'border-ink ring-2 ring-accent' : 'border-surface-3'
          }`}
          style={{ backgroundColor: c }}
        />
      ))}
    </div>
  </div>
);

export const SettingsAndThemeModal: React.FC<SettingsAndThemeModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  isHost,
  gameStatus,
}) => {
  const dialogProps = useModalChrome(isOpen, onClose, 'settings-modal-title');
  const { theme: uiTheme, setTheme: setUiTheme } = useUiTheme();
  const {
    theme,
    setBoardTheme,
    setPieceTheme,
    setXColor,
    setOColor,
    setSelfSimulatedColor,
    setOpponentSimulatedColor,
  } = useTheme();

  if (!isOpen) return null;

  const canEditRules = isHost && gameStatus !== 'playing';
  const lockNote = gameStatus === 'playing' ? 'Locked mid-match' : 'Host only';

  return (
    <div {...dialogProps} className="modal-scrim">
      <div className="modal-panel relative flex max-h-[90vh] max-w-3xl flex-col overflow-hidden p-6">
        <div className="mb-4 flex shrink-0 items-center justify-between border-b-2 border-line pb-3">
          <h2 id="settings-modal-title" className="text-xl text-ink">
            Settings
          </h2>
          <button onClick={onClose} className="btn btn-ghost btn-icon" aria-label="Close">
            <X size={18} strokeWidth={2.25} aria-hidden="true" />
          </button>
        </div>

        <div className="grid flex-1 grid-cols-1 gap-6 overflow-y-auto pr-1 md:grid-cols-2">
          {/* MATCH. The rules both players are bound by. */}
          <div className="space-y-5 border-b-2 border-line pb-5 md:border-b-0 md:border-r-2 md:pb-0 md:pr-6">
            <div className="flex items-center justify-between gap-2 border-b-2 border-line pb-2">
              <h3 className="text-base text-ink">Match</h3>
              {!canEditRules && <span className="chip">{lockNote}</span>}
            </div>

            <Group label="Board size" cols={4}>
              {[15, 19, 30, 50].map((val) => (
                <Choice
                  key={val}
                  selected={settings.boardSize === val}
                  disabled={!canEditRules}
                  onClick={() => onUpdateSettings({ ...settings, boardSize: val })}
                >
                  {val} &times; {val}
                </Choice>
              ))}
            </Group>

            <Group label="Total time" cols={4}>
              {[
                { label: '5 min', val: 5 },
                { label: '15 min', val: 15 },
                { label: '30 min', val: 30 },
                { label: 'None', val: 0 },
              ].map((opt) => (
                <Choice
                  key={opt.val}
                  selected={settings.totalTimeMinutes === opt.val}
                  disabled={!canEditRules}
                  onClick={() => onUpdateSettings({ ...settings, totalTimeMinutes: opt.val })}
                >
                  {opt.label}
                </Choice>
              ))}
            </Group>

            <Group label="Per move" cols={4}>
              {[
                { label: '10s', val: 10 },
                { label: '30s', val: 30 },
                { label: '60s', val: 60 },
                { label: 'None', val: 0 },
              ].map((opt) => (
                <Choice
                  key={opt.val}
                  selected={settings.turnTimeSeconds === opt.val}
                  disabled={!canEditRules}
                  onClick={() => onUpdateSettings({ ...settings, turnTimeSeconds: opt.val })}
                >
                  {opt.label}
                </Choice>
              ))}
            </Group>

            {/* A boolean is still "pick one of these", so it is the same control
                rather than the one checkbox in the dialog. */}
            <Group label="Take backs" cols={2}>
              {[
                { label: 'Allowed', val: true },
                { label: 'Off', val: false },
              ].map((opt) => (
                <Choice
                  key={String(opt.val)}
                  selected={settings.allowUndo === opt.val}
                  disabled={!canEditRules}
                  onClick={() => onUpdateSettings({ ...settings, allowUndo: opt.val })}
                >
                  {opt.label}
                </Choice>
              ))}
            </Group>
          </div>

          {/* LOOK. This device only, and never sent to the other player. */}
          <div className="space-y-5">
            <div className="border-b-2 border-line pb-2">
              <h3 className="text-base text-ink">Look</h3>
            </div>

            <Group label="Appearance" cols={3}>
              {UI_THEMES.map((opt) => {
                const Icon = opt.icon;
                return (
                  <Choice
                    key={opt.id}
                    selected={uiTheme === opt.id}
                    onClick={() => setUiTheme(opt.id)}
                  >
                    <Icon size={15} strokeWidth={2.25} aria-hidden="true" />
                    {opt.label}
                  </Choice>
                );
              })}
            </Group>

            <Group label="Pieces" cols={2}>
              {PIECE_THEMES.map((pt) => (
                <Choice
                  key={pt.id}
                  selected={theme.pieceTheme === pt.id}
                  onClick={() => setPieceTheme(pt.id)}
                >
                  {pt.name}
                </Choice>
              ))}
            </Group>

            <Group label="Board" cols={2}>
              {BOARD_THEMES.map((bt) => (
                <Choice
                  key={bt.id}
                  selected={theme.boardTheme === bt.id}
                  onClick={() => setBoardTheme(bt.id)}
                >
                  {bt.name}
                </Choice>
              ))}
            </Group>

            <div className="space-y-4 border-t-2 border-line pt-4">
              <ColourPickerRow
                label="Your piece"
                value={theme.xColor || '#006699'}
                presets={X_PRESETS}
                onChange={setXColor}
              />
              <ColourPickerRow
                label="Their piece"
                value={theme.oColor || '#e11d24'}
                presets={O_PRESETS}
                onChange={setOColor}
              />
            </div>

            {/* The right-click scratchpad marks, which only this device draws. */}
            <div className="space-y-4 border-t-2 border-line pt-4">
              <ColourPickerRow
                label="Your ghost moves"
                value={theme.selfSimulatedColor}
                presets={SELF_SIM_PRESETS}
                onChange={setSelfSimulatedColor}
              />
              <ColourPickerRow
                label="Their ghost moves"
                value={theme.opponentSimulatedColor}
                presets={OPPONENT_SIM_PRESETS}
                onChange={setOpponentSimulatedColor}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
