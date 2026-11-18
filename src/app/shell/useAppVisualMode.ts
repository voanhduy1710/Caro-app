import { useCallback, useEffect } from 'react';
import { setDisguised } from '../../features/game/disguiseMode';
import { useTheme } from '../../features/theme/ThemeContext';
import { BOARD_THEMES } from '../../features/theme/types';
import type { BoardTheme } from '../../features/theme/types';

/** PR 5's titlebar pill: the Orca workspace, or the Google Sheets ("GGS") disguise. */
export type AppVisualMode = 'orca' | 'sheets';

const LAST_BOARD_KEY = 'caro:last-board-theme';

const readLastBoard = (): BoardTheme => {
  try {
    const stored = localStorage.getItem(LAST_BOARD_KEY);
    if (stored && stored !== 'spreadsheet' && (BOARD_THEMES as readonly string[]).includes(stored)) {
      return stored as BoardTheme;
    }
  } catch {
    // Private windows and blocked site data both throw on access.
  }
  return 'graph_paper';
};

const writeLastBoard = (board: BoardTheme) => {
  if (board === 'spreadsheet') return;
  try {
    localStorage.setItem(LAST_BOARD_KEY, board);
  } catch {
    // Not worth failing the switch over.
  }
};

/**
 * GGS is the Spreadsheet board theme plus the disguise switched on, as in
 * PR 5's ThemeContext.setAppMode. Going back restores the last board that was
 * not the spreadsheet. ThemeContext itself is not changed: the last board is
 * remembered here, under its own key.
 */
export function useAppVisualMode() {
  const { theme, setBoardTheme } = useTheme();
  const appMode: AppVisualMode = theme.boardTheme === 'spreadsheet' ? 'sheets' : 'orca';

  // A board picked in Settings is the one to come back to.
  useEffect(() => {
    writeLastBoard(theme.boardTheme);
  }, [theme.boardTheme]);

  const setAppMode = useCallback(
    (mode: AppVisualMode) => {
      if (mode === 'sheets') {
        writeLastBoard(theme.boardTheme);
        setBoardTheme('spreadsheet');
        setDisguised(true);
      } else {
        setBoardTheme(theme.boardTheme === 'spreadsheet' ? readLastBoard() : theme.boardTheme);
        setDisguised(false);
      }
    },
    [theme.boardTheme, setBoardTheme],
  );

  return { appMode, setAppMode };
}
