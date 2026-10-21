import React from 'react';
import { X, Sun, Moon, Monitor } from 'lucide-react';
import type { RoomSettings } from './types';
import { useModalChrome } from '../../shared/hooks/useModalChrome';
import { useUiTheme } from '../../shared/hooks/useUiTheme';
import type { UiTheme } from '../../shared/hooks/useUiTheme';
import { useTheme } from '../theme/ThemeContext';
import type { BoardTheme, PieceTheme } from '../theme/types';
import type { StringKey } from '../i18n/strings';
import { LANGUAGES, setLanguage, useLanguage, useT } from '../i18n/language';

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

const BOARD_THEMES: Array<{ id: BoardTheme; nameKey: StringKey }> = [
  { id: 'graph_paper', nameKey: 'settings.boardTheme.graphPaper' },
  { id: 'light_wood', nameKey: 'settings.boardTheme.bamboo' },
  { id: 'laser_futuristic', nameKey: 'settings.boardTheme.laser' },
  { id: 'spreadsheet', nameKey: 'settings.boardTheme.spreadsheet' },
];

const PIECE_THEMES: Array<{ id: PieceTheme; nameKey: StringKey }> = [
  { id: 'calligraphic', nameKey: 'settings.pieceTheme.brush' },
  { id: 'classic', nameKey: 'settings.pieceTheme.marker' },
  { id: 'laser', nameKey: 'settings.pieceTheme.neon' },
  { id: 'gomoku_3d', nameKey: 'settings.pieceTheme.goStones' },
];

const UI_THEMES: Array<{ id: UiTheme; labelKey: StringKey; icon: typeof Sun }> = [
  { id: 'light', labelKey: 'settings.ui.light', icon: Sun },
  { id: 'dark', labelKey: 'settings.ui.dark', icon: Moon },
  { id: 'system', labelKey: 'settings.ui.system', icon: Monitor },
];

/** Swatch names. A hex is neither speakable nor meaningful read aloud. */
const COLOUR_NAMES: Record<string, StringKey> = {
  '#006699': 'settings.colour.oceanBlue', '#2563eb': 'settings.colour.blue', '#10b981': 'settings.colour.green',
  '#00f0ff': 'settings.colour.cyan', '#8b5cf6': 'settings.colour.purple', '#f59e0b': 'settings.colour.amber',
  '#0f172a': 'settings.colour.nearBlack', '#e11d24': 'settings.colour.red', '#dc2626': 'settings.colour.crimson',
  '#ef4444': 'settings.colour.coral', '#ff007f': 'settings.colour.hotPink', '#ec4899': 'settings.colour.pink',
  '#f97316': 'settings.colour.orange', '#ffffff': 'settings.colour.white', '#64748b': 'settings.colour.slate',
  '#475569': 'settings.colour.darkSlate', '#334155': 'settings.colour.charcoal', '#b45309': 'settings.colour.brown',
  '#d97706': 'settings.colour.darkAmber', '#c05621': 'settings.colour.burntOrange', '#78350f': 'settings.colour.darkBrown',
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
  const t = useT();
  const labelId = React.useId();
  return (
  <div>
    <div className="mb-2 flex items-center justify-between">
      <p id={labelId} className="field-label">{label}</p>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={t('settings.pickAnyColour', { label })}
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
          aria-label={`${label}: ${COLOUR_NAMES[c] ? t(COLOUR_NAMES[c]) : c}`}
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
  const language = useLanguage();
  const t = useT();
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
  const lockNote = gameStatus === 'playing' ? t('settings.lockedDuringGame') : t('settings.hostOnly');

  /* xColor always paints the X glyph and oColor always paints the O glyph,
     whichever seat the player is in. The host plays X, so for a guest a row
     labelled "Your pieces" bound to xColor recolours the OPPONENT's stones.
     Name the rows from the seat and keep the letter in the label; never swap
     which field a row writes. */
  const pieceRows =
    myPiece === 'O'
      ? [
          { label: t('settings.yourOPieces'), value: theme.oColor || '#e11d24', presets: O_PRESETS, onChange: setOColor },
          { label: t('settings.theirXPieces'), value: theme.xColor || '#006699', presets: X_PRESETS, onChange: setXColor },
        ]
      : [
          { label: t('settings.yourXPieces'), value: theme.xColor || '#006699', presets: X_PRESETS, onChange: setXColor },
          { label: t('settings.theirOPieces'), value: theme.oColor || '#e11d24', presets: O_PRESETS, onChange: setOColor },
        ];

  return (
    <div {...dialogProps} className="modal-scrim">
      <div className="modal-panel relative flex max-h-[99vh] max-w-3xl flex-col overflow-hidden p-6">
        <div className="mb-4 flex shrink-0 items-center justify-between border-b border-line pb-3">
          <h2 id="settings-modal-title" className="text-xl text-ink">
            {t('settings.title')}
          </h2>
          <button onClick={onClose} className="btn btn-ghost btn-icon" aria-label={t('common.close')}>
            <X size={18} strokeWidth={2.25} aria-hidden="true" />
          </button>
        </div>

        <div className="grid flex-1 grid-cols-1 gap-6 overflow-y-auto pr-1 md:grid-cols-2">
          {/* MATCH. The rules both players are bound by. */}
          <div className="space-y-5 border-b border-line pb-5 md:border-b-0 md:border-r md:pb-0 md:pr-6">
            <div className="flex items-center justify-between gap-2 border-b border-line pb-2">
              <h3 className="text-base text-ink">{t('settings.match')}</h3>
              {!canEditRules && <span className="chip">{lockNote}</span>}
            </div>

            <Group label={t('settings.boardSize')} cols={4}>
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

            <Group label={t('settings.totalTime')} cols={4}>
              {[
                { label: t('settings.minutes', { n: 5 }), val: 5 },
                { label: t('settings.minutes', { n: 15 }), val: 15 },
                { label: t('settings.minutes', { n: 30 }), val: 30 },
                { label: t('settings.none'), val: 0 },
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

            <Group label={t('settings.perMove')} cols={4}>
              {[
                { label: '10s', val: 10 },
                { label: '30s', val: 30 },
                { label: '60s', val: 60 },
                { label: t('settings.none'), val: 0 },
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
            <Group label={t('settings.takeBacks')} cols={2}>
              {[
                { label: t('settings.allowed'), val: true },
                { label: t('settings.off'), val: false },
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

            <Group label={t('settings.placementMode')} cols={2}>
              {[
                { label: t('settings.normal'), val: 'normal' as const },
                { label: 'LMAO', val: 'lmao' as const },
              ].map((opt) => (
                <Choice key={opt.val} selected={settings.placementMode === opt.val} disabled={!canEditRules}
                  onClick={() => onUpdateSettings({ ...settings, placementMode: opt.val })}>
                  {opt.label}
                </Choice>
              ))}
            </Group>

            <Group label={t('settings.players')} cols={2}>
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

            <Group label={t('settings.whoGoesFirst')} cols={3}>
              {[
                { label: t('settings.default'), val: 'default' as const },
                { label: t('settings.coinFlip'), val: 'coinFlip' as const },
                { label: t('settings.rockPaperScissors'), val: 'rockPaperScissors' as const },
              ].map((opt) => (
                <Choice key={opt.val} selected={(settings.firstMoveMethod ?? 'default') === opt.val}
                  disabled={!canEditRules || settings.playerMode === 'oneVsOneVsOne'}
                  onClick={() => onUpdateSettings({ ...settings, firstMoveMethod: opt.val })}>
                  {opt.val === 'rockPaperScissors' ? (
                    <img src="/Rock-paper-scissors-icon.png" alt={t('settings.rockPaperScissors')} className="h-6 w-auto" />
                  ) : opt.label}
                </Choice>
              ))}
            </Group>
          </div>

          {/* LOOK. This device only, and never sent to the other player. */}
          <div className="space-y-5">
            <div className="border-b border-line pb-2">
              <h3 className="text-base text-ink">{t('settings.look')}</h3>
            </div>

            <Group label={t('common.language')} cols={2}>
              {LANGUAGES.map((opt) => (
                <Choice key={opt.id} selected={language === opt.id} onClick={() => setLanguage(opt.id)}>
                  {opt.label}
                </Choice>
              ))}
            </Group>

            <Group label={t('settings.appearance')} cols={3}>
              {UI_THEMES.map((opt) => {
                const Icon = opt.icon;
                return (
                  <Choice
                    key={opt.id}
                    selected={uiTheme === opt.id}
                    onClick={() => setUiTheme(opt.id)}
                  >
                    <Icon size={15} strokeWidth={2.25} aria-hidden="true" />
                    {t(opt.labelKey)}
                  </Choice>
                );
              })}
            </Group>

            <Group label={t('settings.pieces')} cols={2}>
              {PIECE_THEMES.map((pt) => (
                <Choice
                  key={pt.id}
                  selected={theme.pieceTheme === pt.id}
                  onClick={() => setPieceTheme(pt.id)}
                >
                  {t(pt.nameKey)}
                </Choice>
              ))}
            </Group>

            <Group label={t('settings.board')} cols={2}>
              {BOARD_THEMES.map((bt) => (
                <Choice
                  key={bt.id}
                  selected={theme.boardTheme === bt.id}
                  onClick={() => setBoardTheme(bt.id)}
                >
                  {t(bt.nameKey)}
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
                label={t('settings.yourGhostMoves')}
                value={theme.selfSimulatedColor}
                presets={SELF_SIM_PRESETS}
                onChange={setSelfSimulatedColor}
              />
              <ColourPickerRow
                label={t('settings.theirGhostMoves')}
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
