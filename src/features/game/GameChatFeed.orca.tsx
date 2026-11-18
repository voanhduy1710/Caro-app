import React from 'react';
import { ArrowDown, Dices, Reply } from 'lucide-react';
import { getAvatarPublicUrl } from '../avatar/avatarService';
import { formatTime, quoteSnippet } from './GameControlsShared';
import { renderWithEmotes } from './chatEmotes';
import { useT } from '../i18n/language';
import { Button, IconButton } from '../../shared/ui/primitives';
import type { GameChatFeedProps } from './GameChatFeed';
import { jumpTo } from './chatJump';

/** Orca style (PR 5) chat feed: flat bordered bubbles, mono timestamps. Same props and behaviour as the default. */
export const GameChatFeedOrca: React.FC<GameChatFeedProps> = ({
  messages,
  emptyText,
  opponent,
  avatarFor,
  listRef,
  onScroll,
  isOwn,
  receipt,
  onOpenImage,
  hasNewBelow,
  onShowNew,
  onReply,
  onAnswerDoubleDown,
}) => {
  const t = useT();
  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={listRef}
        onScroll={onScroll}
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        className="chat-message-list scrollbar-orca h-full space-y-2 overflow-y-auto overscroll-contain px-3 py-2.5 text-xs"
      >
        {messages.length === 0 ? (
          <p className="py-10 text-center text-[13px] text-subtle">{emptyText ?? t('game.noMessagesHello')}</p>
        ) : (
          messages.map((m) => {
            const mine = isOwn(m);
            if (m.system) {
              return (
                <div key={m.id} className="flex justify-center py-0.5">
                  <span className="chip max-w-full min-w-0 whitespace-normal break-words text-center text-[11px]">{m.text}</span>
                </div>
              );
            }
            if (m.doubleDownOffer) {
              return (
                <div key={m.id} data-chat-id={m.id} className="flex justify-center py-1 animate-pop-in">
                  <div
                    role="group"
                    aria-label={t('game.ddOffer')}
                    className="w-full max-w-[18rem] rounded-lg border border-warning/35 bg-warning-soft p-3 text-center"
                  >
                    <div className="flex items-center justify-center gap-1.5 text-[13px] font-semibold text-ink">
                      <Dices size={16} strokeWidth={2} className="shrink-0 text-warning" aria-hidden="true" />
                      <span className="min-w-0 break-words">{m.text}</span>
                    </div>
                    <p className="mt-1 text-[11px] text-muted">
                      {t(m.doubleDownOffer.canAnswer ? 'game.ddTermsMine' : 'game.ddTermsTheirs', {
                        count: m.doubleDownOffer.movesLeft,
                      })}
                    </p>
                    {m.doubleDownOffer.canAnswer && onAnswerDoubleDown ? (
                      <div className="mt-2.5 flex gap-2">
                        <Button variant="primary" size="sm" className="flex-1" onClick={() => onAnswerDoubleDown(true)}>
                          {t('game.accept')}
                        </Button>
                        <Button variant="secondary" size="sm" className="flex-1" onClick={() => onAnswerDoubleDown(false)}>
                          {t('game.reject')}
                        </Button>
                      </div>
                    ) : (
                      <p className="mt-1.5 text-[11px] font-medium text-warning">{t('game.waitingAnswer')}</p>
                    )}
                  </div>
                </div>
              );
            }
            const replyButton = onReply && (
              <IconButton
                size="sm"
                onClick={() => onReply(m)}
                title={t('game.reply')}
                aria-label={t('game.replyToAria', { name: m.sender })}
                className="mb-0.5 text-muted opacity-0 transition group-hover:opacity-100 hover:text-ink focus-visible:opacity-100 [@media(hover:none)]:opacity-60"
              >
                <Reply size={13} strokeWidth={1.75} aria-hidden="true" />
              </IconButton>
            );
            const replyTo = m.replyTo;
            return (
              <div key={m.id} data-chat-id={m.id} className={`group flex items-end gap-1.5 ${mine ? 'justify-end' : 'justify-start'}`}>
                {!mine && (
                  <img
                    src={getAvatarPublicUrl(avatarFor?.(m) ?? m.senderAvatar ?? opponent?.photoURL)}
                    alt=""
                    aria-hidden="true"
                    onError={(e) => {
                      e.currentTarget.onerror = null;
                      e.currentTarget.src = getAvatarPublicUrl();
                    }}
                    className="mb-0.5 h-6 w-6 shrink-0 rounded-full border border-line bg-surface object-contain"
                  />
                )}
                {mine && replyButton}
                <div
                  className={`max-w-[82%] min-w-0 rounded-lg px-3 py-2 text-ink ${
                    mine ? 'border border-line-strong bg-surface-2' : 'border border-line bg-surface'
                  }`}
                >
                  {!mine && <div className="mb-0.5 text-[11px] font-semibold text-muted">{m.sender}</div>}
                  {replyTo && (
                    <button
                      type="button"
                      onClick={() => jumpTo(listRef.current, replyTo.id)}
                      title={t('game.showAnswered')}
                      className="mb-1.5 block w-full min-w-0 cursor-pointer rounded border-l border-line-strong pl-2 text-left text-xs text-muted transition-colors hover:text-ink"
                    >
                      <span className="block truncate font-medium text-ink/80">{replyTo.sender}</span>
                      <span className="block truncate">{quoteSnippet(replyTo)}</span>
                    </button>
                  )}
                  {m.text && <div className="whitespace-pre-wrap break-words text-[13px] leading-snug">{renderWithEmotes(m.text)}</div>}
                  {m.image && (
                    <button
                      type="button"
                      onClick={() => onOpenImage(m.image || null)}
                      className="mt-1.5 block cursor-pointer overflow-hidden rounded-md border border-line"
                      title={t('game.openImage')}
                    >
                      <img src={m.image} alt={t('game.attachment')} className="max-h-44 object-cover transition-opacity hover:opacity-95" />
                    </button>
                  )}
                  <div className="mt-1 flex items-center justify-end gap-1 font-mono text-[11px] tabular-nums text-subtle">
                    <span>{formatTime(m.timestamp)}</span>
                    {mine && receipt?.messageId === m.id && <span> · {receipt.seen ? t('game.seen') : t('game.sent')}</span>}
                  </div>
                </div>
                {!mine && replyButton}
              </div>
            );
          })
        )}
      </div>
      {hasNewBelow && (
        <button
          type="button"
          onClick={onShowNew}
          className="absolute bottom-2 left-1/2 flex -translate-x-1/2 cursor-pointer items-center gap-1.5 rounded-full border border-line-strong bg-surface px-3 py-1 text-[11px] font-medium text-ink shadow-e2 transition hover:bg-surface-2"
        >
          <span>{t('game.newMessages')}</span>
          <ArrowDown size={12} strokeWidth={2} aria-hidden="true" />
        </button>
      )}
    </div>
  );
};
