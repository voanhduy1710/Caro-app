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
  /** Which seat the player holds, so the piece-colour rows can name it. */
  myPiece?: 'X' | 'O' | 'T';
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

/** Swatch names. A hex is neither speakable nor meaningful read aloud. */
const COLOUR_NAMES: Record<string, string> = {
  '#006699': 'ocean blue', '#2563eb': 'blue', '#10b981': 'green', '#00f0ff': 'cyan',
  '#8b5cf6': 'purple', '#f59e0b': 'amber', '#0f172a': 'near-black',
  '#e11d24': 'red', '#dc2626': 'crimson', '#ef4444': 'coral', '#ff007f': 'hot pink',
  '#ec4899': 'pink', '#f97316': 'orange', '#ffffff': 'white',
  '#64748b': 'slate', '#475569': 'dark slate', '#334155': 'charcoal',
  '#b45309': 'brown', '#d97706': 'dark amber', '#c05621': 'burnt orange',
  '#78350f': 'dark brown',
};

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
    className={`flex items-center justify-center gap-1.5 whitespace-nowrap rounded-sm px-2 py-2 text-[13px] font-semibold transition ${
      selected
        ? 'bg-accent text-accent-fg'
        : disabled
        ? /* Not dimmed with opacity: on a tinted track that compounds to 2.1:1.
             The subtle token measures 4.17:1 and still reads as unavailable. */
          'text-subtle'
        : 'text-muted hover:bg-surface-2 hover:text-ink'
    } ${disabled ? 'cursor-not-allowed' : ''}`}
  >
    {children}
  </button>
);

/**
 * The label has to be tied to the options, not merely sitting above them. Both
 * clocks offer a button whose entire accessible name is "None", so without the
 * association a screen reader announces the same control twice with nothing to
 * tell them apart.
 */
const Group: React.FC<{ label: string; cols: 2 | 3 | 4; children: React.ReactNode }> = ({
  label,
  cols,
  children,
}) => {
  const labelId = React.useId();
  return (
    <div>
      <p id={labelId} className="field-label mb-2">
        {label}
      </p>
      {/* One recessed track per setting, rather than four raised boxes. The
          extruded controls stay for actions; configuration is quieter. */}
      <div
        role="group"
        aria-labelledby={labelId}
        className={`grid gap-1 rounded-md bg-surface-3 p-1 ${
          cols === 2 ? 'grid-cols-2' : cols === 3 ? 'grid-cols-3' : 'grid-cols-4'
        }`}
      >
        {children}
      </div>
    </div>
  );
};

/** A colour row: the presets, then a picker for anything they do not cover. */
const ColourPickerRow: React.FC<{
  label: string;
  value: string;
  presets: string[];
  onChange: (hex: string) => void;
}> = ({ label, value, presets, onChange }) => {
  const labelId = React.useId();
  return (
  <div>
    <div className="mb-2 flex items-center justify-between">
      <p id={labelId} className="field-label">{label}</p>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={`${label}: pick any colour`}
        className="h-7 w-9 cursor-pointer rounded-sm border-2 border-line-strong bg-transparent p-0"
      />
    </div>
    <div role="group" aria-labelledby={labelId} className="flex flex-wrap items-center gap-2">
      {presets.map((c) => (
        <button
          key={`${label}-${c}`}
          type="button"
          onClick={() => onChange(c)}
          aria-pressed={value === c}
          aria-label={`${label}: ${COLOUR_NAMES[c] ?? c}`}
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
};

export const SettingsAndThemeModal: React.FC<SettingsAndThemeModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  isHost,
  gameStatus,
  myPiece = 'X',
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
  const lockNote = gameStatus === 'playing' ? 'Locked during a game' : 'Host only';

  /* xColor always paints the X glyph and oColor always paints the O glyph,
     whichever seat the player is in. The host plays X, so for a guest a row
     labelled "Your pieces" bound to xColor recolours the OPPONENT's stones.
     Name the rows from the seat and keep the letter in the label; never swap
     which field a row writes. */
  const pieceRows =
    myPiece === 'O'
      ? [
          { label: 'Your O pieces', value: theme.oColor || '#e11d24', presets: O_PRESETS, onChange: setOColor },
          { label: 'Their X pieces', value: theme.xColor || '#006699', presets: X_PRESETS, onChange: setXColor },
        ]
      : [
          { label: 'Your X pieces', value: theme.xColor || '#006699', presets: X_PRESETS, onChange: setXColor },
          { label: 'Their O pieces', value: theme.oColor || '#e11d24', presets: O_PRESETS, onChange: setOColor },
        ];

  return (
    <div {...dialogProps} className="modal-scrim">
      <div className="modal-panel relative flex max-h-[99vh] max-w-3xl flex-col overflow-hidden p-6">
        <div className="mb-4 flex shrink-0 items-center justify-between border-b border-line pb-3">
          <h2 id="settings-modal-title" className="text-xl text-ink">
            Settings
          </h2>
          <button onClick={onClose} className="btn btn-ghost btn-icon" aria-label="Close">
            <X size={18} strokeWidth={2.25} aria-hidden="true" />
          </button>
        </div>

        <div className="grid flex-1 grid-cols-1 gap-6 overflow-y-auto pr-1 md:grid-cols-2">
          {/* MATCH. The rules both players are bound by. */}
          <div className="space-y-5 border-b border-line pb-5 md:border-b-0 md:border-r md:pb-0 md:pr-6">
            <div className="flex items-center justify-between gap-2 border-b border-line pb-2">
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

            <Group label="Placement mode" cols={2}>
              {[
                { label: 'Normal', val: 'normal' as const },
                { label: 'LMAO', val: 'lmao' as const },
              ].map((opt) => (
                <Choice key={opt.val} selected={settings.placementMode === opt.val} disabled={!canEditRules}
                  onClick={() => onUpdateSettings({ ...settings, placementMode: opt.val })}>
                  {opt.label}
                </Choice>
              ))}
            </Group>

            <Group label="Players" cols={2}>
              {[
                { label: '1v1', val: 'oneVsOne' as const },
                { label: '1v1v1', val: 'oneVsOneVsOne' as const },
              ].map((opt) => (
                <Choice key={opt.val} selected={(settings.playerMode ?? 'oneVsOne') === opt.val} disabled={!canEditRules}
                  onClick={() => onUpdateSettings({ ...settings, playerMode: opt.val })}>
                  {opt.label}
                </Choice>
              ))}
            </Group>
          </div>

          {/* LOOK. This device only, and never sent to the other player. */}
          <div className="space-y-5">
            <div className="border-b border-line pb-2">
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

            <div className="space-y-4 border-t border-line pt-4">
              {pieceRows.map((row) => (
                <ColourPickerRow key={row.label} {...row} />
              ))}
            </div>

            {/* The right-click scratchpad marks, which only this device draws. */}
            <div className="space-y-4 border-t border-line pt-4">
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
