import { useSyncExternalStore } from 'react';
import { useUiTheme } from '../../shared/hooks/useUiTheme';

const DARK_QUERY = '(prefers-color-scheme: dark)';
const subscribeSystemDark = (listener: () => void) => {
  const mql = window.matchMedia?.(DARK_QUERY);
  mql?.addEventListener('change', listener);
  return () => mql?.removeEventListener('change', listener);
};
const getSystemDark = () => Boolean(window.matchMedia?.(DARK_QUERY).matches);

/**
 * Light/dark for the Orca chrome: whether dark is showing now (a 'system'
 * choice follows the OS) and PR 5's one-click toggle. Shares its state with
 * Settings through useUiTheme, so the titlebar, the mobile bar and Settings
 * always agree.
 */
export function useShellUiTheme() {
  const { theme, toggleLightDark } = useUiTheme();
  const systemDark = useSyncExternalStore(subscribeSystemDark, getSystemDark, () => false);
  const isDark = theme === 'dark' || (theme === 'system' && systemDark);
  return { isDark, toggleLightDark };
}

/** Typing in a field must never trigger a shell shortcut (Ctrl+B). */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}
