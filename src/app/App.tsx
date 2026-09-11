import React, { useState, useEffect, useCallback, useRef } from 'react';
import confetti from 'canvas-confetti';
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
import { DEFAULT_ROOM_SETTINGS } from '../features/settings/types';
import type { RoomSettings } from '../features/settings/types';
import { createEmptyBoard, checkWin, isBoardFull } from '../shared/utils/gomokuLogic';
import type { BoardMatrix } from '../shared/utils/gomokuLogic';
import { getBestAiMove } from '../features/game/aiEngine';
import { calculateElo } from '../shared/utils/eloCalculator';
import { saveMatchRecord } from '../features/history/historyService';

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
  const { user, openProfileModal } = useAuth();
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
  const [copiedLink, setCopiedLink] = useState(false);
  const [isRoomPublic, setIsRoomPublic] = useState(true);

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

  // Auto-reconnect on accidental F5 / page refresh or direct room link access
  useEffect(() => {
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
  }, []);

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

  // Turn Countdown Timer Loop
  useEffect(() => {
    if (gameStatus !== 'playing' || webrtc.isReconnecting || roomSettings.turnTimeSeconds === 0) return;

    const timer = setInterval(() => {
      setTurnTimeLeft((prev) => {
        if (prev <= 1) {
          handleGameOver(currentTurn === 'X' ? 'O' : 'X', null, 'turn_timeout');
          return 0;
        }
        if (prev === 5) playTimerWarningSound();
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [gameStatus, currentTurn, webrtc.isReconnecting, roomSettings.turnTimeSeconds, playTimerWarningSound]);

  // Chess Clock Total Match Time Loop
  useEffect(() => {
    if (gameStatus !== 'playing' || webrtc.isReconnecting || roomSettings.totalTimeMinutes === 0) return;

    const timer = setInterval(() => {
      if (currentTurn === 'X') {
        setP1TotalTime((prev) => {
          if (prev <= 1) {
            handleGameOver('O', null, 'total_time_out');
            return 0;
          }
          return prev - 1;
        });
      } else {
        setP2TotalTime((prev) => {
          if (prev <= 1) {
            handleGameOver('X', null, 'total_time_out');
            return 0;
          }
          return prev - 1;
        });
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [gameStatus, currentTurn, webrtc.isReconnecting, roomSettings.totalTimeMinutes]);

  // Overall Match Elapsed Game Timer
  useEffect(() => {
    if (gameStatus !== 'playing' || webrtc.isReconnecting) return;

    const timer = setInterval(() => {
      setElapsedGameTime((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [gameStatus, webrtc.isReconnecting]);

  // Handle Match Over & ELO rating calculation
  const handleGameOver = useCallback((
    winner: 'X' | 'O' | 'DRAW',
    line: Array<[number, number]> | null,
    reason: string,
    broadcast = true
  ) => {
    setGameStatus('ended');
    setWinningLine(line);

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

    // Save match record & update ELO
    if (user && webrtc.peerUser) {
      const p1Elo = user.elo || 1200;
      const p2Elo = webrtc.peerUser.elo || 1200;
      const outcome = winner === myPiece ? 'p1' : winner === 'DRAW' ? 'draw' : 'p2';
      const eloCalc = calculateElo(p1Elo, p2Elo, outcome);

      saveMatchRecord({
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
      });
    }
  }, [myPiece, playWinSound, roomSettings, user, webrtc]);

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

  // Register WebRTC incoming message listener
  useEffect(() => {
    const unbind = webrtc.registerMessageListener((msg) => {
      if (msg.type === 'ROOM_SETTINGS_SYNC') {
        setRoomSettings(msg.payload.settings);
      } else if (msg.type === 'GAME_START') {
        setIsAiMode(false);
        const { guestPiece, firstTurn, boardSize, matchCount: remoteMatchCount } = msg.payload;
        if (remoteMatchCount !== undefined) setMatchCount(remoteMatchCount);
        setMyPiece(guestPiece);
        setCurrentTurn(firstTurn || 'X');
        setBoard(createEmptyBoard(boardSize || roomSettings.boardSize));
        setMoveHistory([]);
        setGameStatus('playing');
        setWinningLine(null);
        setGameResult(null);
        webrtc.clearChat();
        setElapsedGameTime(0);
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
        if (webrtc.isHost) {
          handleStartGame();
        }
      } else if (msg.type === 'MOVE') {
        const { row, col, piece, nextTurn } = msg.payload;
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
        setUndoRequestOpen(true);
      } else if (msg.type === 'ACCEPT_UNDO') {
        executeUndoMove(msg.payload.history);
      } else if (msg.type === 'GAME_OVER') {
        const { winner, winningLine, reason } = msg.payload;
        handleGameOver(winner, winningLine, reason, false);
      } else if (msg.type === 'BUZZ') {
        playBuzzSound();
      }
    });

    return () => unbind();
  }, [webrtc, gameStatus, roomSettings, board, lastMove, moveHistory, winningLine, currentTurn, gameResult, matchCount, turnTimeLeft, p1TotalTime, p2TotalTime, elapsedGameTime, playMoveSound, playBuzzSound, handleGameOver, executeUndoMove]);

  // Both players see the same paused countdown; when it expires, the connected player wins.
  useEffect(() => {
    if (!webrtc.connectionTimedOut || gameStatus !== 'playing' || isAiMode) return;
    handleGameOver(myPiece === 'X' ? 'O' : 'X', null, 'opponent_disconnected', false);
  }, [webrtc.connectionTimedOut, gameStatus, isAiMode, myPiece, handleGameOver]);

  // AI Move Engine (Minimax Alpha-Beta Threat Space AI Engine)
  const makeAiMove = useCallback((currentBoard: BoardMatrix, currentHistory: MoveHistoryItem[]) => {
    const size = roomSettings.boardSize;
    const aiPiece: 'X' | 'O' = myPiece === 'X' ? 'O' : 'X';

    const [aiRow, aiCol] = getBestAiMove(currentBoard, size, aiPiece);

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
  }, [myPiece, roomSettings.boardSize, roomSettings.turnTimeSeconds, playMoveSound, handleGameOver]);

  // Execute Cell Move
  const handleCellClick = (row: number, col: number) => {
    if (gameStatus !== 'playing' || board[row][col] !== null) return;
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
      setTimeout(() => makeAiMove(nextBoard, updatedHistory), 400);
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
        alert('Undo request sent to opponent.');
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

  // Host Starts Game (or triggers next round in session)
  const handleStartGame = () => {
    if (webrtc.roomId && !webrtc.isHost) return; // Only Host can start multiplayer match
    setIsAiMode(false);
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
    setWinningLine(null);
    setGameResult(null);
    setGameStatus('playing');
    setElapsedGameTime(0);
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
    setIsAiMode(true);
    const nextMatchCount = matchCount + 1;
    setMatchCount(nextMatchCount);

    const playerPiece: 'X' | 'O' = 'X';

    setMyPiece(playerPiece);
    setCurrentTurn('X');
    const newBoard = createEmptyBoard(roomSettings.boardSize);
    setBoard(newBoard);
    setMoveHistory([]);
    setWinningLine(null);
    setGameResult(null);
    setGameStatus('playing');
    setElapsedGameTime(0);
    webrtc.clearChat();
  };

  // Helper Wrappers to ensure AI mode is turned off when creating/joining multiplayer rooms
  const handleCreateRoom = (roomCode?: string, boardSize?: number, isPublic?: boolean) => {
    setIsAiMode(false);
    webrtc.createRoom(roomCode, boardSize, isPublic);
  };

  const handleJoinRoom = (roomCode: string) => {
    setIsAiMode(false);
    webrtc.joinRoom(roomCode);
  };

  // Rematch Button Handler (supports both Host and Guest)
  const handleRematchButtonClick = () => {
    if (isAiMode && !webrtc.isConnected && !webrtc.roomId) {
      handleStartAiMode();
    } else if (webrtc.isHost) {
      handleStartGame();
    } else if (webrtc.isConnected) {
      webrtc.sendMessage({ type: 'PROPOSE_REMATCH', payload: {} });
    }
  };

  const copyRoomLink = () => {
    if (!webrtc.roomId) return;
    const url = `${window.location.origin}?room=${webrtc.roomId}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
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
    <div className="min-h-screen flex flex-col justify-between bg-slate-50 text-slate-800 selection:bg-emerald-600 selection:text-white">
      {/* Top Navbar */}
      <Navbar
        onOpenLeaderboard={() => setLeaderboardOpen(true)}
        onOpenHistory={() => setHistoryOpen(true)}
        onOpenSettingsAndTheme={() => setSettingsAndThemeOpen(true)}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 flex flex-col justify-center items-center">
        {/* Lobby View */}
        {gameStatus === 'lobby' && (
          <div className="w-full max-w-4xl bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden text-center">
            {/* Top Title Banner */}
            <div className="p-6 sm:p-8 pb-4 space-y-1.5 text-center border-b border-slate-100">
              <span className="text-[11px] font-mono font-bold tracking-widest text-emerald-700 uppercase">
                Real-Time Gaming
              </span>
              <h2 className="text-2xl font-black tracking-tight text-slate-900">
                Play Caro Online
              </h2>
              <p className="text-xs text-slate-500 font-medium">
                Gemini flash 2.5 Because no money for Fable 5.6
              </p>
            </div>

            {webrtc.isReconnecting && (
              <div className="m-4 p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs flex items-center justify-between font-mono font-bold">
                <span>Opponent disconnected. Reconnecting...</span>
                <span>{webrtc.reconnectTimeLeft}s</span>
              </div>
            )}

            {!webrtc.roomId ? (
              <div>
                {/* 2-Column Header Bar with Light Green Fill */}
                <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-emerald-200/60 bg-emerald-50/60 border-b border-emerald-100 text-left">
                  <div className="px-6 py-3 flex items-center justify-between">
                    <h3 className="text-xs font-mono font-extrabold text-emerald-900 uppercase tracking-wider flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
                      Available Rooms ({availableRooms.length})
                    </h3>
                    <span className="text-[10px] font-semibold text-emerald-700">Public Lobby</span>
                  </div>
                  <div className="px-6 py-3 flex items-center justify-between">
                    <h3 className="text-xs font-mono font-extrabold text-emerald-900 uppercase tracking-wider">
                      Host a Room
                    </h3>
                  </div>
                </div>

                {/* 2-Column Content Body (Clean Background) */}
                <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-200 text-left bg-white">
                  {/* SIDE 1: Available Public Rooms */}
                  <div className="p-6 space-y-4 flex flex-col justify-between">
                    <div>
                      {availableRooms.length === 0 ? (
                        <div className="py-10 text-center space-y-2.5 bg-slate-50 rounded-xl border border-dashed border-slate-200 p-4">
                          <div className="text-xs font-bold text-slate-700">No active rooms found</div>
                          <div className="text-[11px] text-slate-500 leading-relaxed max-w-xs mx-auto">
                            Create a room on the right side to let others join, or join via room code!
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                          {availableRooms.map((room) => (
                            <div
                              key={room.roomId}
                              className="p-3 bg-slate-50 border border-slate-200 hover:border-emerald-500 rounded-xl flex items-center justify-between transition shadow-xs"
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <img
                                  src={room.hostAvatar || '/Avatar/Poring.gif'}
                                  alt={room.hostName}
                                  className="w-9 h-9 rounded-full border border-emerald-400 bg-white shrink-0 object-contain shadow-xs"
                                />
                                <div className="min-w-0">
                                  <div className="text-xs font-extrabold text-slate-800 truncate">
                                    {room.hostName}'s Room
                                  </div>
                                  <div className="text-[10px] font-mono text-slate-500 mt-0.5">
                                    Code: <span className="font-bold text-emerald-700">{room.roomId}</span> · {room.boardSize}x{room.boardSize}
                                  </div>
                                </div>
                              </div>
                              <button
                                onClick={() => handleJoinRoom(room.roomId)}
                                className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition shrink-0 ml-2 shadow-xs"
                              >
                                Join
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono text-center pt-2 border-t border-slate-100">
                      Real-time P2P broadcast
                    </div>
                  </div>

                  {/* SIDE 2: Create Room & Quick Join */}
                  <div className="p-6 space-y-4">
                    <div className="space-y-3">
                      {/* Room Visibility Segmented Selector (Public default) */}
                      <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl">
                        <button
                          type="button"
                          onClick={() => setIsRoomPublic(true)}
                          className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                            isRoomPublic
                              ? 'bg-white text-emerald-700 shadow-xs'
                              : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          <span>🌐</span>
                          <span>Public</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsRoomPublic(false)}
                          className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                            !isRoomPublic
                              ? 'bg-white text-indigo-700 shadow-xs'
                              : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          <span>🔒</span>
                          <span>Private</span>
                        </button>
                      </div>

                      <button
                        onClick={() => handleCreateRoom(undefined, roomSettings.boardSize, isRoomPublic)}
                        className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs transition shadow-xs"
                      >
                        Create {isRoomPublic ? 'Public' : 'Private'} Room
                      </button>
                    </div>

                    <div className="relative flex items-center py-1">
                      <div className="flex-grow border-t border-slate-200"></div>
                      <span className="flex-shrink mx-3 text-[10px] text-slate-400 uppercase tracking-widest font-mono">or join code</span>
                      <div className="flex-grow border-t border-slate-200"></div>
                    </div>

                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={inputRoomCode}
                        onChange={(e) => setInputRoomCode(e.target.value.toUpperCase())}
                        placeholder="ROOM CODE"
                        className="flex-1 bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-center font-mono text-slate-900 font-bold uppercase tracking-wider focus:outline-none focus:border-indigo-600"
                      />
                      <button
                        disabled={!inputRoomCode.trim()}
                        onClick={() => handleJoinRoom(inputRoomCode)}
                        className="py-2.5 px-5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs transition shadow-xs"
                      >
                        Join
                      </button>
                    </div>

                    <button
                      onClick={handleStartAiMode}
                      className="w-full py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs border border-slate-200 transition"
                    >
                      Practice vs Bot
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-6">
                <div className="max-w-md mx-auto space-y-4 text-left bg-slate-50 p-5 rounded-xl border border-slate-200">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                    <div>
                      <span className="text-xs font-semibold text-slate-500 block">Room Code</span>
                      <span className="text-xs font-medium text-slate-400">
                        {isRoomPublic ? '🌐 Public Room' : '🔒 Private Room'}
                      </span>
                    </div>
                    <span className="text-lg font-mono font-extrabold text-emerald-700 tracking-widest">
                      {webrtc.roomId}
                    </span>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={copyRoomLink}
                      className="flex-1 py-2 px-3 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-800 font-bold text-xs transition"
                    >
                      {copiedLink ? 'Link Copied!' : 'Copy Shareable Link'}
                    </button>
                  </div>

                  <div className="p-3.5 bg-white rounded-xl border border-slate-200 text-xs">
                    <div className="font-bold text-slate-800">
                      {webrtc.peerUser ? webrtc.peerUser.displayName : 'Waiting for opponent to join...'}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5 font-medium">
                      {webrtc.isConnected ? 'Peer Connected! Ready to start.' : 'Share code or link with a friend.'}
                    </div>
                  </div>

                  <div className="flex gap-2 pt-1">
                    {webrtc.isHost ? (
                      <button
                        disabled={!webrtc.isConnected}
                        onClick={handleStartGame}
                        className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs transition cursor-pointer"
                      >
                        Start Match
                      </button>
                    ) : (
                      <div className="flex-1 py-2.5 px-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold text-xs text-center flex items-center justify-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                        <span>Waiting for Host to start match...</span>
                      </div>
                    )}
                    <button
                      onClick={() => webrtc.leaveRoom()}
                      className="py-2.5 px-4 rounded-xl bg-slate-200 text-slate-700 hover:bg-slate-300 font-semibold text-xs transition cursor-pointer"
                    >
                      Leave
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 2-SIDED SPLIT SCREEN GAME LAYOUT */}
        {(gameStatus === 'playing' || gameStatus === 'ended') && (
          <div className="w-full flex flex-col lg:flex-row lg:items-start gap-6">
            {/* SIDE 1 (LEFT): Light Mode Board Game View */}
            <div ref={boardPanelRef} className="flex-1 flex flex-col items-center justify-center">
              {/* Board Component with Integrated Minimal Match Header */}
              <Board
                board={board}
                size={roomSettings.boardSize}
                onCellClick={handleCellClick}
                lastMove={lastMove}
                winningLine={winningLine}
                currentTurn={currentTurn}
                disabled={gameStatus !== 'playing' || webrtc.isReconnecting || currentTurn !== myPiece}
                myPiece={myPiece}
                myUser={user}
                opponent={opponentUser}
                turnTimeLeft={turnTimeLeft}
                myTotalTimeLeft={myPiece === 'X' ? p1TotalTime : p2TotalTime}
                opponentTotalTimeLeft={myPiece === 'X' ? p2TotalTime : p1TotalTime}
                gameStatus={gameStatus}
                gameResult={gameResult}
                elapsedGameTime={elapsedGameTime}
                onReturnToLobby={() => {
                  setIsAiMode(false);
                  setGameStatus('lobby');
                }}
                onViewOpponentProfile={(opp) => setSelectedOpponentProfile(opp)}
                onViewMyProfile={openProfileModal}
              />
            </div>

            {/* SIDE 2 (RIGHT): Controls, Actions & Live Chat Feed Sidebar */}
            <div
              className="w-full lg:w-[380px] shrink-0 flex flex-col min-h-0"
              style={boardPanelHeight ? { height: `${boardPanelHeight}px` } : undefined}
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
                onResign={() => handleGameOver(myPiece === 'X' ? 'O' : 'X', null, 'resigned')}
                gameStatus={gameStatus}
                allowUndo={roomSettings.allowUndo}
                boardSize={roomSettings.boardSize}
              />
            </div>
          </div>
        )}
      </main>

      {/* Connection-loss overlay intentionally blocks the board while the match is paused. */}
      {gameStatus === 'playing' && webrtc.isReconnecting && !isAiMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-md" role="dialog" aria-modal="true" aria-labelledby="reconnect-title">
          <div className="w-full max-w-sm overflow-hidden rounded-3xl border border-white/20 bg-white shadow-2xl">
            <div className="h-1.5 bg-slate-100">
              <div
                className="h-full bg-amber-500 transition-all duration-1000 ease-linear"
                style={{ width: `${(webrtc.reconnectTimeLeft / 30) * 100}%` }}
              />
            </div>
            <div className="p-7 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-2xl">📡</div>
              <p className="text-[11px] font-black tracking-[0.2em] text-amber-700 uppercase">Match paused</p>
              <h3 id="reconnect-title" className="mt-2 text-xl font-black tracking-tight text-slate-900">Reconnecting opponent</h3>
              <p className="mt-2 text-sm leading-6 text-slate-500">Your opponent disconnected. The board and clocks are paused while we keep their seat open.</p>
              <div className="my-6 rounded-2xl bg-slate-900 px-5 py-4 text-white">
                <span className="font-mono text-4xl font-black tabular-nums">{webrtc.reconnectTimeLeft}s</span>
                <p className="mt-1 text-[11px] font-semibold text-slate-300">until they forfeit the match</p>
              </div>
              <p className="text-xs font-medium text-slate-500">They can return by reopening the room link or refreshing the page.</p>
            </div>
          </div>
        </div>
      )}

      {/* Undo Proposal Modal */}
      {undoRequestOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-md">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 max-w-sm w-full text-center space-y-4">
            <h3 className="text-base font-extrabold text-slate-900">Undo Move Requested</h3>
            <p className="text-xs text-slate-600">Your opponent has requested to undo their previous move.</p>
            <div className="flex gap-2 pt-2">
              <button
                onClick={handleAcceptUndoProposal}
                className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs"
              >
                Accept Undo
              </button>
              <button
                onClick={() => setUndoRequestOpen(false)}
                className="flex-1 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs border border-slate-300"
              >
                Decline
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Unified Side-by-Side Settings & Themes Modal */}
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
        isHost={webrtc.isHost || gameStatus !== 'playing'}
        gameStatus={gameStatus}
      />

      <LeaderboardModal
        isOpen={leaderboardOpen}
        onClose={() => setLeaderboardOpen(false)}
        onSelectPlayer={(p) => setSelectedOpponentProfile(p)}
      />
      <HistoryModal isOpen={historyOpen} onClose={() => setHistoryOpen(false)} />
      <AuthModal />
      <ProfileModal />
      <OpponentProfileModal
        opponent={selectedOpponentProfile}
        isOpen={Boolean(selectedOpponentProfile)}
        onClose={() => setSelectedOpponentProfile(null)}
      />

      {/* Footer */}
      <footer className="w-full text-center py-3 text-[11px] text-slate-500 font-mono border-t border-slate-200 bg-white">
        Vì Hương ko dùng Claude Fable 5.2 để làm
      </footer>
    </div>
  );
};
