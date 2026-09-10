import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { X, Bell, ChevronDown, ChevronUp, ArrowDown, Smile } from 'lucide-react';
import type { UserProfile } from '../auth/AuthContext';
import type { ChatMessage } from '../webrtc/types';
import { getAvatarPublicUrl } from '../avatar/avatarService';
import { useIsDesktop } from '../../shared/hooks/useMediaQuery';

interface GameControlsProps {
  myPiece: 'X' | 'O';
  currentTurn: 'X' | 'O';
  turnTimeLeft: number;
  myTotalTimeLeft: number;
  opponentTotalTimeLeft: number;
  opponent: UserProfile | null;
  myUser: UserProfile | null;
  chatMessages: ChatMessage[];
  lastReaction: { emoji: string; sender: string } | null;
  onSendChat: (text: string, image?: string) => void;
  onSendReaction: (emoji: string) => void;
  onSendBuzz?: () => void;
  onProposeUndo: () => void;
  onProposeRematch: () => void;
  onResign: () => void;
  /** Leaves the match: back home from practice, out of the room online. */
  onExitMatch: () => void;
  gameStatus: 'lobby' | 'playing' | 'ended';
  allowUndo: boolean;
  boardSize: number;
  /** Practice has no opponent to chat with, react to or buzz. */
  isAiMode: boolean;
  /** False when there is no move to take back yet. */
  canUndo: boolean;
  /** A take-back has been asked for and the opponent has not answered. */
  undoPending: boolean;
  /** A rematch has been offered and the opponent has not answered. */
  rematchPending: boolean;
}

const REACTION_ICONS = [
  { id: 'smirk', label: 'Smirk', emoji: '😏' },
  { id: 'laugh', label: 'Laugh', emoji: '😂' },
  { id: 'smile', label: 'Smile', emoji: '😊' },
  { id: 'grin', label: ':D', emoji: '😃' },
  { id: 'tongue', label: ':P', emoji: '😛' },
  { id: 'gasp', label: ':O', emoji: '😮' },
  { id: 'lmao', label: 'Lmao', emoji: '🤣' },
  { id: 'gg', label: 'GG', emoji: '🤝' },
];

const CHAT_OPEN_STORAGE_KEY = 'caro_chat_panel_open';
/** How close to the bottom still counts as "following the conversation". */
const STICK_TO_BOTTOM_PX = 56;
/** How long to keep re-pinning the feed after a message, in milliseconds. */
const PIN_TO_BOTTOM_MS = 250;

const processImageFile = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const MAX_DIM = 1000;
        let width = img.width;
        let height = img.height;

        if (width > MAX_DIM || height > MAX_DIM) {
          if (width > height) {
            height = Math.round((height * MAX_DIM) / width);
            width = MAX_DIM;
          } else {
            width = Math.round((width * MAX_DIM) / height);
            height = MAX_DIM;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.85));
        } else {
          resolve(event.target?.result as string);
        }
      };
      img.onerror = (err) => reject(err);
      img.src = event.target?.result as string;
    };
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
};

const formatTime = (timestamp: number) => {
  try {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
};

/**
 * Honours a saved preference, and otherwise starts open only where the panel
 * has its own column. On a phone the chat is an overlay, so defaulting it open
 * covered the board before the first move.
 */
const readStoredChatOpen = (defaultOpen: boolean) => {
  try {
    const stored = localStorage.getItem(CHAT_OPEN_STORAGE_KEY);
    if (stored === 'open') return true;
    if (stored === 'closed') return false;
    return defaultOpen;
  } catch {
    return defaultOpen;
  }
};

export const GameControls: React.FC<GameControlsProps> = ({
  myPiece,
  myUser,
  opponent,
  chatMessages,
  onSendChat,
  onSendBuzz,
  onProposeUndo,
  onProposeRematch,
  onResign,
  onExitMatch,
  gameStatus,
  allowUndo,
  boardSize,
  isAiMode,
  canUndo,
  undoPending,
  rematchPending,
}) => {
  const isDesktop = useIsDesktop();

  const [chatText, setChatText] = useState('');
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [isBuzzCooldown, setIsBuzzCooldown] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState<boolean>(() => readStoredChatOpen(isDesktop));
  const [hasNewBelow, setHasNewBelow] = useState(false);
  /** Reactions are a burst action, not a permanent band across the rail. */
  const [isReactionsOpen, setIsReactionsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const listRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const buzzCooldownRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Whether the reader is pinned to the newest message. Auto-scroll only then. */
  const stickToBottomRef = useRef(true);
  const seenCountRef = useRef(chatMessages.length);

  const isOwnMessage = useCallback(
    (message: ChatMessage) => {
      if (!myUser) return false;
      if (message.senderId) return message.senderId === myUser.uid;
      return message.sender === myUser.displayName;
    },
    [myUser]
  );

  const lastMessage = chatMessages[chatMessages.length - 1];
  const lastMessagePreview = useMemo(() => {
    if (!lastMessage) return 'No messages yet';
    const body = lastMessage.text || (lastMessage.image ? 'Sent an image' : '');
    const who = isOwnMessage(lastMessage) ? 'You' : lastMessage.sender;
    return lastMessage.system ? body : `${who}: ${body}`;
  }, [lastMessage, isOwnMessage]);

  /**
   * Scroll the feed itself, never `scrollIntoView`: that walks every scrollable
   * ancestor and used to drag the whole page (and the board) out of view whenever
   * a message arrived.
   */
  const scrollFeedToBottom = useCallback((smooth = false) => {
    const el = listRef.current;
    if (!el) return;
    if (smooth) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    } else {
      // Assign scrollTop rather than scrollTo: the animated path left the newest
      // bubble clipped by its own margin at the bottom of the feed.
      el.scrollTop = el.scrollHeight;
    }
    stickToBottomRef.current = true;
    setHasNewBelow(false);
  }, []);

  const handleFeedScroll = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const atBottom = distanceFromBottom <= STICK_TO_BOTTOM_PX;
    stickToBottomRef.current = atBottom;
    if (atBottom) setHasNewBelow(false);
  }, []);

  // New messages: follow them only when the reader was already at the bottom.
  useEffect(() => {
    if (!isChatOpen) {
      const unseen = Math.max(0, chatMessages.length - seenCountRef.current);
      setUnreadCount(unseen);
      return;
    }

    seenCountRef.current = chatMessages.length;
    setUnreadCount(0);

    if (stickToBottomRef.current) {
      // Hold the bottom for a short window instead of scrolling once.
      //
      // The last few pixels of a new bubble arrive late and unpredictably: the
      // gap comes from the bubble's own margin, which no ResizeObserver reports,
      // and from the composer snapping back to one line. A single scroll (even on
      // the next frame) raced them and left the newest message clipped.
      scrollFeedToBottom();

      let raf = 0;
      const deadline = performance.now() + PIN_TO_BOTTOM_MS;
      const hold = () => {
        const el = listRef.current;
        if (!el || !stickToBottomRef.current) return;
        el.scrollTop = el.scrollHeight;
        if (performance.now() < deadline) raf = requestAnimationFrame(hold);
      };
      raf = requestAnimationFrame(hold);
      return () => cancelAnimationFrame(raf);
    }
    if (chatMessages.length > 0) {
      setHasNewBelow(true);
    }
  }, [chatMessages, isChatOpen, scrollFeedToBottom]);

  // Opening the panel lands the reader on the newest message.
  useEffect(() => {
    if (!isChatOpen) return;
    seenCountRef.current = chatMessages.length;
    setUnreadCount(0);
    stickToBottomRef.current = true;
    const frame = requestAnimationFrame(() => scrollFeedToBottom());
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isChatOpen]);

  useEffect(() => {
    try {
      localStorage.setItem(CHAT_OPEN_STORAGE_KEY, isChatOpen ? 'open' : 'closed');
    } catch {
      // Persisting the panel state is a convenience only.
    }
  }, [isChatOpen]);

  // Auto-expand the composer from 1 line up to ~3 lines.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = '38px';
    el.style.height = `${Math.min(Math.max(el.scrollHeight, 38), 78)}px`;
  }, [chatText]);

  useEffect(() => () => {
    if (buzzCooldownRef.current) clearTimeout(buzzCooldownRef.current);
  }, []);

  // Anything that changes the feed's height after we pinned it to the bottom
  // leaves a gap: the composer growing to a second line, an image finishing its
  // load, the window resizing. Re-pin whenever the box or its content resizes.
  useEffect(() => {
    const el = listRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;

    const repin = () => {
      if (!stickToBottomRef.current) return;
      el.scrollTop = el.scrollHeight;
    };

    const observer = new ResizeObserver(repin);
    observer.observe(el);
    for (const child of Array.from(el.children)) observer.observe(child);

    return () => observer.disconnect();
  }, [isChatOpen, chatMessages.length]);

  // Escape closes the mobile sheet and the lightbox.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (lightboxImage) setLightboxImage(null);
      else if (!isDesktop && isChatOpen) setIsChatOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightboxImage, isDesktop, isChatOpen]);

  const handleChatSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!chatText.trim() && !attachedImage) return;
    onSendChat(chatText.trim(), attachedImage || undefined);
    setChatText('');
    setAttachedImage(null);
    stickToBottomRef.current = true;
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleChatSubmit();
    }
  };

  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.indexOf('image') !== -1) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          try {
            setAttachedImage(await processImageFile(file));
          } catch (err) {
            console.error('Failed to process pasted image:', err);
          }
        }
        break;
      }
    }
  };

  const handleBuzzClick = () => {
    if (isBuzzCooldown || !onSendBuzz) return;
    onSendBuzz();
    setIsBuzzCooldown(true);
    if (buzzCooldownRef.current) clearTimeout(buzzCooldownRef.current);
    buzzCooldownRef.current = setTimeout(() => setIsBuzzCooldown(false), 2000);
  };

  const handleSendReactionToChat = (emoji: string) => {
    onSendChat(emoji);
    stickToBottomRef.current = true;
  };

  /* ------------------------------- sub-views ------------------------------- */

  const undoTitle = !allowUndo
    ? 'Take-backs are turned off for this match'
    : !canUndo
    ? 'There is no move to take back yet'
    : undoPending
    ? 'Waiting for your opponent to answer'
    : isAiMode
    ? 'Take back your last move'
    : 'Within 5s of your own move this is instant; after that your opponent has to agree';

  // A rematch restarts the board, so it is only offered once the match is over.
  // Practice keeps a "New game" button, which asks before discarding a live game.
  const rematchDisabled = rematchPending || (!isAiMode && gameStatus !== 'ended');

  // Conceding is a real control and gets a real button, distinguished from the
  // pair beside it by colour rather than by being pushed out of the group.
  const destructiveAction = isAiMode ? (
    <button
      onClick={onExitMatch}
      title="Leave practice and go back to the home screen"
      className="btn btn-ghost btn-sm w-full text-muted"
    >
      Leave practice
    </button>
  ) : (
    <button
      onClick={onResign}
      disabled={gameStatus !== 'playing'}
      title="Give up this match and record it as a loss"
      className="btn btn-ghost btn-sm w-full text-danger"
    >
      Resign
    </button>
  );

  const actionButtons = (
    <div className="grid grid-cols-2 gap-2">
      <button
        onClick={onProposeUndo}
        disabled={!allowUndo || gameStatus !== 'playing' || !canUndo || undoPending}
        title={undoTitle}
        className="btn btn-secondary btn-sm"
      >
        {undoPending ? 'Sent\u2026' : 'Take back'}
      </button>
      {/* Starting over is only the obvious next step once the game is over.
          Mid-match it is the destructive option, so it does not lead. */}
      <button
        onClick={onProposeRematch}
        disabled={rematchDisabled}
        title={
          isAiMode
            ? 'Start a fresh game against the bot'
            : gameStatus === 'ended'
            ? 'Offer your opponent another round'
            : 'Available once this match has finished'
        }
        className={`btn btn-sm ${gameStatus === 'ended' ? 'btn-primary' : 'btn-secondary'}`}
      >
        {rematchPending ? 'Sent\u2026' : isAiMode ? 'New game' : 'Rematch'}
      </button>
    </div>
  );



  const reactionRow = isAiMode || !isReactionsOpen ? null : (
    <div className="grid grid-cols-8 gap-1 pb-2">
      {REACTION_ICONS.map((item) => (
        <button
          key={item.id}
          onClick={() => {
            handleSendReactionToChat(item.emoji);
            setIsReactionsOpen(false);
          }}
          title={item.label}
          aria-label={`Send ${item.label} reaction`}
          className="flex items-center justify-center rounded-sm px-0.5 py-1 text-base transition-transform hover:scale-110 hover:bg-surface-2 active:scale-95"
        >
          {item.emoji}
        </button>
      ))}
    </div>
  );

  const chatFeed = (
    <div className="relative flex-1 min-h-0">
      <div
        ref={listRef}
        onScroll={handleFeedScroll}
        className="chat-message-list h-full overflow-y-auto overscroll-contain space-y-2 pr-1 text-xs"
      >
        {chatMessages.length === 0 ? (
          <p className="py-10 text-center text-[13px] text-subtle">
            No messages yet. Say hello to your opponent.
          </p>
        ) : (
          chatMessages.map((m) => {
            const isMe = isOwnMessage(m);

            if (m.system) {
              return (
                <div key={m.id} className="flex justify-center">
                  <span className="chip text-[11px]">
                    {m.text}
                  </span>
                </div>
              );
            }

            return (
              <div key={m.id} className={`flex items-end gap-1.5 ${isMe ? 'justify-end' : 'justify-start'}`}>
                {!isMe && (
                  <img
                    src={getAvatarPublicUrl(opponent?.photoURL)}
                    alt=""
                    aria-hidden="true"
                    className="w-6 h-6 rounded-full border border-line bg-surface object-contain shrink-0 mb-0.5"
                  />
                )}
                <div
                  className={`max-w-[78%] rounded-md border px-3 py-2 ${
                    isMe
                      ? 'bg-accent border-accent text-accent-fg rounded-br-sm'
                      : 'bg-surface border-line text-ink rounded-bl-sm'
                  }`}
                >
                  {!isMe && (
                    <div className="text-[10px] font-semibold text-muted mb-0.5">{m.sender}</div>
                  )}
                  {m.text && (
                    <div className="text-[13px] leading-snug whitespace-pre-wrap break-words">{m.text}</div>
                  )}
                  {m.image && (
                    <button
                      type="button"
                      onClick={() => setLightboxImage(m.image || null)}
                      className="mt-1.5 block cursor-pointer"
                      title="Open image"
                    >
                      <img
                        src={m.image}
                        alt="Attachment"
                        className="max-h-44 rounded-sm border border-line object-cover hover:opacity-95 transition"
                      />
                    </button>
                  )}
                  <div className={`mt-1 font-mono text-[10px] tabular-nums ${isMe ? 'text-accent-fg/70' : 'text-subtle'}`}>
                    {formatTime(m.timestamp)}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {hasNewBelow && (
        <button
          type="button"
          onClick={() => scrollFeedToBottom(true)}
          className="absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-inverse px-3 py-1 text-[11px] font-medium text-inverse-fg shadow-lg transition hover:opacity-90"
        >
          New messages
          <ArrowDown size={12} strokeWidth={2} aria-hidden="true" />
        </button>
      )}
    </div>
  );

  const composer = (
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
          <span className="text-[11px] text-muted">Image ready to send</span>
        </div>
      )}

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
            <Smile size={16} strokeWidth={1.75} aria-hidden="true" />
          </button>
        )}
        <textarea
          ref={textareaRef}
          value={chatText}
          onChange={(e) => setChatText(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder="Type a message..."
          title="Shift+Enter for a newline, Ctrl+V to paste a screenshot"
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
        <button
          type="button"
          onClick={handleBuzzClick}
          disabled={isBuzzCooldown}
          title="Nudge your opponent with a sound"
          aria-label="Buzz opponent"
          className="btn btn-secondary btn-icon h-9 w-9 shrink-0"
        >
          <Bell size={16} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </form>
    </div>
  );

  const chatHeader = (
    <button
      type="button"
      onClick={() => setIsChatOpen((open) => !open)}
      aria-expanded={isChatOpen}
      aria-controls="chat-panel-body"
      className="flex w-full cursor-pointer items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-surface-2"
    >
      <span className="text-xs font-semibold text-ink shrink-0">Chat</span>
      {unreadCount > 0 && !isChatOpen && (
        <span className="px-1.5 py-0.5 rounded-full bg-danger-solid text-danger-fg text-[10px] font-semibold leading-none shrink-0">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
      <span className="flex-1 min-w-0 truncate text-[11px] text-muted font-medium">
        {isChatOpen ? `${chatMessages.length} message${chatMessages.length === 1 ? '' : 's'}` : lastMessagePreview}
      </span>
      <span className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-subtle" aria-hidden="true">
        {isChatOpen ? <ChevronUp size={13} strokeWidth={1.75} /> : <ChevronDown size={13} strokeWidth={1.75} />}
        {isChatOpen ? 'Hide' : 'Show'}
      </span>
    </button>
  );

  const lightbox = lightboxImage ? (
    <div
      className="fixed inset-0 z-[70] bg-[var(--ui-scrim)] backdrop-blur-xs flex items-center justify-center p-4 cursor-pointer"
      onClick={() => setLightboxImage(null)}
      role="dialog"
      aria-modal="true"
      aria-label="Image preview"
    >
      <div className="relative max-w-4xl max-h-[90dvh] flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={() => setLightboxImage(null)}
          className="absolute -top-10 right-0 text-inverse-fg hover:text-subtle font-medium text-sm px-3 py-1 bg-inverse/80 rounded-full cursor-pointer"
        >
          <X size={14} strokeWidth={1.75} aria-hidden="true" />
          Close
        </button>
        <img
          src={lightboxImage}
          alt="Enlarged attachment"
          className="max-w-full max-h-[85dvh] object-contain rounded-md border border-line-strong shadow-2xl"
        />
      </div>
    </div>
  ) : null;

  const roomSummary = (
    <div className="flex shrink-0 items-center justify-between gap-2 px-3 py-2 text-[11px] text-muted">
      <span>{isAiMode ? 'Practice vs Bot' : 'Online match'}</span>
      <span>
        <span className="font-mono tabular-nums">
          {boardSize} × {boardSize}
        </span>
        {' · You play '}
        {/* Not the mono face: its O is near enough to a zero that "You play O"
            read as "You play 0". */}
        <span className="font-semibold text-ink">{myPiece}</span>
      </span>
    </div>
  );

  /* ------------------------------ practice ------------------------------- */

  // Chat, reactions and Buzz all need a second player. Rendering them against
  // the bot only offered controls that could not do anything.
  if (isAiMode) {
    return (
      <div className="panel flex w-full flex-col overflow-hidden">
        <div className="shrink-0 p-3">{actionButtons}</div>
        <div className="shrink-0 border-t border-line px-3 py-1.5">{destructiveAction}</div>
        <p className="border-t border-line px-3 py-3 text-xs leading-relaxed text-muted">
          Practice games stay on this device. They are saved to your history but never
          change your rating.
        </p>
        <div className="border-t border-line bg-surface-2">{roomSummary}</div>
      </div>
    );
  }

  /* --------------------------------- desktop -------------------------------- */

  if (isDesktop) {
    return (
      <>
        {/* One rail divided by hairlines. Nesting a bordered box per section
            turned the sidebar into four floating islands. */}
        <div className="panel flex h-full min-h-0 w-full flex-col overflow-hidden">
          <div className="shrink-0 p-3">{actionButtons}</div>
          <div className="shrink-0 border-t border-line px-3 py-1.5">{destructiveAction}</div>

          <div className="shrink-0 border-t border-line">{chatHeader}</div>

          {isChatOpen && (
            <div
              id="chat-panel-body"
              className="flex min-h-0 flex-1 flex-col border-t border-line px-3 pt-2 pb-3"
            >
              {chatFeed}
              {composer}
            </div>
          )}

          <div className="mt-auto shrink-0 border-t border-line bg-surface-2">{roomSummary}</div>
        </div>
        {lightbox}
      </>
    );
  }

  /* --------------------------------- mobile --------------------------------- */

  return (
    <>
      {/* In-flow actions stay put; only the chat dock overlays, so the board never shifts. */}
      <div className="panel w-full overflow-hidden">
        <div className="p-3">{actionButtons}</div>
        <div className="border-t border-line px-3 py-1.5">{destructiveAction}</div>
        <div className="border-t border-line bg-surface-2">{roomSummary}</div>
      </div>

      {/* Reserve room for the collapsed dock so it never covers the last row. */}
      <div aria-hidden="true" className="h-16" />

      {isChatOpen && (
        <div
          className="fixed inset-0 z-40 bg-[var(--ui-scrim)] backdrop-blur-[2px]"
          onClick={() => setIsChatOpen(false)}
          aria-hidden="true"
        />
      )}

      <div className="fixed inset-x-0 bottom-0 z-50 px-2 pb-2 pointer-events-none">
        <div className="pointer-events-auto mx-auto max-w-2xl rounded-lg bg-surface border border-line-strong shadow-[0_-8px_30px_-12px_rgba(15,23,42,0.35)] overflow-hidden">
          {chatHeader}
          {isChatOpen && (
            <div
              id="chat-panel-body"
              className="flex flex-col border-t border-line px-3 pb-3 pt-2 bg-surface-2"
              style={{ height: 'min(58dvh, 460px)' }}
            >
              {chatFeed}
              {composer}
            </div>
          )}
        </div>
      </div>

      {lightbox}
    </>
  );
};
