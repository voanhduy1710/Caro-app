import { useSyncExternalStore } from 'react';

/**
 * The boss-key switch. In-memory only, never persisted: a page reload always
 * comes back undisguised, so the game is never silently hidden from its own
 * player. Only meaningful on the Spreadsheet board theme — every reader of
 * this flag also checks that theme before actually hiding anything, so a
 * stale `true` left over from a different match can never hide the app under
 * a board theme that was never meant to disguise it.
 */
let disguised = false;
const listeners = new Set<() => void>();

export const getDisguised = () => disguised;

export const setDisguised = (value: boolean) => {
  if (disguised === value) return;
  disguised = value;
  listeners.forEach((listener) => listener());
};

export const toggleDisguised = () => setDisguised(!disguised);

/**
 * The (game, board theme) pair the automatic default was last applied for.
 * Picking the Spreadsheet theme or starting a new game on it disguises the
 * match, but a Board that mounts again for the same game must not: that
 * would re-disguise a player who had just peeked with the star.
 */
let appliedDefaultKey: string | null = null;

/** Sets the disguise to `value` once per distinct `key`, never on a repeat. */
export const applyDisguiseDefault = (key: string, value: boolean) => {
  if (appliedDefaultKey === key) return;
  appliedDefaultKey = key;
  setDisguised(value);
};

/**
 * Called when the match's board goes away. The next match starts from its own
 * default again, and a flag left on can no longer restyle anything outside a
 * match.
 */
export const resetDisguise = () => {
  appliedDefaultKey = null;
  setDisguised(false);
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const useDisguiseMode = () => useSyncExternalStore(subscribe, getDisguised, getDisguised);

/**
 * Whether the disguise is actually on screen right now: the toggle is set AND
 * the Spreadsheet board is showing. Board keeps `<html data-sheet-disguise>` in
 * step with that, so code outside React's tree (confetti, global CSS for
 * modals and toasts) can ask without knowing the board theme.
 */
export const SHEET_DISGUISE_ATTR = 'sheetDisguise';

export const isSheetDisguiseActive = () =>
  typeof document !== 'undefined' && document.documentElement.dataset[SHEET_DISGUISE_ATTR] === 'on';

/**
 * Set to "report" by Board while the disguise shows one of the fake reports
 * instead of the game. Global CSS hides the game's own dialogs under it, and
 * game sounds stay quiet, because that is the view a bystander is meant to see.
 */
export const SHEET_VIEW_ATTR = 'sheetView';

export const isSheetReportShowing = () =>
  isSheetDisguiseActive() && document.documentElement.dataset[SHEET_VIEW_ATTR] === 'report';
