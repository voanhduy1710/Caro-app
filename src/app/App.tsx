import React, { useState, useEffect, useCallback, useRef } from 'react';
import confetti from 'canvas-confetti';
import { Bot, Check, Copy, Globe, Lock, Share2, WifiOff } from 'lucide-react';
import { useAuth } from '../features/auth/AuthContext';
import { useWebRTC } from '../features/webrtc/useWebRTC';
import { useAvailableRooms } from '../features/webrtc/roomDiscoveryService';
import { useSound } from '../shared/hooks/useSound';
import { Navbar } from '../shared/components/Navbar';
import { Board } from '../features/game/Board';
import { GameControls } from '../features/game/GameControls';
import { SettingsAndThemeModal } from '../features/settings/SettingsAndThemeModal';
import { LeaderboardModal } from '../features/leaderboard/LeaderboardModal';
import { HistoryModal } from '../features/history/HistoryModal';
import { AuthModal } from '../features/auth/AuthModal';
import { ProfileModal } from '../features/profile/ProfileModal';
import { OpponentProfileModal } from '../features/profile/OpponentProfileModal';
import type { UserProfile } from '../features/auth/AuthContext';
import { DEFAULT_ROOM_SETTINGS, WIN_RULE_TEXT, summariseRoomSettings } from '../features/settings/types';
import type { RoomSettings } from '../features/settings/types';
import { createEmptyBoard, checkWin, isBoardFull } from '../shared/utils/gomokuLogic';
import type { BoardMatrix } from '../shared/utils/gomokuLogic';
import { useAiEngine } from '../features/game/useAiEngine';
import { calculateElo } from '../shared/utils/eloCalculator';
import { saveMatchRecord } from '../features/history/historyService';
import { useIsDesktop } from '../shared/hooks/useMediaQuery';
import type { PeerMessage } from '../features/webrtc/types';

interface MoveHistoryItem {
  row: number;
  col: number;
  piece: 'X' | 'O';
}

type MatchSnapshot = {
  roomId: string;
  roomSettings?: RoomSettings;
  gameStatus?: 'lobby' | 'playing' | 'ended';
  board?: BoardMatrix;
  lastMove?: [number, number] | null;
  moveHistory?: MoveHistoryItem[];
  winningLine?: Array<[number, number]> | null;
  myPiece?: 'X' | 'O';
  currentTurn?: 'X' | 'O';
  gameResult?: { winner: string; reason: string } | null;
  matchCount?: number;
  turnTimeLeft?: number;
  p1TotalTime?: number;
  p2TotalTime?: number;
  elapsedGameTime?: number;
};

/** Why the match ended, in words a player can act on. */
const RESULT_REASONS: Record<string, string> = {
  '5_in_a_row': 'Five in a row completed the line.',
  board_full: 'The board filled up with nobody in a row.',
  turn_timeout: 'The clock for that move ran out.',
  total_time_out: 'A player used up their total time.',
  resigned: 'A player resigned.',
  opponent_disconnected: 'Your opponent lost connection and did not come back in time.',
};

const describeResultReason = (reason?: string) =>
  (reason && RESULT_REASONS[reason]) || 'The match is over.';

/** Seconds both players get to look at a fresh board before the first move. */
const PRE_MATCH_COUNTDOWN_SEC = 3;

type ConfirmSpec = {
  title: string;
  body: string;
  confirmLabel: string;
  tone?: 'danger' | 'default';
  onConfirm: () => void;
};

const readSavedMatchSnapshot = (): MatchSnapshot | null => {
  try {
    const roomId = new URLSearchParams(window.location.search).get('room')?.toUpperCase();
    const rawSnapshot = sessionStorage.getItem('caro_game_snapshot');
    if (!roomId || !rawSnapshot) return null;
    const snapshot = JSON.parse(rawSnapshot) as MatchSnapshot;
    return snapshot.roomId === roomId && Array.isArray(snapshot.board) ? snapshot : null;
  } catch {
    return null;
  }
};

export const App: React.FC = () => {
  const { user, loading: authLoading, openProfileModal, refreshUserProfile } = useAuth();
  const { playMoveSound, playWinSound, playTimerWarningSound, playBuzzSound } = useSound();

  // WebRTC Hook
  const webrtc = useWebRTC(user);
  // Read the recovery snapshot during the very first render. Restoring in an effect
  // was too late: the lobby effect could overwrite the recovered board with a blank one.
  const initialSnapshot = useRef(readSavedMatchSnapshot()).current;

  // Modals state
  const [settingsAndThemeOpen, setSettingsAndThemeOpen] = useState(false);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [selectedOpponentProfile, setSelectedOpponentProfile] = useState<UserProfile | null>(null);

  // Undo Request Modal State
  const [undoRequestOpen, setUndoRequestOpen] = useState(false);

  // Room & Game state
  const [roomSettings, setRoomSettings] = useState<RoomSettings>(() => initialSnapshot?.roomSettings || DEFAULT_ROOM_SETTINGS);
  const [gameStatus, setGameStatus] = useState<'lobby' | 'playing' | 'ended'>(() => initialSnapshot?.gameStatus || 'lobby');
  const [board, setBoard] = useState<BoardMatrix>(() => initialSnapshot?.board || createEmptyBoard(initialSnapshot?.roomSettings?.boardSize || DEFAULT_ROOM_SETTINGS.boardSize));
  const [lastMove, setLastMove] = useState<[number, number] | null>(() => initialSnapshot?.lastMove || null);
  const [moveHistory, setMoveHistory] = useState<MoveHistoryItem[]>(() => initialSnapshot?.moveHistory || []);
  const [winningLine, setWinningLine] = useState<Array<[number, number]> | null>(() => initialSnapshot?.winningLine || null);
  const [myPiece, setMyPiece] = useState<'X' | 'O'>(() => initialSnapshot?.myPiece || 'X');
  const [currentTurn, setCurrentTurn] = useState<'X' | 'O'>(() => initialSnapshot?.currentTurn || 'X');
  const [gameResult, setGameResult] = useState<{ winner: string; reason: string } | null>(() => initialSnapshot?.gameResult || null);
  const [isAiMode, setIsAiMode] = useState<boolean>(false);
  const [matchCount, setMatchCount] = useState<number>(() => initialSnapshot?.matchCount || 0);
  const boardPanelRef = useRef<HTMLDivElement>(null);
  const [boardPanelHeight, setBoardPanelHeight] = useState<number | null>(null);

  // 5-Second Self Undo Tracking Ref
  const lastMoveTimestampRef = useRef<number>(0);

  // Timers state
  const [turnTimeLeft, setTurnTimeLeft] = useState<number>(() => initialSnapshot?.turnTimeLeft ?? DEFAULT_ROOM_SETTINGS.turnTimeSeconds);
  const [p1TotalTime, setP1TotalTime] = useState<number>(() => initialSnapshot?.p1TotalTime ?? DEFAULT_ROOM_SETTINGS.totalTimeMinutes * 60);
  const [p2TotalTime, setP2TotalTime] = useState<number>(() => initialSnapshot?.p2TotalTime ?? DEFAULT_ROOM_SETTINGS.totalTimeMinutes * 60);
  const [elapsedGameTime, setElapsedGameTime] = useState<number>(() => initialSnapshot?.elapsedGameTime || 0);

  const [inputRoomCode, setInputRoomCode] = useState('');
  const [isRoomPublic, setIsRoomPublic] = useState(true);

  /** Only claims success once the clipboard write actually resolved. */
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  /** Shown when the clipboard is unavailable, so the link is still obtainable. */
  const [manualLink, setManualLink] = useState<string | null>(null);

  /** Where a take-back request currently stands, for whoever is looking. */
  const [undoRequest, setUndoRequest] = useState<'none' | 'sent' | 'received'>('none');
  /** Same for a rematch: both players must agree before the board is wiped. */
  const [rematchOffer, setRematchOffer] = useState<'none' | 'sent' | 'received'>('none');

  // A guest used to be dropped into a match the moment the host felt like it.
  const [iAmReady, setIAmReady] = useState(false);
  const [peerReady, setPeerReady] = useState(false);

  /** Rating text is only filled in once a real result comes back. */
  const [ratingNote, setRatingNote] = useState<string | null>(null);
  /** Anything destructive asks first through this one dialog. */
  const [confirmSpec, setConfirmSpec] = useState<ConfirmSpec | null>(null);
  /** Distinguishes "still looking" from "nobody is hosting". */
  const [roomScanDone, setRoomScanDone] = useState(false);
  /**
   * Seconds left before the first move of an online round, or null when no
   * countdown is running. It gives both players a moment to look at the board
   * instead of one of them discovering the match has already started.
   */
  const [countdown, setCountdown] = useState<number | null>(null);

  const isDesktop = useIsDesktop();
  const { requestMove: requestAiMove, cancelPending: cancelAiMove } = useAiEngine();
  const [isAiThinking, setIsAiThinking] = useState(false);

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

  // Both peers run the game-over handler for the same match (one detects it, the
  // other receives GAME_OVER). This latch keeps the result, the confetti and the
  // rating write to exactly one execution per match.
  const matchOverRef = useRef<boolean>(initialSnapshot?.gameStatus === 'ended');

  // The action panel must never be able to make the game row taller than the
  // board. Measure the rendered board (including its match header) so this
  // remains correct across screen sizes and header wrapping.
  useEffect(() => {
    const panel = boardPanelRef.current;
    if (!panel || (gameStatus !== 'playing' && gameStatus !== 'ended')) {
      setBoardPanelHeight(null);
      return;
    }

    const updateHeight = () => {
      const nextHeight = Math.ceil(panel.getBoundingClientRect().height);
      setBoardPanelHeight((current) => current === nextHeight ? current : nextHeight);
    };

    const observer = new ResizeObserver(updateHeight);
    observer.observe(panel);
    updateHeight();
    return () => observer.disconnect();
  }, [gameStatus, roomSettings.boardSize]);

  // Auto-reconnect on accidental F5 / page refresh or direct room link access.
  // This must wait for the profile: reconnecting while `user` was still null
  // announced the room as "Host Player" and never sent your identity to the
  // opponent. The ref keeps it to a single run despite StrictMode.
  const autoReconnectedRef = useRef(false);
  useEffect(() => {
    if (autoReconnectedRef.current || authLoading) return;
    autoReconnectedRef.current = true;

    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    if (roomParam) {
      const code = roomParam.toUpperCase();
      setInputRoomCode(code);

      // Check if user was host before accidental F5
      let wasHost = false;
      try {
        const saved = sessionStorage.getItem('caro_active_session');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed.roomId === code && parsed.isHost) {
            wasHost = true;
          }
        }
      } catch {
        // ignore
      }

      // Reconnect or join room
      if (wasHost) {
        webrtc.createRoom(code);
      } else {
        webrtc.joinRoom(code);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading]);

  // Keep enough local state for the room owner to resume a match after an accidental refresh.
  useEffect(() => {
    if (!webrtc.roomId || isAiMode) return;
    try {
      sessionStorage.setItem('caro_game_snapshot', JSON.stringify({
        roomId: webrtc.roomId, roomSettings, gameStatus, board, lastMove, moveHistory,
        winningLine, myPiece, currentTurn, gameResult, matchCount, turnTimeLeft,
        p1TotalTime, p2TotalTime, elapsedGameTime,
      }));
    } catch {
      // Session storage is a convenience; a live reconnection still works without it.
    }
  }, [webrtc.roomId, isAiMode, roomSettings, gameStatus, board, lastMove, moveHistory, winningLine, myPiece, currentTurn, gameResult, matchCount, turnTimeLeft, p1TotalTime, p2TotalTime, elapsedGameTime]);

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

  // One side owns the clocks. Both peers used to count down independently, drift
  // apart, and each declare its own timeout result. Guests now display their own
  // smooth tick but take the host's numbers as truth and never end the match.
  const isClockAuthority = isAiMode || !webrtc.roomId || webrtc.isHost;

  // The pre-match countdown. Every other clock is held while it runs, so the
  // first player does not lose time to a board they cannot touch yet.
  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      setCountdown(null);
      return;
    }
    const timer = setTimeout(() => setCountdown((prev) => (prev === null ? null : prev - 1)), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  const isCountingIn = countdown !== null;

  // Turn Countdown Timer Loop. The updater only subtracts; anything with a side
  // effect reacts to the resulting value, because a state updater must be pure.
  useEffect(() => {
    if (gameStatus !== 'playing' || webrtc.isReconnecting || isCountingIn || roomSettings.turnTimeSeconds === 0) return;

    const timer = setInterval(() => {
      setTurnTimeLeft((prev) => (prev <= 0 ? 0 : prev - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [gameStatus, currentTurn, webrtc.isReconnecting, isCountingIn, roomSettings.turnTimeSeconds]);

  // Chess Clock Total Match Time Loop
  useEffect(() => {
    if (gameStatus !== 'playing' || webrtc.isReconnecting || isCountingIn || roomSettings.totalTimeMinutes === 0) return;

    const timer = setInterval(() => {
      const tick = (prev: number) => (prev <= 0 ? 0 : prev - 1);
      if (currentTurn === 'X') setP1TotalTime(tick);
      else setP2TotalTime(tick);
    }, 1000);

    return () => clearInterval(timer);
  }, [gameStatus, currentTurn, webrtc.isReconnecting, isCountingIn, roomSettings.totalTimeMinutes]);

  // The host republishes its clocks so a guest's display cannot drift away.
  const clockStateRef = useRef({ turnTimeLeft, p1TotalTime, p2TotalTime, elapsedGameTime });
  useEffect(() => {
    clockStateRef.current = { turnTimeLeft, p1TotalTime, p2TotalTime, elapsedGameTime };
  });

  useEffect(() => {
    if (!webrtc.isHost || !webrtc.isConnected || gameStatus !== 'playing' || isAiMode) return;
    const timer = setInterval(() => {
      webrtc.sendMessage({ type: 'CLOCK_SYNC', payload: clockStateRef.current });
    }, 3000);
    return () => clearInterval(timer);
  }, [webrtc.isHost, webrtc.isConnected, webrtc.sendMessage, gameStatus, isAiMode]);

  // Overall Match Elapsed Game Timer
  useEffect(() => {
    if (gameStatus !== 'playing' || webrtc.isReconnecting || isCountingIn) return;

    const timer = setInterval(() => {
      setElapsedGameTime((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [gameStatus, webrtc.isReconnecting, isCountingIn]);

  // Public room discovery answers over a broadcast channel, so an empty list
  // in the first moment means "not yet", not "none".
  useEffect(() => {
    const timer = setTimeout(() => setRoomScanDone(true), 1200);
    return () => clearTimeout(timer);
  }, []);

  // Handle Match Over & ELO rating calculation
  const handleGameOver = useCallback((
    winner: 'X' | 'O' | 'DRAW',
    line: Array<[number, number]> | null,
    reason: string,
    broadcast = true
  ) => {
    if (matchOverRef.current) return;
    matchOverRef.current = true;

    setGameStatus('ended');
    setWinningLine(line);
    // Nothing that was pending applies to a finished match.
    setCountdown(null);
    setUndoRequestOpen(false);
    setUndoRequest('none');
    setRematchOffer('none');
    setRatingNote(null);

    let winnerText = 'Draw!';
    if (winner !== 'DRAW') {
      const isWinner = winner === myPiece;
      winnerText = isWinner ? 'Victory!' : 'Defeat!';
      if (isWinner) {
        confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } });
        playWinSound();
      }
    }

    setGameResult({ winner: winnerText, reason });

    if (broadcast && webrtc.isConnected) {
      webrtc.sendMessage({
        type: 'GAME_OVER',
        payload: { winner, winningLine: line, reason },
      });
    }

    // Save the match once. Both peers reach this point for the same game, so the
    // host is the single writer; it updates the rating rows for both players.
    if (webrtc.isHost && user && webrtc.peerUser) {
      const p1Elo = user.elo || 1200;
      const p2Elo = webrtc.peerUser.elo || 1200;
      const outcome = winner === myPiece ? 'p1' : winner === 'DRAW' ? 'draw' : 'p2';
      const eloCalc = calculateElo(p1Elo, p2Elo, outcome);

      void saveMatchRecord({
        mode: 'pvp',
        player1Uid: user.uid,
        player2Uid: webrtc.peerUser.uid,
        player1Name: user.displayName,
        player2Name: webrtc.peerUser.displayName,
        winnerUid: winner === myPiece ? user.uid : winner === 'DRAW' ? 'DRAW' : webrtc.peerUser.uid,
        winnerName: winner === myPiece ? user.displayName : winner === 'DRAW' ? 'DRAW' : webrtc.peerUser.displayName,
        boardSize: roomSettings.boardSize,
        timerConfig: `${roomSettings.totalTimeMinutes}m / ${roomSettings.turnTimeSeconds}s`,
        eloDeltaPlayer1: eloCalc.player1Delta,
        eloDeltaPlayer2: eloCalc.player2Delta,
      }).then((outcome) => {
        // The server owns the rating, so read back what it actually stored, and
        // tell the opponent the moment their new rating exists too. Guessing a
        // delay raced the edge function and left the guest showing a stale ELO.
        void refreshUserProfile();
        if (webrtc.isConnected) {
          webrtc.sendMessage({ type: 'RATING_UPDATED', payload: {} });
        }
        // Report the number the server actually stored, or say plainly that it
        // did not store one. A confident "+12" that never happened is worse
        // than admitting the write failed.
        setRatingNote(
          outcome
            ? `Rating ${outcome.eloDeltaPlayer1 >= 0 ? '+' : ''}${outcome.eloDeltaPlayer1}`
            : 'Saved on this device. The rating could not be updated.'
        );
      });
    } else if (isAiMode && user) {
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
  }, [myPiece, playWinSound, roomSettings, user, webrtc, refreshUserProfile, isAiMode]);

  // Clock expiry reacts to the value the timers produced, never from inside a
  // state updater. Only the transition into zero ends the match, so restoring a
  // snapshot or starting a round cannot trigger an instant loss.
  const prevTurnTimeRef = useRef(turnTimeLeft);
  useEffect(() => {
    const previous = prevTurnTimeRef.current;
    prevTurnTimeRef.current = turnTimeLeft;

    if (gameStatus !== 'playing' || roomSettings.turnTimeSeconds === 0) return;
    if (turnTimeLeft === 5 && previous > 5) playTimerWarningSound();
    if (turnTimeLeft <= 0 && previous > 0 && isClockAuthority) {
      handleGameOver(currentTurn === 'X' ? 'O' : 'X', null, 'turn_timeout');
    }
  }, [turnTimeLeft, gameStatus, roomSettings.turnTimeSeconds, isClockAuthority, currentTurn, playTimerWarningSound, handleGameOver]);

  const prevTotalTimesRef = useRef({ p1: p1TotalTime, p2: p2TotalTime });
  useEffect(() => {
    const previous = prevTotalTimesRef.current;
    prevTotalTimesRef.current = { p1: p1TotalTime, p2: p2TotalTime };

    if (gameStatus !== 'playing' || roomSettings.totalTimeMinutes === 0 || !isClockAuthority) return;
    if (p1TotalTime <= 0 && previous.p1 > 0) handleGameOver('O', null, 'total_time_out');
    else if (p2TotalTime <= 0 && previous.p2 > 0) handleGameOver('X', null, 'total_time_out');
  }, [p1TotalTime, p2TotalTime, gameStatus, roomSettings.totalTimeMinutes, isClockAuthority, handleGameOver]);

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

  // Register WebRTC incoming message listener.
  //
  // The handler reads a lot of game state, so it is rebuilt on every render and
  // parked in a ref. The subscription itself is registered once: it used to
  // depend on the `webrtc` object, whose identity changes every render, so the
  // listener was unbound and rebound continuously.
  const handlePeerMessage = (msg: PeerMessage) => {
    {
      if (msg.type === 'ROOM_SETTINGS_SYNC') {
        setRoomSettings(msg.payload.settings);
      } else if (msg.type === 'GAME_START') {
        matchOverRef.current = false;
        setIsAiMode(false);
        setRematchOffer('none');
        setUndoRequest('none');
        setUndoRequestOpen(false);
        setRatingNote(null);
        setIAmReady(false);
        setPeerReady(false);
        const { guestPiece, firstTurn, boardSize, matchCount: remoteMatchCount } = msg.payload;
        if (remoteMatchCount !== undefined) setMatchCount(remoteMatchCount);
        setMyPiece(guestPiece);
        setCurrentTurn(firstTurn || 'X');
        setBoard(createEmptyBoard(boardSize || roomSettings.boardSize));
        setMoveHistory([]);
        setLastMove(null);
        setGameStatus('playing');
        setWinningLine(null);
        setGameResult(null);
        webrtc.clearChat();
        setElapsedGameTime(0);
        // A new round starts on full clocks. Going straight from "ended" to
        // "playing" skipped the lobby reset, so a rematch inherited whatever
        // time was left when the previous game finished.
        setTurnTimeLeft(roomSettings.turnTimeSeconds);
        setP1TotalTime(roomSettings.totalTimeMinutes * 60);
        setP2TotalTime(roomSettings.totalTimeMinutes * 60);
        setCountdown(PRE_MATCH_COUNTDOWN_SEC);
      } else if ((msg.type === 'JOIN_REQUEST' || msg.type === 'GAME_STATE_REQUEST') && webrtc.isHost && gameStatus !== 'lobby') {
        webrtc.sendMessage({
          type: 'GAME_STATE_SYNC',
          payload: { roomSettings, gameStatus, board, lastMove, moveHistory, winningLine, myPiece: 'O', currentTurn, gameResult, matchCount, turnTimeLeft, p1TotalTime, p2TotalTime, elapsedGameTime },
        });
      } else if (msg.type === 'GAME_STATE_SYNC') {
        const synced = msg.payload;
        setRoomSettings(synced.roomSettings);
        setGameStatus(synced.gameStatus);
        setBoard(synced.board);
        setLastMove(synced.lastMove);
        setMoveHistory(synced.moveHistory);
        setWinningLine(synced.winningLine);
        setMyPiece(synced.myPiece);
        setCurrentTurn(synced.currentTurn);
        setGameResult(synced.gameResult);
        setMatchCount(synced.matchCount);
        setTurnTimeLeft(synced.turnTimeLeft);
        setP1TotalTime(synced.p1TotalTime);
        setP2TotalTime(synced.p2TotalTime);
        setElapsedGameTime(synced.elapsedGameTime);
      } else if (msg.type === 'PROPOSE_REMATCH') {
        // A rematch wipes the board, so it needs an answer. The host used to
        // restart the game the instant a guest asked, mid-match included.
        if (gameStatus === 'ended') setRematchOffer('received');
      } else if (msg.type === 'ACCEPT_REMATCH') {
        setRematchOffer('none');
        // Only the host owns the board, so only the host starts the round.
        if (webrtc.isHost) handleStartGame();
      } else if (msg.type === 'DECLINE_REMATCH') {
        setRematchOffer('none');
        showNotice('Your opponent declined the rematch.');
      } else if (msg.type === 'READY_STATE') {
        setPeerReady(Boolean(msg.payload?.ready));
      } else if (msg.type === 'DECLINE_UNDO') {
        setUndoRequest('none');
        showNotice('Your opponent declined the take-back.');
      } else if (msg.type === 'MOVE') {
        const { row, col, piece, nextTurn } = msg.payload ?? {};
        // Peer payloads are untrusted: an out-of-range index used to throw inside
        // the state updater and take the whole board down.
        const size = roomSettings.boardSize;
        const validCoordinate = (value: unknown) =>
          Number.isInteger(value) && (value as number) >= 0 && (value as number) < size;
        if (!validCoordinate(row) || !validCoordinate(col) || (piece !== 'X' && piece !== 'O')) {
          console.warn('Ignoring malformed MOVE from peer:', msg.payload);
          return;
        }
        if (board[row][col] !== null) {
          console.warn('Ignoring MOVE onto an occupied cell:', msg.payload);
          return;
        }
        setBoard((prev) => {
          const next = prev.map((r) => [...r]);
          next[row][col] = piece;
          return next;
        });
        setLastMove([row, col]);
        setMoveHistory((prev) => [...prev, { row, col, piece }]);
        setCurrentTurn(nextTurn);
        setTurnTimeLeft(roomSettings.turnTimeSeconds);
        playMoveSound();
      } else if (msg.type === 'INSTANT_UNDO') {
        executeUndoMove(msg.payload.history);
      } else if (msg.type === 'PROPOSE_UNDO') {
        if (gameStatus === 'playing') setUndoRequestOpen(true);
      } else if (msg.type === 'ACCEPT_UNDO') {
        setUndoRequest('none');
        executeUndoMove(msg.payload.history);
      } else if (msg.type === 'GAME_OVER') {
        const { winner, winningLine, reason } = msg.payload;
        handleGameOver(winner, winningLine, reason, false);
      } else if (msg.type === 'RATING_UPDATED') {
        void refreshUserProfile();
        setRatingNote('Rating updated.');
      } else if (msg.type === 'CLOCK_SYNC') {
        // The host is the only clock authority; ignore anything it did not send.
        if (webrtc.isHost || isAiMode) return;
        const clock = msg.payload ?? {};
        if (Number.isFinite(clock.turnTimeLeft)) setTurnTimeLeft(clock.turnTimeLeft);
        if (Number.isFinite(clock.p1TotalTime)) setP1TotalTime(clock.p1TotalTime);
        if (Number.isFinite(clock.p2TotalTime)) setP2TotalTime(clock.p2TotalTime);
        if (Number.isFinite(clock.elapsedGameTime)) setElapsedGameTime(clock.elapsedGameTime);
      } else if (msg.type === 'BUZZ') {
        playBuzzSound();
      }
    }
  };

  const peerMessageHandlerRef = useRef(handlePeerMessage);
  useEffect(() => {
    peerMessageHandlerRef.current = handlePeerMessage;
  });

  useEffect(
    () => webrtc.registerMessageListener((msg) => peerMessageHandlerRef.current(msg)),
    [webrtc.registerMessageListener]
  );

  // Both players see the same paused countdown; when it expires, the connected player wins.
  useEffect(() => {
    if (!webrtc.connectionTimedOut || gameStatus !== 'playing' || isAiMode) return;
    handleGameOver(myPiece === 'X' ? 'O' : 'X', null, 'opponent_disconnected', false);
  }, [webrtc.connectionTimedOut, gameStatus, isAiMode, myPiece, handleGameOver]);

  // An opponent who left on purpose is gone. Drop every request that was
  // waiting on them so nothing is left spinning.
  useEffect(() => {
    if (!webrtc.peerLeft) return;
    setPeerReady(false);
    setUndoRequest('none');
    setUndoRequestOpen(false);
    setRematchOffer('none');
    if (gameStatus === 'playing' && !isAiMode) {
      handleGameOver(myPiece === 'X' ? 'O' : 'X', null, 'opponent_disconnected', false);
    } else {
      showNotice('Your opponent left the room.');
    }
  }, [webrtc.peerLeft, gameStatus, isAiMode, myPiece, handleGameOver, showNotice]);

  // Rules are agreed before the match, so a change invalidates "ready".
  useEffect(() => {
    setIAmReady(false);
    setPeerReady(false);
  }, [roomSettings]);

  // Nothing may wait for an answer forever. An opponent who simply ignores the
  // dialog used to leave the asker's button stuck on "sent" for the whole match.
  useEffect(() => {
    if (undoRequest !== 'sent') return;
    const timer = setTimeout(() => {
      setUndoRequest('none');
      showNotice('Your take-back request expired.');
    }, 30000);
    return () => clearTimeout(timer);
  }, [undoRequest, showNotice]);

  useEffect(() => {
    if (rematchOffer !== 'sent') return;
    const timer = setTimeout(() => {
      setRematchOffer('none');
      showNotice('Your rematch offer expired.');
    }, 30000);
    return () => clearTimeout(timer);
  }, [rematchOffer, showNotice]);

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
      handleGameOver(aiPiece, win.line, '5_in_a_row', false);
    } else if (isBoardFull(nextBoard)) {
      handleGameOver('DRAW', null, 'board_full', false);
    } else {
      setCurrentTurn(myPiece);
      setTurnTimeLeft(roomSettings.turnTimeSeconds);
    }
  }, [myPiece, roomSettings.boardSize, roomSettings.turnTimeSeconds, playMoveSound, handleGameOver, requestAiMove]);

  // Execute Cell Move
  const handleCellClick = (row: number, col: number) => {
    if (gameStatus !== 'playing' || board[row][col] !== null) return;
    // A cell stays clickable even when the board looks disabled, so the
    // count-in has to be refused here and not only in the presentation.
    if (isCountingIn) return;
    if (!isAiMode && (!webrtc.isConnected || webrtc.isReconnecting)) return;
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

    if (webrtc.isConnected) {
      webrtc.sendMessage({
        type: 'MOVE',
        payload: { row, col, piece: myPiece, nextTurn },
      });
    }

    const win = checkWin(nextBoard, row, col, roomSettings.boardSize);
    if (win) {
      handleGameOver(myPiece, win.line, '5_in_a_row', true);
    } else if (isBoardFull(nextBoard)) {
      handleGameOver('DRAW', null, 'board_full', true);
    } else if (isAiMode && !webrtc.isConnected && !webrtc.roomId) {
      setTimeout(() => { void makeAiMove(nextBoard, updatedHistory); }, 400);
    }
  };

  // 5-Second Self-Undo Rule Handler
  const handleUndoButtonClick = () => {
    if (moveHistory.length === 0 || gameStatus !== 'playing' || undoRequest === 'sent') return;

    const last = moveHistory[moveHistory.length - 1];
    const elapsed = Date.now() - lastMoveTimestampRef.current;

    const isWithin5s = elapsed <= 5000;
    const isMyLastMove = last.piece === myPiece && currentTurn !== myPiece;

    if (isWithin5s && isMyLastMove) {
      const newHistory = moveHistory.slice(0, -1);
      executeUndoMove(newHistory);

      if (webrtc.isConnected) {
        webrtc.sendMessage({
          type: 'INSTANT_UNDO',
          payload: { history: newHistory },
        });
      }
    } else {
      if (webrtc.isConnected) {
        webrtc.sendMessage({ type: 'PROPOSE_UNDO', payload: {} });
        setUndoRequest('sent');
        showNotice('Take-back request sent. Waiting for your opponent.');
      } else if (isAiMode && !webrtc.isConnected && !webrtc.roomId) {
        const newHistory = moveHistory.length >= 2 ? moveHistory.slice(0, -2) : [];
        executeUndoMove(newHistory);
      }
    }
  };

  // Host Accepts Opponent's Undo Proposal
  const handleAcceptUndoProposal = () => {
    setUndoRequestOpen(false);
    const newHistory = moveHistory.slice(0, -1);
    executeUndoMove(newHistory);
    if (webrtc.isConnected) {
      webrtc.sendMessage({
        type: 'ACCEPT_UNDO',
        payload: { history: newHistory },
      });
    }
  };

  // Declining used to close this dialog and tell the asker nothing, leaving
  // their button stuck on "waiting" for the rest of the match.
  const handleDeclineUndoProposal = () => {
    setUndoRequestOpen(false);
    if (webrtc.isConnected) {
      webrtc.sendMessage({ type: 'DECLINE_UNDO', payload: {} });
    }
  };

  // Host Starts Game (or triggers next round in session)
  const handleStartGame = () => {
    if (webrtc.roomId && !webrtc.isHost) return; // Only Host can start multiplayer match
    // A second call mid-match would silently discard the game in progress.
    if (gameStatus === 'playing') return;
    matchOverRef.current = false;
    setIsAiMode(false);
    setRematchOffer('none');
    setUndoRequest('none');
    setUndoRequestOpen(false);
    setRatingNote(null);
    setIAmReady(false);
    setPeerReady(false);
    const nextMatchCount = matchCount + 1;
    setMatchCount(nextMatchCount);

    // Host (Inviter) always goes first ('X'), Guest gets ('O')
    const hostPiece: 'X' | 'O' = 'X';
    const guestPiece: 'X' | 'O' = 'O';

    setMyPiece(hostPiece);
    setCurrentTurn('X');
    const newBoard = createEmptyBoard(roomSettings.boardSize);
    setBoard(newBoard);
    setMoveHistory([]);
    setLastMove(null);
    setWinningLine(null);
    setGameResult(null);
    setGameStatus('playing');
    setElapsedGameTime(0);
    // A new round starts on full clocks. Going straight from "ended" to
    // "playing" skipped the lobby reset, so a rematch inherited whatever time
    // was left when the previous game finished.
    setTurnTimeLeft(roomSettings.turnTimeSeconds);
    setP1TotalTime(roomSettings.totalTimeMinutes * 60);
    setP2TotalTime(roomSettings.totalTimeMinutes * 60);
    // Practice starts on the click: there is nobody else to wait for, so an
    // artificial pause would only be in the way.
    setCountdown(webrtc.isConnected ? PRE_MATCH_COUNTDOWN_SEC : null);
    webrtc.clearChat();

    if (webrtc.isConnected) {
      webrtc.sendMessage({
        type: 'GAME_START',
        payload: {
          hostPiece,
          guestPiece,
          firstTurn: 'X',
          boardSize: roomSettings.boardSize,
          matchCount: nextMatchCount,
        },
      });
    }
  };

  // Start AI Practice Mode
  const handleStartAiMode = () => {
    if (webrtc.roomId || webrtc.isConnected) {
      webrtc.leaveRoom();
    }
    matchOverRef.current = false;
    cancelAiMove();
    setIsAiThinking(false);
    setIsAiMode(true);
    setUndoRequest('none');
    setUndoRequestOpen(false);
    setRematchOffer('none');
    setRatingNote(null);
    const nextMatchCount = matchCount + 1;
    setMatchCount(nextMatchCount);

    const playerPiece: 'X' | 'O' = 'X';

    setMyPiece(playerPiece);
    setCurrentTurn('X');
    const newBoard = createEmptyBoard(roomSettings.boardSize);
    setBoard(newBoard);
    setMoveHistory([]);
    setLastMove(null);
    setWinningLine(null);
    setGameResult(null);
    setGameStatus('playing');
    setElapsedGameTime(0);
    setTurnTimeLeft(roomSettings.turnTimeSeconds);
    setP1TotalTime(roomSettings.totalTimeMinutes * 60);
    setP2TotalTime(roomSettings.totalTimeMinutes * 60);
    setCountdown(null);
    webrtc.clearChat();
  };

  /* ----------------------------- navigation ------------------------------ */

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
    setUndoRequest('none');
    setUndoRequestOpen(false);
    setRematchOffer('none');
    setRatingNote(null);
    setCountdown(null);
    matchOverRef.current = false;
  }, [roomSettings.boardSize, roomSettings.turnTimeSeconds, roomSettings.totalTimeMinutes]);

  /** The home screen: no room, no match, nothing still running in the background. */
  const goHome = useCallback(() => {
    cancelAiMove();
    setIsAiThinking(false);
    setIsAiMode(false);
    if (webrtc.roomId) webrtc.leaveRoom();
    setIAmReady(false);
    setPeerReady(false);
    resetMatchState();
    setGameStatus('lobby');
  }, [cancelAiMove, webrtc, resetMatchState]);

  /** Back to this room's waiting screen, keeping the connection alive. */
  const goToWaitingRoom = useCallback(() => {
    resetMatchState();
    setGameStatus('lobby');
  }, [resetMatchState]);

  // One exit flow for the board button, the brand logo and the Back gesture,
  // so all three treat a game in progress the same way.
  const requestExitMatch = useCallback(() => {
    if (gameStatus !== 'playing') {
      goHome();
      return;
    }
    if (isAiMode) {
      setConfirmSpec({
        title: 'Leave this practice game?',
        body: 'The board will be discarded. Practice games are not counted as a loss.',
        confirmLabel: 'Leave and go home',
        onConfirm: goHome,
      });
      return;
    }
    setConfirmSpec({
      title: 'Leave the room?',
      body: 'The match ends here and your opponent is told you left.',
      confirmLabel: 'Leave the room',
      tone: 'danger',
      onConfirm: goHome,
    });
  }, [gameStatus, isAiMode, goHome]);

  // Keep the ref so the history listener below never has to re-subscribe.
  const requestExitMatchRef = useRef(requestExitMatch);
  useEffect(() => {
    requestExitMatchRef.current = requestExitMatch;
  });

  // Back used to leave the site entirely, because entering a match only changed
  // React state. Park one history entry per match and treat Back as "exit match".
  useEffect(() => {
    if (gameStatus !== 'playing') return;
    window.history.pushState({ caroMatch: true }, '');
    const onPop = () => {
      window.history.pushState({ caroMatch: true }, '');
      requestExitMatchRef.current();
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [gameStatus]);

  /* -------------------------------- rooms -------------------------------- */

  // Helper Wrappers to ensure AI mode is turned off when creating/joining multiplayer rooms
  const handleCreateRoom = (roomCode?: string, boardSize?: number, isPublic?: boolean) => {
    setIsAiMode(false);
    setCopyState('idle');
    setManualLink(null);
    webrtc.createRoom(roomCode, boardSize, isPublic);
  };

  const handleJoinRoom = (roomCode: string) => {
    setIsAiMode(false);
    // Keep whatever was typed on failure: retyping a code you already have is
    // pure friction, and the message needs something to refer to.
    webrtc.joinRoom(roomCode);
  };

  const handleSetReady = (ready: boolean) => {
    setIAmReady(ready);
    if (webrtc.isConnected) {
      webrtc.sendMessage({ type: 'READY_STATE', payload: { ready } });
    }
  };

  // Rematch Button Handler (supports both Host and Guest)
  const handleRematchButtonClick = () => {
    if (isAiMode && !webrtc.isConnected && !webrtc.roomId) {
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
      return;
    }
    if (gameStatus !== 'ended' || !webrtc.isConnected || rematchOffer !== 'none') return;
    webrtc.sendMessage({ type: 'PROPOSE_REMATCH', payload: {} });
    setRematchOffer('sent');
    showNotice('Rematch offered. Waiting for your opponent.');
  };

  const handleAcceptRematch = () => {
    setRematchOffer('none');
    if (webrtc.isHost) {
      handleStartGame();
      return;
    }
    // Only the host can deal a new board, so ask it to.
    if (webrtc.isConnected) {
      webrtc.sendMessage({ type: 'ACCEPT_REMATCH', payload: {} });
    }
  };

  const handleDeclineRematch = () => {
    setRematchOffer('none');
    if (webrtc.isConnected) {
      webrtc.sendMessage({ type: 'DECLINE_REMATCH', payload: {} });
    }
  };

  const handleResignClick = () => {
    if (gameStatus !== 'playing') return;
    setConfirmSpec({
      title: 'Resign this match?',
      body: 'The match ends immediately and is recorded as a loss for you.',
      confirmLabel: 'Resign',
      tone: 'danger',
      onConfirm: () => handleGameOver(myPiece === 'X' ? 'O' : 'X', null, 'resigned'),
    });
  };

  const roomLink = webrtc.roomId ? `${window.location.origin}?room=${webrtc.roomId}` : '';

  // "Link Copied!" appeared before the clipboard write had resolved, so a
  // browser that refused the permission still reported success.
  const copyRoomLink = async () => {
    if (!roomLink) return;
    setManualLink(null);
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(roomLink);
      setCopyState('copied');
      setTimeout(() => setCopyState('idle'), 2500);
    } catch {
      setCopyState('failed');
      setManualLink(roomLink);
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

  const opponentUser = isAiMode
    ? {
        uid: 'ai_bot',
        displayName: 'AI Bot 🤖',
        photoURL: '/Avatar/Gemini.gif',
        email: '',
        elo: 1350,
        wins: 50,
        losses: 50,
        draws: 10,
        streak: 0,
      }
    : webrtc.peerUser;

  // Available Rooms Hook (Serverless Discovery via BroadcastChannel & Local Storage Heartbeats)
  const availableRooms = useAvailableRooms();

  // Handle Send Buzz
  const handleSendBuzz = () => {
    playBuzzSound();
    webrtc.sendBuzz();
  };

  return (
    <div className="min-h-[100dvh] flex flex-col justify-between bg-surface-2 text-ink selection:bg-accent selection:text-accent-fg">
      {/* Top Navbar */}
      <Navbar
        inMatch={gameStatus === 'playing' || gameStatus === 'ended'}
        onOpenLeaderboard={() => setLeaderboardOpen(true)}
        onOpenHistory={() => setHistoryOpen(true)}
        onOpenSettingsAndTheme={() => setSettingsAndThemeOpen(true)}
        onNavigateHome={requestExitMatch}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 flex flex-col justify-center items-center">
        {/* HOME. The three ways to start a game come first; the public room
            list, which is empty most of the time, comes after them. */}
        {gameStatus === 'lobby' && !webrtc.roomId && (
          <div className="w-full max-w-4xl space-y-4">
            <div className="panel p-6 text-center space-y-2 sm:p-8">
              <h2 className="text-2xl font-semibold tracking-tight text-ink">
                Play Caro (Gomoku)
              </h2>
              <p className="mx-auto max-w-md text-sm text-muted">{WIN_RULE_TEXT}</p>
              {(!user || user.isGuest) && (
                <p className="chip chip-accent mx-auto">Play now, no account needed</p>
              )}
            </div>

            {webrtc.error && (
              <div
                role="alert"
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-danger bg-danger-soft p-3 text-xs font-medium text-danger"
              >
                <span>{webrtc.error}</span>
                <button type="button" onClick={webrtc.clearError} className="btn btn-secondary btn-sm">
                  Dismiss
                </button>
              </div>
            )}

            {webrtc.isReconnecting && (
              <div className="flex items-center justify-between rounded-md border border-warning bg-warning-soft p-3 font-mono text-xs font-medium text-warning">
                <span>Opponent disconnected. Reconnecting...</span>
                <span>{webrtc.reconnectTimeLeft}s</span>
              </div>
            )}

            <div className="grid gap-4 text-left md:grid-cols-2">
              {/* Play alone. Listed first because it is the only option that
                  works with nobody else around. */}
              <div className="card flex flex-col gap-3 p-5">
                <div>
                  <h3 className="text-sm font-semibold text-ink">Play the bot</h3>
                  <p className="mt-1 text-xs leading-relaxed text-muted">
                    Starts straight away, on your own. Nothing is shared and your rating
                    does not change.
                  </p>
                </div>
                <button
                  onClick={handleStartAiMode}
                  className="btn btn-primary btn-lg mt-auto w-full"
                >
                  <Bot size={16} strokeWidth={1.75} aria-hidden="true" />
                  <span>Play vs Bot</span>
                </button>
              </div>

              {/* Play someone else. */}
              <div className="card space-y-4 p-5">
                <div>
                  <h3 className="text-sm font-semibold text-ink">Play a friend</h3>
                  <p className="mt-1 text-xs leading-relaxed text-muted">
                    Open a room, then send them the link or the code.
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2 rounded-md bg-surface-3 p-1">
                    <button
                      type="button"
                      onClick={() => setIsRoomPublic(true)}
                      aria-pressed={isRoomPublic}
                      className={`flex flex-1 items-center justify-center gap-1.5 rounded-sm px-3 py-1.5 text-xs font-medium transition ${
                        isRoomPublic ? 'bg-surface text-accent-text shadow-xs' : 'text-muted hover:text-ink'
                      }`}
                    >
                      <Globe size={14} strokeWidth={1.75} aria-hidden="true" />
                      <span>Public</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsRoomPublic(false)}
                      aria-pressed={!isRoomPublic}
                      className={`flex flex-1 items-center justify-center gap-1.5 rounded-sm px-3 py-1.5 text-xs font-medium transition ${
                        !isRoomPublic ? 'bg-surface text-accent-text shadow-xs' : 'text-muted hover:text-ink'
                      }`}
                    >
                      <Lock size={14} strokeWidth={1.75} aria-hidden="true" />
                      <span>Private</span>
                    </button>
                  </div>
                  <p className="field-hint">
                    {isRoomPublic
                      ? 'Public: anyone on this app can see your room and join it.'
                      : 'Private: only someone with your code or link can join.'}
                  </p>
                </div>

                <button
                  onClick={() => handleCreateRoom(undefined, roomSettings.boardSize, isRoomPublic)}
                  disabled={webrtc.isConnecting}
                  className="btn btn-primary btn-lg w-full"
                >
                  {webrtc.isConnecting
                    ? 'Opening the room…'
                    : `Create a ${isRoomPublic ? 'public' : 'private'} room`}
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
                    Join with a code or invite link
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
                      aria-describedby="room-code-hint"
                      className={`field-input flex-1 ${
                        inputRoomCode.includes('/')
                          ? 'text-xs'
                          : 'text-center font-mono uppercase tracking-[0.2em]'
                      }`}
                    />
                    <button
                      type="submit"
                      disabled={!inputRoomCode.trim() || webrtc.isConnecting}
                      className="btn btn-primary shrink-0"
                    >
                      {webrtc.isConnecting ? 'Joining…' : 'Join'}
                    </button>
                  </div>
                  <p id="room-code-hint" className="field-hint">
                    Pasting the whole invite link works too.
                  </p>
                </form>
              </div>
            </div>

            {/* The rules both players will be bound by, before anyone commits. */}
            <div className="card flex flex-wrap items-center justify-between gap-3 p-4 text-left">
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

            <div className="card text-left">
              <div className="flex items-center justify-between border-b border-line px-5 py-3">
                <h3 className="text-sm font-medium text-ink">Public rooms</h3>
                <span className="text-xs tabular-nums text-muted">{availableRooms.length}</span>
              </div>
              <div className="p-5">
                {availableRooms.length === 0 ? (
                  <div className="space-y-3 rounded-md border border-dashed border-line bg-surface-2 p-6 text-center">
                    {/* "Still looking" and "nobody is hosting" are different
                        situations, and only the second one needs a way out. */}
                    <p className="text-xs font-medium text-ink">
                      {roomScanDone ? 'Nobody is hosting a public room right now.' : 'Looking for public rooms…'}
                    </p>
                    {roomScanDone && (
                      <div className="flex flex-wrap items-center justify-center gap-2">
                        <button
                          onClick={() => handleCreateRoom(undefined, roomSettings.boardSize, true)}
                          className="btn btn-primary btn-sm"
                        >
                          Open one yourself
                        </button>
                        <button onClick={handleStartAiMode} className="btn btn-secondary btn-sm">
                          Play the bot instead
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="max-h-72 space-y-2.5 overflow-y-auto pr-1">
                    {availableRooms.map((room) => (
                      <div
                        key={room.roomId}
                        className="flex items-center justify-between rounded-md border border-line bg-surface-2 p-3 shadow-xs transition hover:border-accent"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <img
                            src={room.hostAvatar || '/Avatar/Poring.gif'}
                            alt=""
                            aria-hidden="true"
                            className="h-9 w-9 shrink-0 rounded-full border border-accent bg-surface object-contain shadow-xs"
                          />
                          <div className="min-w-0">
                            <div className="truncate text-xs font-semibold text-ink">
                              {room.hostName}'s room
                            </div>
                            <div className="mt-0.5 font-mono text-[10px] text-muted">
                              Code: <span className="font-medium text-accent-text">{room.roomId}</span> · {room.boardSize}x{room.boardSize}
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => handleJoinRoom(room.roomId)}
                          disabled={webrtc.isConnecting}
                          className="btn btn-primary btn-sm ml-2 shrink-0"
                        >
                          Join
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* WAITING ROOM. Same room, its own screen: who is here, what the rules
            are, and whether both players have actually said they are ready. */}
        {gameStatus === 'lobby' && webrtc.roomId && (
          <div className="w-full max-w-md space-y-4 text-left">
            <div className="panel space-y-4 p-5">
              <div className="flex items-start justify-between gap-3 border-b border-line pb-3">
                <div>
                  <span className="block text-xs font-semibold text-muted">Room code</span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-xs font-medium text-subtle">
                    {isRoomPublic ? (
                      <>
                        <Globe size={13} strokeWidth={1.75} aria-hidden="true" />
                        <span>Public room</span>
                      </>
                    ) : (
                      <>
                        <Lock size={13} strokeWidth={1.75} aria-hidden="true" />
                        <span>Private room</span>
                      </>
                    )}
                  </span>
                </div>
                <span className="font-mono text-lg font-semibold tracking-widest text-accent-text">
                  {webrtc.roomId}
                </span>
              </div>

              <div className="flex gap-2">
                <button onClick={copyRoomLink} className="btn btn-tonal btn-sm flex-1">
                  {copyState === 'copied' ? (
                    <>
                      <Check size={14} strokeWidth={2} aria-hidden="true" />
                      <span>Link copied</span>
                    </>
                  ) : (
                    <>
                      <Copy size={14} strokeWidth={1.75} aria-hidden="true" />
                      <span>Copy invite link</span>
                    </>
                  )}
                </button>
                {typeof navigator !== 'undefined' && 'share' in navigator && (
                  <button onClick={shareRoomLink} className="btn btn-secondary btn-sm shrink-0">
                    <Share2 size={14} strokeWidth={1.75} aria-hidden="true" />
                    <span>Share</span>
                  </button>
                )}
              </div>

              {/* When the clipboard is blocked, hand over the link itself
                  rather than a success message that was never true. */}
              {copyState === 'failed' && manualLink && (
                <div className="field">
                  <label htmlFor="manual-room-link" className="field-label">
                    Your browser blocked the clipboard. Copy this link by hand:
                  </label>
                  <input
                    id="manual-room-link"
                    type="text"
                    readOnly
                    value={manualLink}
                    onFocus={(e) => e.currentTarget.select()}
                    className="field-input text-xs"
                  />
                </div>
              )}

              <div className="rounded-md border border-line bg-surface p-3.5 text-xs">
                <div className="font-medium text-ink">
                  {webrtc.peerUser
                    ? webrtc.peerUser.displayName
                    : webrtc.isConnecting
                    ? 'Connecting…'
                    : 'No opponent yet'}
                </div>
                <div className="mt-0.5 text-[10px] font-medium text-muted">
                  {webrtc.isConnected
                    ? peerReady
                      ? 'Connected and ready.'
                      : 'Connected. Waiting for them to say they are ready.'
                    : webrtc.peerLeft
                    ? 'They left the room.'
                    : 'Send them the code or the link.'}
                </div>
              </div>

              <div className="space-y-2 rounded-md border border-line bg-surface-2 p-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  {summariseRoomSettings(roomSettings).map((fact) => (
                    <span key={fact.label} className="chip">
                      <span>{fact.label}</span>
                      <span className="font-semibold text-ink">{fact.value}</span>
                    </span>
                  ))}
                </div>
                <p className="text-[11px] leading-relaxed text-muted">
                  {WIN_RULE_TEXT} The host plays X and moves first.
                </p>
                {webrtc.isHost && (
                  <button
                    type="button"
                    onClick={() => setSettingsAndThemeOpen(true)}
                    className="btn btn-secondary btn-sm"
                  >
                    Change rules
                  </button>
                )}
              </div>

              {/* Ready gate. The host could previously start the moment the
                  channel opened, with the guest still reading the rules. */}
              {webrtc.isHost ? (
                <div className="flex gap-2 pt-1">
                  <button
                    disabled={!webrtc.isConnected || !peerReady}
                    onClick={handleStartGame}
                    title={
                      !webrtc.isConnected
                        ? 'Nobody has joined yet'
                        : !peerReady
                        ? 'Waiting for your opponent to be ready'
                        : 'Start the match'
                    }
                    className="btn btn-primary flex-1"
                  >
                    {webrtc.isConnected && !peerReady ? 'Waiting for them…' : 'Start match'}
                  </button>
                  <button onClick={goHome} className="btn btn-secondary shrink-0">
                    Leave room
                  </button>
                </div>
              ) : (
                <div className="flex gap-2 pt-1">
                  <button
                    disabled={!webrtc.isConnected}
                    onClick={() => handleSetReady(!iAmReady)}
                    className={`flex-1 ${iAmReady ? 'btn btn-secondary' : 'btn btn-primary'}`}
                  >
                    {iAmReady ? 'Ready. Tap to cancel' : "I'm ready"}
                  </button>
                  <button onClick={goHome} className="btn btn-secondary shrink-0">
                    Leave room
                  </button>
                </div>
              )}

              {!webrtc.isHost && iAmReady && (
                <p className="text-center text-[11px] text-muted">
                  Waiting for the host to start the match.
                </p>
              )}
            </div>

            {webrtc.error && (
              <div
                role="alert"
                className="rounded-md border border-danger bg-danger-soft p-3 text-xs font-medium text-danger"
              >
                {webrtc.error}
              </div>
            )}

            {webrtc.isReconnecting && (
              <div className="flex items-center justify-between rounded-md border border-warning bg-warning-soft p-3 font-mono text-xs font-medium text-warning">
                <span>Opponent disconnected. Reconnecting...</span>
                <span>{webrtc.reconnectTimeLeft}s</span>
              </div>
            )}
          </div>
        )}

        {/* 2-SIDED SPLIT SCREEN GAME LAYOUT */}
        {(gameStatus === 'playing' || gameStatus === 'ended') && (
          <div className="w-full flex flex-col lg:flex-row lg:items-start gap-6">
            {/* SIDE 1 (LEFT): Light Mode Board Game View */}
            {/* min-w-0 stops the board column from claiming its content width and
                pushing the chat rail off the right edge of the viewport. */}
            <div ref={boardPanelRef} className="flex-1 min-w-0 w-full flex flex-col items-center justify-center">
              {/* Board Component with Integrated Minimal Match Header */}
              <Board
                board={board}
                size={roomSettings.boardSize}
                onCellClick={handleCellClick}
                lastMove={lastMove}
                winningLine={winningLine}
                currentTurn={currentTurn}
                disabled={gameStatus !== 'playing' || webrtc.isReconnecting || isCountingIn || currentTurn !== myPiece}
                countdown={countdown}
                myPiece={myPiece}
                myUser={user}
                opponent={opponentUser}
                turnTimeLeft={turnTimeLeft}
                myTotalTimeLeft={myPiece === 'X' ? p1TotalTime : p2TotalTime}
                opponentTotalTimeLeft={myPiece === 'X' ? p2TotalTime : p1TotalTime}
                gameStatus={gameStatus}
                gameResult={gameResult}
                elapsedGameTime={elapsedGameTime}
                opponentThinking={isAiThinking}
                modeLabel={isAiMode ? 'Practice vs Bot' : 'Online match'}
                onExitMatch={requestExitMatch}
                exitLabel={isAiMode ? 'Exit practice' : 'Leave room'}
                resultReason={describeResultReason(gameResult?.reason)}
                ratingNote={ratingNote}
                resultActions={
                  isAiMode ? (
                    <>
                      <button onClick={handleRematchButtonClick} className="btn btn-primary btn-sm">
                        Play again
                      </button>
                      <button onClick={goHome} className="btn btn-secondary btn-sm">
                        Back to home
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={handleRematchButtonClick}
                        disabled={rematchOffer !== 'none' || !webrtc.isConnected}
                        className="btn btn-primary btn-sm"
                      >
                        {rematchOffer === 'sent' ? 'Waiting for their answer…' : 'Offer a rematch'}
                      </button>
                      {/* Two different destinations, so two different names. */}
                      <button onClick={goToWaitingRoom} className="btn btn-secondary btn-sm">
                        Back to waiting room
                      </button>
                      <button onClick={goHome} className="btn btn-ghost btn-sm">
                        Leave room
                      </button>
                    </>
                  )
                }
                onViewOpponentProfile={(opp) => setSelectedOpponentProfile(opp)}
                onViewMyProfile={openProfileModal}
              />
            </div>

            {/* SIDE 2 (RIGHT): Controls, Actions & Live Chat Feed Sidebar */}
            <div
              className="w-full lg:w-[320px] shrink-0 flex flex-col min-h-0 lg:sticky lg:top-20"
              style={
                // Only the chat rail needs to match the board's height. Practice has
                // no chat, so forcing it left a column of empty panel.
                isDesktop && boardPanelHeight && !isAiMode
                  ? { height: `${boardPanelHeight}px`, maxHeight: 'calc(100dvh - 6.5rem)' }
                  : undefined
              }
            >
              <GameControls
                myPiece={myPiece}
                currentTurn={currentTurn}
                turnTimeLeft={turnTimeLeft}
                myTotalTimeLeft={myPiece === 'X' ? p1TotalTime : p2TotalTime}
                opponentTotalTimeLeft={myPiece === 'X' ? p2TotalTime : p1TotalTime}
                opponent={opponentUser}
                myUser={user}
                chatMessages={webrtc.chatMessages}
                lastReaction={webrtc.lastReaction}
                onSendChat={webrtc.sendChat}
                onSendReaction={webrtc.sendReaction}
                onSendBuzz={handleSendBuzz}
                onProposeUndo={handleUndoButtonClick}
                onProposeRematch={handleRematchButtonClick}
                onResign={handleResignClick}
                onExitMatch={requestExitMatch}
                gameStatus={gameStatus}
                allowUndo={roomSettings.allowUndo}
                boardSize={roomSettings.boardSize}
                isAiMode={isAiMode}
                canUndo={moveHistory.length > 0}
                undoPending={undoRequest === 'sent'}
                rematchPending={rematchOffer === 'sent'}
              />
            </div>
          </div>
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

      {/* Connection-loss overlay intentionally blocks the board while the match is paused. */}
      {gameStatus === 'playing' && webrtc.isReconnecting && !isAiMode && (
        <div className="modal-scrim" role="dialog" aria-modal="true" aria-labelledby="reconnect-title">
          <div className="w-full max-w-sm overflow-hidden rounded-lg border border-line bg-surface shadow-2xl">
            <div className="h-1.5 bg-surface-3">
              <div
                className="h-full bg-warning-solid transition-all duration-1000 ease-linear"
                style={{ width: `${(webrtc.reconnectTimeLeft / 30) * 100}%` }}
              />
            </div>
            <div className="p-7 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-lg bg-warning-soft text-warning"><WifiOff size={24} strokeWidth={1.75} aria-hidden="true" /></div>
              <h3 id="reconnect-title" className="mt-2 text-xl font-semibold tracking-tight text-ink">Reconnecting opponent</h3>
              <p className="mt-2 text-sm leading-6 text-muted">Your opponent disconnected. The board and clocks are paused while we keep their seat open.</p>
              <div className="my-6 rounded-lg bg-inverse px-5 py-4 text-inverse-fg">
                <span className="font-mono text-4xl font-semibold tabular-nums">{webrtc.reconnectTimeLeft}s</span>
                <p className="mt-1 text-[11px] font-semibold text-subtle">until they forfeit the match</p>
              </div>
              <p className="text-xs font-medium text-muted">They can return by reopening the room link or refreshing the page.</p>
            </div>
          </div>
        </div>
      )}

      {/* Undo Proposal Modal */}
      {undoRequestOpen && (
        <div className="modal-scrim" role="dialog" aria-modal="true" aria-labelledby="undo-request-title">
          <div className="bg-surface p-6 rounded-lg border border-line max-w-sm w-full text-center space-y-4">
            <h3 id="undo-request-title" className="text-base font-semibold text-ink">
              Take back a move?
            </h3>
            <p className="text-xs text-muted">
              Your opponent wants to undo their last move. Accepting puts the board back
              one move for both of you.
            </p>
            <div className="flex gap-2 pt-2">
              <button onClick={handleAcceptUndoProposal} className="btn btn-primary btn-sm flex-1">
                Allow it
              </button>
              <button onClick={handleDeclineUndoProposal} className="btn btn-secondary btn-sm flex-1">
                Decline
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rematch offer. The host used to restart the board the instant a guest
          asked, with no way for either side to say no. */}
      {rematchOffer === 'received' && (
        <div className="modal-scrim" role="dialog" aria-modal="true" aria-labelledby="rematch-title">
          <div className="bg-surface p-6 rounded-lg border border-line max-w-sm w-full text-center space-y-4">
            <h3 id="rematch-title" className="text-base font-semibold text-ink">Rematch?</h3>
            <p className="text-xs text-muted">
              {webrtc.peerUser?.displayName || 'Your opponent'} wants to play another round
              with the same rules.
            </p>
            <div className="flex gap-2 pt-2">
              <button onClick={handleAcceptRematch} className="btn btn-primary btn-sm flex-1">
                Play again
              </button>
              <button onClick={handleDeclineRematch} className="btn btn-secondary btn-sm flex-1">
                No thanks
              </button>
            </div>
          </div>
        </div>
      )}

      {/* One confirmation dialog for everything that discards a game. */}
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

      {/* Match rules and appearance. Only the host may edit the rules in a
          room: a guest changing them desynchronised the two boards. */}
      <SettingsAndThemeModal
        isOpen={settingsAndThemeOpen}
        onClose={() => setSettingsAndThemeOpen(false)}
        settings={roomSettings}
        onUpdateSettings={(newS) => {
          setRoomSettings(newS);
          if (webrtc.isHost) {
            webrtc.sendMessage({ type: 'ROOM_SETTINGS_SYNC', payload: { settings: newS } });
          }
        }}
        isHost={!webrtc.roomId || webrtc.isHost}
        gameStatus={gameStatus}
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
      <footer className="w-full border-t border-line bg-surface py-4 text-center text-xs text-muted">
        Peer-to-peer Caro. No servers between you and your opponent.
      </footer>
    </div>
  );
};
