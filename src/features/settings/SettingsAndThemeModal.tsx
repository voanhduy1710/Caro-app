import React, { useRef } from 'react';
import type { RoomSettings } from './types';
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
  const backdropRef = useRef<HTMLDivElement>(null);
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

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === backdropRef.current) {
      onClose();
    }
  };

  const canEditRules = isHost && gameStatus !== 'playing';

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-md transition-opacity"
    >
      <div className="bg-white text-slate-800 w-full max-w-4xl max-h-[90vh] rounded-2xl p-6 relative border border-slate-200 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4 shrink-0">
          <div>
            <span className="text-[10px] font-mono font-bold tracking-wider text-emerald-700 uppercase">
              Preferences & Configuration
            </span>
            <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
              Settings & Theme Customization
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 text-2xl font-bold p-1 leading-none"
          >
            ×
          </button>
        </div>

        {/* 2-Column Side-by-Side Body */}
        <div className="flex-1 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-6 pr-1">
          {/* COLUMN 1: Match Rules & Settings */}
          <div className="space-y-4 text-xs border-b md:border-b-0 md:border-r border-slate-100 pb-4 md:pb-0 md:pr-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="font-extrabold text-slate-900 text-sm">Match Rules</h3>
              {canEditRules ? (
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                  Host Editable
                </span>
              ) : (
                <span className="text-[10px] font-mono text-slate-400">
                  {gameStatus === 'playing' ? 'Locked during active match' : 'Host only'}
                </span>
              )}
            </div>

            {/* Board Size */}
            <div>
              <label className="block font-bold text-slate-700 mb-1.5">Board Dimensions</label>
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
                    className={`py-2 px-1 rounded-xl border text-xs font-bold font-mono transition ${settings.boardSize === opt.val
                        ? 'bg-emerald-600 border-emerald-600 text-white'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100 disabled:opacity-50'
                      }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Total Time per Player */}
            <div>
              <label className="block font-bold text-slate-700 mb-1.5">Total Time per Player</label>
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
                    className={`py-2 px-2 rounded-xl border text-xs font-bold transition ${settings.totalTimeMinutes === opt.val
                        ? 'bg-emerald-600 border-emerald-600 text-white'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100 disabled:opacity-50'
                      }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Time per Move */}
            <div>
              <label className="block font-bold text-slate-700 mb-1.5">Time per Move</label>
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
                    className={`py-2 px-2 rounded-xl border text-xs font-bold transition ${settings.turnTimeSeconds === opt.val
                        ? 'bg-emerald-600 border-emerald-600 text-white'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100 disabled:opacity-50'
                      }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Allow Move Undo */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-100">
              <div>
                <span className="text-xs font-bold text-slate-800 block">Allow Move Undo</span>
                <span className="text-[10px] text-slate-500 block">
                  Instant self-undo within 5s; opponent approval required after 5s
                </span>
              </div>
              <input
                type="checkbox"
                disabled={!canEditRules}
                checked={settings.allowUndo}
                onChange={(e) => onUpdateSettings({ ...settings, allowUndo: e.target.checked })}
                className="w-4 h-4 accent-emerald-600 rounded cursor-pointer disabled:opacity-50"
              />
            </div>
          </div>

          {/* COLUMN 2: Appearance & Theme Settings */}
          <div className="space-y-4 text-xs">
            <div className="border-b border-slate-100 pb-2">
              <h3 className="font-extrabold text-slate-900 text-sm">Theme & Visuals</h3>
            </div>

            {/* Piece Style */}
            <div>
              <label className="block font-bold text-slate-700 mb-1.5">Piece Style</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {PIECE_THEMES.map((pt) => (
                  <button
                    key={pt.id}
                    onClick={() => setPieceTheme(pt.id)}
                    className={`p-2.5 rounded-xl border text-left transition ${theme.pieceTheme === pt.id
                        ? 'bg-emerald-600 border-emerald-600 text-white'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                  >
                    <div className="font-bold text-xs">{pt.name}</div>
                    <div className="text-[10px] opacity-80 mt-0.5 truncate">{pt.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Board Theme */}
            <div>
              <label className="block font-bold text-slate-700 mb-1.5">Board Texture</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {BOARD_THEMES.map((bt) => (
                  <button
                    key={bt.id}
                    onClick={() => setBoardTheme(bt.id)}
                    className={`p-2.5 rounded-xl border text-left transition ${theme.boardTheme === bt.id
                        ? 'bg-emerald-600 border-emerald-600 text-white'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                  >
                    <div className="font-bold text-xs">{bt.name}</div>
                    <div className="text-[10px] opacity-80 mt-0.5 truncate">{bt.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Piece Colors (For ALL Piece Themes) */}
            <div className="pt-3 border-t border-slate-100 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-extrabold text-slate-900 text-xs uppercase tracking-wider">
                  Custom Piece Colors (Own & Opponent)
                </h4>
                <span className="text-[10px] text-slate-500 font-mono">Applies to all piece styles</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* X / Own Piece Color */}
                <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                  <div className="flex items-center justify-between mb-2">
                    <label className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-blue-600 inline-block" />
                      X (Own Piece) Color
                    </label>
                    <input
                      type="color"
                      value={theme.xColor || '#006699'}
                      onChange={(e) => setXColor(e.target.value)}
                      className="w-6 h-6 rounded cursor-pointer border border-slate-300 p-0 bg-transparent"
                    />
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {['#006699', '#2563eb', '#10b981', '#00f0ff', '#8b5cf6', '#f59e0b', '#0f172a'].map((c) => (
                      <button
                        key={`x-${c}`}
                        onClick={() => setXColor(c)}
                        className={`w-5 h-5 rounded-full border-2 transition transform hover:scale-110 ${theme.xColor === c ? 'border-slate-900 ring-2 ring-emerald-500 scale-105' : 'border-white shadow-sm'
                          }`}
                        style={{ backgroundColor: c }}
                        title={c}
                      />
                    ))}
                  </div>
                </div>

                {/* O / Opponent Piece Color */}
                <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                  <div className="flex items-center justify-between mb-2">
                    <label className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-600 inline-block" />
                      O (Opponent Piece) Color
                    </label>
                    <input
                      type="color"
                      value={theme.oColor || '#e11d24'}
                      onChange={(e) => setOColor(e.target.value)}
                      className="w-6 h-6 rounded cursor-pointer border border-slate-300 p-0 bg-transparent"
                    />
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {['#e11d24', '#dc2626', '#ef4444', '#ff007f', '#ec4899', '#f97316', '#ffffff'].map((c) => (
                      <button
                        key={`o-${c}`}
                        onClick={() => setOColor(c)}
                        className={`w-5 h-5 rounded-full border-2 transition transform hover:scale-110 ${theme.oColor === c ? 'border-slate-900 ring-2 ring-emerald-500 scale-105' : 'border-white shadow-sm'
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
            <div className="pt-2 border-t border-slate-100 space-y-2">
              <span className="font-bold text-slate-800 block text-xs">Right-Click Simulation Colors</span>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-slate-600 mb-1 font-semibold">
                    Own Simulated Move
                  </label>
                  <div className="flex items-center gap-1.5">
                    {SELF_SIM_PRESETS.map((c) => (
                      <button
                        key={`self-sim-${c}`}
                        onClick={() => setSelfSimulatedColor(c)}
                        className={`w-5 h-5 rounded-full border-2 transition ${theme.selfSimulatedColor === c ? 'border-slate-900 ring-2 ring-emerald-500' : 'border-transparent'
                          }`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] text-slate-600 mb-1 font-semibold">
                    Opponent Simulated Move
                  </label>
                  <div className="flex items-center gap-1.5">
                    {OPPONENT_SIM_PRESETS.map((c) => (
                      <button
                        key={`opp-sim-${c}`}
                        onClick={() => setOpponentSimulatedColor(c)}
                        className={`w-5 h-5 rounded-full border-2 transition ${theme.opponentSimulatedColor === c ? 'border-slate-900 ring-2 ring-emerald-500' : 'border-transparent'
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
