/** Single source for the board and piece styles: the settings list, the
 *  saved-settings check and the board's CSS class map all derive from these. */
export const BOARD_THEMES = ['graph_paper', 'light_wood', 'laser_futuristic', 'spreadsheet'] as const;
export type BoardTheme = (typeof BOARD_THEMES)[number];

export const PIECE_THEMES = ['calligraphic', 'classic', 'laser', 'gomoku_3d'] as const;
export type PieceTheme = (typeof PIECE_THEMES)[number];

export interface ThemeSettings {
  boardTheme: BoardTheme;
  pieceTheme: PieceTheme;
  xColor: string;
  oColor: string;
  selfSimulatedColor: string;
  opponentSimulatedColor: string;
}

/** The third player's triangle; the neon variant is the T under the laser piece theme. */
const TRIANGLE_COLOR = '#7c3aed';
const TRIANGLE_COLOR_NEON = '#a855f7';
export const DEFAULT_SIMULATED_COLOR = '#64748b';

export function pieceColor(colors: { xColor: string; oColor: string }, piece: 'X' | 'O' | 'T', neon = false): string {
  return piece === 'X' ? colors.xColor : piece === 'O' ? colors.oColor : neon ? TRIANGLE_COLOR_NEON : TRIANGLE_COLOR;
}

export const DEFAULT_THEME_SETTINGS: ThemeSettings = {
  boardTheme: 'graph_paper',
  pieceTheme: 'calligraphic',
  xColor: '#006699', // Bold Ocean Blue (X)
  oColor: '#e11d24', // Bold Crimson Red (O)
  selfSimulatedColor: DEFAULT_SIMULATED_COLOR, // Grey default for own simulated moves
  opponentSimulatedColor: DEFAULT_SIMULATED_COLOR, // Grey default for opponent simulated moves
};
