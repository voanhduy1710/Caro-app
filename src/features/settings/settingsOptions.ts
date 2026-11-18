/*
 * The option lists and swatch names both styles of the Settings dialog share
 * (SettingsAndThemeModal.tsx and its Orca variant).
 */
import { Monitor, Moon, Sun } from 'lucide-react';
import type { UiTheme } from '../../shared/hooks/useUiTheme';
import type { UiStyle } from '../theme/uiStyle';
import { DEFAULT_SIMULATED_COLOR } from '../theme/types';
import type { BoardTheme, PieceTheme } from '../theme/types';
import type { StringKey } from '../i18n/strings';

/* Records, so adding a style to theme/types fails the build until it is named here. */
export const BOARD_THEME_NAMES: Record<BoardTheme, StringKey> = {
  graph_paper: 'settings.boardTheme.graphPaper',
  light_wood: 'settings.boardTheme.bamboo',
  laser_futuristic: 'settings.boardTheme.laser',
  spreadsheet: 'settings.boardTheme.spreadsheet',
};

export const PIECE_THEME_NAMES: Record<PieceTheme, StringKey> = {
  calligraphic: 'settings.pieceTheme.brush',
  classic: 'settings.pieceTheme.marker',
  laser: 'settings.pieceTheme.neon',
  gomoku_3d: 'settings.pieceTheme.goStones',
};

export const UI_STYLE_NAMES: Record<UiStyle, StringKey> = {
  default: 'settings.style.default',
  orca: 'settings.style.orca',
};

export const UI_THEMES: Array<{ id: UiTheme; labelKey: StringKey; icon: typeof Sun }> = [
  { id: 'light', labelKey: 'settings.ui.light', icon: Sun },
  { id: 'dark', labelKey: 'settings.ui.dark', icon: Moon },
  { id: 'system', labelKey: 'settings.ui.system', icon: Monitor },
];

/** Swatch names. A hex is neither speakable nor meaningful read aloud. */
export const COLOUR_NAMES: Record<string, StringKey> = {
  '#006699': 'settings.colour.oceanBlue', '#2563eb': 'settings.colour.blue', '#10b981': 'settings.colour.green',
  '#00f0ff': 'settings.colour.cyan', '#8b5cf6': 'settings.colour.purple', '#f59e0b': 'settings.colour.amber',
  '#0f172a': 'settings.colour.nearBlack', '#e11d24': 'settings.colour.red', '#dc2626': 'settings.colour.crimson',
  '#ef4444': 'settings.colour.coral', '#ff007f': 'settings.colour.hotPink', '#ec4899': 'settings.colour.pink',
  '#f97316': 'settings.colour.orange', '#ffffff': 'settings.colour.white', '#64748b': 'settings.colour.slate',
  '#475569': 'settings.colour.darkSlate', '#334155': 'settings.colour.charcoal', '#b45309': 'settings.colour.brown',
  '#d97706': 'settings.colour.darkAmber', '#c05621': 'settings.colour.burntOrange', '#78350f': 'settings.colour.darkBrown',
};

export const X_PRESETS = ['#006699', '#2563eb', '#10b981', '#00f0ff', '#8b5cf6', '#f59e0b', '#0f172a'];
export const O_PRESETS = ['#e11d24', '#dc2626', '#ef4444', '#ff007f', '#ec4899', '#f97316', '#ffffff'];
export const SELF_SIM_PRESETS = [DEFAULT_SIMULATED_COLOR, '#475569', '#334155', '#2563eb', '#10b981', '#0f172a'];
export const OPPONENT_SIM_PRESETS = [DEFAULT_SIMULATED_COLOR, '#b45309', '#d97706', '#c05621', '#dc2626', '#78350f'];
