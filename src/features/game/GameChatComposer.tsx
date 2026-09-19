import React from 'react';
import { Bell, ImagePlus, Smile, X } from 'lucide-react';

export interface GameChatComposerProps {
  attachedImage: string | null; setAttachedImage: React.Dispatch<React.SetStateAction<string | null>>; reactionRow: React.ReactNode;
  handleChatSubmit: (event?: React.FormEvent) => void; isAiMode: boolean; isReactionsOpen: boolean; setIsReactionsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  attachmentInputRef: React.RefObject<HTMLInputElement | null>; handleAttachmentChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>; chatText: string; setChatText: React.Dispatch<React.SetStateAction<string>>;
  handleKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void; handlePaste: (event: React.ClipboardEvent<HTMLTextAreaElement>) => void;
  role: 'player' | 'viewer'; handleBuzzClick: () => void; isBuzzCooldown: boolean;
}

export const GameChatComposer: React.FC<GameChatComposerProps> = (props) => {
  const { attachedImage, setAttachedImage, reactionRow, handleChatSubmit, isAiMode, isReactionsOpen, setIsReactionsOpen, attachmentInputRef, handleAttachmentChange, textareaRef, chatText, setChatText, handleKeyDown, handlePaste, role, handleBuzzClick, isBuzzCooldown } = props;
  return (
    <div className="shrink-0">
      {attachedImage && (
        <div className="pb-2 flex items-center gap-2">
          <div className="relative inline-block">
            <img
              src={attachedImage}
              alt="Pasted attachment preview"
              className="h-14 w-14 object-cover rounded-sm border-2 border-accent"
            />
            <button
              type="button"
              onClick={() => setAttachedImage(null)}
              title="Remove image"
              aria-label="Remove attached image"
              className="absolute -top-1.5 -right-1.5 bg-danger-solid hover:opacity-90 text-danger-fg rounded-full w-5 h-5 text-[10px] font-medium flex items-center justify-center shadow transition cursor-pointer"
            >
              <X size={11} strokeWidth={2.25} aria-hidden="true" />
            </button>
          </div>
          <span className="text-[11px] text-muted">
            {attachedImage.startsWith('data:image/gif') ? 'GIF ready to send' : 'Image ready to send'}
          </span>
        </div>
      )}

      {/* The reaction row is part of the composer, so every layout that shows
          the composer gets it exactly once. Both layouts used to render it
          again just above, and opening reactions showed two rows. */}
      {reactionRow}

      <form onSubmit={handleChatSubmit} className="flex items-end gap-1.5 border-t border-line pt-2">
        {!isAiMode && (
          <button
            type="button"
            onClick={() => setIsReactionsOpen((open) => !open)}
            aria-expanded={isReactionsOpen}
            aria-label="Reactions"
            title="Send a reaction"
            className="btn btn-ghost btn-icon h-9 w-9 shrink-0"
          >
            <Smile size={16} strokeWidth={2.25} aria-hidden="true" />
          </button>
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
            <button
              type="button"
              onClick={() => attachmentInputRef.current?.click()}
              title="Attach an image or animated GIF"
              aria-label="Attach an image or animated GIF"
              className="btn btn-ghost btn-icon h-9 w-9 shrink-0"
            >
              <ImagePlus size={16} strokeWidth={2.25} aria-hidden="true" />
            </button>
          </>
        )}
        <textarea
          ref={textareaRef}
          value={chatText}
          onChange={(e) => setChatText(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder="Type a message..."
          title="Shift+Enter for a newline, paste an image, or attach an image/GIF"
          aria-label="Chat message"
          rows={1}
          className="min-w-0 flex-1 resize-none overflow-y-auto rounded-md border border-line-strong bg-surface px-3 py-2 text-[13px] leading-snug text-ink focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none"
          style={{ height: '38px', maxHeight: '78px' }}
        />
        <button
          type="submit"
          disabled={!chatText.trim() && !attachedImage}
          className="btn btn-primary btn-sm h-9 shrink-0"
        >
          Send
        </button>
        {role === 'player' && (
          <button
            type="button"
            onClick={handleBuzzClick}
            disabled={isBuzzCooldown}
            title="Nudge the other player with a sound"
            aria-label="Buzz the other player"
            className="btn btn-secondary btn-icon h-9 w-9 shrink-0"
          >
            <Bell size={16} strokeWidth={2.25} aria-hidden="true" />
          </button>
        )}
      </form>
    </div>
  );
};
