/*
 * Orca style (PR 5) versions of the room's overlays: the confirm dialog, the
 * host-lost strip, the connecting card, and the take-back / rematch / open-seat
 * prompts. Same props and wording as the Default ones in OnlineRoomOverlays.tsx
 * and OnlineRoomView.tsx; only the look differs. Under the Spreadsheet disguise
 * the dialogs keep the Sheets look (`sheet-dialog`), as in PR 5.
 */
import React from 'react';
import { Loader2, WifiOff } from 'lucide-react';
import type { ConfirmSpec } from './OnlineRoomTypes';
import { formatReconnectDuration } from '../../shared/utils/formatDuration';
import { useT } from '../i18n/language';
import type { Seat } from './protocol';
import type { Member } from './roomEngine';
import type { RoomApi } from './useRoom';

export const RoomConfirmDialogOrca: React.FC<{
  spec: ConfirmSpec | null;
  onDismiss: () => void;
  sheet?: boolean;
}> = ({ spec, onDismiss, sheet = false }) => {
  const t = useT();
  if (!spec) return null;
  const copy = sheet ? spec.sheet : spec;
  const confirm = () => {
    const run = spec.onConfirm;
    onDismiss();
    run();
  };

  if (sheet) {
    return (
      <div className="modal-scrim" role="dialog" aria-modal="true" aria-labelledby="room-confirm-title">
        <div className="modal-panel sheet-dialog w-full max-w-sm space-y-4 rounded-lg border border-line bg-surface p-6">
          <div className="space-y-1.5">
            <h3 id="room-confirm-title" className="text-base font-semibold text-ink">
              {copy.title}
            </h3>
            <p className="text-xs leading-relaxed text-muted">{copy.body}</p>
          </div>
          <div className="sheet-dialog-actions flex justify-end gap-2">
            <button type="button" onClick={onDismiss} className="btn btn-secondary btn-sm flex-1" autoFocus>
              {copy.cancelLabel ?? t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={confirm}
              className={`btn btn-sm flex-1 ${spec.tone === 'danger' ? 'btn-danger' : 'btn-primary'}`}
            >
              {copy.confirmLabel}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-scrim" role="dialog" aria-modal="true" aria-labelledby="room-confirm-title">
      <div className="w-full max-w-sm space-y-4 rounded-lg border border-line-strong bg-surface p-5 shadow-e2">
        <div className="space-y-1.5">
          <h3 id="room-confirm-title" className="text-sm font-semibold text-ink">
            {copy.title}
          </h3>
          <p className="text-xs leading-relaxed text-muted">{copy.body}</p>
        </div>
        <div className="flex items-center justify-end gap-2 pt-1">
          <button type="button" onClick={onDismiss} className="btn btn-secondary btn-sm flex-1" autoFocus>
            {copy.cancelLabel ?? t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={confirm}
            className={`btn btn-sm flex-1 ${spec.tone === 'danger' ? 'btn-danger' : 'btn-primary'}`}
          >
            {copy.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export const HostLostStripOrca: React.FC<{ seconds: number | null | undefined }> = ({ seconds }) => {
  const t = useT();
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-warning/30 bg-warning-soft px-3.5 py-2.5 text-xs font-medium text-warning shadow-e1">
      <span className="flex items-center gap-2">
        <WifiOff size={15} strokeWidth={1.75} aria-hidden="true" />
        <span>{t('room.hostLost')}</span>
      </span>
      <span className="font-mono tabular-nums">
        {seconds === null || seconds === undefined ? '' : formatReconnectDuration(seconds)}
      </span>
    </div>
  );
};

export const OnlineRoomConnectingOrca: React.FC<{ text: string; onCancel: () => void }> = ({ text, onCancel }) => {
  const t = useT();
  return (
    <div
      className="mx-auto my-auto w-full max-w-sm space-y-4 rounded-lg border border-line-strong bg-surface p-6 text-center shadow-e2"
      role="status"
      aria-live="polite"
    >
      <Loader2 size={22} strokeWidth={1.75} className="mx-auto animate-spin text-accent-text" aria-hidden="true" />
      <p className="text-sm font-medium tabular-nums text-ink">{text}</p>
      <button type="button" onClick={onCancel} className="btn btn-secondary btn-sm">
        {t('common.cancel')}
      </button>
    </div>
  );
};

/** One of the two "the other player asks" dialogs (take-back, rematch). */
const RequestDialog: React.FC<{
  titleId: string;
  sheet: boolean;
  title: string;
  body: string;
  acceptLabel: string;
  declineLabel: string;
  onAnswer: (accept: boolean) => void;
}> = ({ titleId, sheet, title, body, acceptLabel, declineLabel, onAnswer }) => (
  <div className="modal-scrim" role="dialog" aria-modal="true" aria-labelledby={titleId}>
    {sheet ? (
      <div className="modal-panel sheet-dialog w-full max-w-sm space-y-4 rounded-lg border border-line bg-surface p-6 text-center">
        <h3 id={titleId} className="text-base font-semibold text-ink">
          {title}
        </h3>
        <p className="text-xs text-muted">{body}</p>
        <div className="sheet-dialog-actions flex gap-2 pt-2">
          <button type="button" onClick={() => onAnswer(true)} className="btn btn-primary btn-sm flex-1">
            {acceptLabel}
          </button>
          <button type="button" onClick={() => onAnswer(false)} className="btn btn-secondary btn-sm flex-1">
            {declineLabel}
          </button>
        </div>
      </div>
    ) : (
      <div className="w-full max-w-sm space-y-4 rounded-lg border border-line-strong bg-surface p-5 text-center shadow-e2">
        <div className="space-y-1.5">
          <h3 id={titleId} className="text-sm font-semibold text-ink">
            {title}
          </h3>
          <p className="text-xs leading-relaxed text-muted">{body}</p>
        </div>
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={() => onAnswer(true)} className="btn btn-primary btn-sm flex-1">
            {acceptLabel}
          </button>
          <button type="button" onClick={() => onAnswer(false)} className="btn btn-secondary btn-sm flex-1">
            {declineLabel}
          </button>
        </div>
      </div>
    )}
  </div>
);

export interface OnlineRoomRequestsOrcaProps {
  room: RoomApi;
  mySeat: Seat | null;
  undoFrom: Seat | null;
  rematchFrom: Seat | null;
  seatPrompt: Seat | null;
  sheetDisguise: boolean;
  occupantOf: (seat: Seat) => Member | null;
  onDismissSeatPrompt: () => void;
  hostLostStrip: React.ReactNode;
}

/**
 * PR 5's OnlineRoomOverlays: the prompts that float over a live game. The
 * conditions are today's (OnlineRoomView decides who sees what).
 */
export const OnlineRoomRequestsOrca: React.FC<OnlineRoomRequestsOrcaProps> = ({
  room,
  mySeat,
  undoFrom,
  rematchFrom,
  seatPrompt,
  sheetDisguise,
  occupantOf,
  onDismissSeatPrompt,
  hostLostStrip,
}) => {
  const t = useT();
  return (
    <>
      {undoFrom && mySeat && mySeat !== undoFrom && (
        <RequestDialog
          titleId="undo-request-title"
          sheet={sheetDisguise}
          title={sheetDisguise ? 'Khôi phục phiên bản trước?' : t('room.undo.title')}
          body={
            sheetDisguise
              ? `${occupantOf(undoFrom)?.profile.name ?? 'Người cộng tác'} muốn khôi phục phiên bản trước của tệp.`
              : t('room.undo.body', { name: occupantOf(undoFrom)?.profile.name ?? t('room.yourOpponent') })
          }
          acceptLabel={sheetDisguise ? 'Cho phép' : t('room.allowIt')}
          declineLabel={sheetDisguise ? 'Từ chối' : t('room.decline')}
          onAnswer={room.answerUndo}
        />
      )}

      {rematchFrom && mySeat && mySeat !== rematchFrom && (
        <RequestDialog
          titleId="rematch-title"
          sheet={sheetDisguise}
          title={sheetDisguise ? 'Tạo bản sao mới?' : t('room.rematch.title')}
          body={
            sheetDisguise
              ? `${occupantOf(rematchFrom)?.profile.name ?? 'Người cộng tác'} muốn tạo một bản sao mới của tệp.`
              : t('room.rematch.body', { name: occupantOf(rematchFrom)?.profile.name ?? t('room.yourOpponent') })
          }
          acceptLabel={sheetDisguise ? 'Tạo bản sao' : t('room.rematch.accept')}
          declineLabel={sheetDisguise ? 'Không, cảm ơn' : t('room.rematch.decline')}
          onAnswer={room.answerRematch}
        />
      )}

      {seatPrompt && !sheetDisguise && (
        <div
          role="status"
          className="fixed bottom-20 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-2.5 rounded-lg border border-line-strong bg-surface px-3.5 py-2 shadow-e2"
        >
          <span className="text-xs font-medium text-ink">{t('room.seatIsOpen', { seat: seatPrompt })}</span>
          <button type="button" onClick={() => room.takeSeat(seatPrompt)} className="btn btn-primary btn-sm">
            {t('room.takeSeatN', { seat: seatPrompt })}
          </button>
          <button type="button" onClick={onDismissSeatPrompt} className="btn btn-ghost btn-sm">
            {t('room.notNow')}
          </button>
        </div>
      )}

      {hostLostStrip && !sheetDisguise && (
        <div className="fixed left-1/2 top-14 z-[55] w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2">
          {hostLostStrip}
        </div>
      )}
    </>
  );
};
