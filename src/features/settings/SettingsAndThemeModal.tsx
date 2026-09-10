import React from 'react';
import { X, Sun, Moon, Monitor } from 'lucide-react';
import type { RoomSettings } from './types';
import { WIN_RULE_TEXT } from './types';
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

const BOARD_THEMES: Array<{ id: BoardTheme; name: string; desc: string }> = [
  { id: 'graph_paper', name: 'Notebook Graph Grid', desc: 'Clean white graph paper grid' },
  { id: 'light_wood', name: 'Light Bamboo Wood', desc: 'Natural light bamboo grain texture' },
  { id: 'laser_futuristic', name: 'Futuristic Laser Grid', desc: 'Neon Cyberpunk dark purple grid' },
  { id: 'classic_wood', name: 'Rich Mahogany Wood', desc: 'Warm deep wooden board texture' },
];

const PIECE_THEMES: Array<{ id: PieceTheme; name: string; desc: string }> = [
  { id: 'calligraphic', name: 'Vector Brush', desc: 'Bold Blue X & Crimson Red O' },
  { id: 'classic', name: 'Marker X & O', desc: 'Hand-drawn bold Marker X & O' },
  { id: 'laser', name: 'Neon Laser', desc: 'Glowing Cyan Laser X & Pink Laser O' },
  { id: 'gomoku_3d', name: '3D Go Stones', desc: 'Authentic 3D Black & White Go stones' },
];

const UI_THEMES: Array<{ id: UiTheme; label: string; icon: typeof Sun }> = [
  { id: 'light', label: 'Light', icon: Sun },
  { id: 'dark', label: 'Dark', icon: Moon },
  { id: 'system', label: 'System', icon: Monitor },
];

const SELF_SIM_PRESETS = ['#64748b', '#475569', '#334155', '#2563eb', '#10b981', '#0f172a'];
const OPPONENT_SIM_PRESETS = ['#64748b', '#b45309', '#d97706', '#c05621', '#dc2626', '#78350f'];

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

  return (
    <div
      {...dialogProps}
      className="modal-scrim"
    >
      <div className="modal-panel max-w-4xl max-h-[90vh] relative p-6 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line pb-3 mb-4 shrink-0">
          <div>
            <h2 id="settings-modal-title" className="text-xl font-semibold text-ink tracking-tight">
              Settings & Theme Customization
            </h2>
          </div>
          <button
            onClick={onClose}
            className="btn btn-ghost btn-icon"
           aria-label="Close">
            <X size={18} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>

        {/* 2-Column Side-by-Side Body */}
        <div className="flex-1 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-6 pr-1">
          {/* COLUMN 1: Match Rules & Settings */}
          <div className="space-y-4 text-xs border-b md:border-b-0 md:border-r border-line pb-4 md:pb-0 md:pr-6">
            <div className="flex items-center justify-between border-b border-line pb-2">
              <h3 className="font-semibold text-ink text-sm">Match Rules</h3>
              {canEditRules ? (
                <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-sm bg-accent-soft text-accent-text border border-accent">
                  Host Editable
                </span>
              ) : (
                <span className="text-[10px] font-mono text-subtle">
                  {gameStatus === 'playing' ? 'Locked during active match' : 'Host only'}
                </span>
              )}
            </div>

            {/* Both players must be looking at the same rules, so say what they
                are and who they apply to before the first move, not after. */}
            <p className="text-[11px] leading-relaxed text-muted">
              {WIN_RULE_TEXT} These rules apply to both players; the host sets them and
              they are sent to whoever joins.
            </p>

            {/* Board Size */}
            <div>
              <label className="block font-medium text-ink mb-1.5">Board Dimensions</label>
              <p className="text-[11px] text-muted mb-1.5">
                15×15 is the standard size and the only one that fits a phone screen
                without scrolling. The larger boards need panning.
              </p>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: '15 × 15', val: 15 },
                  { label: '19 × 19', val: 19 },
                  { label: '30 × 30', val: 30 },
                  { label: '50 × 50', val: 50 },
                ].map((opt) => (
                  <button
                    key={opt.val}
                    disabled={!canEditRules}
                    onClick={() => onUpdateSettings({ ...settings, boardSize: opt.val })}
                    className={`py-2 px-1 rounded-md border text-xs font-medium font-mono transition ${settings.boardSize === opt.val
                        ? 'bg-accent border-accent text-accent-fg'
                        : 'bg-surface-2 border-line text-ink hover:bg-surface-3 disabled:opacity-50'
                      }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Total Time per Player */}
            <div>
              <label className="block font-medium text-ink mb-1.5">Total Time per Player</label>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: '5 Mins', val: 5 },
                  { label: '15 Mins', val: 15 },
                  { label: '30 Mins', val: 30 },
                  { label: 'Unlimited', val: 0 },
                ].map((opt) => (
                  <button
                    key={opt.val}
                    disabled={!canEditRules}
                    onClick={() => onUpdateSettings({ ...settings, totalTimeMinutes: opt.val })}
                    className={`py-2 px-2 rounded-md border text-xs font-medium transition ${settings.totalTimeMinutes === opt.val
                        ? 'bg-accent border-accent text-accent-fg'
                        : 'bg-surface-2 border-line text-ink hover:bg-surface-3 disabled:opacity-50'
                      }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Time per Move */}
            <div>
              <label className="block font-medium text-ink mb-1.5">Time per Move</label>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: '10 Secs', val: 10 },
                  { label: '30 Secs', val: 30 },
                  { label: '60 Secs', val: 60 },
                  { label: 'Unlimited', val: 0 },
                ].map((opt) => (
                  <button
                    key={opt.val}
                    disabled={!canEditRules}
                    onClick={() => onUpdateSettings({ ...settings, turnTimeSeconds: opt.val })}
                    className={`py-2 px-2 rounded-md border text-xs font-medium transition ${settings.turnTimeSeconds === opt.val
                        ? 'bg-accent border-accent text-accent-fg'
                        : 'bg-surface-2 border-line text-ink hover:bg-surface-3 disabled:opacity-50'
                      }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Allow Move Undo */}
            <div className="flex items-center justify-between pt-3 border-t border-line">
              <div>
                <span className="text-xs font-medium text-ink block">Allow Move Undo</span>
                <span className="text-[10px] text-muted block">
                  Instant self-undo within 5s; opponent approval required after 5s
                </span>
              </div>
              <input
                type="checkbox"
                disabled={!canEditRules}
                checked={settings.allowUndo}
                onChange={(e) => onUpdateSettings({ ...settings, allowUndo: e.target.checked })}
                className="w-4 h-4 accent-emerald-600 rounded-sm cursor-pointer disabled:opacity-50"
              />
            </div>
          </div>

          {/* COLUMN 2: Appearance & Theme Settings */}
          <div className="space-y-4 text-xs">
            <div className="border-b border-line pb-2">
              <h3 className="font-semibold text-ink text-sm">Theme & Visuals</h3>
            </div>

            {/* App appearance. Separate from the board and piece themes below,
                which style the playing surface rather than the surrounding UI. */}
            <div>
              <label className="block font-medium text-ink mb-1.5">Appearance</label>
              <div className="grid grid-cols-3 gap-2">
                {UI_THEMES.map((opt) => {
                  const Icon = opt.icon;
                  const active = uiTheme === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setUiTheme(opt.id)}
                      aria-pressed={active}
                      className={`py-2 px-1 rounded-md border text-xs font-medium transition flex items-center justify-center gap-1.5 ${
                        active
                          ? 'bg-accent border-accent text-accent-fg'
                          : 'bg-surface-2 border-line text-ink hover:bg-surface-3'
                      }`}
                    >
                      <Icon size={14} strokeWidth={1.75} aria-hidden="true" />
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Piece Style */}
            <div>
              <label className="block font-medium text-ink mb-1.5">Piece Style</label>
              <div className="grid grid-cols-2 gap-2">
                {PIECE_THEMES.map((pt) => (
                  <button
                    key={pt.id}
                    onClick={() => setPieceTheme(pt.id)}
                    className={`p-2.5 rounded-md border text-left transition ${theme.pieceTheme === pt.id
                        ? 'bg-accent border-accent text-accent-fg'
                        : 'bg-surface-2 border-line text-ink hover:bg-surface-3'
                      }`}
                  >
                    <div className="font-medium text-xs">{pt.name}</div>
                    <div className="text-[11px] opacity-75 mt-0.5 leading-snug">{pt.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Board Theme */}
            <div>
              <label className="block font-medium text-ink mb-1.5">Board Texture</label>
              <div className="grid grid-cols-2 gap-2">
                {BOARD_THEMES.map((bt) => (
                  <button
                    key={bt.id}
                    onClick={() => setBoardTheme(bt.id)}
                    className={`p-2.5 rounded-md border text-left transition ${theme.boardTheme === bt.id
                        ? 'bg-accent border-accent text-accent-fg'
                        : 'bg-surface-2 border-line text-ink hover:bg-surface-3'
                      }`}
                  >
                    <div className="font-medium text-xs">{bt.name}</div>
                    <div className="text-[11px] opacity-75 mt-0.5 leading-snug">{bt.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Piece Colors (For ALL Piece Themes) */}
            <div className="pt-3 border-t border-line space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-medium text-ink text-xs">Piece colours</span>
                <span className="text-[11px] text-muted">Applies to every piece style</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* X / Own Piece Color */}
                <div className="bg-surface-2 p-2.5 rounded-md border border-line">
                  <div className="flex items-center justify-between mb-2">
                    <label className="font-medium text-ink text-xs flex items-center gap-1.5">
                      {/* The swatch previews the colour that is actually set,
                          rather than a hardcoded one that drifts from it. */}
                      <span
                        className="w-2.5 h-2.5 rounded-full inline-block"
                        style={{ backgroundColor: theme.xColor || '#006699' }}
                      />
                      X (Own Piece) Color
                    </label>
                    <input
                      type="color"
                      value={theme.xColor || '#006699'}
                      onChange={(e) => setXColor(e.target.value)}
                      className="w-6 h-6 rounded-sm cursor-pointer border border-line-strong p-0 bg-transparent"
                    />
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {['#006699', '#2563eb', '#10b981', '#00f0ff', '#8b5cf6', '#f59e0b', '#0f172a'].map((c) => (
                      <button
                        key={`x-${c}`}
                        onClick={() => setXColor(c)}
                        className={`w-5 h-5 rounded-full border-2 transition transform hover:scale-110 ${theme.xColor === c ? 'border-ink ring-2 ring-accent scale-105' : 'border-surface shadow-sm'
                          }`}
                        style={{ backgroundColor: c }}
                        title={c}
                      />
                    ))}
                  </div>
                </div>

                {/* O / Opponent Piece Color */}
                <div className="bg-surface-2 p-2.5 rounded-md border border-line">
                  <div className="flex items-center justify-between mb-2">
                    <label className="font-medium text-ink text-xs flex items-center gap-1.5">
                      <span
                        className="w-2.5 h-2.5 rounded-full inline-block"
                        style={{ backgroundColor: theme.oColor || '#e11d24' }}
                      />
                      O (Opponent Piece) Color
                    </label>
                    <input
                      type="color"
                      value={theme.oColor || '#e11d24'}
                      onChange={(e) => setOColor(e.target.value)}
                      className="w-6 h-6 rounded-sm cursor-pointer border border-line-strong p-0 bg-transparent"
                    />
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {['#e11d24', '#dc2626', '#ef4444', '#ff007f', '#ec4899', '#f97316', '#ffffff'].map((c) => (
                      <button
                        key={`o-${c}`}
                        onClick={() => setOColor(c)}
                        className={`w-5 h-5 rounded-full border-2 transition transform hover:scale-110 ${theme.oColor === c ? 'border-ink ring-2 ring-accent scale-105' : 'border-surface shadow-sm'
                          }`}
                        style={{ backgroundColor: c }}
                        title={c}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Simulation Scratchpad Move Colors */}
            <div className="pt-2 border-t border-line space-y-2">
              <span className="font-medium text-ink block text-xs">Right-Click Simulation Colors</span>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-muted mb-1 font-semibold">
                    Own Simulated Move
                  </label>
                  <div className="flex items-center gap-1.5">
                    {SELF_SIM_PRESETS.map((c) => (
                      <button
                        key={`self-sim-${c}`}
                        onClick={() => setSelfSimulatedColor(c)}
                        className={`w-5 h-5 rounded-full border-2 transition ${theme.selfSimulatedColor === c ? 'border-ink ring-2 ring-accent' : 'border-transparent'
                          }`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] text-muted mb-1 font-semibold">
                    Opponent Simulated Move
                  </label>
                  <div className="flex items-center gap-1.5">
                    {OPPONENT_SIM_PRESETS.map((c) => (
                      <button
                        key={`opp-sim-${c}`}
                        onClick={() => setOpponentSimulatedColor(c)}
                        className={`w-5 h-5 rounded-full border-2 transition ${theme.opponentSimulatedColor === c ? 'border-ink ring-2 ring-accent' : 'border-transparent'
                          }`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
