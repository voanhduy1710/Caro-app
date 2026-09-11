export type BoardTheme = 'graph_paper' | 'light_wood' | 'laser_futuristic' | 'classic_wood';
export type PieceTheme = 'calligraphic' | 'classic' | 'gomoku_3d' | 'laser';

export interface ThemeSettings {
  boardTheme: BoardTheme;
  pieceTheme: PieceTheme;
  xColor: string;
  oColor: string;
  selfSimulatedColor: string;
  opponentSimulatedColor: string;
}

export const DEFAULT_THEME_SETTINGS: ThemeSettings = {
  boardTheme: 'graph_paper',
  pieceTheme: 'calligraphic',
  xColor: '#006699', // Bold Ocean Blue (X)
  oColor: '#e11d24', // Bold Crimson Red (O)
  selfSimulatedColor: '#64748b', // Grey default for own simulated moves
  opponentSimulatedColor: '#64748b', // Grey default for opponent simulated moves
};
