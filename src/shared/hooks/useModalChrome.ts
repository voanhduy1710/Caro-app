import { useEffect } from 'react';
import { useBackdropDismiss } from './useBackdropDismiss';
import { useFocusTrap } from './useFocusTrap';

/**
 * Shared chrome for a modal: dialog semantics for assistive technology,
 * dismissal on a genuine backdrop click, Escape to close, and focus moved in,
 * kept inside on Tab and handed back on close (see useFocusTrap).
 *
 * Spread the result onto the scrim element and give the heading `titleId`.
 *
 * The auth dialog deliberately keeps its own version: it must survive the
 * Escape that only dismisses a browser validation popup, so a half-filled
 * sign-up form is never thrown away.
 */
export const useModalChrome = (isOpen: boolean, onClose: () => void, titleId: string) => {
  const { backdropRef, backdropProps } = useBackdropDismiss(onClose);
  useFocusTrap(isOpen, backdropRef);

  useEffect(() => {
    if (!isOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [isOpen, onClose]);

  return {
    ...backdropProps,
    role: 'dialog' as const,
    'aria-modal': true,
    'aria-labelledby': titleId,
  };
};
