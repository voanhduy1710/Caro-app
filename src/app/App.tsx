import React, { useState, useEffect, useCallback, useRef } from 'react';
import confetti from 'canvas-confetti';
import { Bot, Globe, Lock } from 'lucide-react';
import { useAuth } from '../features/auth/AuthContext';
import { useAvailableRooms } from '../features/webrtc/roomDiscoveryService';
import type { ActiveRoomInfo } from '../features/webrtc/roomDiscoveryService';
import { useSound } from '../shared/hooks/useSound';
import { Navbar } from '../shared/components/Navbar';
import { Board } from '../features/game/Board';
import { MatchHeader } from '../features/game/MatchHeader';
import { GameControls } from '../features/game/GameControls';
import { SettingsAndThemeModal } from '../features/settings/SettingsAndThemeModal';
import { LeaderboardModal } from '../features/leaderboard/LeaderboardModal';
import { HistoryModal } from '../features/history/HistoryModal';
import { AuthModal } from '../features/auth/AuthModal';
import { ProfileModal } from '../features/profile/ProfileModal';
import { OpponentProfileModal } from '../features/profile/OpponentProfileModal';
import { getAvatarPublicUrl } from '../features/avatar/avatarService';
import type { UserProfile } from '../features/auth/AuthContext';
import { DEFAULT_ROOM_SETTINGS, WIN_RULE_TEXT, summariseRoomSettings } from '../features/settings/types';
import type { RoomSettings } from '../features/settings/types';
import { createEmptyBoard, checkWin, isBoardFull } from '../shared/utils/gomokuLogic';
import type { BoardMatrix } from '../shared/utils/gomokuLogic';
import { useAiEngine } from '../features/game/useAiEngine';
import { saveMatchRecord, resendPendingRatedResults } from '../features/history/historyService';
import { useRoom, readLastRoom, clearLastRoom } from '../features/room/useRoom';
import type { LastRoom } from '../features/room/useRoom';
import { OnlineRoom } from '../features/room/OnlineRoom';

interface MoveHistoryItem {
  row: number;
  col: number;
  piece: 'X' | 'O';
}

/** Why the practice game ended, in words a player can act on. */
const RESULT_REASONS: Record<string, string> = {
  '5_in_a_row': 'Five in a row completed the line.',
  board_full: 'The board filled up with nobody in a row.',
  turn_timeout: 'The clock for that move ran out.',
  total_time_out: 'A player used up their total time.',
  resigned: 'A player resigned.',
};

const describeResultReason = (reason?: string) =>
  (reason && RESULT_REASONS[reason]) || 'The match is over.';

/** What a listed room is doing, in the words its lobby row uses. */
const ROOM_STATUS_TEXT = (room: ActiveRoomInfo) =>
  room.status === 'waiting'
    ? 'Waiting for a player'
    : room.status === 'playing'
    ? 'Playing'
    : room.status === 'paused'
    ? room.openSeat
      ? 'Paused, seat open'
      : 'Paused'
    : 'Finished';

/**
 * Entrance order for `.animate-pop-in`. The CSS reads `--i` and turns it into
 * a delay, so a screen's items arrive in reading order without an orchestrator
 * and without a re-render per frame.
 */
const stagger = (i: number) => ({ '--i': i }) as React.CSSProperties;

type ConfirmSpec = {
  title: string;
  body: string;
  confirmLabel: string;
  tone?: 'danger' | 'default';
  onConfirm: () => void;
};

const BOT_USER: UserProfile = {
  uid: 'ai_bot',
  displayName: 'AI Bot 🤖',
  photoURL: getAvatarPublicUrl('Blitzcrank'),
  email: '',
  elo: 1350,
  wins: 50,
  losses: 50,
  draws: 10,
  streak: 0,
};

export const App: React.FC = () => {
  const { user, loading: authLoading, openProfileModal, refreshUserProfile, signInWithCredentials, createLocalAccount } = useAuth();

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
  const [winningLine, setWinningLine] = useState<Array<[number, number]> | null>(null);
  const [myPiece, setMyPiece] = useState<'X' | 'O'>('X');
  const [currentTurn, setCurrentTurn] = useState<'X' | 'O'>('X');
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
  const [sessionScore, setSessionScore] = useState({ mine: 0, theirs: 0 });

  const { requestMove: requestAiMove, cancelPending: cancelAiMove } = useAiEngine();
  const [isAiThinking, setIsAiThinking] = useState(false);

  // A practice game is over once, however many paths reach the end.
  const matchOverRef = useRef<boolean>(false);

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
      createAccount: (username: string, password: string, name?: string) => createLocalAccount(username, password, name),
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
    winner: 'X' | 'O' | 'DRAW',
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
        isWinner ? { ...prev, mine: prev.mine + 1 } : { ...prev, theirs: prev.theirs + 1 }
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
  // state updater. Only the transition into zero ends the match, so starting a
  // round cannot trigger an instant loss.
  const prevTurnTimeRef = useRef(turnTimeLeft);
  useEffect(() => {
    const previous = prevTurnTimeRef.current;
    prevTurnTimeRef.current = turnTimeLeft;

    if (gameStatus !== 'playing' || roomSettings.turnTimeSeconds === 0) return;
    if (turnTimeLeft === 5 && previous > 5) playTimerWarningSound();
    if (turnTimeLeft <= 0 && previous > 0) {
      handleGameOver(currentTurn === 'X' ? 'O' : 'X', null, 'turn_timeout');
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

  // Execute actual move undo on local state
  const executeUndoMove = useCallback((targetHistory: MoveHistoryItem[]) => {
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
      setCurrentTurn(last.piece === 'X' ? 'O' : 'X');
    } else {
      setLastMove(null);
      setCurrentTurn('X');
    }
    setTurnTimeLeft(roomSettings.turnTimeSeconds);
  }, [roomSettings.boardSize, roomSettings.turnTimeSeconds]);

  // AI Move Engine. The search runs on a worker so the board stays responsive.
  const makeAiMove = useCallback(async (currentBoard: BoardMatrix, currentHistory: MoveHistoryItem[]) => {
    const size = roomSettings.boardSize;
    const aiPiece: 'X' | 'O' = myPiece === 'X' ? 'O' : 'X';

    setIsAiThinking(true);
    let aiRow: number;
    let aiCol: number;
    try {
      [aiRow, aiCol] = await requestAiMove(currentBoard, size, aiPiece);
    } finally {
      setIsAiThinking(false);
    }

    // A rematch, undo or return to the lobby may have landed while we waited.
    if (currentBoard[aiRow][aiCol] !== null) return;

    const nextBoard = currentBoard.map((row) => [...row]);
    nextBoard[aiRow][aiCol] = aiPiece;

    setBoard(nextBoard);
    setLastMove([aiRow, aiCol]);
    setMoveHistory([...currentHistory, { row: aiRow, col: aiCol, piece: aiPiece }]);
    playMoveSound();

    const win = checkWin(nextBoard, aiRow, aiCol, size);
    if (win) {
      handleGameOver(aiPiece, win.line, '5_in_a_row');
    } else if (isBoardFull(nextBoard)) {
      handleGameOver('DRAW', null, 'board_full');
    } else {
      setCurrentTurn(myPiece);
      setTurnTimeLeft(roomSettings.turnTimeSeconds);
    }
  }, [myPiece, roomSettings.boardSize, roomSettings.turnTimeSeconds, playMoveSound, handleGameOver, requestAiMove]);

  // Execute Cell Move
  const handleCellClick = (row: number, col: number) => {
    if (!isAiMode || gameStatus !== 'playing' || board[row][col] !== null) return;
    if (currentTurn !== myPiece) return;

    const nextBoard = board.map((r) => [...r]);
    nextBoard[row][col] = myPiece;
    const updatedHistory = [...moveHistory, { row, col, piece: myPiece }];

    setBoard(nextBoard);
    setLastMove([row, col]);
    setMoveHistory(updatedHistory);
    lastMoveTimestampRef.current = Date.now();
    playMoveSound();

    const nextTurn = myPiece === 'X' ? 'O' : 'X';
    setCurrentTurn(nextTurn);
    setTurnTimeLeft(roomSettings.turnTimeSeconds);

    const win = checkWin(nextBoard, row, col, roomSettings.boardSize);
    if (win) {
      handleGameOver(myPiece, win.line, '5_in_a_row');
    } else if (isBoardFull(nextBoard)) {
      handleGameOver('DRAW', null, 'board_full');
    } else {
      setTimeout(() => { void makeAiMove(nextBoard, updatedHistory); }, 400);
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

  // Wipe every trace of the previous match. Without this, the next game
  // inherited the old board, result and clocks.
  const resetMatchState = useCallback(() => {
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
  }, [roomSettings.boardSize, roomSettings.turnTimeSeconds, roomSettings.totalTimeMinutes]);

  // Start AI Practice Mode
  const handleStartAiMode = () => {
    if (roomActive) room.leaveRoom();
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
    setSessionScore({ mine: 0, theirs: 0 });
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

  // Back used to leave the site entirely, because entering a match only changed
  // React state. Park one history entry per match and treat Back as "exit".
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

  // Available Rooms Hook (Serverless Discovery via BroadcastChannel & Local Storage Heartbeats)
  const availableRooms = useAvailableRooms();

  // The match is a full-height app view rather than a page: it takes the whole
  // shell width and drops the page chrome, so the board is bounded by the
  // screen instead of by the reading-width container the lobby wants.
  const roomInMatch = roomActive && room.state !== null && room.state.phase !== 'waiting';
  const inMatch = practiceInMatch || roomInMatch;

  const roomClosedDialog = room.closedReason === 'host_left' || room.closedReason === 'host_lost';
  const homeError = roomActive || roomClosedDialog
    ? null
    : room.closedReason === 'not_found' && rejoinCode
    ? 'That room has closed.'
    : room.error;

  const roomPhase = room.state?.phase ?? 'waiting';
  const isMyTurn = gameStatus === 'playing' && currentTurn === myPiece;
  const botPiece: 'X' | 'O' = myPiece === 'X' ? 'O' : 'X';
  const isBotTurn = gameStatus === 'playing' && currentTurn === botPiece;

  return (
    <div className="min-h-[100dvh] flex flex-col justify-between bg-surface-2 text-ink selection:bg-accent selection:text-accent-fg">
      {/* Top Navbar */}
      <Navbar
        inMatch={inMatch}
        onOpenLeaderboard={() => setLeaderboardOpen(true)}
        onOpenHistory={() => setHistoryOpen(true)}
        onOpenSettingsAndTheme={() => setSettingsAndThemeOpen(true)}
        onNavigateHome={requestExitMatch}
      />

      {/* Main Container */}
      <main
        className={`flex-1 w-full mx-auto flex flex-col ${
          inMatch
            ? 'max-w-[1760px] p-0 lg:px-6 lg:py-4'
            : 'max-w-7xl p-4 sm:p-6 items-center justify-center'
        }`}
      >
        {/* HOME. The three ways to start a game come first; the public room
            list, which is empty most of the time, comes after them. */}
        {gameStatus === 'lobby' && !roomActive && (
          <div className="w-full max-w-4xl space-y-5">
            {/* The title sits on the page rather than inside a panel: on a
                game's front screen the name is the composition, and boxing it
                turns the loudest thing on screen into another list item. */}
            <div className="flex flex-col items-center gap-3 pb-1 text-center">
              <h1 className="display-brand animate-pop-in text-[56px] sm:text-[76px]" style={stagger(0)}>
                CARO
                <span className="sr-only"> - play Gomoku online</span>
              </h1>
              <p className="animate-pop-in mx-auto max-w-md text-muted" style={stagger(1)}>
                {WIN_RULE_TEXT}
              </p>
              {(!user || user.isGuest) && (
                <p className="chip animate-pop-in" style={stagger(2)}>
                  Play now, no account needed
                </p>
              )}
            </div>

            {homeError && (
              <div
                role="alert"
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-danger bg-danger-soft p-3 text-xs font-medium text-danger"
              >
                <span>{homeError}</span>
                <button type="button" onClick={room.reset} className="btn btn-secondary btn-sm">
                  Dismiss
                </button>
              </div>
            )}

            {/* A way back into the room this player just left. */}
            {lastRoom && !homeError && (
              <div
                role="status"
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line bg-surface p-3 text-sm"
              >
                <span className="text-ink">
                  You left room <span className="font-mono font-semibold text-accent-text">{lastRoom.roomId}</span>
                  {lastRoom.hostName ? ` (${lastRoom.hostName}'s room)` : ''}.
                </span>
                <span className="flex gap-2">
                  <button type="button" onClick={handleRejoin} className="btn btn-primary btn-sm">
                    Rejoin
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      clearLastRoom();
                      setLastRoom(null);
                    }}
                    className="btn btn-ghost btn-sm"
                  >
                    Dismiss
                  </button>
                </span>
              </div>
            )}

            {/* The two ways in are not the same size of thing: one is a single
                button, the other carries a mode toggle, a create action and a
                join form. Splitting 2/3 lets each be its own shape instead of
                padding the smaller one out to match. */}
            <div className="grid gap-4 text-left md:grid-cols-5">
              {/* Play alone. Listed first because it is the only option that
                  works with nobody else around. */}
              <div className="card animate-pop-in flex flex-col gap-4 p-5 md:col-span-2" style={stagger(3)}>
                <h2 className="text-xl text-ink">Play the bot</h2>

                {/* The sprite is the opponent's portrait, and it is what keeps
                    this column from being a white void beside the taller form. */}
                <div className="grid flex-1 place-items-center rounded-md bg-accent-soft py-5">
                  <img
                    src="/Avatar/Rotar Zairo.gif"
                    alt=""
                    aria-hidden="true"
                    className="pixel-art h-32 w-32 object-contain"
                  />
                </div>

                <button
                  onClick={handleStartAiMode}
                  className="btn btn-primary btn-lg w-full"
                >
                  <Bot size={20} strokeWidth={2.25} aria-hidden="true" />
                  <span>Play vs Bot</span>
                </button>
              </div>

              {/* Play someone else. */}
              <div className="card animate-pop-in space-y-4 p-5 md:col-span-3" style={stagger(4)}>
                <h2 className="text-xl text-ink">Play a friend</h2>

                <div className="space-y-2">
                  <div className="flex items-center gap-2 rounded-md bg-surface-3 p-1">
                    <button
                      type="button"
                      onClick={() => setIsRoomPublic(true)}
                      aria-pressed={isRoomPublic}
                      className={`flex flex-1 items-center justify-center gap-1.5 rounded-sm px-3 py-2 text-sm font-semibold transition ${
                        isRoomPublic ? 'bg-surface text-accent-text shadow-[0_3px_0_var(--ui-border-strong)]' : 'text-muted hover:text-ink'
                      }`}
                    >
                      <Globe size={14} strokeWidth={2.25} aria-hidden="true" />
                      <span>Public</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsRoomPublic(false)}
                      aria-pressed={!isRoomPublic}
                      className={`flex flex-1 items-center justify-center gap-1.5 rounded-sm px-3 py-2 text-sm font-semibold transition ${
                        !isRoomPublic ? 'bg-surface text-accent-text shadow-[0_3px_0_var(--ui-border-strong)]' : 'text-muted hover:text-ink'
                      }`}
                    >
                      <Lock size={14} strokeWidth={2.25} aria-hidden="true" />
                      <span>Private</span>
                    </button>
                  </div>
                  <p className="field-hint">
                    {isRoomPublic ? 'Anyone can find it, join a free seat or watch.' : 'Only with your code or link.'}
                  </p>
                </div>

                <button
                  onClick={() => handleCreateRoom(isRoomPublic)}
                  className="btn btn-primary btn-lg w-full"
                >
                  {`Create a ${isRoomPublic ? 'public' : 'private'} room`}
                </button>

                <div className="relative flex items-center py-1">
                  <div className="flex-grow border-t border-line"></div>
                  <span className="mx-3 flex-shrink text-xs text-subtle">or</span>
                  <div className="flex-grow border-t border-line"></div>
                </div>

                {/* A form, so Enter and the button behave identically. */}
                <form
                  className="field"
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleJoinRoom(inputRoomCode);
                  }}
                >
                  <label htmlFor="room-code" className="field-label">
                    Join with a code
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="room-code"
                      type="text"
                      value={inputRoomCode}
                      onChange={(e) => setInputRoomCode(e.target.value)}
                      placeholder="ABC123"
                      autoComplete="off"
                      spellCheck={false}
                      className={`field-input flex-1 ${
                        inputRoomCode.includes('/')
                          ? 'text-xs'
                          : 'text-center font-mono uppercase tracking-[0.2em]'
                      }`}
                    />
                    <button
                      type="submit"
                      disabled={!inputRoomCode.trim()}
                      className="btn btn-primary shrink-0"
                    >
                      Join
                    </button>
                  </div>
                </form>
              </div>
            </div>

            {/* The rules a new room starts with, before anyone commits. */}
            <div className="card animate-pop-in flex flex-wrap items-center justify-between gap-3 p-4 text-left" style={stagger(5)}>
              <div className="flex flex-wrap items-center gap-2">
                {summariseRoomSettings(roomSettings).map((fact) => (
                  // The chip is a flex row, so the label and value are separate
                  // items: a literal ": " would sit on top of the chip's own gap.
                  <span key={fact.label} className="chip">
                    <span>{fact.label}</span>
                    <span className="font-semibold text-ink">{fact.value}</span>
                  </span>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setSettingsAndThemeOpen(true)}
                className="btn btn-secondary btn-sm"
              >
                Change rules
              </button>
            </div>

            <div className="card animate-pop-in text-left" style={stagger(6)}>
              <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
                <h2 className="text-lg text-ink">Public rooms</h2>
                <span className="chip font-mono tabular-nums">{availableRooms.length}</span>
              </div>
              <div className="p-5">
                {availableRooms.length === 0 ? (
                  <div className="space-y-3 rounded-md border border-dashed border-line bg-surface-2 p-6 text-center">
                    {/* "Still looking" and "nobody is hosting" are different
                        situations, and only the second one needs a way out. */}
                    <p className="text-sm font-medium text-ink">
                      {roomScanDone ? 'Nobody is hosting a public room right now.' : 'Looking for public rooms…'}
                    </p>
                    {/* One way out, under the label the same action already
                        carries above. Two buttons here repeated both cards. */}
                    {roomScanDone && (
                      <button
                        onClick={() => handleCreateRoom(true)}
                        className="btn btn-primary btn-sm"
                      >
                        Create a public room
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="max-h-72 space-y-2.5 overflow-y-auto pr-1">
                    {availableRooms.map((listed) => {
                      const full = listed.members >= listed.capacity;
                      return (
                        <div
                          key={listed.roomId}
                          className="card-inset flex items-center justify-between gap-2 p-3 transition-colors hover:border-accent hover:bg-surface-3"
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <img
                              src={getAvatarPublicUrl(listed.hostAvatar)}
                              alt=""
                              aria-hidden="true"
                              onError={(e) => {
                                e.currentTarget.onerror = null;
                                e.currentTarget.src = getAvatarPublicUrl();
                              }}
                              className="h-11 w-11 shrink-0 rounded-full border-2 border-accent bg-surface object-contain"
                            />
                            <div className="min-w-0">
                              <div className="truncate text-[15px] font-semibold text-ink">
                                {listed.hostName}'s room
                              </div>
                              <div className="mt-0.5 font-mono text-[11px] text-muted">
                                Code: <span className="font-medium text-accent-text">{listed.roomId}</span> · {listed.boardSize}x{listed.boardSize}
                              </div>
                              <div className="mt-1 flex flex-wrap gap-1">
                                <span className="chip px-1.5 py-0 text-[11px]">{listed.seatsFilled}/2 players</span>
                                {listed.viewers > 0 && (
                                  <span className="chip px-1.5 py-0 text-[11px]">{listed.viewers} watching</span>
                                )}
                                <span className={`chip px-1.5 py-0 text-[11px] ${listed.openSeat ? 'chip-accent' : ''}`}>
                                  {ROOM_STATUS_TEXT(listed)}
                                </span>
                              </div>
                            </div>
                          </div>
                          <button
                            onClick={() => handleJoinRoom(listed.roomId)}
                            disabled={full}
                            className={`btn btn-sm shrink-0 ${listed.openSeat && !full ? 'btn-primary' : 'btn-secondary'}`}
                          >
                            {full ? 'Full' : listed.openSeat ? 'Join' : 'Watch'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* A ROOM: its waiting screen, or the game in it. */}
        {roomActive && (
          <OnlineRoom
            room={room}
            user={user}
            onOpenRules={() => setSettingsAndThemeOpen(true)}
            onViewMyProfile={openProfileModal}
            onViewProfile={(profile) => setSelectedOpponentProfile(profile)}
            exitRef={roomExitRef}
          />
        )}

        {/* PRACTICE against the bot. */}
        {practiceInMatch && (
            <GameControls
              headerNode={
                <MatchHeader
                  seats={[
                    {
                      name: user?.displayName || 'You',
                      photoURL: user?.photoURL,
                      piece: myPiece,
                      clock: myPiece === 'X' ? p1TotalTime : p2TotalTime,
                      moveClock: isMyTurn ? turnTimeLeft : 0,
                      isTurn: isMyTurn,
                      tag: 'You',
                      onClick: openProfileModal,
                      title: 'View and edit your profile',
                    },
                    {
                      name: BOT_USER.displayName,
                      photoURL: BOT_USER.photoURL,
                      piece: botPiece,
                      clock: botPiece === 'X' ? p1TotalTime : p2TotalTime,
                      moveClock: isBotTurn ? turnTimeLeft : 0,
                      isTurn: isBotTurn,
                      tag: isAiThinking ? 'Thinking' : undefined,
                      onClick: () => setSelectedOpponentProfile(BOT_USER),
                      title: "View opponent's profile and stats",
                    },
                  ]}
                  score={[sessionScore.mine, sessionScore.theirs]}
                  announcement={gameStatus === 'playing' ? (isMyTurn ? 'Your turn' : 'Your opponent’s turn') : 'Match ended'}
                  scoreLabel={`Score: you ${sessionScore.mine}, opponent ${sessionScore.theirs}`}
                />
              }
              boardNode={
                <div className="flex-1 flex flex-col items-center">
                  {gameStatus !== 'ended' && (
                    <p
                      className={`display mb-4 text-2xl ${
                        currentTurn === myPiece ? 'text-accent-text' : 'text-subtle'
                      }`}
                    >
                      {currentTurn === myPiece ? 'Your turn' : 'Waiting for your opponent…'}
                    </p>
                  )}
                  <Board
                    board={board}
                    size={roomSettings.boardSize}
                    onCellClick={handleCellClick}
                    lastMove={lastMove}
                    winningLine={winningLine}
                    currentTurn={currentTurn}
                    disabled={gameStatus !== 'playing' || currentTurn !== myPiece}
                    myPiece={myPiece}
                    opponent={BOT_USER}
                    gameStatus={gameStatus}
                    gameResult={gameResult}
                    elapsedGameTime={elapsedGameTime}
                    resultReason={describeResultReason(gameResult?.reason)}
                    ratingNote={ratingNote}
                    resultActions={
                      <>
                        <button onClick={handleRematchButtonClick} className="btn btn-primary">
                          Play again
                        </button>
                        <button onClick={goHome} className="btn btn-ghost">
                          Back to menu
                        </button>
                      </>
                    }
                  />
                </div>
              }
              opponent={BOT_USER}
              myUser={user}
              chatMessages={[]}
              onSendChat={() => undefined}
              onProposeUndo={handleUndoButtonClick}
              onProposeRematch={handleRematchButtonClick}
              onResign={() => undefined}
              onExitMatch={requestExitMatch}
              exitLabel="Exit practice"
              gameStatus={gameStatus}
              allowUndo={roomSettings.allowUndo}
              isAiMode
              canUndo={moveHistory.length > 0}
              undoPending={false}
              rematchPending={false}
            />
        )}
      </main>

      {/* Transient status pill */}
      {notice && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-24 left-1/2 z-[60] -translate-x-1/2 rounded-full bg-inverse px-4 py-2 text-xs font-medium text-inverse-fg shadow-lg"
        >
          {notice}
        </div>
      )}

      {/* The host closed the room, or went and did not come back. Nothing
          retries, so this says so plainly and waits to be read. */}
      {roomClosedDialog && (
        <div className="modal-scrim" role="dialog" aria-modal="true" aria-labelledby="room-closed-title">
          <div className="w-full max-w-sm space-y-4 rounded-lg border border-line bg-surface p-6 text-center">
            <h3 id="room-closed-title" className="text-base font-semibold text-ink">
              The room has closed
            </h3>
            <p className="text-xs leading-relaxed text-muted">{room.error}</p>
            <button onClick={room.reset} className="btn btn-primary btn-sm w-full" autoFocus>
              Back to home
            </button>
          </div>
        </div>
      )}

      {/* One confirmation dialog for everything that discards a practice game. */}
      {confirmSpec && (
        <div className="modal-scrim" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
          <div className="bg-surface p-6 rounded-lg border border-line max-w-sm w-full space-y-4">
            <div className="space-y-1.5">
              <h3 id="confirm-title" className="text-base font-semibold text-ink">
                {confirmSpec.title}
              </h3>
              <p className="text-xs leading-relaxed text-muted">{confirmSpec.body}</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmSpec(null)}
                className="btn btn-secondary btn-sm flex-1"
                autoFocus
              >
                Keep playing
              </button>
              <button
                onClick={() => {
                  const run = confirmSpec.onConfirm;
                  setConfirmSpec(null);
                  run();
                }}
                className={`btn btn-sm flex-1 ${confirmSpec.tone === 'danger' ? 'btn-danger' : 'btn-primary'}`}
              >
                {confirmSpec.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Match rules and appearance. In a room only the host edits the rules,
          and only between games; the room carries them to everyone. */}
      <SettingsAndThemeModal
        isOpen={settingsAndThemeOpen}
        onClose={() => setSettingsAndThemeOpen(false)}
        settings={roomActive && room.state ? room.state.settings : roomSettings}
        onUpdateSettings={(next) => {
          if (roomActive) room.updateSettings(next);
          else setRoomSettings(next);
        }}
        isHost={!roomActive || room.isHost}
        gameStatus={
          roomActive ? (roomPhase === 'waiting' || roomPhase === 'ended' ? 'lobby' : 'playing') : gameStatus
        }
        myPiece={roomActive ? (room.mySeat ?? undefined) : myPiece}
      />

      <LeaderboardModal
        isOpen={leaderboardOpen}
        onClose={() => setLeaderboardOpen(false)}
        onSelectPlayer={(p) => setSelectedOpponentProfile(p)}
      />
      <HistoryModal
        isOpen={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onPlayNow={() => {
          setHistoryOpen(false);
          if (roomActive) {
            setConfirmSpec({
              title: 'Leave the room and play the bot?',
              body: room.isHost
                ? 'The room closes for everyone in it.'
                : 'If you are playing, the game pauses and your seat opens for someone else.',
              confirmLabel: 'Leave and play the bot',
              tone: 'danger',
              onConfirm: handleStartAiMode,
            });
            return;
          }
          handleStartAiMode();
        }}
      />
      <AuthModal />
      <ProfileModal />
      <OpponentProfileModal
        opponent={selectedOpponentProfile}
        isOpen={Boolean(selectedOpponentProfile)}
        onClose={() => setSelectedOpponentProfile(null)}
      />

      {/* Footer */}
      {!inMatch && (
        <footer className="w-full border-t border-line bg-surface py-4 text-center text-xs text-muted">
          Peer-to-peer Caro. No servers between you and your opponent.
        </footer>
      )}
    </div>
  );
};
