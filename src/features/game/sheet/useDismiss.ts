import { useEffect, useRef } from 'react';

export type DismissReason = 'escape' | 'outside' | 'resize';

/**
 * Closes a Sheets dropdown on a press outside it, on Escape, or when the
 * window resizes (the panel is positioned from a measured anchor, which a
 * resize invalidates).
 *
 * Escape is caught on the capture phase and marked handled, so the chrome's
 * own Escape (closing the help dialog) leaves that press alone.
 */
export const useDismiss = (
  open: boolean,
  close: (reason: DismissReason) => void,
  refs: ReadonlyArray<React.RefObject<HTMLElement | null>>,
) => {
  // Kept in refs so callers can pass inline values without re-subscribing.
  const closeRef = useRef(close);
  const refsRef = useRef(refs);
  useEffect(() => {
    closeRef.current = close;
    refsRef.current = refs;
  });

  useEffect(() => {
    if (!open) return;
    const inside = (target: EventTarget | null) =>
      target instanceof Node && refsRef.current.some((ref) => ref.current?.contains(target));
    const onPointerDown = (event: PointerEvent) => {
      if (!inside(event.target)) closeRef.current('outside');
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      closeRef.current('escape');
    };
    const onResize = () => closeRef.current('resize');
    document.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open]);
};
