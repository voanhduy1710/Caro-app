/*
 * Orca style (PR 5) settings: two flat cards (Match rules, Look) of segmented
 * tracks. A dialog for use mid-match, or, with `embedded`, the Settings page of
 * the Orca workspace. Same settings and handlers as the Default dialog, plus
 * PR 5's "Interface mode" row (Orca IDE / Google Sheets disguise) and today's
 * Style row (Default / Orca).
 */
import React from 'react';
import { X } from 'lucide-react';
import { BOARD_SIZES } from '../room/protocol';
import { useModalChrome } from '../../shared/hooks/useModalChrome';
import { useUiTheme } from '../../shared/hooks/useUiTheme';
import { Badge, SegmentedControl } from '../../shared/ui/primitives';
import { useTheme } from '../theme/ThemeContext';
import { UI_STYLES, setUiStyle, useUiStyle } from '../theme/uiStyle';
import { BOARD_THEMES, PIECE_THEMES } from '../theme/types';
import { LANGUAGES, setLanguage, useLanguage, useT } from '../i18n/language';
import { useAppVisualMode } from '../../app/shell/useAppVisualMode';
import type { AppVisualMode } from '../../app/shell/useAppVisualMode';
import {
  BOARD_THEME_NAMES,
  COLOUR_NAMES,
  OPPONENT_SIM_PRESETS,
  O_PRESETS,
  PIECE_THEME_NAMES,
  SELF_SIM_PRESETS,
  UI_STYLE_NAMES,
  UI_THEMES,
  X_PRESETS,
} from './settingsOptions';
import type { SettingsAndThemeModalProps } from './SettingsAndThemeModal';

export interface SettingsAndThemeModalOrcaProps extends SettingsAndThemeModalProps {
  /** The workspace page: no scrim, no close button, no focus trap. */
  embedded?: boolean;
}

/** One option of a setting, inside a flat 1px track. */
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
    className={`inline-flex h-7 items-center justify-center gap-1.5 whitespace-nowrap rounded-[5px] border px-2 text-xs font-medium transition-colors duration-120 ${
      selected
        ? 'border-line bg-surface text-ink shadow-[0_1px_2px_rgb(0_0_0/0.12)]'
        : disabled
          ? 'border-transparent text-subtle'
          : 'border-transparent text-muted hover:bg-surface-3/60 hover:text-ink'
    } ${disabled ? 'cursor-not-allowed' : ''}`}
  >
    {children}
  </button>
);

/** The label is tied to the options, so two "None" buttons stay apart for a screen reader. */
const Group: React.FC<{ label: string; hint?: string; cols: 2 | 3 | 4; children: React.ReactNode }> = ({
  label,
  hint,
  cols,
  children,
}) => {
  const labelId = React.useId();
  return (
    <div>
      <p id={labelId} className="field-label mb-1.5">
        {label}
      </p>
      <div
        role="group"
        aria-labelledby={labelId}
        className={`grid gap-1 rounded-[6px] border border-line bg-surface-2 p-0.5 ${
          cols === 2 ? 'grid-cols-2' : cols === 3 ? 'grid-cols-3' : 'grid-cols-4'
        }`}
      >
        {children}
      </div>
      {hint && <p className="field-hint mt-1.5">{hint}</p>}
    </div>
  );
};

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
      <div className="mb-1.5 flex items-center justify-between">
        <p id={labelId} className="field-label">
          {label}
        </p>
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={t('settings.pickAnyColour', { label })}
          className="h-6 w-8 cursor-pointer rounded-[4px] border border-line-strong bg-transparent p-0"
        />
      </div>
      <div role="group" aria-labelledby={labelId} className="flex flex-wrap items-center gap-1.5">
        {presets.map((c) => {
          const isSelected = value.toLowerCase() === c.toLowerCase();
          return (
            <button
              key={`${label}-${c}`}
              type="button"
              onClick={() => onChange(c)}
              aria-pressed={isSelected}
              aria-label={`${label}: ${COLOUR_NAMES[c] ? t(COLOUR_NAMES[c]) : c}`}
              title={c}
              className={`h-5 w-5 rounded-full border transition-transform hover:scale-110 ${
                isSelected ? 'border-ink ring-2 ring-accent' : 'border-line-strong'
              }`}
              style={{ backgroundColor: c }}
            />
          );
        })}
      </div>
    </div>
  );
};

export const SettingsAndThemeModalOrca: React.FC<SettingsAndThemeModalOrcaProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  isHost,
  gameStatus,
  myPiece = 'X',
  embedded = false,
}) => {
  const dialogProps = useModalChrome(!embedded && isOpen, onClose, 'settings-modal-title');
  const { theme: uiTheme, setTheme: setUiTheme } = useUiTheme();
  const uiStyle = useUiStyle();
  const language = useLanguage();
  const t = useT();
  const { appMode, setAppMode } = useAppVisualMode();
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

  /* xColor always paints X and oColor always paints O, whichever seat the
     player is in: name the rows from the seat, never swap which field a row
     writes (same as the Default dialog). */
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

  const workspaceModes: Array<{ id: AppVisualMode; label: string }> = [
    { id: 'orca', label: t('common.modeOrca') },
    { id: 'sheets', label: t('common.modeSheetsFull') },
  ];

  const header = (
    <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line pb-3">
      <div>
        <h2 id="settings-modal-title" className="text-sm font-semibold text-ink">
          {t('settings.title')}
        </h2>
        <p className="text-xs text-muted">{t('settings.winRule')}</p>
      </div>
      <div className="flex items-center gap-2">
        <SegmentedControl
          value={language}
          onChange={setLanguage}
          ariaLabel={t('common.language')}
          size="xs"
          options={LANGUAGES.map((opt) => ({ value: opt.id, label: opt.id.toUpperCase(), title: opt.label }))}
        />
        {!embedded && (
          <button type="button" onClick={onClose} className="orca-icon-btn" aria-label={t('common.close')}>
            <X size={15} strokeWidth={1.75} aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );

  const settingsGrid = (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
      {/* MATCH. The rules both players are bound by. */}
      <section className="space-y-4 rounded-md border border-line bg-surface p-4">
        <div className="flex items-center justify-between gap-2 border-b border-line pb-2.5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-ink">{t('settings.match')}</h3>
          {!canEditRules && <Badge tone="warning">{lockNote}</Badge>}
        </div>

        <Group label={t('settings.boardSize')} cols={4}>
          {BOARD_SIZES.map((val) => (
            <Choice
              key={val}
              selected={settings.boardSize === val}
              disabled={!canEditRules}
              onClick={() => onUpdateSettings({ ...settings, boardSize: val })}
            >
              <span className="font-mono tabular-nums">
                {val}×{val}
              </span>
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
            <Choice
              key={opt.val}
              selected={settings.placementMode === opt.val}
              disabled={!canEditRules}
              onClick={() => onUpdateSettings({ ...settings, placementMode: opt.val })}
            >
              {opt.label}
            </Choice>
          ))}
        </Group>

        <Group label={t('settings.players')} cols={2}>
          {[
            { label: '1v1', val: 'oneVsOne' as const },
            { label: '1v1v1', val: 'oneVsOneVsOne' as const },
          ].map((opt) => (
            <Choice
              key={opt.val}
              selected={(settings.playerMode ?? 'oneVsOne') === opt.val}
              disabled={!canEditRules}
              onClick={() => onUpdateSettings({ ...settings, playerMode: opt.val })}
            >
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
            <Choice
              key={opt.val}
              selected={(settings.firstMoveMethod ?? 'default') === opt.val}
              disabled={!canEditRules || settings.playerMode === 'oneVsOneVsOne'}
              onClick={() => onUpdateSettings({ ...settings, firstMoveMethod: opt.val })}
            >
              <span className="truncate">{opt.label}</span>
            </Choice>
          ))}
        </Group>
      </section>

      {/* LOOK. This device only, and never sent to the other player. */}
      <section className="space-y-4 rounded-md border border-line bg-surface p-4">
        <div className="border-b border-line pb-2.5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-ink">{t('settings.look')}</h3>
        </div>

        <Group label={t('settings.style')} cols={2}>
          {UI_STYLES.map((id) => (
            <Choice key={id} selected={uiStyle === id} onClick={() => setUiStyle(id)}>
              {t(UI_STYLE_NAMES[id])}
            </Choice>
          ))}
        </Group>

        <Group label={t('settings.workspaceMode')} hint={t('settings.workspaceModeHint')} cols={2}>
          {workspaceModes.map((opt) => (
            <Choice key={opt.id} selected={appMode === opt.id} onClick={() => setAppMode(opt.id)}>
              {opt.label}
            </Choice>
          ))}
        </Group>

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
              <Choice key={opt.id} selected={uiTheme === opt.id} onClick={() => setUiTheme(opt.id)}>
                <Icon size={14} strokeWidth={1.75} aria-hidden="true" />
                {t(opt.labelKey)}
              </Choice>
            );
          })}
        </Group>

        <Group label={t('settings.board')} cols={2}>
          {BOARD_THEMES.map((id) => (
            <Choice key={id} selected={theme.boardTheme === id} onClick={() => setBoardTheme(id)}>
              {t(BOARD_THEME_NAMES[id])}
            </Choice>
          ))}
        </Group>

        <Group label={t('settings.pieces')} cols={2}>
          {PIECE_THEMES.map((id) => (
            <Choice key={id} selected={theme.pieceTheme === id} onClick={() => setPieceTheme(id)}>
              {t(PIECE_THEME_NAMES[id])}
            </Choice>
          ))}
        </Group>

        <div className="space-y-3 border-t border-line pt-3">
          <span className="text-xs font-medium text-muted">{t('settings.pieceColours')}</span>
          {pieceRows.map((row) => (
            <ColourPickerRow key={row.label} {...row} />
          ))}
        </div>

        {/* The right-click scratchpad marks, which only this device draws. */}
        <div className="space-y-3 border-t border-line pt-3">
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
      </section>
    </div>
  );

  if (embedded) {
    return (
      <div className="mx-auto w-full max-w-4xl space-y-5 px-4 py-5 sm:px-6">
        {header}
        {settingsGrid}
      </div>
    );
  }

  return (
    <div {...dialogProps} className="modal-scrim">
      <div className="modal-panel relative flex max-h-[90dvh] max-w-3xl flex-col overflow-hidden p-4 sm:p-5">
        {header}
        <div className="scrollbar-orca mt-4 flex-1 overflow-y-auto pr-0.5">{settingsGrid}</div>
      </div>
    </div>
  );
};
