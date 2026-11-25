import React, { useRef } from 'react';
import { X } from 'lucide-react';
import { useT } from '../i18n/language';
import { useFocusTrap } from '../../shared/hooks/useFocusTrap';
import { useIsOrca } from '../theme/uiStyle';
import { GameChatLightboxOrca } from './GameChatLightbox.orca';

export const GameChatLightbox: React.FC<{ image: string | null; onClose: () => void }> = ({ image, onClose }) => {
  const t = useT();
  const isOrca = useIsOrca();
  const scrimRef = useRef<HTMLDivElement>(null);
  // Focus goes into the preview and back to the thumbnail that opened it.
  useFocusTrap(image !== null, scrimRef);
  if (image && isOrca) return <GameChatLightboxOrca image={image} onClose={onClose} scrimRef={scrimRef} />;
  return image ? <div ref={scrimRef} className="fixed inset-0 z-[70] bg-[var(--ui-scrim)] backdrop-blur-xs flex items-center justify-center p-4 cursor-pointer" onClick={onClose} role="dialog" aria-modal="true" aria-label={t('game.imagePreview')}><div className="relative max-w-4xl max-h-[90dvh] flex flex-col items-center" onClick={(event) => event.stopPropagation()}><button type="button" onClick={onClose} className="absolute -top-10 right-0 text-inverse-fg hover:text-subtle font-medium text-sm px-3 py-1 bg-inverse/80 rounded-full cursor-pointer"><X size={14} strokeWidth={2.25} aria-hidden="true" />{t('common.close')}</button><img src={image} alt={t('game.enlargedAttachment')} className="max-w-full max-h-[85dvh] object-contain rounded-md border border-line-strong shadow-2xl" /></div></div> : null;
};
