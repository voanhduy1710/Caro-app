import type { SheetAction } from '../sheetBridge';
import { showSheetSnackbar } from './sheetSnackbar';
import { PENDING_TEXT } from './sheetStyle';

/** True when the control for `action` should be clickable. */
export const isActionReady = (action: SheetAction | null): action is SheetAction =>
  Boolean(action && !action.disabled && !action.pending);

/**
 * Runs a game action from a Sheets control. A request already in flight gets
 * the "waiting" snackbar instead of a second request; a missing or disabled
 * action does nothing, the way a greyed-out Sheets command does nothing.
 */
export const runSheetAction = (action: SheetAction | null) => {
  if (!action) return false;
  if (action.pending) {
    showSheetSnackbar(PENDING_TEXT);
    return false;
  }
  if (action.disabled) return false;
  action.run();
  return true;
};
