import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Image as ImageIcon, MessageSquarePlus, X } from 'lucide-react';
import { updateSheetUi, useSheetChat } from './sheetBridge';
import type { ChatMessage } from '../webrtc/types';

/**
 * The match chat, dressed as Google Sheets' comments panel. While the
 * Spreadsheet disguise is up the real chat column is unmounted, so this is the
 * only way to talk to the room; it reads the chat GameControls publishes and
 * never touches the room itself.
 *
 * Every author gets a letter avatar, never their game avatar: those are pixel
 * sprites, and one of them in a "comment" would give the whole thing away. For
 * the same reason the player's own comments look exactly like everyone else's,
 * as they do in real Sheets.
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

interface SheetCommentsProps {
  /** Opens an attached image full size. */
  onOpenImage?: (src: string) => void;
}

const CommentCard: React.FC<{ message: ChatMessage; onOpenImage?: (src: string) => void; onAnswerOffer?: (accept: boolean) => void }> = ({ message, onOpenImage, onAnswerOffer }) => (
  <article className="mx-3 my-2 rounded-lg border border-[#dadce0] bg-white p-3">
    <header className="flex items-center gap-2.5">
      <span
        aria-hidden="true"
        className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[13px] font-medium text-white"
        style={{ backgroundColor: avatarColour(message.sender) }}
      >
        {initialOf(message.sender)}
      </span>
      <div className="min-w-0 flex-1 leading-tight">
        <div className="truncate text-[13px] font-semibold text-[#202124]">{message.sender}</div>
        <div className="text-[12px] text-[#5f6368]">{formatCommentTime(message.timestamp)}</div>
      </div>
    </header>
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
        <p className="mt-2 whitespace-pre-wrap break-words text-[14px] leading-5 text-[#3c4043]">{message.text}</p>
      )
    )}
    {message.image && (
      <button
        type="button"
        onClick={() => onOpenImage?.(message.image as string)}
        className="mt-2 flex items-center gap-2 rounded-md border border-[#dadce0] p-1.5 pr-3 text-left text-[12px] text-[#3c4043] hover:bg-[#f1f3f4]"
        title="Xem hình ảnh"
      >
        <img src={message.image} alt="" className="h-12 w-12 shrink-0 rounded object-cover" />
        <span className="flex items-center gap-1.5">
          <ImageIcon size={14} strokeWidth={2} color="#5f6368" aria-hidden="true" />
          Hình ảnh đính kèm
        </span>
      </button>
    )}
  </article>
);

export const SheetComments: React.FC<SheetCommentsProps> = ({ onOpenImage }) => {
  const chat = useSheetChat();
  const available = Boolean(chat?.available);
  // The room's own event lines (buzzes, teases) are game talk with emoji, not
  // anything a colleague would comment on a file, so the panel leaves them out.
  const allMessages = available && chat ? chat.messages : null;
  const messages = useMemo(() => (allMessages ? allMessages.filter((message) => !message.system) : []), [allMessages]);
  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
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

  // The composer grows with what is typed, up to about five lines.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [draft]);

  const handleScroll = () => {
    const el = listRef.current;
    if (!el) return;
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight <= STICK_TO_BOTTOM_PX;
  };

  const submit = () => {
    const text = draft.trim();
    if (!text || !chat || !available) return;
    chat.send(text);
    setDraft('');
    stickRef.current = true;
  };

  const close = () => updateSheetUi({ commentsOpen: false });

  return (
    <aside
      aria-label="Nhận xét"
      // Lets the boss key fire while the player is typing a comment (see
      // SheetChrome's key handler), which is exactly when it is most needed.
      data-sheet-comments=""
      className="fixed inset-0 z-[55] flex flex-col bg-white md:static md:z-auto md:w-[340px] md:shrink-0 md:border-l md:border-[#e0e0e0]"
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
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[#f8fafd] py-1"
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
          messages.map((message) => <CommentCard key={message.id} message={message} onOpenImage={onOpenImage} onAnswerOffer={chat?.answerOffer} />)
        )}
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        className="shrink-0 border-t border-[#e0e0e0] bg-white p-3"
      >
        <div
          className={`rounded-lg border bg-white px-3 pb-2 pt-2.5 transition-colors ${
            available ? 'border-[#c4c7c5] focus-within:border-[#0b57d0]' : 'border-[#e0e0e0] bg-[#f8f9fa]'
          }`}
        >
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              // Enter sends, Shift+Enter breaks the line. A Vietnamese input
              // method commits its word on Enter too, so that one is left alone.
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                submit();
              }
            }}
            disabled={!available}
            rows={1}
            placeholder="Nhận xét hoặc thêm người khác bằng @"
            aria-label="Nhận xét"
            className="block w-full resize-none bg-transparent text-[14px] leading-5 text-[#202124] placeholder:text-[#5f6368] focus:outline-none disabled:cursor-not-allowed"
          />
          <div className="mt-2 flex justify-end gap-1">
            <button
              type="button"
              onClick={() => setDraft('')}
              disabled={!available}
              className="h-9 rounded-full px-4 text-[14px] font-medium text-[#0b57d0] transition-colors hover:bg-[rgba(11,87,208,0.08)] disabled:text-[#80868b] disabled:hover:bg-transparent"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={!available || !draft.trim()}
              className="h-9 rounded-full bg-[#0b57d0] px-4 text-[14px] font-medium text-white transition-colors hover:bg-[#0a4ab4] disabled:bg-[rgba(31,31,31,0.12)] disabled:text-[rgba(31,31,31,0.38)]"
            >
              Nhận xét
            </button>
          </div>
        </div>
      </form>
    </aside>
  );
};
