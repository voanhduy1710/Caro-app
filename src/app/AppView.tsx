import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import confetti from 'canvas-confetti';
import { useAuth } from '../features/auth/AuthContext';
import { useAvailableRooms } from '../features/webrtc/roomDiscoveryService';
import { isSheetDisguiseActive, useDisguiseMode } from '../features/game/disguiseMode';
import { showSheetSnackbar } from '../features/game/sheet/sheetSnackbar';
import { useSheetAwareSound } from '../features/game/sheet/useSheetAwareSound';
import { OPEN_SETTINGS_EVENT } from '../features/game/sheetBridge';
import { useTheme } from '../features/theme/ThemeContext';
import type { BoardCorner } from '../features/game/Board';
import type { UserProfile } from '../features/auth/AuthContext';
import { DEFAULT_ROOM_SETTINGS } from '../features/settings/types';
import type { RoomSettings } from '../features/settings/types';
import { createEmptyBoard, checkWin, isBoardFull } from '../shared/utils/gomokuLogic';
import { forcedFourMoves } from '../shared/utils/forcedFour';
import type { BoardMatrix } from '../shared/utils/gomokuLogic';
import { useAiEngine } from '../features/game/useAiEngine';
import { saveMatchRecord, resendPendingRatedResults } from '../features/history/historyService';
import { syncPracticeHistory } from '../features/history/practiceSync';
import { useRoom, readLastRoom, clearLastRoom } from '../features/room/useRoom';
import type { LastRoom } from '../features/room/useRoom';
import type { RoomMode } from '../features/room/roomEngineTypes';
import { PublicRoomList } from './PublicRoomList';
import { HomePlayActions } from './HomePlayActions';
import { HomeLobbyMeta } from './HomeLobbyMeta';
import { AppFeedback } from './AppFeedback';
import { AppModalStack } from './AppModalStack';
import { AppNavbar } from './AppNavbar';
import { ActiveMatchStage } from './ActiveMatchStage';
import { AI_BOARD_SIZE, aiThinkMs, canLetBotOpen, firstTurnFor, lmaoCornerFor, nextPracticePiece, settingsUpdateFor, sheetNoticeText } from './AppViewShared';
import { setBotUrl, shouldAutoStartBot } from './botRoute';
import type { MoveHistoryItem, PracticePiece } from './AppViewShared';
import type { ConfirmSpec } from './AppViewShared';
import { useT } from '../features/i18n/language';
import { PairingContext } from '../features/pairing/PairingContext';
import type { PairingContextValue } from '../features/pairing/PairingContext';
import { PairMobileModal } from '../features/pairing/PairMobileModal';
import { usePairHost } from '../features/pairing/usePairHost';
import type { PairSource } from '../features/pairing/usePairHost';
import type { PracticeMatchViewProps } from './PracticeMatchView';
export const App: React.FC = () => {
  const t = useT();
  const { user, loading: authLoading, openProfileModal, refreshUserProfile, signInWithCredentials, createAccount } = useAuth();

  // A rated result that could not be sent, because the tab closed mid-request
  // or the network dropped, is kept on this device and sent again once the
  // player is back and signed in.
  const signedInUid = user && !user.isGuest ? user.uid : null;
  useEffect(() => {
    if (authLoading || !signedInUid) return;
    void resendPendingRatedResults();
    // Practice games played on this device, including ones from before they
    // were stored online, are copied to the player's account.
    void syncPracticeHistory(signedInUid);
  }, [authLoading, signedInUid]);
  const { playMoveSound, playWinSound, playTimerWarningSound, playBuzzSound } = useSheetAwareSound();

  // Non-blocking status pill, used instead of window.alert during a live match.
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showNotice = useCallback((message: string) => {
    // Under the disguise there is one bottom-left snackbar, the Sheets one,
    // and the notice goes there in Sheets' words instead of as the game's pill.
    if (isSheetDisguiseActive()) {
      showSheetSnackbar(sheetNoticeText(message));
      return;
    }
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
    room.status === 'opening' || room.status === 'joining' || room.status === 'connected' || room.status === 'host_lost' || room.status === 'claimed';
  /** The room's own exit flow, which knows whether leaving pauses a game or closes the room. */
  const roomExitRef = useRef<(() => void) | null>(null);

  // Modals state
  const [settingsAndThemeOpen, setSettingsAndThemeOpen] = useState(false);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [selectedOpponentProfile, setSelectedOpponentProfile] = useState<UserProfile | null>(null);

  // The Spreadsheet disguise hides the navbar, which is where Settings normally
  // opens from, so its "Spreadsheet settings" menu item asks for it by event.
  useEffect(() => {
    const open = () => setSettingsAndThemeOpen(true);
    window.addEventListener(OPEN_SETTINGS_EVENT, open);
    return () => window.removeEventListener(OPEN_SETTINGS_EVENT, open);
  }, []);

  // Whether the Spreadsheet disguise is up, gated on being in a match below:
  // the flag outlives nothing, but the lobby must never be styled as a sheet.
  const { theme } = useTheme();
  const disguiseOn = useDisguiseMode();

  // Practice game state. Online games live in the room.
  const [roomSettings, setRoomSettings] = useState<RoomSettings>(DEFAULT_ROOM_SETTINGS);
  /** The bot always plays 19x19; online rooms keep the chosen size. */
  const practiceSettings = useMemo(() => ({ ...roomSettings, boardSize: AI_BOARD_SIZE }), [roomSettings]);
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
  const [p1ElapsedTime, setP1ElapsedTime] = useState<number>(0);
  const [p2ElapsedTime, setP2ElapsedTime] = useState<number>(0);
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
  /** Set by "Let bot play first": an emptied board (after take back) then gives the opening to the bot again. */
  const botOpensRef = useRef(false);
  /** Counts bot games started here. A paired phone belongs to one game, so a new one ends the pairing. */
  const [practiceGameNumber, setPracticeGameNumber] = useState(0);

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
    // /bot is the bot page: opening it goes straight into a game against the bot.
    if (shouldAutoStartBot(window.location.pathname, window.location.search)) {
      handleStartAiMode();
      return;
    }
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
      setP1ElapsedTime(0);
      setP2ElapsedTime(0);
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

  // Even unlimited games show each side's own thinking time in the board
  // toolbar. Unlike the optional total bank, these counters always run.
  useEffect(() => {
    if (gameStatus !== 'playing') return;
    const timer = setInterval(() => {
      if (currentTurn === 'X') setP1ElapsedTime((prev) => prev + 1);
      else if (currentTurn === 'O') setP2ElapsedTime((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [gameStatus, currentTurn]);

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
        // A burst of confetti over a "spreadsheet" would give the disguise away.
        if (!isSheetDisguiseActive()) confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } });
        playWinSound();
      }
    }

    setGameResult({ winner: winnerText, reason });

    if (user) {
      // Practice is still a game the player finished, so it belongs in their
      // history. It is stored for their account but never moves the rating.
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
          boardSize: AI_BOARD_SIZE,
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
    // The cancelled search never answers, so nothing else would clear this and the bot would wait forever.
    setIsAiThinking(false);
    const size = AI_BOARD_SIZE;
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
      setCurrentTurn(firstTurnFor(botOpensRef.current));
    }
    setTurnTimeLeft(roomSettings.turnTimeSeconds);
  }, [cancelAiMove, roomSettings.turnTimeSeconds]);

  const makeAiMove = useCallback(async (
    currentBoard: BoardMatrix,
    currentHistory: MoveHistoryItem[],
    gameGeneration: number,
    aiPiece: 'O' | 'T',
  ) => {
    const size = AI_BOARD_SIZE;

    setIsAiThinking(true);
    let aiRow: number;
    let aiCol: number;
    try {
      if (aiPiece === 'O') {
        [aiRow, aiCol] = await requestAiMove(currentBoard, size, aiPiece, aiThinkMs(roomSettings.turnTimeSeconds));
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
    if (roomSettings.playerMode === 'oneVsOneVsOne') {
      const forced = forcedFourMoves(currentBoard, aiPiece);
      if (forced && !forced.some(([row, col]) => row === aiRow && col === aiCol)) [aiRow, aiCol] = forced[0];
    }
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

    const win = checkWin(nextBoard, aiRow, aiCol, size, roomSettings.playerMode === 'oneVsOneVsOne' ? 4 : 5);
    if (win) {
      handleGameOver(aiPiece, win.line, '5_in_a_row');
    } else if (isBoardFull(nextBoard)) {
      handleGameOver('DRAW', null, 'board_full');
    } else {
      setCurrentTurn(nextPracticePiece(aiPiece, roomSettings.playerMode === 'oneVsOneVsOne'));
      setTurnTimeLeft(roomSettings.turnTimeSeconds);
    }
  }, [roomSettings.turnTimeSeconds, roomSettings.playerMode, playMoveSound, handleGameOver, requestAiMove]);

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
    if (roomSettings.playerMode === 'oneVsOneVsOne') {
      const forced = forcedFourMoves(board, myPiece);
      if (forced && !forced.some(([r, c]) => r === row && c === col)) return;
    }

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

    const win = checkWin(nextBoard, row, col, AI_BOARD_SIZE, roomSettings.playerMode === 'oneVsOneVsOne' ? 4 : 5);
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
    botOpensRef.current = false;
    setCurrentTurn('X');
    setTurnTimeLeft(roomSettings.turnTimeSeconds);
    setP1TotalTime(roomSettings.totalTimeMinutes * 60);
    setP2TotalTime(roomSettings.totalTimeMinutes * 60);
    setP1ElapsedTime(0);
    setP2ElapsedTime(0);
    setElapsedGameTime(0);
    setRatingNote(null);
    matchOverRef.current = false;
  }, [cancelAiMove, roomSettings.boardSize, roomSettings.turnTimeSeconds, roomSettings.totalTimeMinutes]);

  const handleStartAiMode = () => {
    if (roomActive) room.leaveRoom();
    setBotUrl(true);
    botOpensRef.current = false;
    practiceGameGenerationRef.current += 1;
    setPracticeGameNumber((n) => n + 1);
    matchOverRef.current = false;
    cancelAiMove();
    setIsAiThinking(false);
    setIsAiMode(true);
    setRatingNote(null);
    setMyPiece('X');
    setCurrentTurn('X');
    setBoard(createEmptyBoard(AI_BOARD_SIZE));
    setMoveHistory([]);
    setLastMove(null);
    setWinningLine(null);
    setGameResult(null);
    setGameStatus('playing');
    setElapsedGameTime(0);
    setTurnTimeLeft(roomSettings.turnTimeSeconds);
    setP1TotalTime(roomSettings.totalTimeMinutes * 60);
    setP2TotalTime(roomSettings.totalTimeMinutes * 60);
    setP1ElapsedTime(0);
    setP2ElapsedTime(0);
  };

  // Hands the opening move to the bot. Only on a fresh board; the bot then answers like on any of its turns.
  const handleBotFirst = () => {
    if (!canLetBotOpen({ gameStatus, moveCount: moveHistory.length, threePlayer: roomSettings.playerMode === 'oneVsOneVsOne', currentTurn, myPiece, isAiThinking })) return;
    botOpensRef.current = true;
    setCurrentTurn(firstTurnFor(true));
    setTurnTimeLeft(roomSettings.turnTimeSeconds);
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
    setBotUrl(false);
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
      title: t('home.leavePracticeTitle'),
      body: t('home.leavePracticeBody'),
      confirmLabel: t('home.leavePracticeConfirm'),
      sheet: {
        title: 'Đóng tệp?',
        body: 'Các thay đổi chưa lưu trong tệp này sẽ bị mất.',
        confirmLabel: 'Đóng',
      },
      onConfirm: goHome,
    });
  }, [roomActive, room, gameStatus, goHome, t]);

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
    setBotUrl(false);
  };

  const handleCreateRoom = (isPublic: boolean, mode: RoomMode = 'ranked') => {
    leavePractice();
    setRejoinCode(null);
    room.createRoom({ isPublic, mode, settings: roomSettings });
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
        title: t('home.newGameTitle'),
        body: t('home.newGameBody'),
        confirmLabel: t('home.newGameConfirm'),
        sheet: {
          title: 'Tạo bảng tính mới?',
          body: 'Nội dung hiện tại của trang tính sẽ bị thay thế.',
          confirmLabel: 'Tạo mới',
        },
        onConfirm: handleStartAiMode,
      });
      return;
    }
    handleStartAiMode();
  };

  const availableRooms = useAvailableRooms();

  const roomInMatch = roomActive && room.state !== null && room.state.phase !== 'waiting';
  const inMatch = practiceInMatch || roomInMatch;
  const sheetDisguise = inMatch && theme.boardTheme === 'spreadsheet' && disguiseOn;

  const roomClosedDialog = room.closedReason === 'host_left' || room.closedReason === 'host_lost';
  const homeError = roomActive || roomClosedDialog
    ? null
    : room.closedReason === 'not_found' && rejoinCode
    ? t('home.roomClosedError')
    : room.error;

  const roomPhase = room.state?.phase ?? 'waiting';

  // One object feeds both the board on screen and a paired phone.
  const practiceProps: PracticeMatchViewProps | null = practiceInMatch ? { user, openProfileModal, settings: practiceSettings, board, placementCorners: practicePlacementCorners, onCellClick: handleCellClick, lastMove, winningLine, currentTurn, myPiece, gameStatus, gameResult, ratingNote, p1TotalTime, p2TotalTime, p1ElapsedTime, p2ElapsedTime, turnTimeLeft, isAiThinking, elapsedGameTime, moveHistory, sessionScore, onUndo: handleUndoButtonClick, onRematch: handleRematchButtonClick, onExit: requestExitMatch, onBotFirst: handleBotFirst, setOpponent: setSelectedOpponentProfile } : null;

  // A room keeps its pairing across rematches; each bot game is its own.
  const pairSource: PairSource | null = roomActive
    ? (room.roomId ? { kind: 'room', room, gameKey: room.roomId } : null)
    : practiceProps
    ? { kind: 'practice', props: practiceProps, gameKey: `practice-${practiceGameNumber}` }
    : null;
  const pair = usePairHost({ user, source: pairSource, onNotice: showNotice });
  const hasPairSource = pairSource !== null;
  const signedIn = Boolean(user && !user.isGuest);
  const pairingValue = useMemo<PairingContextValue | null>(
    () => (hasPairSource
      ? { canPair: signedIn, needsSignIn: !signedIn, phoneConnected: pair.phoneConnected, openPairModal: pair.open }
      : null),
    [hasPairSource, signedIn, pair.phoneConnected, pair.open],
  );

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
            <PublicRoomList rooms={availableRooms} scanDone={roomScanDone} onJoin={handleJoinRoom} />
          </div>
        )}

        <PairingContext.Provider value={pairingValue}>
          <ActiveMatchStage roomActive={roomActive} room={room} user={user} onRules={() => setSettingsAndThemeOpen(true)} onMyProfile={openProfileModal} onOpponent={setSelectedOpponentProfile} exitRef={roomExitRef} practice={practiceProps} />
        </PairingContext.Provider>

      </main>

      <AppFeedback sheetDisguise={sheetDisguise} notice={notice}roomClosed={roomClosedDialog} roomError={room.error} onResetRoom={room.reset} confirm={confirmSpec} onDismissConfirm={() => setConfirmSpec(null)} />
      <PairMobileModal isOpen={pair.modalOpen} link={pair.link} secondsLeft={pair.secondsLeft} phoneConnected={pair.phoneConnected} onClose={pair.close} onUnpair={pair.unpair} />
      <AppModalStack settingsOpen={settingsAndThemeOpen} onCloseSettings={() => setSettingsAndThemeOpen(false)} settings={roomActive && room.state ? room.state.settings : isAiMode ? practiceSettings : roomSettings} onUpdateSettings={(next) => { if (roomActive) room.updateSettings(next); else setRoomSettings(settingsUpdateFor(roomSettings, next, isAiMode)); }} isHost={!roomActive || room.isHost} gameStatus={roomActive ? (roomPhase === 'waiting' || roomPhase === 'ended' ? 'lobby' : 'playing') : gameStatus} myPiece={roomActive ? (room.mySeat ?? undefined) : myPiece} leaderboardOpen={leaderboardOpen} onCloseLeaderboard={() => setLeaderboardOpen(false)} historyOpen={historyOpen} onCloseHistory={() => setHistoryOpen(false)} onSelectOpponent={setSelectedOpponentProfile} opponent={selectedOpponentProfile} onPlayNow={() => { setHistoryOpen(false); if (roomActive) { setConfirmSpec({ title: t('home.leaveRoomBotTitle'), body: room.isHost ? t('home.leaveRoomBotBodyHost') : t('home.leaveRoomBotBodyGuest'), confirmLabel: t('home.leaveRoomBotConfirm'), tone: 'danger', onConfirm: handleStartAiMode }); } else handleStartAiMode(); }} confirmRoomExit={setConfirmSpec} />

    </div>
  );
};
