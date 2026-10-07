/**
 * Shared look of the Sheets disguise. The chrome stays white in the app's
 * dark mode too, the way the real product does, so these are fixed colours
 * rather than theme tokens.
 */
export const CHROME_FONT = "'Google Sans', Roboto, Arial, sans-serif";
export const CELL_FONT = 'Arial, Helvetica, sans-serif';

export const SHEETS_GREEN = '#0F9D58';

/** The panel shadow every Sheets dropdown and dialog uses. */
export const MENU_SHADOW = '0 2px 6px 2px rgba(60,64,67,.15), 0 1px 2px rgba(60,64,67,.3)';
export const DIALOG_SHADOW = '0 4px 8px 3px rgba(60,64,67,.15), 0 1px 3px rgba(60,64,67,.3)';

/** Hides a scrollbar while keeping the row scrollable, for the toolbar and tabs. */
export const HIDDEN_SCROLLBAR = '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden';

/** Text the chrome shows whenever a request has gone out to the other player. */
export const PENDING_TEXT = 'Đã gửi yêu cầu, đang chờ phản hồi…';

/**
 * Whether a key event came from somewhere the player is typing. The chrome's
 * shortcuts stand down there, so Ctrl+Z still undoes text in the chat box.
 */
export const isEditableTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
};

/** Formats a whole number the way the fake reports print money. */
export const formatNumber = (value: number) => Math.round(value).toLocaleString('en-US');

/** mm:ss for the clocks in the status bar. */
export const formatClock = (seconds: number) => {
  const total = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
};
