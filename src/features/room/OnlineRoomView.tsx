import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import { Board } from '../game/Board';
import type { BoardCorner } from '../game/Board';
import { MatchHeader } from '../game/MatchHeader';
import type { SeatView } from '../game/MatchHeader';
import { GameControls } from '../game/GameControls';
import { useIsDesktop } from '../../shared/hooks/useMediaQuery';
import { useSound } from '../../shared/hooks/useSound';
import { RoomRoster } from './RoomRoster';
import { TeaseToast } from './TeaseToast';
import { CoinTossModal } from '../minigames/CoinTossModal';
import { RockPaperScissorsModal } from '../minigames/RockPaperScissorsModal';
import { OnlineRoomLobby } from './OnlineRoomLobby';
import { HostLostStrip, OnlineRoomConnecting, RoomConfirmDialog } from './OnlineRoomOverlays';
import type { Seat } from './protocol';
import { DISCARD_GUARD_MS, MAX_MEMBERS, SEATS, activeSeats, boardFromMoves, latestResult, otherSeat, pieceAt } from './roomEngine';
import type { Member } from './roomEngine';
import { describeRating } from './roomRating';
import { LEFT_HOW, resultReason } from './roomCopy';
import { memberProfile } from './OnlineRoomTypes';
import type { ConfirmSpec, OnlineRoomProps } from './OnlineRoomTypes';

export const OnlineRoom: React.FC<OnlineRoomProps> = ({ room, user, onOpenRules, onViewMyProfile, onViewProfile, exitRef }) => {
  const isDesktop = useIsDesktop();
  const { playWinSound, playTimerWarningSound, playClickSound, playBuzzSound } = useSound();
  const [confirmSpec, setConfirmSpec] = useState<ConfirmSpec | null>(null);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [dismissedPromptAt, setDismissedPromptAt] = useState<number | null>(null);

  const s = room.state;
  const me = room.memberId;
  const mySeat = room.mySeat;
  const game = s?.game ?? null;
  const phase = s?.phase ?? 'waiting';
  const members = useMemo(() => s?.members ?? [], [s?.members]);
  const myMember = members.find((m) => m.id === me) ?? null;
  const occupantOf = (seat: Seat): Member | null => (s ? (members.find((m) => m.id === s.seats[seat]) ?? null) : null);
  const requiredSeats = s ? activeSeats(game?.settings ?? s.settings) : [];
  const bothSeated = Boolean(s && requiredSeats.every((seat) => s.seats[seat]));
  const connected = room.status === 'connected';
  const isViewer = mySeat === null;
  const emptySeat: Seat | null = s ? (requiredSeats.find((seat) => s.seats[seat] === null) ?? null) : null;
  // A player who gave up a seat in this game may not take one again in it.
  const barred = Boolean(phase === 'paused' && game && myMember && game.gaveUp.includes(myMember.profile.uid));
  const openSeat: Seat | null = phase !== 'countdown' && connected && isViewer && !barred ? emptySeat : null;
  const clocks = room.clocksNow();
  const settings = game?.settings ?? s?.settings;
  const result = s ? latestResult(s) : null;
  const shownResult = phase === 'ended' && result && game && result.gameId === game.id ? result : null;
  const roomLink = room.roomId ? `${window.location.origin}?room=${room.roomId}` : '';
  // This hook must run while the room is still connecting too. Returning from
  // the loading view before it ran made React see an extra hook once a room
  // state arrived, crashing every player-vs-player room.
  const moves = game?.moves ?? [];
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
        title: 'Close the room?',
        body: `Everyone here (${others}) is sent home${game ? ' and the game ends without a result' : ''}.`,
        confirmLabel: 'Close the room',
        cancelLabel: 'Stay',
        tone: 'danger',
        onConfirm: leaveNow,
      });
      return;
    }
    if (mySeat && (phase === 'opening' || phase === 'playing' || phase === 'paused' || phase === 'countdown')) {
      setConfirmSpec({
        title: 'Leave the room?',
        body: 'The game pauses and your seat opens for someone else. You can come back as a viewer.',
        confirmLabel: 'Leave the room',
        cancelLabel: 'Stay',
        tone: 'danger',
        onConfirm: leaveNow,
      });
      return;
    }
    leaveNow();
  }, [s, room.isHost, game, mySeat, phase, leaveNow]);

  useEffect(() => {
    exitRef.current = requestExit;
    return () => {
      exitRef.current = null;
    };
  }, [exitRef, requestExit]);

  const requestBecomeViewer = () => {
    if (phase === 'opening' || phase === 'playing' || phase === 'paused' || phase === 'countdown') {
      setConfirmSpec({
        title: 'Give up your seat?',
        body: 'The game pauses until someone takes your seat and carries on from this position. You cannot sit back down in this game.',
        confirmLabel: 'Become a viewer',
        cancelLabel: 'Keep playing',
        onConfirm: () => room.becomeViewer(),
      });
      return;
    }
    room.becomeViewer();
  };

  const requestResign = () => {
    if (phase !== 'playing') return;
    setConfirmSpec({
      title: 'Resign this game?',
      body: 'The game ends now and counts as a loss for you.',
      confirmLabel: 'Resign',
      cancelLabel: 'Keep playing',
      tone: 'danger',
      onConfirm: () => room.resign(),
    });
  };

  const requestDiscard = () =>
    setConfirmSpec({
      title: 'End this game without a result?',
      body: 'Nobody wins or loses, and the room waits for two players again.',
      confirmLabel: 'End the game',
      cancelLabel: 'Keep waiting',
      tone: 'danger',
      onConfirm: () => room.discardGame(),
    });

  const copyRoomLink = async () => {
    if (!roomLink) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(roomLink);
      setCopyState('copied');
      setTimeout(() => setCopyState('idle'), 2500);
    } catch {
      setCopyState('failed');
    }
  };

  const shareRoomLink = async () => {
    if (!roomLink || !navigator.share) return;
    try {
      await navigator.share({ title: 'Play Caro with me', url: roomLink });
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
      confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } });
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
    const original = document.title;
    document.title = `(Seat open) ${original}`;
    playClickSound();
    const restore = () => {
      if (!document.hidden) document.title = original;
    };
    document.addEventListener('visibilitychange', restore);
    return () => {
      document.removeEventListener('visibilitychange', restore);
      document.title = original;
    };
  }, [titleMarkNeeded, playClickSound]);

  /* ------------------------------- views ------------------------------ */

  const confirmDialog = <RoomConfirmDialog spec={confirmSpec} onDismiss={() => setConfirmSpec(null)} />;

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
      onViewProfile={(member) => (member.id === me ? onViewMyProfile() : onViewProfile(memberProfile(member)))}
      onCopyInvite={copyRoomLink}
      collapsible={!isDesktop}
    />
  );

  // Not in the room yet: opening, joining, or finding the way back in.
  if (!s) {
    return <OnlineRoomConnecting status={room.status} roomId={room.roomId} seconds={room.hostGraceSecondsLeft} onCancel={leaveNow} />;
  }

  const hostLostStrip = room.status === 'host_lost' ? <HostLostStrip seconds={room.hostGraceSecondsLeft} /> : null;
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
  const turn = game?.turn ?? 'X';
  const mover = occupantOf(turn);
  const moverName = mover?.profile.name ?? `Seat ${turn}`;

  const seatView = (seat: Seat): SeatView => {
    const occupant = occupantOf(seat);
    const bank = settings && settings.totalTimeMinutes > 0 && clocks ? Math.ceil(clocks[seat] / 1000) : 0;
    const isTurn = phase === 'playing' && turn === seat;
    const moveClock = isTurn && settings && settings.turnTimeSeconds > 0 && clocks ? Math.ceil(clocks.turn / 1000) : 0;
    if (!occupant) {
      return {
        name: 'Open seat',
        piece: seat,
        clock: bank,
        moveClock: 0,
        isTurn: false,
        title: `Seat ${seat} is open`,
        empty: true,
        action: openSeat === seat ? { label: `Take seat ${seat}`, onClick: () => room.takeSeat(seat), tone: 'primary' } : undefined,
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
      tag: isMine ? 'You' : occupant.isHost ? 'Host' : undefined,
      onClick: isMine ? onViewMyProfile : () => onViewProfile(memberProfile(occupant)),
      title: isMine ? 'View and edit your profile' : `View ${occupant.profile.name}'s profile`,
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

  const announcement =
    phase === 'paused'
      ? 'Game paused'
      : phase === 'ended'
      ? 'Game over'
      : phase === 'countdown'
      ? 'Get ready'
      : mySeat
      ? turn === mySeat
        ? 'Your turn'
        : `${moverName}'s turn`
      : `${moverName} (${turn}) to move`;

  // ---- the paused overlay
  let paused: { title: string; body?: string; actions?: React.ReactNode } | null = null;
  if (room.status === 'host_lost') {
    paused = {
      title: `Waiting for the host… ${room.hostGraceSecondsLeft ?? ''}s`,
      body: 'The clocks are stopped. The room closes if the host does not come back.',
    };
  } else if (phase === 'paused' && game) {
    const away = SEATS.map(occupantOf).find((m) => m && !m.connected) ?? null;
    if (emptySeat) {
      const lastChange = [...game.seatLog].reverse().find((c) => c.seat === emptySeat && c.to === null);
      const previousName = lastChange?.from?.name ?? 'the last player';
      const vacatedAt = game.vacatedAt[emptySeat];
      const guardLeft = vacatedAt === null ? 0 : Math.max(0, DISCARD_GUARD_MS - (room.hostNow() - vacatedAt));
      const canEnd = room.isHost || (mySeat !== null && guardLeft === 0);
      const endButton =
        room.isHost || mySeat ? (
          <button
            onClick={requestDiscard}
            disabled={!canEnd}
            title={canEnd ? undefined : 'A viewer gets a moment to take the seat first'}
            className="btn btn-ghost"
          >
            {canEnd ? 'End game (no result)' : `End game in ${Math.ceil(guardLeft / 1000)}s`}
          </button>
        ) : null;
      if (isViewer) {
        paused = {
          title: `Seat ${emptySeat} is open`,
          body: barred
            ? 'You gave up a seat in this game, so someone else has to take this one.'
            : `Take it to continue ${previousName}'s game as ${emptySeat} from this position.`,
          actions: (
            <>
              {openSeat && (
                <button onClick={() => room.takeSeat(openSeat)} className="btn btn-primary">
                  Take seat {openSeat}
                </button>
              )}
              {endButton}
            </>
          ),
        };
      } else {
        paused = {
          title: `${previousName} ${LEFT_HOW[lastChange?.reason ?? 'stood'] ?? 'stood up'}`,
          body: `The clocks are stopped until someone takes seat ${emptySeat}.`,
          actions: (
            <>
              <button onClick={requestBecomeViewer} className="btn btn-secondary">
                Become viewer
              </button>
              {endButton}
            </>
          ),
        };
      }
    } else if (away) {
      paused = {
        title: 'Game paused',
        body: `Waiting for ${away.profile.name} to reconnect… ${room.graceSecondsLeft(away.id) ?? ''}s`,
      };
    } else {
      paused = { title: 'Game paused', body: 'Resuming shortly…' };
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
        ? { headline: 'Draw', tone: 'text-warning', winnerPiece: null }
        : winner === mineInResult
        ? { headline: 'You win!', tone: 'text-accent-text', winnerPiece: winner }
        : { headline: 'You lose', tone: 'text-danger', winnerPiece: winner }
      : winner === null
      ? { headline: 'Draw', tone: 'text-warning', winnerPiece: null }
      : { headline: `${shownResult.players[winner].name} wins as ${winner}`, tone: 'text-ink', winnerPiece: winner };
    ratingNote = describeRating(shownResult, mineInResult, room.ratingNotes[shownResult.gameId]);
  }

  const countdownCaption = s.countdown?.resuming
    ? `Resuming: ${moverName} (${turn}) to move`
    : mySeat === turn
    ? `You move first, as ${turn}`
    : `${occupantOf(turn)?.profile.name ?? turn} moves first, as ${turn}`;

  const rps = game?.firstMove.method === 'rockPaperScissors' ? game.firstMove : null;
  const myRpsChoice = mySeat === 'X' || mySeat === 'O' ? rps?.choices?.[mySeat] : null;
  const coin = game?.firstMove.method === 'coinFlip' ? game.firstMove : null;
  const hostMember = s.members.find((member) => member.isHost);
  const hostSeat = hostMember
    ? (s.seats.X === hostMember.id ? 'X' : s.seats.O === hostMember.id ? 'O' : null)
    : null;
  const coinChooserSeat = hostSeat && game ? (game.number % 2 === 1 ? hostSeat : otherSeat(hostSeat)) : null;
  const coinChooserName = coinChooserSeat ? occupantOf(coinChooserSeat)?.profile.name ?? coinChooserSeat : 'A player';
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

  return (
    <>
      <GameControls
        headerNode={
          <MatchHeader
            seats={order.map(seatView)}
            score={order.map(scoreOf)}
            announcement={announcement}
            scoreLabel={`Score: ${order.map((seat) => `${seatView(seat).name} ${scoreOf(seat)}`).join(', ')}`}
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
              countdownTitle={s.countdown?.resuming ? 'Resuming' : game?.firstMove.method === 'coinFlip' ? 'Golden coin flip' : 'Get ready'}
              countdownCaption={game?.firstMove.method === 'coinFlip' && game.firstMove.winner
                ? `The coin chose ${game.firstMove.winner}.`
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
        chatMessages={room.chatMessages}
        onSendChat={(text, image) => void room.sendChat(text, image)}
        onSendBuzz={() => {
          const sent = room.buzz();
          if (sent) playBuzzSound();
          return sent;
        }}
        onProposeUndo={() => room.requestUndo()}
        onProposeRematch={() => room.offerRematch()}
        onResign={requestResign}
        onExitMatch={requestExit}
        exitLabel={room.isHost ? 'Close room' : 'Leave room'}
        gameStatus={phase === 'ended' ? 'ended' : 'playing'}
        allowUndo={settings?.allowUndo ?? false}
        isAiMode={false}
        elapsedGameTime={Math.floor((clocks?.elapsed ?? 0) / 1000)}
        canUndo={phase === 'playing' && Boolean(mySeat) && moves.some((_, i) => pieceAt(i, game?.openingSeat, game?.settings) === mySeat)}
        undoPending={undoFrom !== null && undoFrom === mySeat}
        rematchPending={rematchFrom !== null && rematchFrom === mySeat}
        role={isViewer ? 'viewer' : 'player'}
        myChatId={me}
        avatarFor={(m) => members.find((member) => member.id === m.senderId)?.profile.avatar}
        openSeat={openSeat}
        onTakeSeat={() => openSeat && room.takeSeat(openSeat)}
        canResign={phase === 'playing' && bothSeated}
        chatEmptyText="No messages yet. Say hello to the room."
      />

      {/* Take-back: only the other seated player is asked. */}
      {undoFrom && mySeat && mySeat !== undoFrom && (
        <div className="modal-scrim" role="dialog" aria-modal="true" aria-labelledby="undo-request-title">
          <div className="w-full max-w-sm space-y-4 rounded-lg border border-line bg-surface p-6 text-center">
            <h3 id="undo-request-title" className="text-base font-semibold text-ink">
              Take back a move?
            </h3>
            <p className="text-xs text-muted">
              {occupantOf(undoFrom)?.profile.name ?? 'Your opponent'} wants to take back their last move.
            </p>
            <div className="flex gap-2 pt-2">
              <button onClick={() => room.answerUndo(true)} className="btn btn-primary btn-sm flex-1">
                Allow it
              </button>
              <button onClick={() => room.answerUndo(false)} className="btn btn-secondary btn-sm flex-1">
                Decline
              </button>
            </div>
          </div>
        </div>
      )}

      {rematchFrom && mySeat && mySeat !== rematchFrom && (
        <div className="modal-scrim" role="dialog" aria-modal="true" aria-labelledby="rematch-title">
          <div className="w-full max-w-sm space-y-4 rounded-lg border border-line bg-surface p-6 text-center">
            <h3 id="rematch-title" className="text-base font-semibold text-ink">
              Play again?
            </h3>
            <p className="text-xs text-muted">
              {occupantOf(rematchFrom)?.profile.name ?? 'Your opponent'} wants to play another game with the same rules.
            </p>
            <div className="flex gap-2 pt-2">
              <button onClick={() => room.answerRematch(true)} className="btn btn-primary btn-sm flex-1">
                Play again
              </button>
              <button onClick={() => room.answerRematch(false)} className="btn btn-secondary btn-sm flex-1">
                No thanks
              </button>
            </div>
          </div>
        </div>
      )}

      {/* A seat opened while this viewer was watching a finished game. */}
      {seatPrompt && (
        <div
          role="status"
          className="fixed bottom-24 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-2 rounded-full border border-line bg-surface px-3 py-2 shadow-lg"
        >
          <span className="text-xs font-medium text-ink">Seat {seatPrompt} is open</span>
          <button onClick={() => room.takeSeat(seatPrompt)} className="btn btn-primary btn-sm">
            Take seat {seatPrompt}
          </button>
          <button onClick={() => setDismissedPromptAt(room.seatOpened?.at ?? null)} className="btn btn-ghost btn-sm">
            Not now
          </button>
        </div>
      )}

      {hostLostStrip && <div className="fixed left-1/2 top-20 z-[55] w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2">{hostLostStrip}</div>}
      {confirmDialog}
      {teaseToast}
    </>
  );
};


