import { OPEN_SETTINGS_EVENT, sheetActionsStore, sheetUiStore, updateSheetUi } from '../sheetBridge';
import type { SheetAction } from '../sheetBridge';
import { isActionReady, runSheetAction } from './runAction';
import { showSheetSnackbar } from './sheetSnackbar';

/**
 * Every real game command the disguise exposes, as plain functions over the
 * bridge stores. The toolbar, the menus and the keyboard shortcuts all call
 * these, so the three ways in to "take back" or "rematch" cannot drift apart.
 */

export const sheetUndo = () => runSheetAction(sheetActionsStore.get().undo);

/**
 * Runs an action that may ask for confirmation first. A fake report hides the
 * game's dialogs, so the game sheet comes back before the confirm opens;
 * otherwise the command would seem to do nothing.
 */
const runOnGameSheet = (action: SheetAction | null) => {
  if (isActionReady(action) && sheetUiStore.get().view !== 'game') updateSheetUi({ view: 'game' });
  return runSheetAction(action);
};

/** Sheets' Redo is the game's "next game": a new game in practice, a rematch offer in rooms. */
export const sheetRematch = () => runOnGameSheet(sheetActionsStore.get().rematch);

export const sheetExit = () => runOnGameSheet(sheetActionsStore.get().exit);

export const sheetResign = () => runOnGameSheet(sheetActionsStore.get().resign);

export const sheetTakeSeat = () => runSheetAction(sheetActionsStore.get().takeSeat);

/**
 * The Chia sẻ button copies the room's invite link. Practice has no room to
 * share, so it answers the way Sheets does for a private file instead of
 * claiming to have copied a link that does not exist. In a room the copy is
 * asynchronous and can fail (no clipboard outside a secure context, a denied
 * permission), so the room's own runner posts the outcome once it is known.
 */
export const sheetShare = () => {
  const share = sheetActionsStore.get().share;
  if (!share) {
    showSheetSnackbar('Chỉ bạn có quyền truy cập');
    return;
  }
  runSheetAction(share);
};

export const toggleSheetComments = () => updateSheetUi({ commentsOpen: !sheetUiStore.get().commentsOpen });

export const openSheetHelp = () => updateSheetUi({ helpOpen: true });

export const setSheetZoom = (zoom: number) => updateSheetUi({ zoom });

/** "Align centre": scrolls the board back so the play sits in the middle. */
export const centerSheetBoard = () => window.dispatchEvent(new Event('caro:center-board'));

/** Removes this player's right-click sketch moves. */
export const clearSheetSketches = () => window.dispatchEvent(new Event('caro:clear-simulations'));

/**
 * Opens the game's Settings dialog. A fake report hides the game's dialogs
 * (see the report-view rule in index.css), so asking for Settings from a
 * report goes back to the game sheet first, or the dialog would open unseen.
 */
export const openSheetSettings = () => {
  if (sheetUiStore.get().view !== 'game') updateSheetUi({ view: 'game' });
  window.dispatchEvent(new Event(OPEN_SETTINGS_EVENT));
};
