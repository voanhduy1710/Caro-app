import { useSyncExternalStore } from 'react';

/**
 * The one Sheets-style snackbar the disguise shows. A module store rather than
 * component state, so the toolbar, the menus, the tabs and the keyboard
 * shortcuts can all post to it without sharing a parent.
 */
export interface SheetSnack {
  id: number;
  text: string;
}

const VISIBLE_MS = 3000;

let snack: SheetSnack | null = null;
let nextId = 1;
let hideTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((listener) => listener());

export const hideSheetSnackbar = () => {
  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = null;
  if (!snack) return;
  snack = null;
  emit();
};

/** Shows `text` for a few seconds, replacing whatever was showing. */
export const showSheetSnackbar = (text: string) => {
  if (hideTimer) clearTimeout(hideTimer);
  snack = { id: nextId++, text };
  emit();
  hideTimer = setTimeout(hideSheetSnackbar, VISIBLE_MS);
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const get = () => snack;

export const useSheetSnackbar = () => useSyncExternalStore(subscribe, get, get);
