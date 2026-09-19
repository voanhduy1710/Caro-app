import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import confetti from 'canvas-confetti';
import { useAuth } from '../features/auth/AuthContext';
import { useAvailableRooms } from '../features/webrtc/roomDiscoveryService';
import { useSound } from '../shared/hooks/useSound';
import type { BoardCorner } from '../features/game/Board';
import type { UserProfile } from '../features/auth/AuthContext';
import { DEFAULT_ROOM_SETTINGS } from '../features/settings/types';
import type { RoomSettings } from '../features/settings/types';
import { createEmptyBoard, checkWin, isBoardFull } from '../shared/utils/gomokuLogic';
import type { BoardMatrix } from '../shared/utils/gomokuLogic';
import { useAiEngine } from '../features/game/useAiEngine';
import { saveMatchRecord, resendPendingRatedResults } from '../features/history/historyService';
import { useRoom, readLastRoom, clearLastRoom } from '../features/room/useRoom';
import type { LastRoom } from '../features/room/useRoom';
import { PublicRoomList } from './PublicRoomList';
import { HomePlayActions } from './HomePlayActions';
import { HomeLobbyMeta } from './HomeLobbyMeta';
import { AppFeedback } from './AppFeedback';
import { AppModalStack } from './AppModalStack';
import { AppNavbar } from './AppNavbar';
import { ActiveMatchStage } from './ActiveMatchStage';
import { lmaoCornerFor, nextPracticePiece } from './AppViewShared';
import type { MoveHistoryItem, PracticePiece } from './AppViewShared';
import type { ConfirmSpec } from './AppViewShared';
export const App: React.FC = () => {
  const { user, loading: authLoading, openProfileModal, refreshUserProfile, signInWithCredentials, createAccount } = useAuth();

  // A rated result that could not be sent, because the tab closed mid-request
  // or the network dropped, is kept on this device and sent again once the
  // player is back and signed in.
  const signedInUid = user && !user.isGuest ? user.uid : null;
  useEffect(() => {
    if (authLoading || !signedInUid) return;
    void resendPendingRatedResults();
  }, [authLoading, signedInUid]);
  const { playMoveSound, playWinSound, playTimerWarningSound, playBuzzSound } = useSound();

  // Non-blocking status pill, used instead of window.alert during a live match.
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showNotice = useCallback((message: string) => {
    setNotice(message);
    if (noticeTimeoutRef.current) clearTimeout(noticeTimeoutRef.current);
    noticeTimeoutRef.current = setTimeout(() => setNotice(null), 3200);
  }, []);
  useEffect(() => () => {
    if (noticeTimeoutRef.current) clearTimeout(noticeTimeoutRef.current);
  }, []);

  // Online play: one room at a time, hosted by this tab or joined from another.
  const room = useRoom(user, {
    onNotice: showNotice,
    onMoveApplied: playMoveSound,
    onBuzzed: playBuzzSound,
    onTeased: playBuzzSound,
    onRated: () => void refreshUserProfile(),
  });
  const roomActive =
    room.status === 'opening' || room.status === 'joining' || room.status === 'connected' || room.status === 'host_lost';
  /** The room's own exit flow, which knows whether leaving pauses a game or closes the room. */
  const roomExitRef = useRef<(() => void) | null>(null);

  // Modals state
  const [settingsAndThemeOpen, setSettingsAndThemeOpen] = useState(false);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [selectedOpponentProfile, setSelectedOpponentProfile] = useState<UserProfile | null>(null);

  // Practice game state. Online games live in the room.
  const [roomSettings, setRoomSettings] = useState<RoomSettings>(DEFAULT_ROOM_SETTINGS);
  const [gameStatus, setGameStatus] = useState<'lobby' | 'playing' | 'ended'>('lobby');
  const [board, setBoard] = useState<BoardMatrix>(() => createEmptyBoard(DEFAULT_ROOM_SETTINGS.boardSize));
  const [lastMove, setLastMove] = useState<[number, number] | null>(null);
  const [moveHistory, setMoveHistory] = useState<MoveHistoryItem[]>([]);
  const practicePlacementCorners = useMemo<Record<string, BoardCorner>>(
    () => Object.fromEntries(moveHistory.map((move) => [`${move.row}:${move.col}`, move.corner ?? 'center'])),
    [moveHistory],
  );
  const [winningLine, setWinningLine] = useState<Array<[number, number]> | null>(null);
  const [myPiece, setMyPiece] = useState<PracticePiece>('X');
  const [currentTurn, setCurrentTurn] = useState<PracticePiece>('X');
  const [gameResult, setGameResult] = useState<{ winner: string; reason: string } | null>(null);
  const [isAiMode, setIsAiMode] = useState<boolean>(false);

  // 5-Second Self Undo Tracking Ref
  const lastMoveTimestampRef = useRef<number>(0);

  // Timers state
  const [turnTimeLeft, setTurnTimeLeft] = useState<number>(DEFAULT_ROOM_SETTINGS.turnTimeSeconds);
  const [p1TotalTime, setP1TotalTime] = useState<number>(DEFAULT_ROOM_SETTINGS.totalTimeMinutes * 60);
  const [p2TotalTime, setP2TotalTime] = useState<number>(DEFAULT_ROOM_SETTINGS.totalTimeMinutes * 60);
  const [elapsedGameTime, setElapsedGameTime] = useState<number>(0);

  const [inputRoomCode, setInputRoomCode] = useState('');
  const [isRoomPublic, setIsRoomPublic] = useState(true);

  /** Rating text is only filled in once a real result comes back. */
  const [ratingNote, setRatingNote] = useState<string | null>(null);
  /** Anything destructive asks first through this one dialog. */
  const [confirmSpec, setConfirmSpec] = useState<ConfirmSpec | null>(null);
  /** Distinguishes "still looking" from "nobody is hosting". */
  const [roomScanDone, setRoomScanDone] = useState(false);
  /** Rounds won against the bot since the player sat down. */
  const [sessionScore, setSessionScore] = useState({ mine: 0, theirs: 0, triangle: 0 });

  const { requestMove: requestAiMove, cancelPending: cancelAiMove } = useAiEngine();
  const [isAiThinking, setIsAiThinking] = useState(false);

  // A practice game is over once, however many paths reach the end.
  const matchOverRef = useRef<boolean>(false);
  // Invalidates delayed or in-flight AI work when this practice game is reset.
  // A rematch used to let an old search write its old board back over the new
  // one, which could leave a completed five-in-a-row game playable.
  const practiceGameGenerationRef = useRef(0);

  /** The room this player last left, offered back on the home screen for a while. */
  const [lastRoom, setLastRoom] = useState<LastRoom | null>(() => readLastRoom());
  /** Set while a Rejoin is in flight, so a room that has gone is described as closed. */
  const [rejoinCode, setRejoinCode] = useState<string | null>(null);

  useEffect(() => {
    if (!roomActive) setLastRoom(readLastRoom());
  }, [roomActive]);

  // A Rejoin that finds nobody hosting means the room is gone, not mistyped.
  useEffect(() => {
    if (room.closedReason === 'not_found' && rejoinCode) {
      clearLastRoom();
      setLastRoom(null);
    }
  }, [room.closedReason, rejoinCode]);

  // Rejoin the room in the URL once the profile is known. Joining while `user`
  // was still null announced the player as a nameless guest. The ref keeps it
  // to a single run despite StrictMode.
  const resumedRef = useRef(false);
  useEffect(() => {
    if (resumedRef.current || authLoading) return;
    resumedRef.current = true;
    room.resumeFromUrl(roomSettings);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading]);

  // The browser tests sign in, and make throwaway accounts, through this. It never ships.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const w = window as unknown as { __caro?: Record<string, unknown> };
    w.__caro = {
      ...w.__caro,
      signIn: (username: string, password: string) => signInWithCredentials(username, password),
      createAccount: (username: string, password: string, name?: string) => createAccount(username, password, name),
      me: () => user,
    };
  });

  // Sync board dimensions on settings change in lobby
  useEffect(() => {
    if (gameStatus === 'lobby') {
      setBoard(createEmptyBoard(roomSettings.boardSize));
      setTurnTimeLeft(roomSettings.turnTimeSeconds);
      const totalSec = roomSettings.totalTimeMinutes * 60;
      setP1TotalTime(totalSec);
      setP2TotalTime(totalSec);
    }
  }, [roomSettings, gameStatus]);

  // Turn Countdown Timer Loop. The updater only subtracts; anything with a side
  // effect reacts to the resulting value, because a state updater must be pure.
  useEffect(() => {
    if (gameStatus !== 'playing' || roomSettings.turnTimeSeconds === 0) return;

    const timer = setInterval(() => {
      setTurnTimeLeft((prev) => (prev <= 0 ? 0 : prev - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [gameStatus, currentTurn, roomSettings.turnTimeSeconds]);

  // Chess Clock Total Match Time Loop
  useEffect(() => {
    if (gameStatus !== 'playing' || roomSettings.totalTimeMinutes === 0) return;

    const timer = setInterval(() => {
      const tick = (prev: number) => (prev <= 0 ? 0 : prev - 1);
      if (currentTurn === 'X') setP1TotalTime(tick);
      else setP2TotalTime(tick);
    }, 1000);

    return () => clearInterval(timer);
  }, [gameStatus, currentTurn, roomSettings.totalTimeMinutes]);

  // Overall Match Elapsed Game Timer
  useEffect(() => {
    if (gameStatus !== 'playing') return;

    const timer = setInterval(() => {
      setElapsedGameTime((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [gameStatus]);

  // Public room discovery answers over a broadcast channel, so an empty list
  // in the first moment means "not yet", not "none".
  useEffect(() => {
    const timer = setTimeout(() => setRoomScanDone(true), 1200);
    return () => clearTimeout(timer);
  }, []);

  // The end of a practice game.
  const handleGameOver = useCallback((
    winner: PracticePiece | 'DRAW',
    line: Array<[number, number]> | null,
    reason: string,
  ) => {
    if (matchOverRef.current) return;
    matchOverRef.current = true;

    setGameStatus('ended');
    setWinningLine(line);
    setRatingNote(null);

    let winnerText = 'Draw!';
    if (winner !== 'DRAW') {
      const isWinner = winner === myPiece;
      winnerText = isWinner ? 'Victory!' : 'Defeat!';
      setSessionScore((prev) =>
        isWinner
          ? { ...prev, mine: prev.mine + 1 }
          : winner === 'T'
          ? { ...prev, triangle: prev.triangle + 1 }
          : { ...prev, theirs: prev.theirs + 1 }
      );
      if (isWinner) {
        confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } });
        playWinSound();
      }
    }

    setGameResult({ winner: winnerText, reason });

    if (user) {
      // Practice is still a game the player finished, so it belongs in their
      // history. It never reaches the server and never moves the rating.
      const iWon = winner === myPiece;
      void saveMatchRecord(
        {
          mode: 'ai',
          player1Uid: user.uid,
          player2Uid: 'ai_bot',
          player1Name: user.displayName,
          player2Name: 'AI Bot',
          winnerUid: winner === 'DRAW' ? 'DRAW' : iWon ? user.uid : 'ai_bot',
          winnerName: winner === 'DRAW' ? 'DRAW' : iWon ? user.displayName : 'AI Bot',
          boardSize: roomSettings.boardSize,
          timerConfig: `${roomSettings.totalTimeMinutes}m / ${roomSettings.turnTimeSeconds}s`,
          eloDeltaPlayer1: 0,
          eloDeltaPlayer2: 0,
        },
        { localOnly: true }
      );
      setRatingNote('Practice game. Saved to your history; rating unchanged.');
    }
  }, [myPiece, playWinSound, roomSettings, user]);

  // Clock expiry reacts to the value the timers produced, never from inside a
  const prevTurnTimeRef = useRef(turnTimeLeft);
  useEffect(() => {
    const previous = prevTurnTimeRef.current;
    prevTurnTimeRef.current = turnTimeLeft;

    if (gameStatus !== 'playing' || roomSettings.turnTimeSeconds === 0) return;
    if (turnTimeLeft === 5 && previous > 5) playTimerWarningSound();
    if (turnTimeLeft <= 0 && previous > 0) {
      handleGameOver(nextPracticePiece(currentTurn, roomSettings.playerMode === 'oneVsOneVsOne'), null, 'turn_timeout');
    }
  }, [turnTimeLeft, gameStatus, roomSettings.turnTimeSeconds, currentTurn, playTimerWarningSound, handleGameOver]);

  const prevTotalTimesRef = useRef({ p1: p1TotalTime, p2: p2TotalTime });
  useEffect(() => {
    const previous = prevTotalTimesRef.current;
    prevTotalTimesRef.current = { p1: p1TotalTime, p2: p2TotalTime };

    if (gameStatus !== 'playing' || roomSettings.totalTimeMinutes === 0) return;
    if (p1TotalTime <= 0 && previous.p1 > 0) handleGameOver('O', null, 'total_time_out');
    else if (p2TotalTime <= 0 && previous.p2 > 0) handleGameOver('X', null, 'total_time_out');
  }, [p1TotalTime, p2TotalTime, gameStatus, roomSettings.totalTimeMinutes, handleGameOver]);

  const executeUndoMove = useCallback((targetHistory: MoveHistoryItem[]) => {
    practiceGameGenerationRef.current += 1;
    cancelAiMove();
    const size = roomSettings.boardSize;
    const newBoard = createEmptyBoard(size);

    targetHistory.forEach((item) => {
      newBoard[item.row][item.col] = item.piece;
    });

    setBoard(newBoard);
    setMoveHistory(targetHistory);

    if (targetHistory.length > 0) {
      const last = targetHistory[targetHistory.length - 1];
      setLastMove([last.row, last.col]);
      setCurrentTurn(nextPracticePiece(last.piece, roomSettings.playerMode === 'oneVsOneVsOne'));
    } else {
      setLastMove(null);
      setCurrentTurn('X');
    }
    setTurnTimeLeft(roomSettings.turnTimeSeconds);
  }, [cancelAiMove, roomSettings.boardSize, roomSettings.turnTimeSeconds]);

  const makeAiMove = useCallback(async (
    currentBoard: BoardMatrix,
    currentHistory: MoveHistoryItem[],
    gameGeneration: number,
    aiPiece: 'O' | 'T',
  ) => {
    const size = roomSettings.boardSize;

    setIsAiThinking(true);
    let aiRow: number;
    let aiCol: number;
    try {
      if (aiPiece === 'O') {
        [aiRow, aiCol] = await requestAiMove(currentBoard, size, aiPiece);
      } else {
        const empty: Array<[number, number]> = [];
        currentBoard.forEach((line, row) => line.forEach((cell, col) => {
          if (cell === null) empty.push([row, col]);
        }));
        [aiRow, aiCol] = empty[(currentHistory.length * 17) % empty.length];
      }
    } finally {
      if (practiceGameGenerationRef.current === gameGeneration) setIsAiThinking(false);
    }

    // A rematch, undo or return to the lobby may have landed while we waited.
    if (practiceGameGenerationRef.current !== gameGeneration) return;
    if (currentBoard[aiRow][aiCol] !== null) return;

    const nextBoard = currentBoard.map((row) => [...row]);
    nextBoard[aiRow][aiCol] = aiPiece;

    setBoard(nextBoard);
    setLastMove([aiRow, aiCol]);
    setMoveHistory([
      ...currentHistory,
      { row: aiRow, col: aiCol, piece: aiPiece, corner: roomSettings.placementMode === 'lmao' ? lmaoCornerFor(aiRow, aiCol) : 'center' },
    ]);
    playMoveSound();

    const win = checkWin(nextBoard, aiRow, aiCol, size);
    if (win) {
      handleGameOver(aiPiece, win.line, '5_in_a_row');
    } else if (isBoardFull(nextBoard)) {
      handleGameOver('DRAW', null, 'board_full');
    } else {
      setCurrentTurn(nextPracticePiece(aiPiece, roomSettings.playerMode === 'oneVsOneVsOne'));
      setTurnTimeLeft(roomSettings.turnTimeSeconds);
    }
  }, [roomSettings.boardSize, roomSettings.turnTimeSeconds, roomSettings.playerMode, playMoveSound, handleGameOver, requestAiMove]);

  useEffect(() => {
    if (!isAiMode || gameStatus !== 'playing' || currentTurn === myPiece || isAiThinking) return;
    if (currentTurn !== 'O' && currentTurn !== 'T') return;
    const generation = practiceGameGenerationRef.current;
    const timer = window.setTimeout(() => {
      if (practiceGameGenerationRef.current === generation) {
        void makeAiMove(board, moveHistory, generation, currentTurn);
      }
    }, 400);
    return () => window.clearTimeout(timer);
  }, [isAiMode, gameStatus, currentTurn, myPiece, isAiThinking, board, moveHistory, makeAiMove]);

  // Execute Cell Move
  const handleCellClick = (row: number, col: number, corner: BoardCorner) => {
    if (!isAiMode || gameStatus !== 'playing' || board[row][col] !== null) return;
    if (currentTurn !== myPiece) return;

    const nextBoard = board.map((r) => [...r]);
    nextBoard[row][col] = myPiece;
    const updatedHistory = [...moveHistory, { row, col, piece: myPiece, corner: roomSettings.placementMode === 'lmao' ? corner : 'center' }];

    setBoard(nextBoard);
    setLastMove([row, col]);
    setMoveHistory(updatedHistory);
    lastMoveTimestampRef.current = Date.now();
    playMoveSound();

    const nextTurn = nextPracticePiece(myPiece, roomSettings.playerMode === 'oneVsOneVsOne');
    setCurrentTurn(nextTurn);
    setTurnTimeLeft(roomSettings.turnTimeSeconds);

    const win = checkWin(nextBoard, row, col, roomSettings.boardSize);
    if (win) {
      handleGameOver(myPiece, win.line, '5_in_a_row');
    } else if (isBoardFull(nextBoard)) {
      handleGameOver('DRAW', null, 'board_full');
    }
  };

  // 5-Second Self-Undo Rule Handler
  const handleUndoButtonClick = () => {
    if (moveHistory.length === 0 || gameStatus !== 'playing') return;

    const last = moveHistory[moveHistory.length - 1];
    const elapsed = Date.now() - lastMoveTimestampRef.current;
    const isWithin5s = elapsed <= 5000;
    const isMyLastMove = last.piece === myPiece && currentTurn !== myPiece;

    if (isWithin5s && isMyLastMove) {
      executeUndoMove(moveHistory.slice(0, -1));
    } else {
      executeUndoMove(moveHistory.length >= 2 ? moveHistory.slice(0, -2) : []);
    }
  };

  const resetMatchState = useCallback(() => {
    practiceGameGenerationRef.current += 1;
    cancelAiMove();
    setBoard(createEmptyBoard(roomSettings.boardSize));
    setLastMove(null);
    setMoveHistory([]);
    setWinningLine(null);
    setGameResult(null);
    setCurrentTurn('X');
    setTurnTimeLeft(roomSettings.turnTimeSeconds);
    setP1TotalTime(roomSettings.totalTimeMinutes * 60);
    setP2TotalTime(roomSettings.totalTimeMinutes * 60);
    setElapsedGameTime(0);
    setRatingNote(null);
    matchOverRef.current = false;
  }, [cancelAiMove, roomSettings.boardSize, roomSettings.turnTimeSeconds, roomSettings.totalTimeMinutes]);

  const handleStartAiMode = () => {
    if (roomActive) room.leaveRoom();
    practiceGameGenerationRef.current += 1;
    matchOverRef.current = false;
    cancelAiMove();
    setIsAiThinking(false);
    setIsAiMode(true);
    setRatingNote(null);
    setMyPiece('X');
    setCurrentTurn('X');
    setBoard(createEmptyBoard(roomSettings.boardSize));
    setMoveHistory([]);
    setLastMove(null);
    setWinningLine(null);
    setGameResult(null);
    setGameStatus('playing');
    setElapsedGameTime(0);
    setTurnTimeLeft(roomSettings.turnTimeSeconds);
    setP1TotalTime(roomSettings.totalTimeMinutes * 60);
    setP2TotalTime(roomSettings.totalTimeMinutes * 60);
  };

  /* ----------------------------- navigation ------------------------------ */

  /** The home screen: no practice game, nothing still running in the background. */
  const goHome = useCallback(() => {
    cancelAiMove();
    setIsAiThinking(false);
    setIsAiMode(false);
    // A new opponent starts level.
    setSessionScore({ mine: 0, theirs: 0, triangle: 0 });
    resetMatchState();
    setGameStatus('lobby');
  }, [cancelAiMove, resetMatchState]);

  // One exit flow for the board button, the brand logo and the Back gesture,
  // so all three treat a game in progress the same way. A room has its own.
  const requestExitMatch = useCallback(() => {
    if (roomActive) {
      if (roomExitRef.current) roomExitRef.current();
      else room.leaveRoom();
      return;
    }
    if (gameStatus !== 'playing') {
      goHome();
      return;
    }
    setConfirmSpec({
      title: 'Leave this practice game?',
      body: 'The board will be discarded. Practice games are not counted as a loss.',
      confirmLabel: 'Leave and go home',
      onConfirm: goHome,
    });
  }, [roomActive, room, gameStatus, goHome]);

  // Keep the ref so the history listener below never has to re-subscribe.
  const requestExitMatchRef = useRef(requestExitMatch);
  useEffect(() => {
    requestExitMatchRef.current = requestExitMatch;
  });

  const practiceInMatch = !roomActive && (gameStatus === 'playing' || gameStatus === 'ended');
  const guardBack = (!roomActive && gameStatus === 'playing') || roomActive;

  useEffect(() => {
    if (!guardBack) return;
    window.history.pushState({ caroMatch: true }, '');
    const onPop = () => {
      window.history.pushState({ caroMatch: true }, '');
      requestExitMatchRef.current();
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [guardBack]);

  /* -------------------------------- rooms -------------------------------- */

  const leavePractice = () => {
    if (!isAiMode) return;
    cancelAiMove();
    setIsAiThinking(false);
    setIsAiMode(false);
    resetMatchState();
    setGameStatus('lobby');
  };

  const handleCreateRoom = (isPublic: boolean) => {
    leavePractice();
    setRejoinCode(null);
    room.createRoom({ isPublic, settings: roomSettings });
  };

  const handleJoinRoom = (roomCode: string) => {
    leavePractice();
    setRejoinCode(null);
    // Keep whatever was typed on failure: retyping a code you already have is
    // pure friction, and the message needs something to refer to.
    room.joinRoom(roomCode);
  };

  const handleRejoin = () => {
    if (!lastRoom) return;
    leavePractice();
    setRejoinCode(lastRoom.roomId);
    room.joinRoom(lastRoom.roomId);
  };

  // Rematch Button Handler for practice
  const handleRematchButtonClick = () => {
    // Practice has no one to ask, so only a live board needs confirming.
    if (gameStatus === 'playing' && moveHistory.length > 0) {
      setConfirmSpec({
        title: 'Start a new game?',
        body: 'The game you are playing will be discarded.',
        confirmLabel: 'Start a new game',
        onConfirm: handleStartAiMode,
      });
      return;
    }
    handleStartAiMode();
  };

  const availableRooms = useAvailableRooms();

  const roomInMatch = roomActive && room.state !== null && room.state.phase !== 'waiting';
  const inMatch = practiceInMatch || roomInMatch;

  const roomClosedDialog = room.closedReason === 'host_left' || room.closedReason === 'host_lost';
  const homeError = roomActive || roomClosedDialog
    ? null
    : room.closedReason === 'not_found' && rejoinCode
    ? 'That room has closed.'
    : room.error;

  const roomPhase = room.state?.phase ?? 'waiting';

  return (
    <div className="min-h-[100dvh] flex flex-col justify-between bg-surface-2 text-ink selection:bg-accent selection:text-accent-fg">
      <AppNavbar inMatch={inMatch} onLeaderboard={() => setLeaderboardOpen(true)} onHistory={() => setHistoryOpen(true)} onSettings={() => setSettingsAndThemeOpen(true)} onHome={requestExitMatch} />
      <main
        className={`flex-1 w-full mx-auto flex flex-col ${
          inMatch
            ? 'max-w-[1760px] p-0 lg:px-6 lg:py-4'
            : 'max-w-7xl p-4 pt-8 sm:p-6 sm:pt-8 items-center justify-start'
        }`}
      >
        {gameStatus === 'lobby' && !roomActive && (
          <div className="home-lobby w-full max-w-6xl">
            <HomeLobbyMeta user={user} error={homeError} onDismissError={room.reset} lastRoom={lastRoom} onRejoin={handleRejoin} onDismissLast={() => { clearLastRoom(); setLastRoom(null); }} settings={roomSettings} onOpenRules={() => setSettingsAndThemeOpen(true)} />
            <HomePlayActions {...{ isRoomPublic, setIsRoomPublic, onStartBot: handleStartAiMode, onCreate: handleCreateRoom, inputRoomCode, setInputRoomCode, onJoin: handleJoinRoom }} />
            <PublicRoomList rooms={availableRooms} scanDone={roomScanDone} onCreate={() => handleCreateRoom(true)} onJoin={handleJoinRoom} />
          </div>
        )}

        <ActiveMatchStage roomActive={roomActive} room={room} user={user} onRules={() => setSettingsAndThemeOpen(true)} onMyProfile={openProfileModal} onOpponent={setSelectedOpponentProfile} exitRef={roomExitRef} practice={practiceInMatch ? { user, openProfileModal, settings: roomSettings, board, placementCorners: practicePlacementCorners, onCellClick: handleCellClick, lastMove, winningLine, currentTurn, myPiece, gameStatus, gameResult, ratingNote, p1TotalTime, p2TotalTime, turnTimeLeft, isAiThinking, elapsedGameTime, moveHistory, sessionScore, onUndo: handleUndoButtonClick, onRematch: handleRematchButtonClick, onExit: requestExitMatch, setOpponent: setSelectedOpponentProfile } : null} />

      </main>

      <AppFeedback notice={notice} roomClosed={roomClosedDialog} roomError={room.error} onResetRoom={room.reset} confirm={confirmSpec} onDismissConfirm={() => setConfirmSpec(null)} />
      <AppModalStack settingsOpen={settingsAndThemeOpen} onCloseSettings={() => setSettingsAndThemeOpen(false)} settings={roomActive && room.state ? room.state.settings : roomSettings} onUpdateSettings={(next) => { if (roomActive) room.updateSettings(next); else setRoomSettings(next); }} isHost={!roomActive || room.isHost} gameStatus={roomActive ? (roomPhase === 'waiting' || roomPhase === 'ended' ? 'lobby' : 'playing') : gameStatus} myPiece={roomActive ? (room.mySeat ?? undefined) : myPiece} leaderboardOpen={leaderboardOpen} onCloseLeaderboard={() => setLeaderboardOpen(false)} historyOpen={historyOpen} onCloseHistory={() => setHistoryOpen(false)} onSelectOpponent={setSelectedOpponentProfile} opponent={selectedOpponentProfile} onPlayNow={() => { setHistoryOpen(false); if (roomActive) { setConfirmSpec({ title: 'Leave the room and play the bot?', body: room.isHost ? 'The room closes for everyone in it.' : 'If you are playing, the game pauses and your seat opens for someone else.', confirmLabel: 'Leave and play the bot', tone: 'danger', onConfirm: handleStartAiMode }); } else handleStartAiMode(); }} confirmRoomExit={setConfirmSpec} />

    </div>
  );
};
