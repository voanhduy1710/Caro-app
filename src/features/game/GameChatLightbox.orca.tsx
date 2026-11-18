import React from 'react';
import { X } from 'lucide-react';
import { useT } from '../i18n/language';

/** Orca style (PR 5) image preview. The focus trap lives in GameChatLightbox, around both looks. */
export const GameChatLightboxOrca: React.FC<{
  image: string;
  onClose: () => void;
  scrimRef: React.RefObject<HTMLDivElement | null>;
}> = ({ image, onClose, scrimRef }) => {
  const t = useT();
  return (
    <div
      ref={scrimRef}
      className="fixed inset-0 z-[70] flex cursor-pointer items-center justify-center bg-[var(--ui-scrim)] p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={t('game.imagePreview')}
    >
      <div className="relative flex max-h-[90dvh] max-w-4xl flex-col items-center animate-pop-in" onClick={(event) => event.stopPropagation()}>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('common.close')}
          className="absolute -top-10 right-0 inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-line-strong bg-surface px-2.5 py-1 text-xs font-medium text-ink shadow-e2 transition-colors hover:bg-surface-2"
        >
          <X size={14} strokeWidth={1.75} aria-hidden="true" />
          <span>{t('common.close')}</span>
        </button>
        <img
          src={image}
          alt={t('game.enlargedAttachment')}
          className="max-h-[85dvh] max-w-full rounded-lg border border-line-strong bg-surface object-contain shadow-e2"
        />
      </div>
    </div>
  );
};
