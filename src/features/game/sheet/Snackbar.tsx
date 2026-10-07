import React from 'react';
import { createPortal } from 'react-dom';
import { useSheetSnackbar } from './sheetSnackbar';
import { CHROME_FONT } from './sheetStyle';

/**
 * Sheets' bottom-left notice, and the only one the disguise shows: the game
 * result and the room's notices are routed here too, so there is one slot,
 * sitting just above the 36px sheet-tab bar. Portalled to the body so no
 * transformed or clipped ancestor of the board can displace it.
 */
export const SheetSnackbar: React.FC = () => {
  const snack = useSheetSnackbar();
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div role="status" aria-live="polite" className="pointer-events-none fixed bottom-12 left-4 z-[1100] sm:left-6">
      {snack && (
        <div
          key={snack.id}
          className="max-w-[min(420px,calc(100vw-32px))] rounded bg-[#323232] px-4 py-[14px] text-[14px] leading-5 text-white"
          style={{ fontFamily: CHROME_FONT, boxShadow: '0 3px 5px -1px rgba(0,0,0,.2), 0 6px 10px 0 rgba(0,0,0,.14), 0 1px 18px 0 rgba(0,0,0,.12)' }}
        >
          {snack.text}
        </div>
      )}
    </div>,
    document.body,
  );
};
