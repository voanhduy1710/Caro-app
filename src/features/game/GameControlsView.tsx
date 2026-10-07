import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { ChevronDown, ChevronUp, Timer } from 'lucide-react';
import type { ChatMessage } from '../webrtc/types';
import { useDisplayPrefs } from './displayPrefs';
import { useIsDesktop } from '../../shared/hooks/useMediaQuery';
import { useTheme } from '../theme/ThemeContext';
import { useDisguiseMode } from './disguiseMode';
import { EMPTY_SHEET_ACTIONS, sheetActionsStore, sheetChatStore, sheetMatchStore, updateSheetUi, useSheetUi } from './sheetBridge';
import type { SheetMatch } from './sheetBridge';
import { SheetComments } from './SheetComments';
import { SheetSideStrip } from './SheetSideStrip';
import { useSheetAwareSound } from './sheet/useSheetAwareSound';
import { CHAT_BAR_HEIGHT_PX, CHAT_OPEN_STORAGE_KEY, formatElapsed, PIN_TO_BOTTOM_MS, processImageFile, readStoredChatOpen, STICK_TO_BOTTOM_PX } from './GameControlsShared';
import { GameActionRail } from './GameActionRail';
import { GameReactionPicker } from './GameReactionPicker';
import { GameChatLightbox } from './GameChatLightbox';
import { GameChatFeed } from './GameChatFeed';
import { GameChatComposer } from './GameChatComposer';
import { GameChatHeader } from './GameChatHeader';
import type { GameControlsProps } from './GameControlsShared';

export const GameControls: React.FC<GameControlsProps> = ({
  headerNode,
  boardNode,
  playerTimers = [],
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
  rematchUnavailable = false,
  role = 'player',
  rosterNode,
  myChatId,
  avatarFor,
  openSeat = null,
  onTakeSeat,
  canResign,
  chatEmptyText,
  elapsedGameTime = 0,
  moveCount = 0,
  doubleDown,
  onOfferDoubleDown,
  onAnswerDoubleDown,
  sheetMatch = null,
}) => {
  const isDesktop = useIsDesktop();
  const prefs = useDisplayPrefs();
  const { theme } = useTheme();
  // Boss-key disguise: roster, chat and the action rail all go dark, leaving
  // only the board (which carries the Sheets chrome) on screen. Gated on the
  // theme too, so a flag left set from an earlier match can never hide the
  // app under a board theme that isn't the disguise.
  const disguiseOn = useDisguiseMode();
  const sheetDisguise = theme.boardTheme === 'spreadsheet' && disguiseOn;
  const [isPrefsOpen, setIsPrefsOpen] = useState(false);
  const gearRef = useRef<HTMLButtonElement>(null);
  const prefsRef = useRef<HTMLDivElement>(null);

  const [chatText, setChatText] = useState('');
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [isBuzzCooldown, setIsBuzzCooldown] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState<boolean>(() => isDesktop && readStoredChatOpen());
  // One open/closed state serves two layouts with opposite defaults: the
  // desktop column comes back as the player left it, the phone sheet always
  // starts closed. Crossing 1024px mid-match, by snapping a window to half the
  // screen or rotating a tablet, carried one layout's state into the other and
  // opened an 80dvh sheet over the board. Adjusting state during render is how
  // React resets state when an input changes, without a stale frame between.
  const [chatLayoutIsDesktop, setChatLayoutIsDesktop] = useState(isDesktop);
  if (chatLayoutIsDesktop !== isDesktop) {
    setChatLayoutIsDesktop(isDesktop);
    setIsChatOpen(isDesktop && readStoredChatOpen());
  }
  const [hasNewBelow, setHasNewBelow] = useState(false);
  /** Reactions are a burst action, not a permanent band across the rail. */
  const [isReactionsOpen, setIsReactionsOpen] = useState(false);
  const emoteButtonRef = useRef<HTMLButtonElement>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [simulationCount, setSimulationCount] = useState(0);
  const { playChatSound } = useSheetAwareSound();

  const listRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLDivElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  /** The phone's chat bar, which opens the sheet and takes focus back from it. */
  const chatBarRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onSimulationCount = (event: Event) => setSimulationCount((event as CustomEvent<number>).detail);
    window.addEventListener('caro:simulation-count', onSimulationCount);
    return () => window.removeEventListener('caro:simulation-count', onSimulationCount);
  }, []);
  /** The phone's chat sheet, which takes focus when it opens and keeps Tab inside. */
  const sheetRef = useRef<HTMLDivElement>(null);
  const buzzCooldownRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Whether the reader is pinned to the newest message. Auto-scroll only then. */
  const stickToBottomRef = useRef(true);
  const seenCountRef = useRef(chatMessages.length);
  // Chat history is loaded silently. Only a later peer message gets a sound.
  const notifiedChatIdsRef = useRef(new Set(chatMessages.map((message) => message.id)));

  const isOwnMessage = useCallback(
    (message: ChatMessage) => {
      // In a room, lines are keyed by member: one account can be in the room twice.
      if (myChatId !== undefined) return Boolean(myChatId) && message.senderId === myChatId;
      if (!myUser) return false;
      if (message.senderId) return message.senderId === myUser.uid;
      return message.sender === myUser.displayName;
    },
    [myUser, myChatId]
  );

  const lastMessage = chatMessages[chatMessages.length - 1];
  const lastMessagePreview = useMemo(() => {
    if (!lastMessage) return 'No messages yet';
    const body = lastMessage.text || (lastMessage.image ? 'Sent an image' : '');
    const who = isOwnMessage(lastMessage) ? 'You' : lastMessage.sender;
    return lastMessage.system ? body : `${who}: ${body}`;
  }, [lastMessage, isOwnMessage]);

  useEffect(() => {
    let receivedMessage = false;
    for (const message of chatMessages) {
      if (notifiedChatIdsRef.current.has(message.id)) continue;
      notifiedChatIdsRef.current.add(message.id);
      if (!message.system && !isOwnMessage(message)) receivedMessage = true;
    }
    if (receivedMessage) playChatSound();
  }, [chatMessages, isOwnMessage, playChatSound]);

  // A double-down offer waits on an answer, so it opens the chat where its buttons are.
  const answerableOfferId = chatMessages.find((message) => message.doubleDownOffer?.canAnswer)?.id;
  useEffect(() => {
    if (answerableOfferId) setIsChatOpen(true);
  }, [answerableOfferId]);

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
  // like every other transient menu. Escape is taken on the capture phase and
  // marked handled, so nothing else reacts to the same press.
  useEffect(() => {
    if (!isPrefsOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (prefsRef.current?.contains(target) || gearRef.current?.contains(target)) return;
      setIsPrefsOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setIsPrefsOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [isPrefsOpen]);

  // On a phone the sheet is modal, so opening it moves focus into it. Left on
  // the bar, focus would sit behind the scrim, and a screen reader would never
  // learn that a dialog had opened. It goes to the sheet itself, not to the
  // composer: a focus() in the frame after the tap still counts as the tap on
  // Android, so the soft keyboard came up and covered half the sheet for
  // someone who had only opened it to read.
  useEffect(() => {
    if (isDesktop || !isChatOpen) return;
    const frame = requestAnimationFrame(() => sheetRef.current?.focus({ preventScroll: true }));
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

  /**
   * Keeps Tab inside the open sheet. It is aria-modal, but the chat bar, the
   * action rail and every board cell come before it in the page, under the
   * scrim, so Shift+Tab from its first control walked out onto Resign and the
   * board.
   */
  const trapSheetFocus = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    const sheet = sheetRef.current;
    if (event.key !== 'Tab' || !sheet) return;
    const items = Array.from(
      sheet.querySelectorAll<HTMLElement>(
        'button:not([disabled]), textarea:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
      )
    );
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === sheet)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }, []);

  // Escape closes the mobile sheet and the lightbox. Either one marks the key
  // as used, on the capture phase, so nothing else reacts to the same press.
  // The phone sheet is unmounted while disguised, so a sheet left open from
  // before the boss key must not swallow Escape either.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (lightboxImage) {
        event.preventDefault();
        setLightboxImage(null);
      } else if (!sheetDisguise && !isDesktop && isChatOpen) {
        event.preventDefault();
        closeChatSheet();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [lightboxImage, isDesktop, isChatOpen, closeChatSheet, sheetDisguise]);

  const handleChatSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!chatText.trim() && !attachedImage) return;
    onSendChat(chatText.trim(), attachedImage || undefined, replyingTo ?? undefined);
    playChatSound();
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
      // Cancels the reply only; the window-level Escape must not close the sheet too.
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
  const rematchDisabled = rematchUnavailable || rematchPending || (!isAiMode && gameStatus !== 'ended');

  /* -------------------------- spreadsheet bridge -------------------------- */

  // While disguised the rail and the chat column are gone, and the Sheets
  // toolbar and menus run the same actions instead. They are published with
  // exactly the rail's rules, so a greyed-out "Undo" in the toolbar means the
  // same as a greyed-out Take back here. The callbacks change identity on
  // every parent render, so the published run() functions go through a ref and
  // the store only changes when a flag or a label does. The labels are what
  // the chrome speaks to a screen reader beside its Sheets wording, so they
  // are Vietnamese like everything else in the disguise.
  const callbacksRef = useRef({ onExitMatch, onProposeUndo, onProposeRematch, onResign, onTakeSeat });
  useEffect(() => {
    callbacksRef.current = { onExitMatch, onProposeUndo, onProposeRematch, onResign, onTakeSeat };
  });
  const runners = useMemo(
    () => ({
      exit: () => callbacksRef.current.onExitMatch(),
      undo: () => callbacksRef.current.onProposeUndo(),
      rematch: () => callbacksRef.current.onProposeRematch(),
      resign: () => callbacksRef.current.onResign(),
      takeSeat: () => callbacksRef.current.onTakeSeat?.(),
    }),
    []
  );
  const isViewer = role === 'viewer';
  const undoDisabled = !allowUndo || gameStatus !== 'playing' || !canUndo;
  const resignDisabled = canResign === undefined ? gameStatus !== 'playing' : !canResign;
  const canTakeSeat = Boolean(openSeat && onTakeSeat);
  useEffect(() => {
    sheetActionsStore.set((prev) => ({
      ...prev,
      exit: { run: runners.exit, disabled: false, pending: false, label: isAiMode ? 'Thoát ván luyện tập' : 'Rời phòng' },
      undo: isViewer ? null : { run: runners.undo, disabled: undoDisabled, pending: undoPending, label: 'Xin đi lại' },
      rematch: isViewer
        ? null
        : {
            run: runners.rematch,
            disabled: rematchDisabled,
            pending: rematchPending,
            label: isAiMode ? 'Ván mới' : 'Tái đấu',
          },
      resign:
        isViewer || isAiMode ? null : { run: runners.resign, disabled: resignDisabled, pending: false, label: 'Đầu hàng' },
      takeSeat: isViewer
        ? {
            run: runners.takeSeat,
            disabled: !canTakeSeat,
            pending: false,
            label: openSeat ? `Vào ghế ${openSeat}` : 'Vào ghế',
          }
        : null,
    }));
  }, [runners, isViewer, isAiMode, undoDisabled, undoPending, rematchDisabled, rematchPending, resignDisabled, canTakeSeat, openSeat]);
  // The room's own Share entry belongs to the room, not to this match, so it
  // survives the match's actions being taken down.
  useEffect(() => () => sheetActionsStore.set((prev) => ({ ...EMPTY_SHEET_ACTIONS, share: prev.share })), []);

  // The comments panel counts what arrived while nobody was looking. "Looking"
  // is whichever chat is on screen: the comments panel in disguise, the chat
  // column otherwise, so lines read before the boss key are not news after it.
  const { commentsOpen } = useSheetUi();
  const chatInView = sheetDisguise ? commentsOpen : isChatOpen;
  const [sheetSeenCount, setSheetSeenCount] = useState(chatMessages.length);
  if (chatInView && sheetSeenCount !== chatMessages.length) setSheetSeenCount(chatMessages.length);
  const sheetUnread = chatInView
    ? 0
    : chatMessages
        .slice(Math.min(sheetSeenCount, chatMessages.length))
        .filter((message) => !message.system && !isOwnMessage(message)).length;

  // The comments panel sends text, emote shortcuts, images and replies.
  const sendChatRef = useRef(onSendChat);
  const answerOfferRef = useRef(onAnswerDoubleDown);
  useEffect(() => {
    sendChatRef.current = onSendChat;
    answerOfferRef.current = onAnswerDoubleDown;
  });
  const canAnswerOffers = Boolean(onAnswerDoubleDown);
  useEffect(() => {
    sheetChatStore.set({
      messages: chatMessages,
      send: (text: string, image?: string, replyTo?: ChatMessage) => {
        sendChatRef.current(text, image, replyTo);
        playChatSound();
      },
      isOwn: isOwnMessage,
      unread: sheetUnread,
      available: !isAiMode,
      answerOffer: canAnswerOffers ? (accept: boolean) => answerOfferRef.current?.(accept) : undefined,
    });
  }, [chatMessages, isOwnMessage, sheetUnread, isAiMode, playChatSound, canAnswerOffers]);
  // The game's chat opens itself for an offer waiting on an answer (above);
  // under the disguise the comments panel is where its buttons are.
  useEffect(() => {
    if (answerableOfferId && sheetDisguise) updateSheetUi({ commentsOpen: true });
  }, [answerableOfferId, sheetDisguise]);
  useEffect(() => () => sheetChatStore.set(null), []);

  // Who sits where, compared by value: the clocks tick every second and the
  // caller rebuilds this object on every render, but the store should only
  // change when something it shows has.
  const sheetMatchKey = JSON.stringify(sheetMatch);
  useEffect(() => {
    sheetMatchStore.set(JSON.parse(sheetMatchKey) as SheetMatch | null);
  }, [sheetMatchKey]);
  useEffect(() => () => sheetMatchStore.set(null), []);
  // One row of icons rather than a wrap of labelled buttons: every action here
  // is either rare or destructive, and none of them should out-shout the board.
  const actionButtons = <GameActionRail {...{ exitLabel, isAiMode, onExitMatch, simulationCount, role, openSeat, onTakeSeat, undoTitle, onProposeUndo, allowUndo, gameStatus, canUndo, undoPending, onProposeRematch, rematchDisabled, rematchPending, onResign, canResign, gearRef, prefsRef, isPrefsOpen, setIsPrefsOpen, prefs, doubleDown, onOfferDoubleDown }} />;
  const reactionRow = <GameReactionPicker open={isReactionsOpen} isAiMode={isAiMode} anchorRef={emoteButtonRef} onPick={handlePickEmote} onClose={() => setIsReactionsOpen(false)} />;

  const chatFeed = <GameChatFeed messages={chatMessages} emptyText={chatEmptyText} opponent={opponent} avatarFor={avatarFor} listRef={listRef} onScroll={handleFeedScroll} isOwn={isOwnMessage} onOpenImage={setLightboxImage} onReply={isAiMode ? undefined : startReply} onAnswerDoubleDown={onAnswerDoubleDown} hasNewBelow={hasNewBelow} onShowNew={() => scrollFeedToBottom(true)} />;
  const composer = <GameChatComposer {...{ attachedImage, setAttachedImage, reactionRow, handleChatSubmit, isAiMode, isReactionsOpen, setIsReactionsOpen, attachmentInputRef, handleAttachmentChange, emoteButtonRef, textareaRef, chatText, setChatText, handleKeyDown, handlePaste, role: role ?? 'player', handleBuzzClick, isBuzzCooldown, replyingTo, onCancelReply: () => setReplyingTo(null) }} />;
  const chatHeader = <GameChatHeader open={isChatOpen} unreadCount={unreadCount} messageCount={chatMessages.length} preview={lastMessagePreview} onToggle={() => setIsChatOpen((open) => !open)} />;

  const lightbox = <GameChatLightbox image={lightboxImage} onClose={() => setLightboxImage(null)} />;

  /* ------------------------------- layout -------------------------------- */

  // The board actions stay in one compact rail. On wide screens it sits above
  // the board, where it is easy to find without making the roster column taller.
  const actionsCell = () => (
    <div className="area-actions relative flex min-h-12 items-center justify-center p-1.5">
      {playerTimers.length > 0 && (
        <div className="absolute left-3 hidden items-start gap-7 xl:flex" aria-label="Player clocks">
          {playerTimers.map(({ piece, seconds, isTurn, moves }) => {
            const color = piece === 'X' ? theme.xColor : piece === 'O' ? theme.oColor : '#7c3aed';
            return (
              <div
                key={piece}
                className={`flex min-w-[6.5rem] flex-col items-start font-mono text-sm font-bold tabular-nums transition-opacity ${
                  isTurn ? 'opacity-100' : 'opacity-70'
                }`}
                style={{ color }}
                title={`${piece} time remaining: ${formatElapsed(seconds)}`}
              >
                <span className="flex items-center gap-2 font-display text-base font-extrabold leading-4">
                  <span>{piece === 'T' ? '△' : piece}</span>
                  <span className="font-mono text-xs font-semibold tabular-nums">{moves}</span>
                </span>
                <span className="mt-0.5 flex items-center gap-1.5 whitespace-nowrap">
                  <Timer size={15} strokeWidth={2.5} aria-hidden="true" />
                  <span>{formatElapsed(seconds)}</span>
                </span>
              </div>
            );
          })}
        </div>
      )}
      {actionButtons}
      <div
        className="absolute right-2 flex flex-col items-end px-2 py-1 font-mono font-semibold text-muted tabular-nums"
        title={`${moveCount} moves; match elapsed time`}
      >
        <span className="text-[10px] leading-3">{moveCount} {moveCount === 1 ? 'move' : 'moves'}</span>
        <span className="flex items-center gap-2 text-sm">
          <Timer size={16} strokeWidth={2.5} aria-hidden="true" />
          <span>{formatElapsed(elapsedGameTime)}</span>
        </span>
      </div>
    </div>
  );

  /* ------------------------------- layouts ------------------------------- */

  // Four layouts share one tree, and the board sits at the same place in all
  // of them: the second child of the root, after a slot that may be empty.
  // React keeps a child mounted only while its position in the tree holds, and
  // the boss key flips layouts at will. With separate trees per layout every
  // flip mounted a new Board, which threw away the sketches, the scroll and
  // the centring, and whose auto-disguise put the disguise straight back on,
  // so the star could never peek at the real game.
  //
  // Disguised, the whole window becomes one Sheets document. Roster, rail and
  // chat are unmounted rather than hidden, so nothing of the game's own UI can
  // flash through; the board (which draws the Sheets chrome around itself)
  // fills the main column, chat reappears as the comments panel, and the
  // Workspace strip closes off the right edge the way real Sheets does. One
  // shell serves practice, desktop and phone alike.
  const layout: 'sheet' | 'solo' | 'desktop' | 'mobile' = sheetDisguise
    ? 'sheet'
    : isAiMode
    ? 'solo'
    : isDesktop
    ? 'desktop'
    : 'mobile';

  const rootClassName =
    layout === 'sheet'
      ? 'sheet-shell fixed inset-0 z-[45] flex bg-white'
      : layout === 'solo'
      ? 'match-stage match-stage--solo'
      : 'match-stage';

  return (
    <div className={rootClassName}>
      {layout === 'sheet' ? null : (
        <div className="area-left">
          {headerNode}
          {rosterNode}
          {layout !== 'mobile' && <div className="flex-1 min-h-0" />}
        </div>
      )}

      {/* The board's slot. In the shell the board node, which centres its
          content for the game's own layout, has to stretch instead, or the
          Sheets chrome would shrink to the grid. */}
      <div
        className={
          layout === 'sheet' ? 'flex min-h-0 min-w-0 flex-1 flex-col *:min-h-0 *:items-stretch' : 'area-board pt-2'
        }
      >
        {layout === 'solo' || layout === 'desktop' ? (
          <div className="mx-auto mb-2 w-full max-w-[1200px]">{actionsCell()}</div>
        ) : null}
        {boardNode}
      </div>

      {layout === 'sheet' ? (
        <>
          {commentsOpen && <SheetComments onOpenImage={setLightboxImage} />}
          <SheetSideStrip />
        </>
      ) : null}

      {layout === 'desktop' ? (
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
            {composer}
          </div>
        </aside>
      ) : null}

      {layout === 'mobile' ? (
        <>
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
              aria-describedby="chat-bar-preview"
              className="flex h-full w-full items-center justify-between gap-2 rounded-full bg-surface-2 px-4 text-left transition-colors hover:bg-surface-3"
            >
              {/* One line, always. A long or multi-line message would otherwise
                  grow the bar past the strip the page reserves for it. */}
              <div className="flex min-w-0 items-center gap-2">
                <span id="chat-bar-preview" className="min-w-0 truncate text-[13px] font-medium text-muted">
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
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="chat-sheet-title"
            aria-hidden={isChatOpen ? undefined : true}
            inert={!isChatOpen}
            tabIndex={-1}
            onKeyDown={trapSheetFocus}
            className={`fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-2xl outline-none border-t border-line bg-surface shadow-2xl transition-transform duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] ${
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
              {composer}
            </div>
          </div>
        </>
      ) : null}

      {lightbox}
    </div>
  );
};
