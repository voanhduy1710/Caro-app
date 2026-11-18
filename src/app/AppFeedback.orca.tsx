import React from 'react';
import type { AppFeedbackProps } from './AppFeedback';
import { useT } from '../features/i18n/language';

/**
 * Under the Spreadsheet disguise notices go to the Sheets snackbar instead (see
 * showNotice), so a pill still showing from just before the boss key is hidden
 * rather than left up in English, and a confirmation that has Sheets wording
 * asks in it.
 */
/** Orca notice pill, room-closed and confirm dialogs (PR 5 AppFeedback). */
export const AppFeedbackOrca: React.FC<AppFeedbackProps> = ({
  notice,
  roomClosed,
  roomError,
  onResetRoom,
  confirm,
  onDismissConfirm,
  sheetDisguise = false,
}) => {
  const t = useT();
  const sheetCopy = sheetDisguise ? confirm?.sheet : undefined;
  const copy = sheetCopy ?? confirm;

  return (
    <>
      {notice && !sheetDisguise && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-16 lg:bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-[6px] border border-line-strong bg-surface px-3.5 py-2 text-xs font-medium text-ink shadow-e2"
        >
          {notice}
        </div>
      )}

      {roomClosed && (
        <div
          className="modal-scrim"
          role="dialog"
          aria-modal="true"
          aria-labelledby="room-closed-title"
        >
          <div className="modal-panel max-w-sm space-y-4 p-5 text-left">
            <div className="space-y-1.5">
              <h3 id="room-closed-title" className="text-sm font-semibold text-ink">
                {t('home.roomClosedTitle')}
              </h3>
              {roomError && <p className="text-xs leading-relaxed text-muted">{roomError}</p>}
            </div>
            <button
              type="button"
              onClick={onResetRoom}
              className="btn btn-primary btn-sm w-full"
              autoFocus
            >
              {t('home.backToHome')}
            </button>
          </div>
        </div>
      )}

      {confirm && copy && (
        <div
          className="modal-scrim"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-title"
        >
          <div className="modal-panel max-w-sm space-y-4 p-5 text-left">
            <div className="space-y-1.5">
              <h3 id="confirm-title" className="text-sm font-semibold text-ink">
                {copy.title}
              </h3>
              <p className="text-xs leading-relaxed text-muted">{copy.body}</p>
            </div>
            <div className="flex items-center gap-2 pt-0.5">
              <button
                type="button"
                onClick={onDismissConfirm}
                className="btn btn-secondary btn-sm flex-1"
                autoFocus
              >
                {sheetCopy ? 'Hủy' : t('home.keepPlaying')}
              </button>
              <button
                type="button"
                onClick={() => {
                  const run = confirm.onConfirm;
                  onDismissConfirm();
                  run();
                }}
                className={`btn btn-sm flex-1 ${
                  confirm.tone === 'danger' ? 'btn-danger-solid' : 'btn-primary'
                }`}
              >
                {copy.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
