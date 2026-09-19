import React from 'react';
import { WifiOff } from 'lucide-react';
import type { ConfirmSpec } from './OnlineRoomTypes';

export const RoomConfirmDialog: React.FC<{ spec: ConfirmSpec | null; onDismiss: () => void }> = ({ spec, onDismiss }) => {
  if (!spec) return null;
  return (
    <div className="modal-scrim" role="dialog" aria-modal="true" aria-labelledby="room-confirm-title">
      <div className="w-full max-w-sm space-y-4 rounded-lg border border-line bg-surface p-6">
        <div className="space-y-1.5">
          <h3 id="room-confirm-title" className="text-base font-semibold text-ink">{spec.title}</h3>
          <p className="text-xs leading-relaxed text-muted">{spec.body}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={onDismiss} className="btn btn-secondary btn-sm flex-1" autoFocus>{spec.cancelLabel ?? 'Cancel'}</button>
          <button onClick={() => { const run = spec.onConfirm; onDismiss(); run(); }} className={`btn btn-sm flex-1 ${spec.tone === 'danger' ? 'btn-danger' : 'btn-primary'}`}>
            {spec.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export const HostLostStrip: React.FC<{ seconds: number | null | undefined }> = ({ seconds }) => (
  <div className="flex items-center justify-between gap-3 rounded-md border border-warning bg-warning-soft p-3 text-xs font-medium text-warning">
    <span className="flex items-center gap-2"><WifiOff size={14} strokeWidth={2.25} aria-hidden="true" />Lost the connection to the host. Waiting for them to come back…</span>
    <span className="font-mono tabular-nums">{seconds}s</span>
  </div>
);

export const OnlineRoomConnecting: React.FC<{ status: 'opening' | 'host_lost' | string; roomId: string | null; seconds: number | null; onCancel: () => void }> = ({ status, roomId, seconds, onCancel }) => {
  const text = status === 'opening' ? 'Opening the room…' : status === 'host_lost' ? `Reconnecting to room ${roomId}… ${seconds ?? ''}s` : `Joining room ${roomId}…`;
  return <div className="panel w-full max-w-sm space-y-4 p-6 text-center" role="status" aria-live="polite"><p className="text-sm font-medium text-ink">{text}</p><button onClick={onCancel} className="btn btn-secondary btn-sm">Cancel</button></div>;
};
