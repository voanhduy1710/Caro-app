/**
 * Mirrors a desktop bot/practice match onto a paired phone. The desktop sends a
 * JSON snapshot of the data PracticeMatchView renders; the phone renders the same
 * component with action callbacks that are sent back as calls.
 */
import type { PracticeMatchViewProps } from '../../app/PracticeMatchView';

/** Callbacks a phone may trigger on the desktop's match. */
export const PRACTICE_CALLS = ['onCellClick', 'onUndo', 'onRematch', 'onBotFirst'] as const;

type LocalKey = 'user' | 'openProfileModal' | 'setOpponent' | 'onExit';
const LOCAL_KEYS: readonly LocalKey[] = ['user', 'openProfileModal', 'setOpponent', 'onExit'];

export type PracticeSnapshot = Omit<PracticeMatchViewProps, LocalKey | typeof PRACTICE_CALLS[number]>;

const CALLABLE = new Set<string>(PRACTICE_CALLS);
const EXCLUDED = new Set<string>([...LOCAL_KEYS, ...PRACTICE_CALLS]);

export const buildPracticeSnapshot = (p: PracticeMatchViewProps): PracticeSnapshot => {
  const snapshot: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(p)) {
    if (!EXCLUDED.has(key)) snapshot[key] = value;
  }
  return snapshot as unknown as PracticeSnapshot;
};

export const createRemotePracticeProps = (
  s: PracticeSnapshot,
  call: (method: string, args: unknown[]) => void,
  local: Pick<PracticeMatchViewProps, LocalKey>,
): PracticeMatchViewProps => ({
  ...s,
  user: local.user,
  openProfileModal: local.openProfileModal,
  setOpponent: local.setOpponent,
  onExit: local.onExit,
  onCellClick: (...args) => call('onCellClick', args),
  onUndo: (...args) => call('onUndo', args),
  onRematch: (...args) => call('onRematch', args),
  onBotFirst: (...args) => call('onBotFirst', args),
});

/** Runs a phone's call on the real match. False when the method is not one a phone may call, or it threw. */
export const applyPracticeCall = (p: PracticeMatchViewProps, method: string, args: unknown[]): boolean => {
  if (!CALLABLE.has(method) || !Array.isArray(args)) return false;
  if (!Object.hasOwn(p, method)) return false;
  const fn = (p as unknown as Record<string, unknown>)[method];
  if (typeof fn !== 'function') return false;
  try {
    fn.apply(p, args);
    return true;
  } catch (error) {
    console.warn(`pairing: practice call ${method} failed`, error);
    return false;
  }
};
