import React, { useEffect } from 'react';
import { TEASE_PHRASE } from './protocol';
import type { Seat } from './protocol';
import type { TeaseNotice } from './useRoom';

const VISIBLE_MS = 4_000;
/** Long enough to reach the Take seat button without it vanishing under the thumb. */
const VISIBLE_WITH_ACTION_MS = 7_000;

interface TeaseToastProps {
  notice: TeaseNotice | null;
  onDismiss: () => void;
  /** Offered when the teased player is watching and a seat is free: the punchline. */
  openSeat?: Seat | null;
  onTakeSeat?: (seat: Seat) => void;
}

export const TeaseToast: React.FC<TeaseToastProps> = ({ notice, onDismiss, openSeat = null, onTakeSeat }) => {
  const hasAction = Boolean(openSeat && onTakeSeat);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(onDismiss, hasAction ? VISIBLE_WITH_ACTION_MS : VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [notice, hasAction, onDismiss]);

  if (!notice) return null;

  return (
    <div
      // The key restarts the pop for a second tease that lands while the first is showing.
      key={notice.at}
      role="alert"
      className="tease-toast animate-tease fixed top-20 z-[65] flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-lg border-2 border-danger bg-surface px-4 py-3 shadow-2xl"
    >
      <span aria-hidden="true" className="text-3xl leading-none">😡</span>
      <p className="min-w-0 text-sm font-semibold text-ink">
        <span className="text-danger">{notice.fromName}:</span> {TEASE_PHRASE}!
      </p>
      {openSeat && onTakeSeat && (
        <button
          type="button"
          onClick={() => {
            onTakeSeat(openSeat);
            onDismiss();
          }}
          className="btn btn-primary btn-sm shrink-0"
        >
          Take seat {openSeat}
        </button>
      )}
      <button type="button" onClick={onDismiss} className="btn btn-ghost btn-sm shrink-0" aria-label="Dismiss">
        OK
      </button>
    </div>
  );
};
