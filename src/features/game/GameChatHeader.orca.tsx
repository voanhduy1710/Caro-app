import React from 'react';
import { MessageSquare, PanelRightClose, PanelRightOpen } from 'lucide-react';
import { useT } from '../i18n/language';
import { IconButton } from '../../shared/ui/primitives';
import type { GameChatHeaderProps } from './GameChatHeader';

/** Orca style (PR 5): a 36px panel header with a collapse button. */
export const GameChatHeaderOrca: React.FC<GameChatHeaderProps> = ({ open, unreadCount, messageCount, preview, onToggle }) => {
  const t = useT();
  return (
    <div className="flex h-9 w-full items-center justify-between border-b border-line bg-sidebar px-3 select-none">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={open ? 'chat-panel-body' : undefined}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left focus-visible:outline-none"
      >
        <MessageSquare size={14} strokeWidth={1.75} className="shrink-0 text-muted" aria-hidden="true" />
        <span className="shrink-0 text-xs font-semibold text-ink">{t('game.chat')}</span>
        {unreadCount > 0 && !open && (
          <span className="shrink-0 rounded-full bg-danger-solid px-1.5 py-0.5 text-[10px] font-semibold leading-none text-danger-fg">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
        {open ? (
          <span className="chip shrink-0 px-1.5 py-0 text-[10px] tabular-nums text-muted">
            {t(messageCount === 1 ? 'game.messageOne' : 'game.messageMany', { count: messageCount })}
          </span>
        ) : (
          <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-muted">{preview}</span>
        )}
      </button>
      <IconButton size="sm" onClick={onToggle} aria-label={open ? t('game.hide') : t('game.show')} title={open ? t('game.hide') : t('game.show')}>
        {open ? <PanelRightClose size={15} strokeWidth={1.75} /> : <PanelRightOpen size={15} strokeWidth={1.75} />}
      </IconButton>
    </div>
  );
};
