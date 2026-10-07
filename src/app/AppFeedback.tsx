import React from 'react';
import type { ConfirmSpec } from './AppViewShared';

/**
 * Under the Spreadsheet disguise notices go to the Sheets snackbar instead (see
 * showNotice), so a pill still showing from just before the boss key is hidden
 * rather than left up in English, and a confirmation that has Sheets wording
 * asks in it.
 */
export const AppFeedback: React.FC<{ notice: string | null; roomClosed: boolean; roomError: string | null; onResetRoom: () => void; confirm: ConfirmSpec | null; onDismissConfirm: () => void; sheetDisguise?: boolean }> = ({ notice, roomClosed, roomError, onResetRoom, confirm, onDismissConfirm, sheetDisguise = false }) => {
  const sheetCopy = sheetDisguise ? confirm?.sheet : undefined;
  const copy = sheetCopy ?? confirm;
  return <>{notice && !sheetDisguise && <div role="status" aria-live="polite" className="fixed bottom-24 left-1/2 z-[60] -translate-x-1/2 rounded-full bg-inverse px-4 py-2 text-xs font-medium text-inverse-fg shadow-lg">{notice}</div>}{roomClosed && <div className="modal-scrim" role="dialog" aria-modal="true" aria-labelledby="room-closed-title"><div className="w-full max-w-sm space-y-4 rounded-lg border border-line bg-surface p-6 text-center"><h3 id="room-closed-title" className="text-base font-semibold text-ink">The room has closed</h3><p className="text-xs leading-relaxed text-muted">{roomError}</p><button onClick={onResetRoom} className="btn btn-primary btn-sm w-full" autoFocus>Back to home</button></div></div>}{confirm && copy && <div className="modal-scrim" role="dialog" aria-modal="true" aria-labelledby="confirm-title"><div className="bg-surface p-6 rounded-lg border border-line max-w-sm w-full space-y-4"><div className="space-y-1.5"><h3 id="confirm-title" className="text-base font-semibold text-ink">{copy.title}</h3><p className="text-xs leading-relaxed text-muted">{copy.body}</p></div><div className="flex gap-2"><button onClick={onDismissConfirm} className="btn btn-secondary btn-sm flex-1" autoFocus>{sheetCopy ? 'Hủy' : 'Keep playing'}</button><button onClick={() => { const run = confirm.onConfirm; onDismissConfirm(); run(); }} className={`btn btn-sm flex-1 ${confirm.tone === 'danger' ? 'btn-danger' : 'btn-primary'}`}>{copy.confirmLabel}</button></div></div></div>}</>;
};
