import React, { useRef, useState, useEffect } from 'react';
import type { BoardMatrix, CellValue } from '../../shared/utils/gomokuLogic';
import { useTheme } from '../theme/ThemeContext';
import type { UserProfile } from '../auth/AuthContext';
import { getAvatarPublicUrl } from '../avatar/avatarService';

export interface SimulatedMove {
  row: number;
  col: number;
  piece: 'X' | 'O';
}

interface BoardProps {
  board: BoardMatrix;
  size: number;
  onCellClick: (row: number, col: number) => void;
  lastMove: [number, number] | null;
  winningLine: Array<[number, number]> | null;
  currentTurn: 'X' | 'O';
  disabled: boolean;
  myPiece?: 'X' | 'O';
  myUser?: UserProfile | null;
  opponent?: UserProfile | null;
  turnTimeLeft?: number;
  myTotalTimeLeft?: number;
  opponentTotalTimeLeft?: number;
  gameStatus?: 'lobby' | 'playing' | 'ended';
  gameResult?: { winner: string; reason: string } | null;
  elapsedGameTime?: number;
  onReturnToLobby?: () => void;
  onViewOpponentProfile?: (opponent: UserProfile) => void;
  onViewMyProfile?: () => void;
}

export const Board: React.FC<BoardProps> = ({
  board,
  size,
  onCellClick,
  lastMove,
  winningLine,
  currentTurn,
  disabled,
  myPiece = 'X',
  myUser,
  opponent,
  turnTimeLeft = 0,
  myTotalTimeLeft = 0,
  opponentTotalTimeLeft = 0,
  gameStatus = 'playing',
  gameResult,
  elapsedGameTime = 0,
  onReturnToLobby,
  onViewOpponentProfile,
  onViewMyProfile,
}) => {
  const { theme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);

  // Private local right-click simulated moves state
  const [simulatedMoves, setSimulatedMoves] = useState<SimulatedMove[]>([]);
  // Hover cell state
  const [hoveredCell, setHoveredCell] = useState<[number, number] | null>(null);

  // Middle mouse click & drag pan state
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<{ startX: number; startY: number; scrollLeft: number; scrollTop: number }>({
    startX: 0,
    startY: 0,
    scrollLeft: 0,
    scrollTop: 0,
  });

  // Calculate cell size dynamically for board size
  const getCellPixelSize = (boardSize: number) => {
    if (boardSize <= 15) return 42;
    if (boardSize <= 19) return 38;
    if (boardSize <= 30) return 36;
    return 32; // 50x50 board: 32px x 32px per cell
  };

  const cellSize = getCellPixelSize(size);

  // Always center board on mount or size change
  useEffect(() => {
    if (containerRef.current) {
      const el = containerRef.current;
      el.scrollLeft = Math.max(0, (el.scrollWidth - el.clientWidth) / 2);
      el.scrollTop = Math.max(0, (el.scrollHeight - el.clientHeight) / 2);
    }
  }, [size]);

  // Only clear simulated moves at coordinates where a real piece has been placed
  useEffect(() => {
    setSimulatedMoves((prev) => prev.filter((m) => board[m.row][m.col] === null));
  }, [board]);

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button === 1 && containerRef.current) {
      e.preventDefault();
      setIsPanning(true);
      panStartRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        scrollLeft: containerRef.current.scrollLeft,
        scrollTop: containerRef.current.scrollTop,
      };
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isPanning && containerRef.current) {
      e.preventDefault();
      const dx = e.clientX - panStartRef.current.startX;
      const dy = e.clientY - panStartRef.current.startY;
      containerRef.current.scrollLeft = panStartRef.current.scrollLeft - dx;
      containerRef.current.scrollTop = panStartRef.current.scrollTop - dy;
    }
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button === 1 || isPanning) {
      setIsPanning(false);
    }
  };

  // Touch Panning Handlers for Mobile Devices
  const touchStartRef = useRef<{ x: number; y: number; scrollLeft: number; scrollTop: number; isMoved: boolean }>({
    x: 0,
    y: 0,
    scrollLeft: 0,
    scrollTop: 0,
    isMoved: false,
  });

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 1 && containerRef.current) {
      const touch = e.touches[0];
      touchStartRef.current = {
        x: touch.clientX,
        y: touch.clientY,
        scrollLeft: containerRef.current.scrollLeft,
        scrollTop: containerRef.current.scrollTop,
        isMoved: false,
      };
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 1 && containerRef.current) {
      const touch = e.touches[0];
      const dx = touch.clientX - touchStartRef.current.x;
      const dy = touch.clientY - touchStartRef.current.y;

      if (Math.abs(dx) > 6 || Math.abs(dy) > 6) {
        touchStartRef.current.isMoved = true;
      }

      if (touchStartRef.current.isMoved) {
        containerRef.current.scrollLeft = touchStartRef.current.scrollLeft - dx;
        containerRef.current.scrollTop = touchStartRef.current.scrollTop - dy;
      }
    }
  };

  const handleCellClickWithTouchCheck = (r: number, c: number) => {
    if (touchStartRef.current.isMoved) return;
    if (!disabled && !board[r][c]) {
      onCellClick(r, c);
    }
  };

  // Right-click to toggle private local simulated move
  const handleCellContextMenu = (e: React.MouseEvent, r: number, c: number) => {
    e.preventDefault();
    if (board[r][c] !== null) return;

    const existingIdx = simulatedMoves.findIndex((m) => m.row === r && m.col === c);
    if (existingIdx >= 0) {
      setSimulatedMoves((prev) => prev.filter((_, idx) => idx !== existingIdx));
    } else {
      let nextPiece: 'X' | 'O' = currentTurn;
      if (simulatedMoves.length > 0) {
        const lastSim = simulatedMoves[simulatedMoves.length - 1];
        nextPiece = lastSim.piece === 'X' ? 'O' : 'X';
      }
      setSimulatedMoves((prev) => [...prev, { row: r, col: c, piece: nextPiece }]);
    }
  };

  const getBoardThemeClass = () => {
    if (theme.boardTheme === 'light_wood') return 'board-theme-light-wood';
    if (theme.boardTheme === 'laser_futuristic') return 'board-theme-laser-futuristic';
    if (theme.boardTheme === 'classic_wood') return 'board-theme-classic-wood';
    return 'board-theme-graph-paper';
  };

  const isWinningCell = (r: number, c: number) => {
    if (!winningLine) return false;
    return winningLine.some(([wr, wc]) => wr === r && wc === c);
  };

  const isLastMoveCell = (r: number, c: number) => {
    if (!lastMove) return false;
    return lastMove[0] === r && lastMove[1] === c;
  };

  const formatClock = (seconds: number) => {
    if (seconds <= 0) return 'Unlimited';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const formatElapsed = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const isMyTurn = myPiece === currentTurn;

  const renderPiece = (cell: CellValue, r: number, c: number, isSimulated = false, customColor?: string) => {
    if (!cell) return null;

    const winning = !isSimulated && isWinningCell(r, c);
    const simClass = isSimulated ? 'opacity-60 scale-95' : '';

    if (theme.pieceTheme === 'calligraphic') {
      const isX = cell === 'X';
      const strokeColor = customColor || (isX ? theme.xColor || '#006699' : theme.oColor || '#e11d24');
      if (isX) {
        return (
          <svg
            viewBox="0 0 24 24"
            className={`w-[78%] h-[78%] transition-transform shrink-0 ${simClass} ${winning ? 'animate-winning-cell' : ''}`}
            fill="none"
            stroke={strokeColor}
            strokeWidth="4.2"
            strokeLinecap="round"
          >
            <line x1="5" y1="5" x2="19" y2="19" />
            <line x1="19" y1="5" x2="5" y2="19" />
          </svg>
        );
      }
      return (
        <svg
          viewBox="0 0 24 24"
          className={`w-[78%] h-[78%] transition-transform shrink-0 ${simClass} ${winning ? 'animate-winning-cell' : ''}`}
          fill="none"
          stroke={strokeColor}
          strokeWidth="4.2"
        >
          <circle cx="12" cy="12" r="7.5" />
        </svg>
      );
    }

    if (theme.pieceTheme === 'laser') {
      const isX = cell === 'X';
      const laserColor = customColor || (isX ? theme.xColor || '#00f0ff' : theme.oColor || '#ff007f');

      if (isX) {
        return (
          <svg
            viewBox="0 0 24 24"
            className={`w-[82%] h-[82%] transition-transform shrink-0 ${simClass} ${
              winning ? 'animate-winning-cell' : ''
            }`}
            style={{
              filter: `drop-shadow(0 0 4px ${laserColor}) drop-shadow(0 0 10px ${laserColor})`,
            }}
            fill="none"
            stroke={laserColor}
            strokeWidth="3.8"
            strokeLinecap="round"
          >
            <line x1="5" y1="5" x2="19" y2="19" />
            <line x1="19" y1="5" x2="5" y2="19" />
          </svg>
        );
      }
      return (
        <svg
          viewBox="0 0 24 24"
          className={`w-[82%] h-[82%] transition-transform shrink-0 ${simClass} ${
            winning ? 'animate-winning-cell' : ''
          }`}
          style={{
            filter: `drop-shadow(0 0 4px ${laserColor}) drop-shadow(0 0 10px ${laserColor})`,
          }}
          fill="none"
          stroke={laserColor}
          strokeWidth="3.8"
        >
          <circle cx="12" cy="12" r="7.5" />
        </svg>
      );
    }

    if (theme.pieceTheme === 'gomoku_3d') {
      const isX = cell === 'X';
      const activeColor = customColor || (isX ? theme.xColor : theme.oColor);
      const stoneBg = activeColor
        ? `radial-gradient(circle at 35% 35%, ${activeColor}, #0f172a)`
        : undefined;

      return (
        <div
          className={`${isX ? 'stone-black' : 'stone-white'} ${simClass} ${
            winning ? 'animate-winning-cell ring-4 ring-amber-400' : ''
          }`}
          style={stoneBg ? { background: stoneBg } : undefined}
        />
      );
    }

    // Default Classic Style
    const isX = cell === 'X';
    const color = customColor || (isX ? theme.xColor || '#2563eb' : theme.oColor || '#dc2626');

    return (
      <span
        className={`select-none font-black text-xl sm:text-2xl transition-transform ${simClass} ${
          isX ? 'piece-blue-x' : 'piece-red-o'
        } ${winning ? 'animate-winning-cell' : ''}`}
        style={{ color }}
      >
        {cell}
      </span>
    );
  };

  return (
    <div className="flex flex-col items-center justify-center w-full max-w-5xl mx-auto select-none space-y-2">
      {/* ATTACHED MATCH STATUS HEADER BAR */}
      <div className="w-full bg-white border border-slate-300 rounded-2xl p-3 flex flex-wrap items-center justify-between gap-3">
        {/* Player 1 (You) */}
        <div
          onClick={onViewMyProfile}
          title="Click to view/edit your profile"
          className="flex items-center gap-2.5 cursor-pointer hover:opacity-85 transition group p-1 rounded-xl hover:bg-slate-50"
        >
          <img
            src={getAvatarPublicUrl(myUser?.photoURL)}
            alt="You"
            className="w-8 h-8 rounded-full border border-emerald-400 bg-white object-contain p-0.5 group-hover:border-emerald-600 shadow-xs"
          />
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-slate-800 group-hover:text-emerald-700">{myUser?.displayName || 'You'}</span>
              <span className="text-[10px] font-mono font-bold text-emerald-700">({myPiece})</span>
            </div>
            <div className="text-[10px] font-mono text-slate-500">
              Clock: <span className="font-bold text-slate-700">{formatClock(myTotalTimeLeft)}</span>
            </div>
          </div>
        </div>

        {/* Status Center Badge, Outcome & Controls */}
        <div className="flex items-center gap-2.5">
          {gameStatus === 'playing' ? (
            <>
              <div
                className={`text-xs font-mono font-bold px-3 py-1 rounded-xl border ${
                  isMyTurn
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-300 animate-pulse'
                    : 'bg-rose-50 text-rose-700 border-rose-200'
                }`}
              >
                {isMyTurn
                  ? `YOUR TURN (${turnTimeLeft > 0 ? `${turnTimeLeft}s` : '∞'})`
                  : `OPPONENT'S TURN (${turnTimeLeft > 0 ? `${turnTimeLeft}s` : '∞'})`}
              </div>
              <div
                className="text-xs font-mono font-bold px-2.5 py-1 rounded-xl bg-slate-100 text-slate-700 border border-slate-300 flex items-center gap-1.5 shadow-xs"
                title="Match elapsed time"
              >
                <span>⏱️</span>
                <span>{formatElapsed(elapsedGameTime)}</span>
              </div>
            </>
          ) : gameResult ? (
            <div className="flex items-center gap-2">
              <span
                className={`text-xs font-mono font-bold px-3 py-1 rounded-xl border ${
                  gameResult.winner === 'Victory!'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                    : gameResult.winner === 'Defeat!'
                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                    : 'bg-amber-50 text-amber-800 border-amber-300'
                }`}
              >
                {gameResult.winner}
              </span>
              {onReturnToLobby && (
                <button
                  onClick={onReturnToLobby}
                  className="px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-300 text-[11px] font-bold text-slate-700 transition"
                >
                  Lobby
                </button>
              )}
            </div>
          ) : (
            <div className="text-xs font-mono font-bold px-3 py-1 rounded-xl border bg-slate-100 text-slate-600 border-slate-200">
              MATCH ENDED
            </div>
          )}

          {/* Clear Simulation Button */}
          {simulatedMoves.length > 0 && (
            <button
              onClick={() => setSimulatedMoves([])}
              className="px-2.5 py-1 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-300 text-[11px] font-bold text-amber-800 transition"
            >
              Clear Sim ({simulatedMoves.length})
            </button>
          )}
        </div>

        {/* Player 2 (Opponent) */}
        <div
          onClick={() => opponent && onViewOpponentProfile && onViewOpponentProfile(opponent)}
          title={opponent ? "Click to view opponent's full profile & stats" : "Waiting for opponent..."}
          className={`flex items-center gap-2.5 p-1 rounded-xl transition group ${
            opponent ? 'cursor-pointer hover:opacity-85 hover:bg-slate-50' : 'opacity-70'
          }`}
        >
          <div className="text-right">
            <div className="flex items-center gap-1.5 justify-end">
              <span className="text-xs font-bold text-slate-800 group-hover:text-rose-600">{opponent?.displayName || 'Waiting...'}</span>
              <span className="text-[10px] font-mono font-bold text-rose-600">
                ({myPiece === 'X' ? 'O' : 'X'})
              </span>
            </div>
            <div className="text-[10px] font-mono text-slate-500">
              Clock: <span className="font-bold text-slate-700">{formatClock(opponentTotalTimeLeft)}</span>
            </div>
          </div>
          <img
            src={getAvatarPublicUrl(opponent?.photoURL)}
            alt="Opponent"
            className="w-8 h-8 rounded-full border border-rose-400 bg-white object-contain p-0.5 group-hover:border-rose-600 shadow-xs"
          />
        </div>
      </div>

      {/* BOARD CONTAINER */}
      <div
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onContextMenu={(e) => e.preventDefault()}
        onMouseLeave={() => {
          setIsPanning(false);
          setHoveredCell(null);
        }}
        className={`board-scroll-container w-full h-[60vh] sm:h-[75vh] max-h-[850px] overflow-auto rounded-2xl p-2 sm:p-4 border-2 border-slate-300 ${
          isPanning ? 'cursor-grabbing select-none' : 'cursor-grab'
        } ${getBoardThemeClass()}`}
      >
        <div
          className="flex items-center justify-center p-3 sm:p-6 min-w-max min-h-max m-auto"
          onContextMenu={(e) => e.preventDefault()}
        >
          <div
            className="grid m-auto shrink-0 board-grid-inner"
            onContextMenu={(e) => e.preventDefault()}
            style={{
              gridTemplateColumns: `repeat(${size}, ${cellSize}px)`,
              gridTemplateRows: `repeat(${size}, ${cellSize}px)`,
              width: 'max-content',
              height: 'max-content',
            }}
          >
            {board.map((row, rIdx) =>
              row.map((cell, cIdx) => {
                const last = isLastMoveCell(rIdx, cIdx);
                const winning = isWinningCell(rIdx, cIdx);
                const simItem = simulatedMoves.find((m) => m.row === rIdx && m.col === cIdx);
                const isHovered = hoveredCell && hoveredCell[0] === rIdx && hoveredCell[1] === cIdx;

                return (
                  <button
                    key={`${rIdx}-${cIdx}`}
                    onClick={() => handleCellClickWithTouchCheck(rIdx, cIdx)}
                    onContextMenu={(e) => handleCellContextMenu(e, rIdx, cIdx)}
                    onMouseEnter={() => setHoveredCell([rIdx, cIdx])}
                    disabled={cell !== null}
                    style={{ width: `${cellSize}px`, height: `${cellSize}px` }}
                    className={`board-cell relative flex items-center justify-center shrink-0 aspect-square transition-all duration-100 ${
                      last ? 'ring-2 ring-blue-600 bg-blue-500/20 z-10' : ''
                    } ${winning ? 'bg-amber-300/60 z-20 ring-2 ring-amber-500' : ''}`}
                  >
                    {/* 1. Real Piece */}
                    {cell ? (
                      renderPiece(cell, rIdx, cIdx)
                    ) : simItem ? (
                      /* 2. Simulated Move (Matches Active Piece Style) */
                      renderPiece(
                        simItem.piece,
                        rIdx,
                        cIdx,
                        true,
                        simItem.piece === myPiece
                          ? theme.selfSimulatedColor || '#64748b'
                          : theme.opponentSimulatedColor || '#64748b'
                      )
                    ) : isHovered && !disabled ? (
                      /* 3. On-Hover Preview (Matches Active Piece Style) */
                      <div className="opacity-35 w-full h-full flex items-center justify-center">
                        {renderPiece(currentTurn, rIdx, cIdx, true)}
                      </div>
                    ) : null}
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
