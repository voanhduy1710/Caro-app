import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

/** The controls Tab can reach inside `root`, in page order. */
export const focusableIn = (root: ParentNode): HTMLElement[] =>
  Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.tabIndex >= 0 && !el.closest('[inert]') && el.getAttribute('aria-hidden') !== 'true',
  );

/**
 * Where a Tab press should land to stay inside a dialog, or null to let the
 * browser move focus normally. `focused` is the element that has focus and
 * `inside` whether it sits in the dialog (the dialog itself counts).
 */
export const trapTabTarget = <T>(items: readonly T[], focused: T | null, inside: boolean, shift: boolean): T | null => {
  if (items.length === 0) return null;
  const first = items[0];
  const last = items[items.length - 1];
  if (!inside) return shift ? last : first;
  const index = focused === null ? -1 : items.indexOf(focused);
  if (shift && index <= 0) return last;
  if (!shift && index === items.length - 1) return first;
  return null;
};

export interface FocusTrapOptions {
  /** Where focus goes on open: the dialog itself (default) or its first control. */
  initialFocus?: 'container' | 'first';
  /** Focus moves in only when this accepts the element that has focus at open. */
  moveFocusIf?: (focused: Element | null) => boolean;
  /** Keep Tab inside only while focus is already inside (a popover next to a text field). */
  onlyWhileInside?: boolean;
}

/** Open traps, newest last. Only the newest one handles Tab. */
const openTraps: object[] = [];

/**
 * Moves focus into a dialog when it opens, keeps Tab inside it while open and
 * hands focus back to where it was when it closes.
 *
 * A field that already took focus (autoFocus) keeps it. Focus is put back only
 * when it is still in the dialog or was dropped on the page body, so a close
 * that sent the person somewhere on purpose is not undone.
 */
export const useFocusTrap = (
  active: boolean,
  containerRef: RefObject<HTMLElement | null>,
  options: FocusTrapOptions = {},
) => {
  const { initialFocus = 'container', onlyWhileInside = false } = options;
  const moveFocusIfRef = useRef(options.moveFocusIf);
  useEffect(() => {
    moveFocusIfRef.current = options.moveFocusIf;
  });

  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;
    const token = {};
    openTraps.push(token);
    const focusedAtOpen = document.activeElement;
    const previous = focusedAtOpen instanceof HTMLElement && !container.contains(focusedAtOpen) ? focusedAtOpen : null;

    const focusContainer = () => {
      if (!container.hasAttribute('tabindex')) {
        container.setAttribute('tabindex', '-1');
        container.style.outline = 'none';
      }
      container.focus({ preventScroll: true });
    };

    const accept = moveFocusIfRef.current;
    if (!container.contains(focusedAtOpen) && (!accept || accept(focusedAtOpen))) {
      const first = initialFocus === 'first' ? focusableIn(container)[0] : undefined;
      if (first) first.focus({ preventScroll: true });
      else focusContainer();
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || event.defaultPrevented || openTraps[openTraps.length - 1] !== token) return;
      const focused = document.activeElement;
      const inside = !!focused && container.contains(focused);
      if (onlyWhileInside && !inside) return;
      const items = focusableIn(container);
      if (items.length === 0) {
        event.preventDefault();
        focusContainer();
        return;
      }
      const target = trapTabTarget<Element>(items, focused, inside, event.shiftKey);
      if (target instanceof HTMLElement) {
        event.preventDefault();
        target.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      const at = openTraps.indexOf(token);
      if (at >= 0) openTraps.splice(at, 1);
      const now = document.activeElement;
      const dropped = !now || now === document.body || container.contains(now);
      if (previous && previous.isConnected && dropped) previous.focus({ preventScroll: true });
    };
  }, [active, containerRef, initialFocus, onlyWhileInside]);
};
