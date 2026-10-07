import { useSyncExternalStore } from 'react';

/**
 * The cell picked on a fake report. The report view and the formula bar are
 * siblings that never share a parent component (the formula bar is part of
 * SheetChrome, the report replaces the grid below it), so the selection is
 * handed across in this small store.
 */
export interface ReportCellInfo {
  /** "C4"-style reference for the name box. */
  ref: string;
  /** What the formula bar shows: a formula, a raw number or the label. */
  text: string;
}

let current: ReportCellInfo | null = null;
const listeners = new Set<() => void>();

export const setReportCell = (next: ReportCellInfo | null) => {
  if (current === next || (current && next && current.ref === next.ref && current.text === next.text)) return;
  current = next;
  listeners.forEach((listener) => listener());
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const get = () => current;

export const useReportCell = () => useSyncExternalStore(subscribe, get, get);
