import { useSyncExternalStore } from 'react';

/**
 * The handful of board settings a player reaches for mid-match. They are kept
 * out of the Settings dialog, which holds the rules both players are bound by:
 * these change only what this browser draws and plays.
 */
export interface DisplayPrefs {
  /** Row/column numbers printed in empty cells. */
  showCoordinates: boolean;
  /** Ring around the most recent move. */
  markLastMove: boolean;
  soundEnabled: boolean;
}

const STORAGE_KEY = 'caro_display_prefs';

const DEFAULTS: DisplayPrefs = {
  showCoordinates: false,
  markLastMove: true,
  soundEnabled: true,
};

const read = (): DisplayPrefs => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<DisplayPrefs>;
    return {
      showCoordinates: parsed.showCoordinates ?? DEFAULTS.showCoordinates,
      markLastMove: parsed.markLastMove ?? DEFAULTS.markLastMove,
      soundEnabled: parsed.soundEnabled ?? DEFAULTS.soundEnabled,
    };
  } catch {
    return DEFAULTS;
  }
};

let prefs: DisplayPrefs = read();
const listeners = new Set<() => void>();

/**
 * Read without subscribing. Sound is played from callbacks that must not force
 * a render, so they ask for the current value at the moment they fire.
 */
export const getDisplayPrefs = () => prefs;

export const setDisplayPref = <K extends keyof DisplayPrefs>(key: K, value: DisplayPrefs[K]) => {
  if (prefs[key] === value) return;
  prefs = { ...prefs, [key]: value };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Persisting a display preference is a convenience, not a requirement.
  }
  listeners.forEach((listener) => listener());
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const useDisplayPrefs = () => useSyncExternalStore(subscribe, getDisplayPrefs, getDisplayPrefs);
