import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { BellRing, ChevronDown, Image as ImageIcon, MessageSquarePlus, Reply, Smile, X } from 'lucide-react';
import { updateSheetUi, useSheetChat } from './sheetBridge';
import type { ChatMessage, ChatQuote } from '../webrtc/types';
import { renderWithEmotes } from './chatEmotes';
import { EmoteInput } from './EmoteInput';
import { GameReactionPicker } from './GameReactionPicker';
import { processImageFile } from './GameControlsShared';

/**
 * The match chat, dressed as Google Sheets' comments panel. While the
 * Spreadsheet disguise is up the real chat column is unmounted, so this is the
 * only way to talk to the room; it reads the chat GameControls publishes and
 * never touches the room itself.
 *
 * Every author gets a letter avatar, never their game avatar: those are pixel
 * sprites, and one of them in a "comment" would give the whole thing away.
 * The player's own comments sit on the right in Sheets' selection blue and
 * everyone else's on the left, so a conversation reads at a glance.
 */

const SHEET_FONT = "'Google Sans', Roboto, Arial, sans-serif";

/** Close to the palette Google uses for letter avatars. */
const AVATAR_COLOURS = ['#1a73e8', '#e8710a', '#188038', '#d93025', '#9334e6', '#e52592', '#12b5cb', '#f29900', '#5f6368', '#a142f4'];

/** How close to the bottom still counts as reading the newest comment. */
const STICK_TO_BOTTOM_PX = 48;

const avatarColour = (name: string) => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return AVATAR_COLOURS[Math.abs(hash) % AVATAR_COLOURS.length];
};

/** The first letter of the name, skipping emoji and punctuation a bot's name carries. */
const initialOf = (name: string) => {
  const letter = name.match(/\p{L}|\p{N}/u)?.[0];
  return (letter ?? '?').toUpperCase();
};

const formatCommentTime = (timestamp: number) => {
  try {
    return new Date(timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false });
  } catch {
    return '';
  }
};

/** A quoted comment, in Sheets' words rather than the game chat's "📷 Image". */
const quoteText = (quote: Pick<ChatQuote, 'text' | 'hasImage'>) => quote.text || (quote.hasImage ? 'Hình ảnh đính kèm' : '…');

/** Brings the answered comment into view and flashes it, when it is still in the list. */
const jumpTo = (list: HTMLDivElement | null, id: string) => {
  const target = list?.querySelector<HTMLElement>(`[data-chat-id="${CSS.escape(id)}"]`);
  if (!target) return;
  target.scrollIntoView({ block: 'center', behavior: 'smooth' });
  target.classList.remove('chat-flash');
  void target.offsetWidth;
  target.classList.add('chat-flash');
};

interface SheetCommentsProps {
  /** Opens an attached image full size. */
  onOpenImage?: (src: string) => void;
}

interface CommentCardProps {
  message: ChatMessage;
  mine: boolean;
  onOpenImage?: (src: string) => void;
  onAnswerOffer?: (accept: boolean) => void;
  onReply?: (message: ChatMessage) => void;
  onJump: (id: string) => void;
}

const CommentCard: React.FC<CommentCardProps> = ({ message, mine, onOpenImage, onAnswerOffer, onReply, onJump }) => (
  <div data-chat-id={message.id} className={`flex px-3 py-1 ${mine ? 'justify-end' : 'justify-start'}`}>
    <article
      className={`min-w-0 max-w-[88%] rounded-lg border p-3 ${
        mine ? 'rounded-br-sm border-[#d3e3fd] bg-[#e8f0fe]' : 'rounded-bl-sm border-[#dadce0] bg-white'
      }`}
    >
      <header className={`flex items-center gap-2.5 ${mine ? 'flex-row-reverse text-right' : ''}`}>
        <span
          aria-hidden="true"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[13px] font-medium text-white"
          style={{ backgroundColor: avatarColour(message.sender) }}
        >
          {initialOf(message.sender)}
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-[13px] font-semibold text-[#202124]">{mine ? 'Bạn' : message.sender}</div>
          <div className="text-[12px] text-[#5f6368]">{formatCommentTime(message.timestamp)}</div>
        </div>
      </header>

      {message.replyTo && (
        <button
          type="button"
          onClick={() => onJump(message.replyTo!.id)}
          title="Xem nhận xét gốc"
          className={`mt-2 block w-full min-w-0 rounded border-l-2 border-[#1a73e8] px-2 py-1 text-left text-[12px] leading-snug text-[#5f6368] ${
            mine ? 'bg-[#d3e3fd]/60 hover:bg-[#d3e3fd]' : 'bg-[#f1f3f4] hover:bg-[#e8eaed]'
          }`}
        >
          <span className="block truncate font-semibold text-[#3c4043]">{message.replyTo.sender}</span>
          <span className="block truncate">{renderWithEmotes(quoteText(message.replyTo))}</span>
        </button>
      )}

      {message.doubleDownOffer ? (
        // A double-down offer is game talk in English; here it is a suggested
        // edit, answered with Sheets' own Accept and Reject.
        <>
          <p className="mt-2 text-[14px] leading-5 text-[#3c4043]">Đã đề xuất một chỉnh sửa cho trang tính này.</p>
          {message.doubleDownOffer.canAnswer && onAnswerOffer && (
            <div className="mt-2 flex justify-end gap-1">
              <button
                type="button"
                onClick={() => onAnswerOffer(false)}
                className="h-8 rounded-full px-3 text-[13px] font-medium text-[#0b57d0] transition-colors hover:bg-[rgba(11,87,208,0.08)]"
              >
                Từ chối
              </button>
              <button
                type="button"
                onClick={() => onAnswerOffer(true)}
                className="h-8 rounded-full bg-[#0b57d0] px-3 text-[13px] font-medium text-white transition-colors hover:bg-[#0a4ab4]"
              >
                Chấp nhận
              </button>
            </div>
          )}
        </>
      ) : (
        message.text && (
          <p className="mt-2 whitespace-pre-wrap break-words text-[14px] leading-5 text-[#3c4043]">
            {renderWithEmotes(message.text)}
          </p>
        )
      )}

      {message.image && (
        <button
          type="button"
          onClick={() => onOpenImage?.(message.image as string)}
          className="mt-2 block cursor-zoom-in overflow-hidden rounded-md border border-[#dadce0] bg-white transition-opacity hover:opacity-90"
          title="Xem hình ảnh"
          aria-label="Xem hình ảnh đính kèm"
        >
          <img src={message.image} alt="Hình ảnh đính kèm" className="block max-h-44 max-w-full object-contain" />
        </button>
      )}

      {onReply && !message.doubleDownOffer && (
        <div className={`mt-1.5 flex ${mine ? 'justify-start' : 'justify-end'}`}>
          <button
            type="button"
            onClick={() => onReply(message)}
            aria-label={`Trả lời ${message.sender}`}
            className="-mb-1 flex h-7 items-center gap-1 rounded-full px-2 text-[12px] font-medium text-[#0b57d0] transition-colors hover:bg-[rgba(11,87,208,0.08)]"
          >
            <Reply size={13} strokeWidth={2.25} aria-hidden="true" />
            Trả lời
          </button>
        </div>
      )}
    </article>
  </div>
);

export const SheetComments: React.FC<SheetCommentsProps> = ({ onOpenImage }) => {
  const chat = useSheetChat();
  const available = Boolean(chat?.available);
  // The room's own event lines (teases and the like) are game talk with emoji,
  // not anything a colleague would comment on a file, so the panel leaves them
  // out. A buzz stays, reworded as a Sheets reminder.
  const allMessages = available && chat ? chat.messages : null;
  const messages = useMemo(
    () => (allMessages ? allMessages.filter((message) => !message.system || message.buzzFrom) : []),
    [allMessages],
  );
  const [draft, setDraft] = useState('');
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [replyTarget, setReplyingTo] = useState<ChatMessage | null>(null);
  // A reply to a comment that has since left the list has nothing to point at.
  const replyingTo = replyTarget && messages.some((message) => message.id === replyTarget.id) ? replyTarget : null;
  const [isEmotesOpen, setIsEmotesOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLDivElement>(null);
  const emoteButtonRef = useRef<HTMLButtonElement>(null);
  /** Follow new comments only while the reader is already at the newest one. */
  const stickRef = useRef(true);

  // Opening the panel lands on the newest comment, and a new one arriving is
  // followed only when the reader had not scrolled up to read older ones.
  // Layout effect, so the panel never paints scrolled to the top first.
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el || !stickRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length]);


  // Opening the panel puts the caret in the comment box, ready to type. Not on
  // a touch screen, where focusing would throw the keyboard over the panel.
  useLayoutEffect(() => {
    if (window.matchMedia?.('(pointer: fine)').matches) inputRef.current?.focus();
  }, []);

  const handleScroll = () => {
    const el = listRef.current;
    if (!el) return;
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight <= STICK_TO_BOTTOM_PX;
  };

  const startReply = (message: ChatMessage) => {
    setReplyingTo(message);
    inputRef.current?.focus();
  };

  const submit = () => {
    const text = draft.trim();
    if ((!text && !attachedImage) || !chat || !available) return;
    chat.send(text, attachedImage ?? undefined, replyingTo ?? undefined);
    setDraft('');
    setAttachedImage(null);
    setReplyingTo(null);
    stickRef.current = true;
  };

  const attachFile = async (file: File | null | undefined) => {
    if (!file || !file.type.startsWith('image/')) return;
    try {
      setAttachedImage(await processImageFile(file));
    } catch (err) {
      console.error('Failed to process comment image:', err);
    }
  };

  /** A pasted image becomes the attachment; pasted text goes in as usual. */
  const handlePaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    const item = Array.from(event.clipboardData?.items ?? []).find((entry) => entry.type.startsWith('image/'));
    if (!item) return;
    event.preventDefault();
    void attachFile(item.getAsFile());
  };

  /** Puts the emote's shortcut at the caret, the way the game's chat does. */
  const insertEmote = (code: string) => {
    const el = inputRef.current;
    if (!el) return;
    if (document.activeElement !== el) {
      el.focus();
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
    document.execCommand('insertText', false, `${code} `);
  };

  const close = () => updateSheetUi({ commentsOpen: false });

  return (
    <aside
      aria-label="Nhận xét"
      className="fixed inset-0 z-[55] flex flex-col bg-white md:static md:z-auto md:w-[360px] md:shrink-0 md:border-l md:border-[#e0e0e0]"
      style={{ fontFamily: SHEET_FONT }}
    >
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-[#e0e0e0] pl-4 pr-2">
        <h2 className="flex-1 text-[18px] font-normal text-[#1f1f1f]">Nhận xét</h2>
        <span className="flex h-8 cursor-default items-center gap-1 rounded-full border border-[#dadce0] px-3 text-[12px] font-medium text-[#444746]">
          Tất cả nhận xét
          <ChevronDown size={14} strokeWidth={2} aria-hidden="true" />
        </span>
        <button
          type="button"
          onClick={close}
          title="Đóng"
          aria-label="Đóng nhận xét"
          className="grid h-9 w-9 place-items-center rounded-full text-[#444746] transition-colors hover:bg-[rgba(68,71,70,0.08)]"
        >
          <X size={20} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>

      <div
        ref={listRef}
        onScroll={handleScroll}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[#f8fafd] py-2"
      >
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-[#e8f0fe]">
              <MessageSquarePlus size={26} strokeWidth={1.75} color="#1a73e8" aria-hidden="true" />
            </span>
            <p className="text-[14px] font-medium text-[#202124]">Chưa có nhận xét nào</p>
            <p className="text-[12px] leading-5 text-[#5f6368]">
              {available
                ? 'Nhận xét về tệp này sẽ xuất hiện ở đây.'
                : 'Chỉ bạn có quyền truy cập tệp này, nên chưa ai có thể nhận xét.'}
            </p>
          </div>
        ) : (
          messages.map((message) =>
            message.system ? (
              <div key={message.id} data-chat-id={message.id} className="flex justify-center px-3 py-1.5">
                <span className="flex max-w-full items-center gap-1.5 rounded-full bg-[#e8eaed] px-3 py-1 text-[12px] text-[#3c4043]">
                  <BellRing size={13} strokeWidth={2} color="#5f6368" aria-hidden="true" />
                  <span className="truncate">{message.buzzFrom} đã gửi lời nhắc</span>
                  <span className="text-[#5f6368]">· {formatCommentTime(message.timestamp)}</span>
                </span>
              </div>
            ) : (
              <CommentCard
                key={message.id}
                message={message}
                mine={Boolean(chat?.isOwn(message))}
                onOpenImage={onOpenImage}
                onAnswerOffer={chat?.answerOffer}
                onReply={available ? startReply : undefined}
                onJump={(id) => jumpTo(listRef.current, id)}
              />
            ),
          )
        )}
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        className="shrink-0 border-t border-[#e0e0e0] bg-white p-3"
      >
        {replyingTo && (
          <div className="mb-2 flex items-center gap-2 rounded border-l-2 border-[#1a73e8] bg-[#f1f3f4] py-1 pl-2 pr-1 text-[12px] text-[#5f6368]">
            <span className="min-w-0 flex-1 truncate">
              Trả lời <span className="font-semibold text-[#202124]">{replyingTo.sender}</span>:{' '}
              {renderWithEmotes(quoteText({ text: replyingTo.text, hasImage: Boolean(replyingTo.image) }))}
            </span>
            <button
              type="button"
              onClick={() => setReplyingTo(null)}
              title="Hủy trả lời"
              aria-label="Hủy trả lời"
              className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[#444746] hover:bg-[rgba(68,71,70,0.08)]"
            >
              <X size={14} strokeWidth={2} aria-hidden="true" />
            </button>
          </div>
        )}
        <div
          className={`rounded-lg border bg-white px-3 pb-2 pt-2.5 transition-colors ${
            available ? 'border-[#c4c7c5] focus-within:border-[#0b57d0]' : 'border-[#e0e0e0] bg-[#f8f9fa]'
          }`}
        >
          {attachedImage && (
            <div className="relative mb-2 inline-block">
              <button
                type="button"
                onClick={() => onOpenImage?.(attachedImage)}
                className="block cursor-zoom-in overflow-hidden rounded-md border border-[#dadce0]"
                title="Xem hình ảnh"
              >
                <img src={attachedImage} alt="Hình ảnh sẽ gửi" className="block max-h-24 max-w-[200px] object-contain" />
              </button>
              <button
                type="button"
                onClick={() => setAttachedImage(null)}
                title="Xóa hình ảnh"
                aria-label="Xóa hình ảnh"
                className="absolute -right-2 -top-2 grid h-6 w-6 place-items-center rounded-full border border-[#dadce0] bg-white text-[#444746] shadow-sm hover:bg-[#f1f3f4]"
              >
                <X size={13} strokeWidth={2.25} aria-hidden="true" />
              </button>
            </div>
          )}
          {available ? (
            <EmoteInput
              inputRef={inputRef}
              value={draft}
              onChange={setDraft}
              onPaste={handlePaste}
              onKeyDown={(event) => {
                // Enter sends, Shift+Enter breaks the line. A Vietnamese input
                // method commits its word on Enter too, so that one is left alone.
                if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  submit();
                } else if (event.key === 'Escape' && replyingTo) {
                  event.preventDefault();
                  setReplyingTo(null);
                }
              }}
              placeholder={replyingTo ? `Trả lời ${replyingTo.sender}…` : 'Nhận xét hoặc thêm người khác bằng @'}
              aria-label="Nhận xét"
              className="block max-h-[120px] min-h-[20px] w-full overflow-y-auto bg-transparent text-[14px] leading-5 text-[#202124] focus:outline-none"
            />
          ) : (
            <p className="text-[14px] leading-5 text-[#80868b]">Nhận xét hoặc thêm người khác bằng @</p>
          )}
          <div className="mt-2 flex items-center gap-1">
            <button
              ref={emoteButtonRef}
              type="button"
              onClick={() => setIsEmotesOpen((open) => !open)}
              disabled={!available}
              aria-expanded={isEmotesOpen}
              title="Chèn biểu tượng cảm xúc"
              aria-label="Chèn biểu tượng cảm xúc"
              className="grid h-8 w-8 place-items-center rounded-full text-[#444746] transition-colors hover:bg-[rgba(68,71,70,0.08)] disabled:text-[#80868b] disabled:hover:bg-transparent"
            >
              <Smile size={18} strokeWidth={2} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={!available}
              title="Chèn hình ảnh"
              aria-label="Chèn hình ảnh"
              className="grid h-8 w-8 place-items-center rounded-full text-[#444746] transition-colors hover:bg-[rgba(68,71,70,0.08)] disabled:text-[#80868b] disabled:hover:bg-transparent"
            >
              <ImageIcon size={18} strokeWidth={2} aria-hidden="true" />
            </button>
            {chat?.buzz && (
              // The game's buzz, passed off as nudging a collaborator.
              <button
                type="button"
                onClick={chat.buzz}
                disabled={chat.buzzCooldown}
                title="Gửi lời nhắc"
                aria-label="Gửi lời nhắc"
                className="grid h-8 w-8 place-items-center rounded-full text-[#444746] transition-colors hover:bg-[rgba(68,71,70,0.08)] disabled:text-[#80868b] disabled:hover:bg-transparent"
              >
                <BellRing size={18} strokeWidth={2} aria-hidden="true" />
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={(event) => {
                void attachFile(event.target.files?.[0]);
                event.target.value = '';
              }}
            />
            <span className="flex-1" />
            <button
              type="button"
              onClick={() => {
                setDraft('');
                setAttachedImage(null);
                setReplyingTo(null);
              }}
              disabled={!available}
              className="h-9 rounded-full px-4 text-[14px] font-medium text-[#0b57d0] transition-colors hover:bg-[rgba(11,87,208,0.08)] disabled:text-[#80868b] disabled:hover:bg-transparent"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={!available || (!draft.trim() && !attachedImage)}
              className="h-9 rounded-full bg-[#0b57d0] px-4 text-[14px] font-medium text-white transition-colors hover:bg-[#0a4ab4] disabled:bg-[rgba(31,31,31,0.12)] disabled:text-[rgba(31,31,31,0.38)]"
            >
              {replyingTo ? 'Trả lời' : 'Nhận xét'}
            </button>
          </div>
        </div>
        <GameReactionPicker
          open={isEmotesOpen}
          isAiMode={!available}
          anchorRef={emoteButtonRef}
          onPick={insertEmote}
          onClose={() => setIsEmotesOpen(false)}
        />
      </form>
    </aside>
  );
};
