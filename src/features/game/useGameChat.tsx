import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '../webrtc/types';
import type { UserProfile } from '../auth/AuthContext';
import { useSheetAwareSound } from './sheet/useSheetAwareSound';
import { PIN_TO_BOTTOM_MS, processImageFile, STICK_TO_BOTTOM_PX } from './GameControlsShared';
import type { ChatReceipt } from './GameControlsShared';
import { GameChatFeed } from './GameChatFeed';
import { GameChatComposer } from './GameChatComposer';
import { GameReactionPicker } from './GameReactionPicker';
import { GameChatLightbox } from './GameChatLightbox';

export interface UseGameChatOptions {
  messages: ChatMessage[];
  isOwn: (message: ChatMessage) => boolean;
  onSendChat: (text: string, image?: string, replyTo?: ChatMessage) => void;
  /** Returns false when the buzz was not sent, so no cooldown starts. */
  onSendBuzz?: () => boolean | void;
  /** Practice: no replies, reactions, images or buzz. */
  isAiMode?: boolean;
  /** Only a 'player' gets the buzz button. */
  role?: 'player' | 'viewer';
  /** Whether the feed is on screen. A closed panel counts unread lines instead of scrolling. */
  visible: boolean;
  /**
   * Whether the reader is looking at this chat at all, for read receipts.
   * Defaults to `visible`. The game's disguise shows the chat elsewhere.
   */
  inView?: boolean;
  /** Counts the chat as read whatever the feed's scroll position. */
  ignoreFeedPosition?: boolean;
  onChatSeen?: (messageId: string) => void;
  emptyText?: string;
  opponent?: UserProfile | null;
  avatarFor?: (message: ChatMessage) => string | null | undefined;
  receipt?: ChatReceipt | null;
  onAnswerDoubleDown?: (accept: boolean) => void;
}

/**
 * Everything a chat needs short of where it sits on screen: the draft, image
 * attachments, replies, reactions, buzz, the arrival sound, read receipts and
 * the stick-to-bottom scrolling. The match's chat panel and the "Just
 * chatting" room both run on it, so the two can never drift apart.
 */
export const useGameChat = ({
  messages,
  isOwn,
  onSendChat,
  onSendBuzz,
  isAiMode = false,
  role = 'player',
  visible,
  inView = visible,
  ignoreFeedPosition = false,
  onChatSeen,
  emptyText,
  opponent = null,
  avatarFor,
  receipt,
  onAnswerDoubleDown,
}: UseGameChatOptions) => {
  const [chatText, setChatText] = useState('');
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [isBuzzCooldown, setIsBuzzCooldown] = useState(false);
  const [hasNewBelow, setHasNewBelow] = useState(false);
  /** Reactions are a burst action, not a permanent band across the rail. */
  const [isReactionsOpen, setIsReactionsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const { playChatSound } = useSheetAwareSound();

  const emoteButtonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLDivElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const buzzCooldownRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Whether the reader is pinned to the newest message. Auto-scroll only then. */
  const stickToBottomRef = useRef(true);
  const seenCountRef = useRef(messages.length);
  // Chat history is loaded silently. Only a later peer message gets a sound.
  const notifiedChatIdsRef = useRef(new Set(messages.map((message) => message.id)));

  useEffect(() => {
    let receivedMessage = false;
    for (const message of messages) {
      if (notifiedChatIdsRef.current.has(message.id)) continue;
      notifiedChatIdsRef.current.add(message.id);
      if (!message.system && !isOwn(message)) receivedMessage = true;
    }
    if (receivedMessage) playChatSound();
  }, [messages, isOwn, playChatSound]);

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
    if (!visible) {
      const unseen = Math.max(0, messages.length - seenCountRef.current);
      setUnreadCount(unseen);
      return;
    }

    seenCountRef.current = messages.length;
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
    if (messages.length > 0) {
      setHasNewBelow(true);
    }
  }, [messages, visible, scrollFeedToBottom]);

  // Opening the panel lands the reader on the newest message.
  useEffect(() => {
    if (!visible) return;
    seenCountRef.current = messages.length;
    setUnreadCount(0);
    stickToBottomRef.current = true;
    const frame = requestAnimationFrame(() => scrollFeedToBottom());
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

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
  }, [visible, messages.length]);

  // Escape closes the lightbox, on the capture phase and marked handled, so
  // nothing else (a chat sheet, a dialog) reacts to the same press.
  useEffect(() => {
    if (!lightboxImage) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setLightboxImage(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [lightboxImage]);

  // Read receipts: the newest line from someone else counts as read once the
  // chat is on screen, the tab is visible and the feed is not holding unread
  // lines below the fold.
  let lastReadableId: string | null = null;
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (!message.system && !message.doubleDownOffer && !isOwn(message)) {
      lastReadableId = message.id;
      break;
    }
  }
  const feedCaughtUp = ignoreFeedPosition || !hasNewBelow;
  useEffect(() => {
    if (!onChatSeen || !lastReadableId || !inView || !feedCaughtUp) return;
    const report = () => {
      if (document.visibilityState === 'visible') onChatSeen(lastReadableId);
    };
    report();
    document.addEventListener('visibilitychange', report);
    return () => document.removeEventListener('visibilitychange', report);
  }, [onChatSeen, lastReadableId, inView, feedCaughtUp]);

  const sendChat = useCallback(
    (text: string, image?: string, replyTo?: ChatMessage) => {
      onSendChat(text, image, replyTo);
      playChatSound();
    },
    [onSendChat, playChatSound]
  );

  const handleChatSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!chatText.trim() && !attachedImage) return;
    sendChat(chatText.trim(), attachedImage || undefined, replyingTo ?? undefined);
    setChatText('');
    setAttachedImage(null);
    setReplyingTo(null);
    stickToBottomRef.current = true;
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleChatSubmit();
    } else if (e.key === 'Escape' && replyingTo) {
      // Cancels the reply only; a window-level Escape must not close the sheet too.
      e.preventDefault();
      e.nativeEvent.stopImmediatePropagation();
      setReplyingTo(null);
    }
  };

  const handlePaste = async (e: React.ClipboardEvent<HTMLDivElement>) => {
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

  const attachFile = async (file: File | null) => {
    if (!file || !file.type.startsWith('image/')) return;
    try {
      setAttachedImage(await processImageFile(file));
    } catch (err) {
      console.error('Failed to process chat attachment:', err);
    }
  };

  const handleAttachmentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    void attachFile(e.target.files?.[0] ?? null);
    e.target.value = '';
  };

  const handleBuzzClick = () => {
    if (isBuzzCooldown || !onSendBuzz) return;
    if (onSendBuzz() === false) return;
    setIsBuzzCooldown(true);
    if (buzzCooldownRef.current) clearTimeout(buzzCooldownRef.current);
    buzzCooldownRef.current = setTimeout(() => setIsBuzzCooldown(false), 2000);
  };

  const startReply = (message: ChatMessage) => {
    setReplyingTo(message);
    textareaRef.current?.focus();
  };

  // Drops an emoticon's shortcut into the draft at the caret; EmoteInput then
  // draws it as its picture, and the person can keep typing around it.
  const handlePickEmote = (code: string) => {
    const el = textareaRef.current;
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

  // Buzz needs a seat in a game, and a way to send it.
  const canBuzz = !isAiMode && role === 'player' && Boolean(onSendBuzz);

  const reactionRow = (
    <GameReactionPicker
      open={isReactionsOpen}
      isAiMode={isAiMode}
      anchorRef={emoteButtonRef}
      onPick={handlePickEmote}
      onClose={() => setIsReactionsOpen(false)}
    />
  );

  const feed = (
    <GameChatFeed
      messages={messages}
      emptyText={emptyText}
      opponent={opponent}
      avatarFor={avatarFor}
      listRef={listRef}
      onScroll={handleFeedScroll}
      isOwn={isOwn}
      receipt={receipt}
      onOpenImage={setLightboxImage}
      onReply={isAiMode ? undefined : startReply}
      onAnswerDoubleDown={onAnswerDoubleDown}
      hasNewBelow={hasNewBelow}
      onShowNew={() => scrollFeedToBottom(true)}
    />
  );

  const composer = (
    <GameChatComposer
      {...{
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
        onCancelReply: () => setReplyingTo(null),
      }}
    />
  );

  const lightbox = <GameChatLightbox image={lightboxImage} onClose={() => setLightboxImage(null)} />;

  return {
    feed,
    composer,
    lightbox,
    lightboxOpen: lightboxImage !== null,
    setLightboxImage,
    unreadCount,
    hasNewBelow,
    sendChat,
    handleBuzzClick,
    canBuzz,
    isBuzzCooldown,
    playChatSound,
  };
};
