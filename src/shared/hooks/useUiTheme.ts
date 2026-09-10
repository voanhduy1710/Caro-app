import { useCallback, useEffect, useState } from 'react';

/**
 * App chrome light/dark mode. This is separate from the in-game board and
 * piece themes in features/theme, which style the playing surface rather than
 * the surrounding UI.
 *
 * 'system' leaves the root element unstamped so tokens.css falls through to
 * prefers-color-scheme; an explicit choice stamps data-ui-theme so it wins in
 * both directions.
 */
export type UiTheme = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'caro:ui-theme';

function readStoredTheme(): UiTheme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  } catch {
    // Private windows and blocked site data both throw on access.
  }
  return 'system';
}

function applyTheme(theme: UiTheme) {
  const root = document.documentElement;
  if (theme === 'system') {
    root.removeAttribute('data-ui-theme');
  } else {
    root.setAttribute('data-ui-theme', theme);
  }
}

export function useUiTheme() {
  const [theme, setThemeState] = useState<UiTheme>(readStoredTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const setTheme = useCallback((next: UiTheme) => {
    setThemeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Preference is not critical enough to fail the interaction over.
    }
  }, []);

  return { theme, setTheme };
}
