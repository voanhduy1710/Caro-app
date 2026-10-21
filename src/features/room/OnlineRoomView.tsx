import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import { Board } from '../game/Board';
import type { BoardCorner } from '../game/Board';
import { MatchHeader } from '../game/MatchHeader';
import type { SeatView } from '../game/MatchHeader';
import { GameControls } from '../game/GameControls';
import { useIsDesktop } from '../../shared/hooks/useMediaQuery';
import { isSheetDisguiseActive, useDisguiseMode } from '../game/disguiseMode';
import { sheetActionsStore } from '../game/sheetBridge';
import type { SheetMatch } from '../game/sheetBridge';
import { showSheetSnackbar } from '../game/sheet/sheetSnackbar';
import { useSheetAwareSound } from '../game/sheet/useSheetAwareSound';
import { useTheme } from '../theme/ThemeContext';
import { useT } from '../i18n/language';
import { RoomRoster } from './RoomRoster';
import { TeaseToast } from './TeaseToast';
import { CoinTossModal } from '../minigames/CoinTossModal';
import { RockPaperScissorsModal } from '../minigames/RockPaperScissorsModal';
import { OnlineRoomLobby } from './OnlineRoomLobby';
import { ChatRoomView } from './ChatRoomView';
import { HostLostStrip, OnlineRoomConnecting, RoomConfirmDialog } from './OnlineRoomOverlays';
import type { Seat } from './protocol';
import { CLAIM_DISCONNECT_WIN_MS, DISCARD_GUARD_MS, DOUBLE_DOWN_ANSWER_MOVES, DOUBLE_DOWN_BONUS, GRACE_MS, MAX_MEMBERS, SEATS, activeSeats, boardFromMoves, latestResult, otherSeat, pieceAt } from './roomEngine';
import type { Member } from './roomEngine';
import type { ChatMessage } from '../webrtc/types';
import { describeRating } from './roomRating';
import { LEFT_HOW, resultReason } from './roomCopy';
import { memberProfile } from './OnlineRoomTypes';
import type { ConfirmSpec, OnlineRoomProps } from './OnlineRoomTypes';

const formatReconnectTime = (seconds: number | null | undefined) => {
  if (seconds === null || seconds === undefined) return '';
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
};

export const OnlineRoom: React.FC<OnlineRoomProps> = ({ room, user, onOpenRules, onViewMyProfile, onViewProfile, exitRef }) => {
  const t = useT();
  const isDesktop = useIsDesktop();
  const { playWinSound, playTimerWarningSound, playClickSound, playBuzzSound } = useSheetAwareSound();
  // Under the Spreadsheet board the room speaks Sheets: the paused panel
  // always (it is drawn inside the sheet), and the room's own dialogs and
  // pop-ups while the disguise is actually up.
  const { theme } = useTheme();
  const disguiseOn = useDisguiseMode();
  const sheetTheme = theme.boardTheme === 'spreadsheet';
  const sheetDisguise = sheetTheme && disguiseOn;
  const [confirmSpec, setConfirmSpec] = useState<ConfirmSpec | null>(null);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [dismissedPromptAt, setDismissedPromptAt] = useState<number | null>(null);

  const s = room.state;
  const me = room.memberId;
  const mySeat = room.mySeat;
  const game = s?.game ?? null;
  const phase = s?.phase ?? 'waiting';
  const members = useMemo(() => s?.members ?? [], [s?.members]);
  const occupantOf = (seat: Seat): Member | null => (s ? (members.find((m) => m.id === s.seats[seat]) ?? null) : null);
  const requiredSeats = s ? activeSeats(game?.settings ?? s.settings) : [];
  const bothSeated = Boolean(s && requiredSeats.every((seat) => s.seats[seat]));
  const connected = room.status === 'connected';
  const isViewer = mySeat === null;
  const emptySeat: Seat | null = s ? (requiredSeats.find((seat) => s.seats[seat] === null) ?? null) : null;
  // A player who gave up a seat in this game may not take one again in it.
  const openSeat: Seat | null = phase !== 'countdown' && connected && isViewer ? emptySeat : null;
  const clocks = room.clocksNow();
  const settings = game?.settings ?? s?.settings;
  const result = s ? latestResult(s) : null;
  const shownResult = phase === 'ended' && result && game && result.gameId === game.id ? result : null;
  const roomLink = room.roomId ? `${window.location.origin}?room=${room.roomId}` : '';
  // This hook must run while the room is still connecting too. Returning from
  // the loading view before it ran made React see an extra hook once a room
  // state arrived, crashing every player-vs-player room.
  const moves = game?.moves ?? [];
  // A live double-down offer rides at the bottom of the chat until it is answered.
  const doubleDownFrom = game && (phase === 'playing' || phase === 'paused') ? game.doubleDown?.pending ?? null : null;
  const doubleDownOfferer = doubleDownFrom ? occupantOf(doubleDownFrom) : null;
  const canAnswerDoubleDown = Boolean(doubleDownFrom && mySeat && mySeat === otherSeat(doubleDownFrom));
  const chatMessages = useMemo<ChatMessage[]>(() => {
    if (!doubleDownFrom || !game) return room.chatMessages;
    const offer: ChatMessage = {
      id: `double-down-${game.id}-${doubleDownFrom}`,
      senderId: doubleDownOfferer?.id,
      sender: doubleDownOfferer?.profile.name ?? t('room.yourOpponent'),
      text: t('room.dd.offered', { name: doubleDownOfferer?.profile.name ?? t('room.yourOpponent') }),
      timestamp: Date.now(),
      doubleDownOffer: { canAnswer: canAnswerDoubleDown, movesLeft: game.doubleDown?.answerMovesLeft ?? DOUBLE_DOWN_ANSWER_MOVES },
    };
    return [...room.chatMessages, offer];
    // The offer is rebuilt only when something it shows changes, so the feed does not re-scroll on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.chatMessages, game?.id, game?.doubleDown?.answerMovesLeft, doubleDownFrom, doubleDownOfferer?.id, doubleDownOfferer?.profile.name, canAnswerDoubleDown, t]);
  // A seated player's newest line reads "Seen" once a player in another seat
  // has read up to it or past it. Viewers neither get the label nor count.
  const chatReceipt = useMemo(() => {
    if (!s || !me || !mySeat) return null;
    const lines = room.chatMessages;
    let mine = -1;
    for (let i = lines.length - 1; i >= 0 && mine < 0; i--) if (!lines[i].system && lines[i].senderId === me) mine = i;
    if (mine < 0) return null;
    const seen = (['X', 'O', 'T'] as Seat[]).some((seat) => {
      const reader = s.seats[seat];
      const upTo = reader && seat !== mySeat ? room.chatSeen[reader] : undefined;
      return upTo !== undefined && lines.findIndex((line) => line.id === upTo) >= mine;
    });
    return { messageId: lines[mine].id, seen };
  }, [s, me, mySeat, room.chatMessages, room.chatSeen]);
  const placementCorners = useMemo<Record<string, BoardCorner>>(
    () =>
      Object.fromEntries(
        moves.map(([row, col], index) => [`${row}:${col}`, game?.moveCorners?.[index] ?? 'center']),
      ) as Record<string, BoardCorner>,
    [moves, game?.moveCorners],
  );

  /* ------------------------------ flows ------------------------------ */

  const leaveNow = useCallback(() => room.leaveRoom(), [room]);

  const requestExit = useCallback(() => {
    if (!s) {
      leaveNow();
      return;
    }
    if (room.isHost) {
      const others = s.members.length - 1;
      if (others === 0) {
        leaveNow();
        return;
      }
      setConfirmSpec({
        title: t('room.confirm.closeTitle'),
        body: t(game ? 'room.confirm.closeBodyGame' : 'room.confirm.closeBody', { others }),
        confirmLabel: t('room.confirm.closeConfirm'),
        cancelLabel: t('room.confirm.stay'),
        sheet: {
          title: 'Xóa tệp này?',
          body: 'Mọi người đang mở tệp sẽ mất quyền truy cập.',
          confirmLabel: 'Xóa',
          cancelLabel: 'Hủy',
        },
        tone: 'danger',
        onConfirm: leaveNow,
      });
      return;
    }
    if (mySeat && (phase === 'opening' || phase === 'playing' || phase === 'paused' || phase === 'countdown')) {
      setConfirmSpec({
        title: t('room.confirm.leaveTitle'),
        body: t('room.confirm.leaveBody'),
        confirmLabel: t('room.confirm.leaveConfirm'),
        cancelLabel: t('room.confirm.stay'),
        sheet: {
          title: 'Đóng tệp?',
          body: 'Bạn có thể mở lại tệp này sau với quyền xem.',
          confirmLabel: 'Đóng',
          cancelLabel: 'Hủy',
        },
        tone: 'danger',
        onConfirm: leaveNow,
      });
      return;
    }
    leaveNow();
  }, [s, room.isHost, game, mySeat, phase, leaveNow, t]);

  useEffect(() => {
    exitRef.current = requestExit;
    return () => {
      exitRef.current = null;
    };
  }, [exitRef, requestExit]);

  const requestKick = (member: Member) => {
    const seated = s ? SEATS.some((seat) => s.seats[seat] === member.id) : false;
    const midGame = phase === 'opening' || phase === 'playing' || phase === 'paused';
    setConfirmSpec({
      title: t('room.confirm.kickTitle', { name: member.profile.name }),
      body: seated && midGame
        ? t('room.confirm.kickBodySeated')
        : t('room.confirm.kickBody'),
      confirmLabel: t('room.confirm.kick'),
      cancelLabel: t('common.cancel'),
      sheet: {
        title: `Xóa quyền truy cập của ${member.profile.name}?`,
        body: 'Người này sẽ không thể mở tệp nữa cho đến khi được chia sẻ lại.',
        confirmLabel: 'Xóa quyền truy cập',
        cancelLabel: 'Hủy',
      },
      tone: 'danger',
      onConfirm: () => room.kickMember(member.id),
    });
  };

  const requestBecomeViewer = () => {
    if (phase === 'opening' || phase === 'playing' || phase === 'paused' || phase === 'countdown') {
      setConfirmSpec({
        title: t('room.confirm.giveUpTitle'),
        body: t('room.confirm.giveUpBody'),
        confirmLabel: t('room.confirm.becomeViewer'),
        cancelLabel: t('room.keepPlaying'),
        sheet: {
          title: 'Từ bỏ quyền chỉnh sửa?',
          body: 'Bạn sẽ chỉ còn quyền xem tệp này.',
          confirmLabel: 'Từ bỏ',
          cancelLabel: 'Hủy',
        },
        onConfirm: () => room.becomeViewer(),
      });
      return;
    }
    room.becomeViewer();
  };

  const requestResign = () => {
    if (phase !== 'playing') return;
    setConfirmSpec({
      title: t('room.confirm.resignTitle'),
      body: t('room.confirm.resignBody'),
      confirmLabel: t('room.confirm.resign'),
      cancelLabel: t('room.keepPlaying'),
      sheet: {
        title: 'Chuyển vào thùng rác?',
        body: 'Tệp sẽ được chuyển vào thùng rác.',
        confirmLabel: 'Chuyển vào thùng rác',
        cancelLabel: 'Hủy',
      },
      tone: 'danger',
      onConfirm: () => room.resign(),
    });
  };

  const requestDiscard = () =>
    setConfirmSpec({
      title: t('room.confirm.discardTitle'),
      body: t('room.confirm.discardBody'),
      confirmLabel: t('room.confirm.discard'),
      cancelLabel: t('room.confirm.keepWaiting'),
      sheet: {
        title: 'Hủy các thay đổi?',
        body: 'Các thay đổi trong phiên này sẽ không được lưu.',
        confirmLabel: 'Hủy thay đổi',
        cancelLabel: 'Quay lại',
      },
      tone: 'danger',
      onConfirm: () => room.discardGame(),
    });

  /** Resolves to whether the link actually reached the clipboard. */
  const copyRoomLink = async () => {
    if (!roomLink) return false;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(roomLink);
      setCopyState('copied');
      setTimeout(() => setCopyState('idle'), 2500);
      return true;
    } catch {
      setCopyState('failed');
      return false;
    }
  };

  // The Spreadsheet disguise's "Share" button copies the invite link, through
  // the very same function the roster's copy button uses. The function is
  // rebuilt every render, so the published action calls it through a ref and
  // only changes when there starts or stops being a link to copy.
  const copyRoomLinkRef = useRef(copyRoomLink);
  useEffect(() => {
    copyRoomLinkRef.current = copyRoomLink;
  });
  const hasRoomLink = Boolean(roomLink);
  useEffect(() => {
    sheetActionsStore.set((prev) => ({
      ...prev,
      share: {
        // The snackbar waits for the clipboard: a copy can fail outside a
        // secure context or without permission, and the roster that would
        // otherwise say so is not on screen while disguised.
        run: () =>
          void copyRoomLinkRef
            .current()
            .then((copied) =>
              showSheetSnackbar(copied ? 'Đã sao chép đường liên kết' : 'Không thể sao chép đường liên kết'),
            ),
        disabled: !hasRoomLink,
        pending: false,
        label: 'Sao chép đường liên kết mời',
      },
    }));
    return () => sheetActionsStore.set((prev) => ({ ...prev, share: null }));
  }, [hasRoomLink]);

  const shareRoomLink = async () => {
    if (!roomLink || !navigator.share) return;
    try {
      await navigator.share({ title: t('room.shareTitle'), url: roomLink });
    } catch {
      // A cancelled share sheet is not a failure worth reporting.
    }
  };

  /* ------------------------------ effects ----------------------------- */

  // The winner's moment, once per game.
  const celebratedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!shownResult || celebratedRef.current === shownResult.gameId) return;
    celebratedRef.current = shownResult.gameId;
    if (mySeat && shownResult.winner === mySeat && shownResult.players[mySeat].memberId === me) {
      // A burst of confetti over a "spreadsheet" would give the disguise away.
      if (!isSheetDisguiseActive()) confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } });
      playWinSound();
    }
  }, [shownResult, mySeat, me, playWinSound]);

  // Five seconds left on my own move.
  const myMoveSeconds =
    phase === 'playing' && game && mySeat === game.turn && game.settings.turnTimeSeconds > 0 && clocks
      ? Math.ceil(clocks.turn / 1000)
      : null;
  const prevMoveSecondsRef = useRef<number | null>(null);
  useEffect(() => {
    const previous = prevMoveSecondsRef.current;
    prevMoveSecondsRef.current = myMoveSeconds;
    if (myMoveSeconds === 5 && previous !== null && previous > 5) playTimerWarningSound();
  }, [myMoveSeconds, playTimerWarningSound]);

  // A seat opening is news for viewers, and worth a sound and a title mark
  // when they are looking at another tab.
  const seatPrompt =
    room.seatOpened &&
    openSeat &&
    s?.seats[openSeat] === null &&
    dismissedPromptAt !== room.seatOpened.at &&
    phase !== 'paused'
      ? openSeat
      : null;
  const titleMarkNeeded = Boolean(openSeat && room.seatOpened && dismissedPromptAt !== room.seatOpened.at);
  useEffect(() => {
    if (!titleMarkNeeded || !document.hidden) return;
    playClickSound();
    // Under the Spreadsheet disguise the tab title is the fake document's
    // name, and a game-worded prefix there would give the cover away.
    if (isSheetDisguiseActive()) return;
    const original = document.title;
    document.title = t('room.seatOpenTab', { title: original });
    const marked = document.title;
    // Only take the mark back off while it is still there. The disguise may
    // have come on since, and its own tab title must not be replaced with
    // the game's.
    const unmark = () => {
      if (document.title === marked) document.title = original;
    };
    const restore = () => {
      if (!document.hidden) unmark();
    };
    document.addEventListener('visibilitychange', restore);
    return () => {
      document.removeEventListener('visibilitychange', restore);
      unmark();
    };
  }, [titleMarkNeeded, playClickSound, t]);

  /* ------------------------------- views ------------------------------ */

  const confirmDialog = <RoomConfirmDialog spec={confirmSpec} sheet={sheetDisguise} onDismiss={() => setConfirmSpec(null)} />;

  const teaseToast = (
    <TeaseToast notice={room.teaseNotice} onDismiss={room.dismissTease} openSeat={openSeat} onTakeSeat={room.takeSeat} />
  );

  const roster = s && (
    <RoomRoster
      members={members}
      seats={s.seats}
      myMemberId={me}
      capacity={MAX_MEMBERS}
      graceSecondsLeft={room.graceSecondsLeft}
      onPassBaton={mySeat ? requestBecomeViewer : undefined}
      onClearSeat={room.isHost ? room.clearSeat : undefined}
      onKick={room.isHost ? requestKick : undefined}
      onViewProfile={(member) => (member.id === me ? onViewMyProfile() : onViewProfile(memberProfile(member)))}
      onCopyInvite={copyRoomLink}
      collapsible={!isDesktop}
      showSeats={s.mode !== 'chat'}
    />
  );

  // Not in the room yet: opening, joining, or finding the way back in.
  if (!s) {
    return <OnlineRoomConnecting status={room.status} roomId={room.roomId} seconds={room.hostGraceSecondsLeft} onCancel={leaveNow} />;
  }

  const hostLostStrip = room.status === 'host_lost' ? <HostLostStrip seconds={phase === 'playing' || phase === 'paused' ? room.hostClaimSecondsLeft : room.hostGraceSecondsLeft} /> : null;
  /* ------------------------------ chat room ------------------------------ */

  if (s.mode === 'chat') {
    return (
      <ChatRoomView
        room={room} s={s} me={me} members={members}
        copyState={copyState} roomLink={roomLink} copyRoomLink={copyRoomLink} requestExit={requestExit}
        roster={roster} hostLostStrip={hostLostStrip} confirmDialog={confirmDialog}
      />
    );
  }

  /* ----------------------------- waiting room ----------------------------- */

  if (phase === 'waiting') {
    return (
      <OnlineRoomLobby
        room={room} s={s} me={me} isViewer={isViewer} connected={connected} occupantOf={occupantOf}
        copyState={copyState} roomLink={roomLink} copyRoomLink={copyRoomLink} shareRoomLink={shareRoomLink}
        onOpenRules={onOpenRules} requestExit={requestExit} roster={roster} hostLostStrip={hostLostStrip}
        confirmDialog={confirmDialog} teaseToast={teaseToast}
      />
    );
  }

  /* -------------------------------- match -------------------------------- */

  const size = settings?.boardSize ?? 15;
  const board = boardFromMoves(moves, size, game?.openingSeat, game?.settings);
  if (room.pendingMove && mySeat) {
    const [row, col] = room.pendingMove;
    if (board[row]?.[col] === null) board[row][col] = mySeat;
  }
  const lastMove: [number, number] | null =
    room.pendingMove ?? (moves.length ? [moves[moves.length - 1][0], moves[moves.length - 1][1]] : null);
  const moveCounts = { X: 0, O: 0, T: 0 };
  moves.forEach((_, index) => { moveCounts[pieceAt(index, game?.openingSeat, game?.settings)] += 1; });
  const turn = game?.turn ?? 'X';
  const mover = occupantOf(turn);
  const moverName = mover?.profile.name ?? t('room.seatLabel', { seat: turn });

  const seatView = (seat: Seat): SeatView => {
    const occupant = occupantOf(seat);
    const bank = settings && settings.totalTimeMinutes > 0 && clocks ? Math.ceil(clocks[seat] / 1000) : 0;
    const isTurn = phase === 'playing' && turn === seat;
    const moveClock = isTurn && settings && settings.turnTimeSeconds > 0 && clocks ? Math.ceil(clocks.turn / 1000) : 0;
    if (!occupant) {
      return {
        name: t('room.openSeat'),
        piece: seat,
        clock: bank,
        moveClock: 0,
        isTurn: false,
        title: t('room.seatIsOpen', { seat }),
        empty: true,
        action: openSeat === seat ? { label: t('room.takeSeatN', { seat }), onClick: () => room.takeSeat(seat), tone: 'primary' } : undefined,
      };
    }
    const isMine = occupant.id === me;
    return {
      name: occupant.profile.name,
      photoURL: occupant.profile.avatar,
      piece: seat,
      clock: bank,
      moveClock,
      isTurn,
      tag: isMine ? t('common.you') : occupant.isHost ? t('common.host') : undefined,
      onClick: isMine ? onViewMyProfile : () => onViewProfile(memberProfile(occupant)),
      title: isMine ? t('room.viewEditProfile') : t('room.roster.viewProfile', { name: occupant.profile.name }),
      reconnectingSeconds: room.graceSecondsLeft(occupant.id),
    };
  };
  const order: Seat[] = game?.settings.playerMode === 'oneVsOneVsOne'
    ? mySeat
      ? [mySeat, ...SEATS.filter((seat) => seat !== mySeat)]
      : [...SEATS]
    : mySeat
    ? [mySeat, otherSeat(mySeat)]
    : ['X', 'O'];
  const scoreOf = (seat: Seat) => {
    if (game?.settings.playerMode === 'oneVsOneVsOne') return s.score[seat];
    const pair = s.seats.X && s.seats.O ? `${s.seats.X}|${s.seats.O}` : null;
    return pair && s.score.pair === pair ? s.score[seat] : 0;
  };
  // The same seats, in the same order, as the Spreadsheet disguise shows them.
  const sheetMatch: SheetMatch = {
    seats: order.map((seat) => {
      const view = seatView(seat);
      return {
        name: view.name,
        piece: seat,
        isTurn: view.isTurn,
        isMe: seat === mySeat,
        clock: view.clock,
        moveClock: view.moveClock,
        empty: Boolean(view.empty),
      };
    }),
    score: order.map(scoreOf),
    isAiMode: false,
    role: isViewer ? 'viewer' : 'player',
  };

  const announcement =
    phase === 'paused'
      ? t('room.ann.paused')
      : phase === 'ended'
      ? t('room.ann.over')
      : phase === 'countdown'
      ? t('room.getReady')
      : mySeat
      ? turn === mySeat
        ? t('room.ann.yourTurn')
        : t('room.ann.turnOf', { name: moverName })
      : t('room.ann.toMove', { name: moverName, seat: turn });

  // ---- the paused overlay
  // On the Spreadsheet board it is a Sheets dialog in the middle of the grid,
  // so it reads as a document waiting on a collaborator: Vietnamese, no game
  // words, and the buttons named after Sheets' own actions. Claiming a
  // disconnect win becomes "finishing the edit" on one's own.
  const claimLabel = (secondsLeft: number | null) =>
    sheetTheme
      ? secondsLeft && secondsLeft > 0
        ? `Hoàn tất chỉnh sửa sau ${secondsLeft}s`
        : 'Hoàn tất chỉnh sửa'
      : secondsLeft && secondsLeft > 0
      ? t('room.claimIn', { seconds: secondsLeft })
      : t('room.claimDisconnect');
  let paused: { title: string; body?: string; actions?: React.ReactNode } | null = null;
  if (room.status === 'host_lost' && (phase === 'playing' || phase === 'paused')) {
    const host = members.find((member) => member.isHost);
    const canClaimWin = Boolean(game && game.settings.playerMode === 'oneVsOne' && mySeat && host && occupantOf(otherSeat(mySeat))?.id === host.id);
    paused = {
      title: sheetTheme ? 'Đang kết nối lại…' : t('room.paused.waitingHost'),
      body: sheetTheme
        ? 'Mất kết nối với máy chủ. Các thay đổi sẽ được đồng bộ khi có kết nối lại.'
        : t('room.paused.hostBody'),
      actions: canClaimWin ? (
        <button
          onClick={room.claimLostHostWin}
          disabled={room.hostClaimSecondsLeft === null || room.hostClaimSecondsLeft > 0}
          className="btn btn-primary"
        >
          {claimLabel(room.hostClaimSecondsLeft)}
        </button>
      ) : undefined,
    };
  } else if (phase === 'paused' && game) {
    const away = SEATS.map(occupantOf).find((m) => m && !m.connected) ?? null;
    if (emptySeat) {
      const lastChange = [...game.seatLog].reverse().find((c) => c.seat === emptySeat && c.to === null);
      const previousName = lastChange?.from?.name ?? t('room.lastPlayer');
      const vacatedAt = game.vacatedAt[emptySeat];
      const guardLeft = vacatedAt === null ? 0 : Math.max(0, DISCARD_GUARD_MS - (room.hostNow() - vacatedAt));
      const canEnd = room.isHost || (mySeat !== null && guardLeft === 0);
      const endButton =
        room.isHost || mySeat ? (
          <button
            onClick={requestDiscard}
            disabled={!canEnd}
            title={canEnd ? undefined : t('room.endHint')}
            className="btn btn-ghost"
          >
            {sheetTheme
              ? canEnd
                ? 'Hủy thay đổi'
                : `Hủy thay đổi sau ${Math.ceil(guardLeft / 1000)}s`
              : canEnd
              ? t('room.endGame')
              : t('room.endGameIn', { seconds: Math.ceil(guardLeft / 1000) })}
          </button>
        ) : null;
      if (sheetTheme) {
        paused = {
          title: isViewer ? 'Có thể yêu cầu quyền chỉnh sửa' : 'Đang chờ người cộng tác',
          actions: (
            <>
              {isViewer && openSeat && (
                <button onClick={() => room.takeSeat(openSeat)} className="btn btn-primary">
                  Yêu cầu quyền chỉnh sửa
                </button>
              )}
              {!isViewer && (
                <button onClick={requestBecomeViewer} className="btn btn-secondary">
                  Chỉ xem
                </button>
              )}
              {endButton}
            </>
          ),
        };
      } else if (isViewer) {
        paused = {
          title: t('room.seatIsOpen', { seat: emptySeat }),
          body: t('room.paused.openBody', { name: previousName, seat: emptySeat }),
          actions: (
            <>
              {openSeat && (
                <button onClick={() => room.takeSeat(openSeat)} className="btn btn-primary">
                  {t('room.takeSeatN', { seat: openSeat })}
                </button>
              )}
              {endButton}
            </>
          ),
        };
      } else {
        paused = {
          title: `${previousName} ${t(LEFT_HOW[lastChange?.reason ?? 'stood'] ?? 'room.left.stood')}`,
          body: t('room.paused.clocksStopped', { seat: emptySeat }),
          actions: (
            <>
              <button onClick={requestBecomeViewer} className="btn btn-secondary">
                {t('room.becomeViewer')}
              </button>
              {endButton}
            </>
          ),
        };
      }
    } else if (away) {
      const reconnectSeconds = room.graceSecondsLeft(away.id);
      const claimWaitSeconds = reconnectSeconds === null
        ? null
        : Math.max(0, Math.ceil((CLAIM_DISCONNECT_WIN_MS - (GRACE_MS - reconnectSeconds * 1000)) / 1000));
      const canClaimWin =
        game.settings.playerMode === 'oneVsOne' &&
        mySeat !== null &&
        occupantOf(otherSeat(mySeat))?.id === away.id;
      paused = {
        title: sheetTheme ? 'Đang chờ người cộng tác' : t('room.paused.title'),
        body: sheetTheme
          ? `Đang kết nối lại… ${formatReconnectTime(reconnectSeconds)}`
          : t('room.paused.waitingReconnect', { name: away.profile.name, time: formatReconnectTime(reconnectSeconds) }),
        actions: canClaimWin ? (
          <button
            onClick={room.claimDisconnectWin}
            disabled={claimWaitSeconds === null || claimWaitSeconds > 0}
            className="btn btn-primary"
          >
            {claimLabel(claimWaitSeconds)}
          </button>
        ) : undefined,
      };
    } else {
      paused = sheetTheme ? { title: 'Đang đồng bộ…' } : { title: t('room.paused.title'), body: t('room.paused.resuming') };
    }
  }

  // ---- the result card
  let resultView: { headline: string; tone: string; winnerPiece: Seat | null } | null = null;
  let ratingNote: string | null = null;
  if (shownResult) {
    const winner = shownResult.winner === 'DRAW' ? null : shownResult.winner;
    const mineInResult = mySeat && shownResult.players[mySeat].memberId === me ? mySeat : null;
    resultView = mineInResult
      ? winner === null
        ? { headline: t('room.draw'), tone: 'text-warning', winnerPiece: null }
        : winner === mineInResult
        ? { headline: t('room.youWin'), tone: 'text-accent-text', winnerPiece: winner }
        : { headline: t('room.youLose'), tone: 'text-danger', winnerPiece: winner }
      : winner === null
      ? { headline: t('room.draw'), tone: 'text-warning', winnerPiece: null }
      : { headline: t('room.winsAs', { name: shownResult.players[winner].name, seat: winner }), tone: 'text-ink', winnerPiece: winner };
    ratingNote = describeRating(shownResult, mineInResult, room.ratingNotes[shownResult.gameId]);
  }

  const countdownCaption = s.countdown?.resuming
    ? t('room.resumingMove', { name: moverName, seat: turn })
    : mySeat === turn
    ? t('room.youMoveFirst', { seat: turn })
    : t('room.movesFirst', { name: occupantOf(turn)?.profile.name ?? turn, seat: turn });

  const rps = game?.firstMove.method === 'rockPaperScissors' ? game.firstMove : null;
  const myRpsChoice = mySeat === 'X' || mySeat === 'O' ? rps?.choices?.[mySeat] : null;
  const coin = game?.firstMove.method === 'coinFlip' ? game.firstMove : null;
  const hostMember = s.members.find((member) => member.isHost);
  const hostSeat = hostMember
    ? (s.seats.X === hostMember.id ? 'X' : s.seats.O === hostMember.id ? 'O' : null)
    : null;
  const coinChooserSeat = hostSeat && game ? (game.number % 2 === 1 ? hostSeat : otherSeat(hostSeat)) : null;
  const coinChooserName = coinChooserSeat ? occupantOf(coinChooserSeat)?.profile.name ?? coinChooserSeat : t('room.aPlayer');
  const coinCallerName = coin?.callerMemberId ? s.members.find((member) => member.id === coin.callerMemberId)?.profile.name : undefined;
  const preGame = game?.firstMove.method === 'rockPaperScissors' && (phase === 'opening' || phase === 'countdown') && rps
    ? <RockPaperScissorsModal
        myChoice={myRpsChoice ?? null}
        choices={rps.choices ?? { X: null, O: null }}
        isPlayer={mySeat === 'X' || mySeat === 'O'}
        winnerName={rps.winner ? occupantOf(rps.winner)?.profile.name : undefined}
        onChoose={(choice) => room.chooseFirstMove(choice)}
      />
    : game?.firstMove.method === 'coinFlip' && (phase === 'opening' || phase === 'countdown')
    ? <CoinTossModal
        chooserName={coinChooserName}
        canCall={mySeat === coinChooserSeat && coin?.call === null}
        call={game.firstMove.call ?? null}
        face={game.firstMove.face ?? null}
        callerName={coinCallerName}
        winnerName={game.firstMove.winner ? occupantOf(game.firstMove.winner)?.profile.name : undefined}
        onCall={(face) => room.callCoin(face)}
      />
    : null;

  const undoFrom = phase === 'playing' ? game?.undo?.from ?? null : null;
  const rematchFrom = phase === 'ended' ? game?.rematch?.from ?? null : null;
  const opponent = mySeat ? occupantOf(otherSeat(mySeat)) : null;
  const doubleDownState = game?.doubleDown;
  const doubleDownActive = Boolean(doubleDownState?.accepted);
  const doubleDownMine = Boolean(mySeat && doubleDownState?.pending === mySeat);
  const doubleDownUsed = Boolean(mySeat && doubleDownState?.offered.includes(mySeat));
  const doubleDownCanOffer =
    phase === 'playing' && connected && bothSeated && Boolean(mySeat) && !doubleDownActive && !doubleDownState?.pending && !doubleDownUsed;
  const doubleDown = game && s?.mode !== 'casual' && settings?.playerMode !== 'oneVsOneVsOne'
    ? {
        canOffer: doubleDownCanOffer,
        pending: doubleDownMine,
        active: doubleDownActive,
        title: doubleDownActive
          ? t('room.dd.active', { bonus: DOUBLE_DOWN_BONUS })
          : doubleDownMine
          ? t('room.dd.waiting')
          : doubleDownUsed
          ? t('room.dd.used')
          : doubleDownState?.pending
          ? t('room.dd.offerWaiting')
          : phase !== 'playing'
          ? t('room.dd.unavailable')
          : t('room.dd.offer', { bonus: DOUBLE_DOWN_BONUS }),
      }
    : undefined;

  return (
    <>
      <GameControls
        playerTimers={
          settings && clocks
            ? activeSeats(settings).map((piece) => ({
                piece,
                seconds: Math.max(0, Math.ceil((settings.totalTimeMinutes > 0 ? clocks[piece] : clocks.elapsedBySeat[piece]) / 1000)),
                isTurn: phase === 'playing' && turn === piece,
                moves: moveCounts[piece],
              }))
            : []
        }
        headerNode={
          <MatchHeader
            seats={order.map(seatView)}
            score={order.map(scoreOf)}
            announcement={announcement}
            scoreLabel={t('room.scoreLabel', { scores: order.map((seat) => `${seatView(seat).name} ${scoreOf(seat)}`).join(', ') })}
          />
        }
        rosterNode={roster}
        boardNode={
          <div className="flex flex-1 flex-col items-center">
            <Board
              board={board}
              size={size}
              gameId={game?.id}
              lmaoMode={game?.settings.placementMode === 'lmao'}
              threePlayer={game?.settings.playerMode === 'oneVsOneVsOne'}
              placementCorners={placementCorners}
              onCellClick={(row, col, corner) => {
                if (board[row][col] === null) room.move(row, col, corner);
              }}
              lastMove={lastMove}
              winningLine={shownResult?.line ?? null}
              currentTurn={turn}
              disabled={phase !== 'playing' || !connected || !mySeat || mySeat !== turn || room.pendingMove !== null}
              myPiece={mySeat ?? undefined}
              gameStatus={phase === 'ended' ? 'ended' : 'playing'}
              resultView={resultView}
              resultReason={shownResult ? resultReason(shownResult) : undefined}
              ratingNote={ratingNote}
              countdown={phase === 'countdown' ? room.countdownSecondsLeft : null}
              countdownTitle={s.countdown?.resuming ? t('room.resuming') : game?.firstMove.method === 'coinFlip' ? t('room.coinFlip') : t('room.getReady')}
              countdownCaption={game?.firstMove.method === 'coinFlip' && game.firstMove.winner
                ? t('room.coinChose', { seat: game.firstMove.winner })
                : countdownCaption}
              coinFlip={phase === 'countdown' && !preGame && game?.firstMove.method === 'coinFlip' && game.firstMove.winner
                ? { winner: game.firstMove.winner }
                : null}
              rpsReveal={phase === 'countdown' && !preGame && game?.firstMove.method === 'rockPaperScissors' && game.firstMove.winner && game.firstMove.choices?.X && game.firstMove.choices.O
                ? { X: game.firstMove.choices.X, O: game.firstMove.choices.O, winner: game.firstMove.winner as 'X' | 'O' }
                : null}
              preGame={preGame}
              paused={paused}
            />
          </div>
        }
        opponent={opponent ? memberProfile(opponent) : null}
        myUser={user}
        chatMessages={chatMessages}
        chatReceipt={chatReceipt}
        onChatSeen={room.markChatSeen}
        doubleDown={doubleDown}
        onOfferDoubleDown={() => room.offerDoubleDown()}
        onAnswerDoubleDown={(accept) => room.answerDoubleDown(accept)}
        onSendChat={(text, image, replyTo) => void room.sendChat(text, image, replyTo)}
        onSendBuzz={() => {
          const sent = room.buzz();
          if (sent) playBuzzSound();
          return sent;
        }}
        onProposeUndo={() => room.requestUndo()}
        onProposeRematch={() => room.offerRematch()}
        onResign={requestResign}
        onExitMatch={requestExit}
        exitLabel={room.isHost ? t('common.closeRoom') : t('common.leaveRoom')}
        gameStatus={phase === 'ended' ? 'ended' : 'playing'}
        allowUndo={settings?.allowUndo ?? false}
        isAiMode={false}
        elapsedGameTime={Math.floor((clocks?.elapsed ?? 0) / 1000)}
        moveCount={moves.length}
        canUndo={phase === 'playing' && Boolean(mySeat) && moves.some((_, i) => pieceAt(i, game?.openingSeat, game?.settings) === mySeat)}
        undoPending={undoFrom !== null && undoFrom === mySeat}
        rematchPending={rematchFrom !== null && rematchFrom === mySeat}
        rematchUnavailable={!connected}
        role={isViewer ? 'viewer' : 'player'}
        myChatId={me}
        avatarFor={(m) => members.find((member) => member.id === m.senderId)?.profile.avatar}
        openSeat={openSeat}
        onTakeSeat={() => openSeat && room.takeSeat(openSeat)}
        canResign={phase === 'playing' && bothSeated}
        chatEmptyText={t('room.chatEmptyRoom')}
        sheetMatch={sheetMatch}
      />

      {/* Take-back: only the other seated player is asked. The opponent
          triggers it at a moment the player does not choose, so under the
          disguise it asks in Sheets' words (and global CSS keeps it out of
          sight while a fake report is up). */}
      {undoFrom && mySeat && mySeat !== undoFrom && (
        <div className="modal-scrim" role="dialog" aria-modal="true" aria-labelledby="undo-request-title">
          <div className="w-full max-w-sm space-y-4 rounded-lg border border-line bg-surface p-6 text-center">
            <h3 id="undo-request-title" className="text-base font-semibold text-ink">
              {sheetDisguise ? 'Khôi phục phiên bản trước?' : t('room.undo.title')}
            </h3>
            <p className="text-xs text-muted">
              {sheetDisguise
                ? `${occupantOf(undoFrom)?.profile.name ?? 'Người cộng tác'} muốn khôi phục phiên bản trước của tệp.`
                : t('room.undo.body', { name: occupantOf(undoFrom)?.profile.name ?? t('room.yourOpponent') })}
            </p>
            <div className="flex gap-2 pt-2">
              <button onClick={() => room.answerUndo(true)} className="btn btn-primary btn-sm flex-1">
                {sheetDisguise ? 'Cho phép' : t('room.allowIt')}
              </button>
              <button onClick={() => room.answerUndo(false)} className="btn btn-secondary btn-sm flex-1">
                {sheetDisguise ? 'Từ chối' : t('room.decline')}
              </button>
            </div>
          </div>
        </div>
      )}

      {rematchFrom && mySeat && mySeat !== rematchFrom && (
        <div className="modal-scrim" role="dialog" aria-modal="true" aria-labelledby="rematch-title">
          <div className="w-full max-w-sm space-y-4 rounded-lg border border-line bg-surface p-6 text-center">
            <h3 id="rematch-title" className="text-base font-semibold text-ink">
              {sheetDisguise ? 'Tạo bản sao mới?' : t('room.rematch.title')}
            </h3>
            <p className="text-xs text-muted">
              {sheetDisguise
                ? `${occupantOf(rematchFrom)?.profile.name ?? 'Người cộng tác'} muốn tạo một bản sao mới của tệp.`
                : t('room.rematch.body', { name: occupantOf(rematchFrom)?.profile.name ?? t('room.yourOpponent') })}
            </p>
            <div className="flex gap-2 pt-2">
              <button onClick={() => room.answerRematch(true)} className="btn btn-primary btn-sm flex-1">
                {sheetDisguise ? 'Tạo bản sao' : t('room.rematch.accept')}
              </button>
              <button onClick={() => room.answerRematch(false)} className="btn btn-secondary btn-sm flex-1">
                {sheetDisguise ? 'Không, cảm ơn' : t('room.rematch.decline')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* A seat opened while this viewer was watching a finished game. Not
          under the disguise: there it is Tệp > Yêu cầu quyền chỉnh sửa, and
          this pill would float over the sheet in game words. */}
      {seatPrompt && !sheetDisguise && (
        <div
          role="status"
          className="fixed bottom-24 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-2 rounded-full border border-line bg-surface px-3 py-2 shadow-lg"
        >
          <span className="text-xs font-medium text-ink">{t('room.seatIsOpen', { seat: seatPrompt })}</span>
          <button onClick={() => room.takeSeat(seatPrompt)} className="btn btn-primary btn-sm">
            {t('room.takeSeatN', { seat: seatPrompt })}
          </button>
          <button onClick={() => setDismissedPromptAt(room.seatOpened?.at ?? null)} className="btn btn-ghost btn-sm">
            {t('room.notNow')}
          </button>
        </div>
      )}

      {/* The paused panel inside the sheet already says the host is gone. */}
      {hostLostStrip && !sheetDisguise && <div className="fixed left-1/2 top-20 z-[55] w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2">{hostLostStrip}</div>}
      {confirmDialog}
      {teaseToast}
    </>
  );
};


