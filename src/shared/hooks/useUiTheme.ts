import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { useUiStyle } from '../../features/theme/uiStyle';
import type { UiStyle } from '../../features/theme/uiStyle';

/**
 * App chrome light/dark mode. This is separate from the in-game board and
 * piece themes in features/theme, which style the playing surface rather than
 * the surrounding UI.
 *
 * 'system' leaves the root element unstamped so tokens.css falls through to
 * prefers-color-scheme; an explicit choice stamps data-ui-theme so it wins in
 * both directions.
 *
 * With nothing saved, the Default style is light (as always) and the Orca
 * style is dark, as PR 5 shipped it. The saved choice is one shared value, so
 * every caller (Settings, the Orca titlebar toggle) sees the same theme.
 */
export type UiTheme = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'caro:ui-theme';

function readStoredTheme(): UiTheme | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  } catch {
    // Private windows and blocked site data both throw on access.
  }
  return null;
}

let saved: UiTheme | null = readStoredTheme();
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const getSaved = () => saved;

/** The theme in force for a style when nothing was chosen. */
export const defaultUiThemeFor = (style: UiStyle): UiTheme => (style === 'orca' ? 'dark' : 'light');

function applyTheme(theme: UiTheme, style: UiStyle) {
  const root = document.documentElement;
  // Orca swaps every surface in one frame, as PR 5 did (see orca/tokens.css).
  const freeze = style === 'orca';
  if (freeze) root.classList.add('theme-transition-disabled');
  if (theme === 'system') {
    root.removeAttribute('data-ui-theme');
  } else {
    root.setAttribute('data-ui-theme', theme);
  }
  if (freeze) {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => root.classList.remove('theme-transition-disabled'));
    });
  }
}

export function useUiTheme() {
  const style = useUiStyle();
  const stored = useSyncExternalStore(subscribe, getSaved, getSaved);
  const theme: UiTheme = stored ?? defaultUiThemeFor(style);

  useEffect(() => {
    applyTheme(theme, style);
  }, [theme, style]);

  const setTheme = useCallback((next: UiTheme) => {
    saved = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Preference is not critical enough to fail the interaction over.
    }
    listeners.forEach((listener) => listener());
  }, []);

  /** PR 5's titlebar button: flips whatever is showing now, resolving 'system'. */
  const toggleLightDark = useCallback(() => {
    const showing =
      theme === 'system'
        ? window.matchMedia?.('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light'
        : theme;
    setTheme(showing === 'dark' ? 'light' : 'dark');
  }, [theme, setTheme]);

  return { theme, setTheme, toggleLightDark };
}
