import { useCallback, useRef } from 'react';
import type React from 'react';

/**
 * Click-outside dismissal for a modal backdrop.
 *
 * A plain `onClick` check is not enough: the browser fires `click` on the nearest
 * common ancestor of the press and the release. Selecting text inside a field and
 * releasing the mouse past the dialog edge therefore targets the backdrop and
 * closed the dialog mid-typing. Requiring the press to start on the backdrop as
 * well makes dismissal reflect an actual click outside.
 */
export const useBackdropDismiss = (onDismiss: () => void) => {
  const backdropRef = useRef<HTMLDivElement>(null);
  const pressStartedOnBackdropRef = useRef(false);

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    pressStartedOnBackdropRef.current = event.target === backdropRef.current;
  }, []);

  const onClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const startedOutside = pressStartedOnBackdropRef.current;
    pressStartedOnBackdropRef.current = false;
    if (startedOutside && event.target === backdropRef.current) {
      onDismiss();
    }
  }, [onDismiss]);

  return {
    backdropRef,
    backdropProps: { ref: backdropRef, onPointerDown, onClick },
  };
};
