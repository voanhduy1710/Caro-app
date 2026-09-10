import { useEffect } from 'react';
import { useBackdropDismiss } from './useBackdropDismiss';

/**
 * Shared chrome for a modal: dialog semantics for assistive technology,
 * dismissal on a genuine backdrop click, and Escape to close.
 *
 * Spread the result onto the scrim element and give the heading `titleId`.
 *
 * The auth dialog deliberately keeps its own version: it must survive the
 * Escape that only dismisses a browser validation popup, so a half-filled
 * sign-up form is never thrown away.
 */
export const useModalChrome = (isOpen: boolean, onClose: () => void, titleId: string) => {
  const { backdropProps } = useBackdropDismiss(onClose);

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
