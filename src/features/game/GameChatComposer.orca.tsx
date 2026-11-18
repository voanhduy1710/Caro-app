import React from 'react';
import { Bell, ImagePlus, SendHorizontal, Smile, X } from 'lucide-react';
import { quoteSnippet } from './GameControlsShared';
import { EmoteInput } from './EmoteInput';
import { useT } from '../i18n/language';
import { Button, IconButton } from '../../shared/ui/primitives';
import type { GameChatComposerProps } from './GameChatComposer';

/**
 * Orca style (PR 5) composer: the message box on its own row, the emoticon /
 * image / buzz icons and Send under it. Same props and behaviour as the
 * default; the buzz button is still a player's only.
 */
export const GameChatComposerOrca: React.FC<GameChatComposerProps> = (props) => {
  const t = useT();
  const {
    attachedImage,
    setAttachedImage,
    reactionRow,
    handleChatSubmit,
    isAiMode,
    isReactionsOpen,
    setIsReactionsOpen,
    attachmentInputRef,
    handleAttachmentChange,
    emoteButtonRef,
    textareaRef,
    chatText,
    setChatText,
    handleKeyDown,
    handlePaste,
    role,
    handleBuzzClick,
    isBuzzCooldown,
    replyingTo,
    onCancelReply,
  } = props;

  return (
    <div className="shrink-0 border-t border-line bg-sidebar p-2.5">
      {replyingTo && (
        <div className="mb-2 flex items-center gap-2 rounded-md border-l border-line-strong bg-surface-2 px-2.5 py-1.5 text-xs">
          <button
            type="button"
            onClick={onCancelReply}
            title={t('game.cancelReply')}
            aria-label={t('game.cancelReply')}
            className="orca-icon-btn h-5 w-5 shrink-0 cursor-pointer rounded-full text-muted hover:text-ink"
          >
            <X size={12} strokeWidth={2} aria-hidden="true" />
          </button>
          <span className="min-w-0 flex-1 truncate text-muted">
            {t('game.replyToLabel')} <span className="font-semibold text-ink">{replyingTo.sender}</span>:{' '}
            {quoteSnippet({ text: replyingTo.text, hasImage: Boolean(replyingTo.image) })}
          </span>
        </div>
      )}

      {attachedImage && (
        <div className="mb-2 flex items-center gap-2.5">
          <div className="relative inline-block">
            <img src={attachedImage} alt={t('game.pastedPreview')} className="h-14 w-14 rounded-md border border-line-strong object-cover" />
            <button
              type="button"
              onClick={() => setAttachedImage(null)}
              title={t('game.removeImage')}
              aria-label={t('game.removeAttachedImage')}
              className="absolute -top-1.5 -right-1.5 flex h-4 w-4 cursor-pointer items-center justify-center rounded-full bg-danger-solid text-danger-fg shadow transition-opacity hover:opacity-90"
            >
              <X size={10} strokeWidth={2.25} aria-hidden="true" />
            </button>
          </div>
          <span className="text-xs text-muted">
            {attachedImage.startsWith('data:image/gif') ? t('game.gifReady') : t('game.imageReady')}
          </span>
        </div>
      )}

      {reactionRow}

      <form onSubmit={handleChatSubmit} className="flex flex-col gap-2">
        <div className="rounded-md border border-line-strong bg-surface px-2.5 py-1.5 transition-colors focus-within:border-ink/40">
          <EmoteInput
            inputRef={textareaRef}
            value={chatText}
            onChange={setChatText}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={replyingTo ? t('game.replyToPlaceholder', { name: replyingTo.sender }) : t('game.typeMessage')}
            title={t('game.composerHint')}
            aria-label={t('game.chatMessage')}
            className="scrollbar-orca max-h-[76px] min-h-[32px] min-w-0 flex-1 overflow-y-auto bg-transparent py-0.5 text-[13px] leading-snug text-ink focus:outline-none"
          />
        </div>

        <div className="flex items-center justify-between gap-1.5">
          <div className="flex items-center gap-1">
            {!isAiMode && (
              <IconButton
                ref={emoteButtonRef}
                size="sm"
                onClick={() => setIsReactionsOpen((open) => !open)}
                aria-expanded={isReactionsOpen}
                aria-label={t('game.emoticons')}
                title={t('game.emoticons')}
                className="text-muted hover:text-ink"
              >
                <Smile size={15} strokeWidth={1.75} aria-hidden="true" />
              </IconButton>
            )}
            {!isAiMode && (
              <>
                <input
                  ref={attachmentInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={handleAttachmentChange}
                  className="sr-only"
                  tabIndex={-1}
                />
                <IconButton
                  size="sm"
                  onClick={() => attachmentInputRef.current?.click()}
                  title={t('game.attachImage')}
                  aria-label={t('game.attachImage')}
                  className="text-muted hover:text-ink"
                >
                  <ImagePlus size={15} strokeWidth={1.75} aria-hidden="true" />
                </IconButton>
              </>
            )}
            {role === 'player' && (
              <IconButton
                size="sm"
                onClick={handleBuzzClick}
                disabled={isBuzzCooldown}
                title={t('game.buzzTitle')}
                aria-label={t('game.buzzAria')}
                className="text-muted hover:text-ink disabled:opacity-40"
              >
                <Bell size={15} strokeWidth={1.75} aria-hidden="true" />
              </IconButton>
            )}
          </div>

          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={!chatText.trim() && !attachedImage}
            className="h-7 gap-1.5 px-3 text-xs font-medium"
          >
            <span>{t('game.send')}</span>
            <SendHorizontal size={13} strokeWidth={1.75} aria-hidden="true" />
          </Button>
        </div>
      </form>
    </div>
  );
};
