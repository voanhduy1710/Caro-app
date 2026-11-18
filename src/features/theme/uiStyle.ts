import { useSyncExternalStore } from 'react';

/**
 * The whole app's look: today's design ('default') or the Orca IDE redesign
 * from PR 5 ('orca'). Separate from light/dark (useUiTheme) and from the board
 * and piece themes (ThemeContext), which both apply inside either style.
 *
 * Stamped on <html data-ui-style> so CSS can scope the Orca tokens; index.html
 * stamps it before first paint so a saved choice never flashes the other style.
 */
export const UI_STYLES = ['default', 'orca'] as const;
export type UiStyle = (typeof UI_STYLES)[number];

export const UI_STYLE_STORAGE_KEY = 'caro:ui-style';
const DEFAULT_UI_STYLE: UiStyle = 'default';

const listeners = new Set<() => void>();

const read = (): UiStyle => {
  try {
    const stored = localStorage.getItem(UI_STYLE_STORAGE_KEY);
    if (stored && (UI_STYLES as readonly string[]).includes(stored)) return stored as UiStyle;
  } catch {
    // Private windows and blocked site data both throw on access.
  }
  return DEFAULT_UI_STYLE;
};

let current: UiStyle = read();

const apply = (style: UiStyle) => {
  if (typeof document === 'undefined') return;
  if (style === 'default') document.documentElement.removeAttribute('data-ui-style');
  else document.documentElement.setAttribute('data-ui-style', style);
};

apply(current);

export const getUiStyle = (): UiStyle => current;

export const setUiStyle = (next: UiStyle) => {
  if (next === current) return;
  current = next;
  apply(next);
  try {
    localStorage.setItem(UI_STYLE_STORAGE_KEY, next);
  } catch {
    // Preference is not critical enough to fail the interaction over.
  }
  listeners.forEach((listener) => listener());
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const useUiStyle = (): UiStyle => useSyncExternalStore(subscribe, getUiStyle, getUiStyle);

export const useIsOrca = (): boolean => useUiStyle() === 'orca';
