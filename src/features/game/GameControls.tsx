import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  X,
  Bell,
  ChevronDown,
  ChevronUp,
  ArrowDown,
  Smile,
  Settings,
  LogOut,
  Undo2,
  RefreshCw,
  Flag,
  Loader2,
} from 'lucide-react';
import { setDisplayPref, useDisplayPrefs } from './displayPrefs';
import type { DisplayPrefs } from './displayPrefs';
import type { UserProfile } from '../auth/AuthContext';
import type { ChatMessage } from '../webrtc/types';
import { getAvatarPublicUrl } from '../avatar/avatarService';
import { useIsDesktop } from '../../shared/hooks/useMediaQuery';

interface GameControlsProps {
  headerNode?: React.ReactNode;
  boardNode?: React.ReactNode;
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
  /** Names where the exit goes, e.g. "Leave room". */
  exitLabel: string;
  gameStatus: 'lobby' | 'playing' | 'ended';
  allowUndo: boolean;
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

/** The three board settings worth reaching for without leaving the match. */
const PREF_ROWS: Array<{ key: keyof DisplayPrefs; label: string }> = [
  { key: 'showCoordinates', label: 'Show coordinates' },
  { key: 'markLastMove', label: 'Mark the last move' },
  { key: 'soundEnabled', label: 'Sound' },
];

const CHAT_OPEN_STORAGE_KEY = 'caro_chat_panel_open';
/** How close to the bottom still counts as "following the conversation". */
const STICK_TO_BOTTOM_PX = 56;
/** How long to keep re-pinning the feed after a message, in milliseconds. */
const PIN_TO_BOTTOM_MS = 250;
/**
 * Height of the phone's fixed chat bar. The page reserves the same height under
 * the action rail, so the bar is pinned to it rather than sized by its content.
 */
const CHAT_BAR_HEIGHT_PX = 60;

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
 * Whether the desktop chat column starts open: as the player last left it, and
 * open when nothing is saved. A phone never reads it. There the chat is a sheet
 * over the board, and restoring a column left open on a wide window covered the
 * board before the first move.
 */
const readStoredChatOpen = () => {
  try {
    return localStorage.getItem(CHAT_OPEN_STORAGE_KEY) !== 'closed';
  } catch {
    return true;
  }
};

interface RailButtonProps {
  icon: React.ReactNode;
  /** The action's name. Carried by the tooltip and by the accessible label. */
  label: string;
  /** The longer sentence, when the action needs one to be understood. */
  title?: string;
  onClick: () => void;
  disabled?: boolean;
  /** Asked for, and waiting on the opponent's answer. */
  pending?: boolean;
  tone?: 'default' | 'primary' | 'danger';
}

/**
 * One action in the match rail. The rail is 240px wide at its narrowest, where
 * five named buttons wrapped onto three lines and read as a pile rather than as
 * a toolbar, so each action is an icon and keeps its name in the tooltip and in
 * the accessible label. An action waiting on the opponent spins in place, which
 * says "sent, still waiting" without the button changing width.
 */
const RailButton: React.FC<RailButtonProps> = ({
  icon,
  label,
  title,
  onClick,
  disabled = false,
  pending = false,
  tone = 'default',
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled || pending}
    title={title ? `${label} — ${title}` : label}
    aria-label={label}
    className={`btn btn-icon h-10 w-10 rounded-full ${
      tone === 'primary' ? 'btn-primary' : 'btn-ghost'
    } ${tone === 'danger' ? 'text-muted hover:text-danger' : ''}`}
  >
    {pending ? (
      <Loader2 size={17} strokeWidth={2.25} className="animate-spin" aria-hidden="true" />
    ) : (
      icon
    )}
  </button>
);

export const GameControls: React.FC<GameControlsProps> = ({
  headerNode,
  boardNode,
  myUser,
  opponent,
  chatMessages,
  onSendChat,
  onSendBuzz,
  onProposeUndo,
  onProposeRematch,
  onResign,
  onExitMatch,
  exitLabel,
  gameStatus,
  allowUndo,
  isAiMode,
  canUndo,
  undoPending,
  rematchPending,
}) => {
  const isDesktop = useIsDesktop();
  const prefs = useDisplayPrefs();
  const [isPrefsOpen, setIsPrefsOpen] = useState(false);
  const gearRef = useRef<HTMLButtonElement>(null);
  const prefsRef = useRef<HTMLDivElement>(null);

  const [chatText, setChatText] = useState('');
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [isBuzzCooldown, setIsBuzzCooldown] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState<boolean>(() => isDesktop && readStoredChatOpen());
  const [hasNewBelow, setHasNewBelow] = useState(false);
  /** Reactions are a burst action, not a permanent band across the rail. */
  const [isReactionsOpen, setIsReactionsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const listRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  /** The phone's chat bar, which opens the sheet and takes focus back from it. */
  const chatBarRef = useRef<HTMLButtonElement>(null);
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

  // Only the desktop column's state is saved. The phone sheet always starts
  // closed, and saving it would overwrite what the column was left as.
  useEffect(() => {
    if (!isDesktop) return;
    try {
      localStorage.setItem(CHAT_OPEN_STORAGE_KEY, isChatOpen ? 'open' : 'closed');
    } catch {
      // Persisting the panel state is a convenience only.
    }
  }, [isChatOpen, isDesktop]);

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

  // The preferences popover closes on Escape or on a click anywhere else,
  // like every other transient menu.
  useEffect(() => {
    if (!isPrefsOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (prefsRef.current?.contains(target) || gearRef.current?.contains(target)) return;
      setIsPrefsOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsPrefsOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [isPrefsOpen]);

  // On a phone the sheet is modal, so opening it moves focus to its composer.
  // Left on the bar, focus would sit behind the scrim, and a screen reader
  // would never learn that a dialog had opened.
  useEffect(() => {
    if (isDesktop || !isChatOpen) return;
    const frame = requestAnimationFrame(() => textareaRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [isDesktop, isChatOpen]);

  /**
   * Closes the phone's chat sheet and hands focus back to the bar that opened
   * it. Left alone, focus falls to the page body as the sheet turns inert, and
   * a keyboard user starts again from the top of the page.
   */
  const closeChatSheet = useCallback(() => {
    setIsChatOpen(false);
    chatBarRef.current?.focus();
  }, []);

  // Escape closes the mobile sheet and the lightbox.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (lightboxImage) setLightboxImage(null);
      else if (!isDesktop && isChatOpen) closeChatSheet();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightboxImage, isDesktop, isChatOpen, closeChatSheet]);

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

  // One row of icons rather than a wrap of labelled buttons: every action here
  // is either rare or destructive, and none of them should out-shout the board.
  // The way out keeps its own side of a divider, being the only one that leaves
  // the match rather than acting inside it.
  const actionButtons = (
    <div className="flex flex-wrap items-center justify-center gap-0.5">
      <RailButton
        icon={<LogOut size={17} strokeWidth={2.25} aria-hidden="true" />}
        label={exitLabel}
        title={isAiMode ? 'go back to the home screen' : 'leave this room'}
        onClick={onExitMatch}
      />

      <span aria-hidden="true" className="mx-1 h-6 w-px bg-line" />

      <RailButton
        icon={<Undo2 size={17} strokeWidth={2.25} aria-hidden="true" />}
        label="Take back"
        title={undoTitle}
        onClick={onProposeUndo}
        disabled={!allowUndo || gameStatus !== 'playing' || !canUndo}
        pending={undoPending}
      />

      {/* Starting over is only the obvious next step once the game is over.
          Mid-match it is the destructive option, so it does not lead. */}
      <RailButton
        icon={<RefreshCw size={17} strokeWidth={2.25} aria-hidden="true" />}
        label={isAiMode ? 'New game' : 'Rematch'}
        title={
          isAiMode
            ? 'start a fresh game against the bot'
            : gameStatus === 'ended'
            ? 'offer your opponent another round'
            : 'available once this match has finished'
        }
        onClick={onProposeRematch}
        disabled={rematchDisabled}
        pending={rematchPending}
        tone={gameStatus === 'ended' ? 'primary' : 'default'}
      />

      {/* Conceding stays in the rail with everything else and is told apart by
          colour, not by being pushed out of the group. */}
      {!isAiMode && (
        <RailButton
          icon={<Flag size={17} strokeWidth={2.25} aria-hidden="true" />}
          label="Resign"
          title="give up this match and record it as a loss"
          onClick={onResign}
          disabled={gameStatus !== 'playing'}
          tone="danger"
        />
      )}

      {/* What this browser draws and plays, kept apart from the Settings
          dialog, which holds the rules both players are bound by. */}
      <div className="relative">
        <button
          ref={gearRef}
          type="button"
          onClick={() => setIsPrefsOpen((open) => !open)}
          aria-haspopup="true"
          aria-expanded={isPrefsOpen}
          title="Board display and sound"
          aria-label="Board display and sound"
          className="btn btn-ghost btn-icon h-10 w-10 rounded-full"
        >
          <Settings size={17} strokeWidth={2.25} aria-hidden="true" />
        </button>

        {isPrefsOpen && (
          <div
            ref={prefsRef}
            role="dialog"
            aria-label="Board display and sound"
            className="absolute bottom-12 right-0 z-30 w-60 rounded-lg border border-line bg-surface p-2 shadow-2xl"
          >
            <p className="px-2 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-[0.09em] text-muted">
              This device only
            </p>
            {PREF_ROWS.map((row) => (
              <button
                key={row.key}
                type="button"
                role="switch"
                aria-checked={prefs[row.key]}
                onClick={() => setDisplayPref(row.key, !prefs[row.key])}
                className="flex w-full items-center justify-between gap-3 rounded-md p-2 text-left text-[13px] font-medium transition-colors hover:bg-surface-2"
              >
                <span>{row.label}</span>
                <span
                  aria-hidden="true"
                  className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
                    prefs[row.key] ? 'bg-accent' : 'bg-surface-3'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-surface shadow transition-transform ${
                      prefs[row.key] ? 'translate-x-4' : ''
                    }`}
                  />
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
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
                    onError={(e) => {
                      e.currentTarget.onerror = null;
                      e.currentTarget.src = getAvatarPublicUrl();
                    }}
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
            <Smile size={16} strokeWidth={2.25} aria-hidden="true" />
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
          <Bell size={16} strokeWidth={2.25} aria-hidden="true" />
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
        {isChatOpen ? <ChevronUp size={13} strokeWidth={2.25} /> : <ChevronDown size={13} strokeWidth={2.25} />}
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
          <X size={14} strokeWidth={2.25} aria-hidden="true" />
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

  /* ------------------------------- layout -------------------------------- */

  // The bar under the board. Everything that acts on the match lives here, so
  // the frame itself keeps the height it needs.
  const actionsCell = () => (
    <div className="area-actions panel mx-3 mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 p-2">
      {actionButtons}
    </div>
  );

  /* ------------------------------ practice ------------------------------- */

  if (isAiMode) {
    return (
      <div className="match-stage match-stage--solo">
        <div className="area-left">
          {headerNode}
          <div className="flex-1 min-h-0" />
          {actionsCell()}
        </div>
        <div className="area-board pt-4">{boardNode}</div>
        {lightbox}
      </div>
    );
  }

  /* --------------------------------- desktop -------------------------------- */

  if (isDesktop) {
    return (
      <div className="match-stage">
        <div className="area-left">
          {headerNode}
          <div className="flex-1 min-h-0" />
          {actionsCell()}
        </div>

        <div className="area-board pt-4">
          {boardNode}
        </div>

        <aside className="area-right flex min-h-0 flex-col overflow-hidden">
          <div className="shrink-0 border-b border-line">
            {chatHeader}
          </div>
          {isChatOpen && (
            <div id="chat-panel-body" className="flex min-h-0 flex-1 flex-col px-3 pt-2">
              {chatFeed}
            </div>
          )}
          <div className="area-compose flex flex-col justify-center px-3 py-2 border-t border-line">
            {reactionRow}
            {composer}
          </div>
        </aside>

        {lightbox}
      </div>
    );
  }

  /* --------------------------------- mobile --------------------------------- */

  return (
    <div className="match-stage">
      <div className="area-left">
        {headerNode}
      </div>

      <div className="area-board pt-2">
        {boardNode}
      </div>

      <div className="area-actions flex flex-col w-full">
        {actionsCell()}
      </div>

      {/* The chat bar is fixed over the bottom of the screen, so the page ends
          in a strip exactly as tall as the bar. Without it the bar sat on the
          action rail, and no amount of scrolling brought the rail out from
          under it. */}
      <div style={{ height: `calc(${CHAT_BAR_HEIGHT_PX}px + env(safe-area-inset-bottom))` }} />

      <div
        className="fixed bottom-[env(safe-area-inset-bottom)] left-0 right-0 z-40 border-t border-line bg-surface p-2 shadow-[0_-4px_12px_rgba(0,0,0,0.05)]"
        style={{ height: CHAT_BAR_HEIGHT_PX }}
      >
        <button
          ref={chatBarRef}
          type="button"
          onClick={() => setIsChatOpen(true)}
          aria-label={
            unreadCount > 0
              ? `Open chat, ${unreadCount} unread message${unreadCount === 1 ? '' : 's'}`
              : 'Open chat'
          }
          aria-expanded={isChatOpen}
          aria-controls="chat-sheet"
          className="flex h-full w-full items-center justify-between gap-2 rounded-full bg-surface-2 px-4 text-left transition-colors hover:bg-surface-3"
        >
          {/* One line, always. A long or multi-line message would otherwise
              grow the bar past the strip the page reserves for it. */}
          <div className="flex min-w-0 items-center gap-2">
            <span className="min-w-0 truncate text-[13px] font-medium text-muted">
              {lastMessagePreview}
            </span>
            {unreadCount > 0 && (
              <span className="shrink-0 px-1.5 py-0.5 rounded-full bg-danger-solid text-danger-fg text-[10px] font-semibold leading-none">
                {unreadCount}
              </span>
            )}
          </div>
          <ChevronUp size={16} className="shrink-0 text-subtle" />
        </button>
      </div>

      {/* Without a scrim a tap above the open sheet landed on the page
          underneath, board cells included. It sits over the bar (z-40) and
          under the sheet (z-50). */}
      {isChatOpen && (
        <div
          className="fixed inset-0 z-[45] bg-[var(--ui-scrim)] backdrop-blur-[2px]"
          onClick={closeChatSheet}
          aria-hidden="true"
        />
      )}

      {/* Closed, the sheet is only moved off screen, so it is made inert too.
          Otherwise a screen reader read out a chat nobody could see, and Tab
          reached its composer, which could still send. */}
      <div
        id="chat-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="chat-sheet-title"
        aria-hidden={isChatOpen ? undefined : true}
        inert={!isChatOpen}
        className={`fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-2xl border-t border-line bg-surface shadow-2xl transition-transform duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] ${
          isChatOpen ? 'translate-y-0' : 'translate-y-full'
        }`}
        style={{
          height: '80dvh',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-line px-2 py-1">
          <h2 id="chat-sheet-title" className="px-2 text-base text-ink">Chat</h2>
          <button
            type="button"
            onClick={closeChatSheet}
            className="btn btn-ghost btn-icon h-10 w-10 shrink-0 text-muted hover:bg-surface-2 hover:text-ink"
            aria-label="Close chat"
          >
            <ChevronDown size={20} strokeWidth={2} />
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col p-3 pb-0">{chatFeed}</div>
        <div className="shrink-0 p-3 shadow-[0_-8px_16px_-8px_rgba(0,0,0,0.05)]">
          {reactionRow}
          {composer}
        </div>
      </div>

      {lightbox}
    </div>
  );
};
