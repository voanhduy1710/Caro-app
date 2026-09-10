import React, { useRef, useState, useEffect, useCallback, memo } from 'react';
import { Timer, Minus, Plus, Crosshair } from 'lucide-react';
import type { BoardMatrix, CellValue } from '../../shared/utils/gomokuLogic';
import { useTheme } from '../theme/ThemeContext';
import type { PieceTheme } from '../theme/types';
import type { UserProfile } from '../auth/AuthContext';
import { useDisplayPrefs } from './displayPrefs';

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
  /** Only for naming who moves first in the count-in. */
  opponent?: UserProfile | null;
  gameStatus?: 'lobby' | 'playing' | 'ended';
  gameResult?: { winner: string; reason: string } | null;
  elapsedGameTime?: number;
  /** Plain-language explanation of how the match ended. */
  resultReason?: string;
  /** Only shown once a rating change is known, never as a guess. */
  ratingNote?: string | null;
  /** The next steps, rendered beside the result rather than in another panel. */
  resultActions?: React.ReactNode;
  /** Seconds left before the first move, or null when play is already open. */
  countdown?: number | null;
}

interface PieceGlyphProps {
  piece: 'X' | 'O';
  pieceTheme: PieceTheme;
  xColor: string;
  oColor: string;
  isSimulated?: boolean;
  isWinning?: boolean;
  customColor?: string;
}

/**
 * Renders a single piece for the active theme. Split out of Board so that a
 * board cell can be memoised on primitive props only.
 */
const PieceGlyph: React.FC<PieceGlyphProps> = ({
  piece,
  pieceTheme,
  xColor,
  oColor,
  isSimulated = false,
  isWinning = false,
  customColor,
}) => {
  const isX = piece === 'X';
  const simClass = isSimulated ? 'opacity-60 scale-95' : '';
  const winClass = !isSimulated && isWinning ? 'animate-winning-cell' : '';

  if (pieceTheme === 'calligraphic') {
    const strokeColor = customColor || (isX ? xColor || '#006699' : oColor || '#e11d24');
    return (
      <svg
        viewBox="0 0 24 24"
        className={`w-[78%] h-[78%] transition-transform shrink-0 ${simClass} ${winClass}`}
        fill="none"
        stroke={strokeColor}
        strokeWidth="4.2"
        strokeLinecap="round"
      >
        {isX ? (
          <>
            <line x1="5" y1="5" x2="19" y2="19" />
            <line x1="19" y1="5" x2="5" y2="19" />
          </>
        ) : (
          <circle cx="12" cy="12" r="7.5" />
        )}
      </svg>
    );
  }

  if (pieceTheme === 'laser') {
    const laserColor = customColor || (isX ? xColor || '#00f0ff' : oColor || '#ff007f');
    return (
      <svg
        viewBox="0 0 24 24"
        className={`w-[82%] h-[82%] transition-transform shrink-0 ${simClass} ${winClass}`}
        style={{ filter: `drop-shadow(0 0 4px ${laserColor}) drop-shadow(0 0 10px ${laserColor})` }}
        fill="none"
        stroke={laserColor}
        strokeWidth="3.8"
        strokeLinecap="round"
      >
        {isX ? (
          <>
            <line x1="5" y1="5" x2="19" y2="19" />
            <line x1="19" y1="5" x2="5" y2="19" />
          </>
        ) : (
          <circle cx="12" cy="12" r="7.5" />
        )}
      </svg>
    );
  }

  if (pieceTheme === 'gomoku_3d') {
    const activeColor = customColor || (isX ? xColor : oColor);
    const stoneBg = activeColor ? `radial-gradient(circle at 35% 35%, ${activeColor}, #0f172a)` : undefined;
    return (
      <div
        className={`${isX ? 'stone-black' : 'stone-white'} ${simClass} ${
          !isSimulated && isWinning ? 'animate-winning-cell ring-4 ring-warning' : ''
        }`}
        style={stoneBg ? { background: stoneBg } : undefined}
      />
    );
  }

  const color = customColor || (isX ? xColor || '#2563eb' : oColor || '#dc2626');
  return (
    <span
      className={`select-none font-black text-xl sm:text-2xl transition-transform ${simClass} ${
        isX ? 'piece-blue-x' : 'piece-red-o'
      } ${winClass}`}
      style={{ color }}
    >
      {piece}
    </span>
  );
};

interface BoardCellProps {
  row: number;
  col: number;
  cell: CellValue;
  cellSize: number;
  isLast: boolean;
  isWinning: boolean;
  isHovered: boolean;
  /** Sits on a promoted grid line, every fifth column or row. */
  isMajorRight: boolean;
  isMajorBottom: boolean;
  /** Row/column numbers, drawn only in empty cells so pieces stay legible. */
  showCoords: boolean;
  simulatedPiece: 'X' | 'O' | null;
  simulatedColor?: string;
  currentTurn: 'X' | 'O';
  boardDisabled: boolean;
  pieceTheme: PieceTheme;
  xColor: string;
  oColor: string;
  onSelect: (row: number, col: number) => void;
  onContextMenu: (event: React.MouseEvent, row: number, col: number) => void;
  onHover: (row: number, col: number) => void;
}

/**
 * Memoised so that moving the pointer across a 50x50 grid re-renders the two
 * cells whose hover state changed instead of all 2,500 of them.
 */
const BoardCell = memo<BoardCellProps>(({
  row,
  col,
  cell,
  cellSize,
  isLast,
  isWinning,
  isHovered,
  isMajorRight,
  isMajorBottom,
  showCoords,
  simulatedPiece,
  simulatedColor,
  currentTurn,
  boardDisabled,
  pieceTheme,
  xColor,
  oColor,
  onSelect,
  onContextMenu,
  onHover,
}) => (
  <button
    type="button"
    onClick={() => onSelect(row, col)}
    onContextMenu={(event) => onContextMenu(event, row, col)}
    onMouseEnter={() => onHover(row, col)}
    aria-label={`Row ${row + 1}, column ${col + 1}${cell ? `, ${cell}` : ', empty'}`}
    style={{ width: `${cellSize}px`, height: `${cellSize}px` }}
    className={`board-cell relative flex shrink-0 aspect-square items-center justify-center transition-all duration-100 ${
      cell ? 'board-cell--filled' : ''
    } ${isMajorRight ? 'board-cell--gx' : ''} ${isMajorBottom ? 'board-cell--gy' : ''} ${
      isLast ? 'z-10 bg-accent/20 ring-2 ring-accent' : ''
    } ${isWinning ? 'z-20 bg-warning-soft ring-2 ring-warning' : ''}`}
  >
    {cell ? (
      // The move that just landed gets a short drop, so a placement is
      // confirmed by the board itself. Only the last cell is wrapped, so a
      // 50x50 grid does not carry 2,500 extra nodes for one animation.
      isLast ? (
        <span className="animate-piece-drop flex h-full w-full items-center justify-center">
          <PieceGlyph piece={cell} pieceTheme={pieceTheme} xColor={xColor} oColor={oColor} isWinning={isWinning} />
        </span>
      ) : (
        <PieceGlyph piece={cell} pieceTheme={pieceTheme} xColor={xColor} oColor={oColor} isWinning={isWinning} />
      )
    ) : simulatedPiece ? (
      <PieceGlyph
        piece={simulatedPiece}
        pieceTheme={pieceTheme}
        xColor={xColor}
        oColor={oColor}
        isSimulated
        customColor={simulatedColor}
      />
    ) : isHovered && !boardDisabled ? (
      <div className="opacity-35 w-full h-full flex items-center justify-center">
        <PieceGlyph piece={currentTurn} pieceTheme={pieceTheme} xColor={xColor} oColor={oColor} isSimulated />
      </div>
    ) : showCoords ? (
      <span className="pointer-events-none select-none font-mono text-[9px] leading-none text-subtle opacity-70">
        {row},{col}
      </span>
    ) : null}
  </button>
));

BoardCell.displayName = 'BoardCell';

export const Board: React.FC<BoardProps> = ({
  board,
  size,
  onCellClick,
  lastMove,
  winningLine,
  currentTurn,
  disabled,
  myPiece = 'X',
  opponent,
  gameStatus = 'playing',
  gameResult,
  elapsedGameTime = 0,
  resultReason,
  ratingNote,
  resultActions,
  countdown = null,
}) => {
  const { theme } = useTheme();
  const prefs = useDisplayPrefs();
  const containerRef = useRef<HTMLDivElement>(null);
  // Full-width wrapper, used only as the width source for the cell measurement.
  const columnRef = useRef<HTMLDivElement>(null);
  // Mirror of the board so the memoised cell callbacks stay identity-stable.
  const boardRef = useRef(board);
  boardRef.current = board;

  // Private local right-click simulated moves state
  const [simulatedMoves, setSimulatedMoves] = useState<SimulatedMove[]>([]);
  const [hoveredCell, setHoveredCell] = useState<[number, number] | null>(null);

  // Middle mouse click & drag pan state
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<{ startX: number; startY: number; scrollLeft: number; scrollTop: number }>({
    startX: 0,
    startY: 0,
    scrollLeft: 0,
    scrollTop: 0,
  });

  // A fixed step per board size left a 15x15 grid floating inside a viewport
  // sized frame. The cell is measured from the frame instead, so a small board
  // fills it and a large one still hits a playable floor and scrolls.
  const MIN_CELL = 26;
  const MAX_CELL = 64;
  const FRAME_PADDING = 48;
  const ZOOM_STEP = 6;
  /** Fitted size for this frame, and the player's offset from it. */
  const [fittedCell, setFittedCell] = useState(() =>
    Math.min(MAX_CELL, Math.max(MIN_CELL, Math.round(560 / size)))
  );
  const [zoomOffset, setZoomOffset] = useState(0);
  const cellSize = Math.min(MAX_CELL, Math.max(MIN_CELL, fittedCell + zoomOffset));
  const canZoomIn = cellSize < MAX_CELL;
  const canZoomOut = cellSize > MIN_CELL;

  useEffect(() => {
    const frame = containerRef.current;
    const column = columnRef.current;
    if (!frame || !column) return;

    const measure = () => {
      // Width comes from the column, never from the frame: the frame's own
      // width is capped by this cell size, so measuring it would feed the
      // result back in and shrink the board a pixel on every pass. The height
      // is safe to read because .board-frame sizes it from the viewport.
      const box = Math.min(column.clientWidth, frame.clientHeight) - FRAME_PADDING;
      if (box <= 0) return;
      const next = Math.min(MAX_CELL, Math.max(MIN_CELL, Math.floor(box / size)));
      setFittedCell((current) => (current === next ? current : next));
    };

    // Both are watched: the column drives the width, the frame's viewport-unit
    // height changes on its own when the window is resized. Re-measuring from
    // the frame is safe because the frame's width is not an input.
    const observer = new ResizeObserver(measure);
    observer.observe(column);
    observer.observe(frame);
    measure();
    return () => observer.disconnect();
  }, [size]);

  const centreOnBoard = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollLeft = Math.max(0, (el.scrollWidth - el.clientWidth) / 2);
    el.scrollTop = Math.max(0, (el.scrollHeight - el.clientHeight) / 2);
  }, []);

  useEffect(() => {
    centreOnBoard();
  }, [size, centreOnBoard]);

  // A board wider than its frame can put the move that just landed off screen,
  // which is how a player loses their place on a 50x50 grid. Scroll it back
  // into view, but only when it is actually outside.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !lastMove) return;

    const [row, col] = lastMove;
    const x = col * cellSize;
    const y = row * cellSize;
    const margin = cellSize * 2;

    let left = el.scrollLeft;
    let top = el.scrollTop;
    if (x - margin < left) left = Math.max(0, x - margin);
    else if (x + cellSize + margin > left + el.clientWidth) left = x + cellSize + margin - el.clientWidth;
    if (y - margin < top) top = Math.max(0, y - margin);
    else if (y + cellSize + margin > top + el.clientHeight) top = y + cellSize + margin - el.clientHeight;

    if (left === el.scrollLeft && top === el.scrollTop) return;
    el.scrollTo({ left, top, behavior: 'smooth' });
  }, [lastMove, cellSize]);

  // Only clear simulated moves at coordinates where a real piece has been placed
  useEffect(() => {
    setSimulatedMoves((prev) => {
      const next = prev.filter((m) => board[m.row]?.[m.col] === null);
      return next.length === prev.length ? prev : next;
    });
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

  // Stable identities keep BoardCell's memoisation effective.
  const handleSelectCell = useCallback((r: number, c: number) => {
    if (touchStartRef.current.isMoved) return;
    onCellClick(r, c);
  }, [onCellClick]);

  const handleHoverCell = useCallback((r: number, c: number) => {
    setHoveredCell((prev) => (prev && prev[0] === r && prev[1] === c ? prev : [r, c]));
  }, []);

  // Right-click to toggle a private local simulated move
  const handleCellContextMenu = useCallback((e: React.MouseEvent, r: number, c: number) => {
    e.preventDefault();
    if (boardRef.current?.[r]?.[c] != null) return; // never sketch over a real piece
    setSimulatedMoves((prev) => {
      const existingIdx = prev.findIndex((m) => m.row === r && m.col === c);
      if (existingIdx >= 0) return prev.filter((_, idx) => idx !== existingIdx);
      const lastSim = prev[prev.length - 1];
      const nextPiece: 'X' | 'O' = lastSim ? (lastSim.piece === 'X' ? 'O' : 'X') : currentTurn;
      return [...prev, { row: r, col: c, piece: nextPiece }];
    });
  }, [currentTurn]);

  const getBoardThemeClass = () => {
    if (theme.boardTheme === 'light_wood') return 'board-theme-light-wood';
    if (theme.boardTheme === 'laser_futuristic') return 'board-theme-laser-futuristic';
    if (theme.boardTheme === 'classic_wood') return 'board-theme-classic-wood';
    return 'board-theme-graph-paper';
  };

  const isWinningCell = (r: number, c: number) =>
    Boolean(winningLine?.some(([wr, wc]) => wr === r && wc === c));

  const formatElapsed = (seconds: number) => {
    // Past an hour, "109:00" reads as a broken clock rather than a long game.
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    const mm = m.toString().padStart(2, '0');
    const ss = s.toString().padStart(2, '0');
    return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  };

  const isMyTurn = myPiece === currentTurn;

  return (
    // The outer element stays full width so the cell measurement has a source
    // the board's own size cannot feed back into. The inner stack is capped to
    // the board, so the toolbar, the match header and the frame share one edge.
    <div ref={columnRef} className="flex w-full justify-center select-none">
      <div
        style={{ maxWidth: cellSize * size + 40 }}
        className="flex w-full max-w-5xl flex-col items-center justify-center space-y-3"
      >
      {/* BOARD CONTAINER. Wrapped so the count-in can cover exactly the board
          and nothing else. */}
      <div className="relative w-full">
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
          className={`board-scroll-container board-frame mx-auto w-full overflow-auto ${
            isPanning ? 'cursor-grabbing select-none' : 'cursor-grab'
          } ${getBoardThemeClass()}`}
        >
          <div className="m-auto flex min-h-full min-w-max items-center justify-center">
            <div
              className="grid m-auto shrink-0 board-grid-inner"
              style={{
                gridTemplateColumns: `repeat(${size}, ${cellSize}px)`,
                gridTemplateRows: `repeat(${size}, ${cellSize}px)`,
                width: 'max-content',
                height: 'max-content',
              }}
            >
              {board.map((row, rIdx) =>
                row.map((cell, cIdx) => {
                  const simItem = simulatedMoves.find((m) => m.row === rIdx && m.col === cIdx);
                  return (
                    <BoardCell
                      key={`${rIdx}-${cIdx}`}
                      row={rIdx}
                      col={cIdx}
                      cell={cell}
                      cellSize={cellSize}
                      isLast={prefs.markLastMove && Boolean(lastMove && lastMove[0] === rIdx && lastMove[1] === cIdx)}
                      isWinning={isWinningCell(rIdx, cIdx)}
                      isHovered={Boolean(hoveredCell && hoveredCell[0] === rIdx && hoveredCell[1] === cIdx)}
                      isMajorRight={(cIdx + 1) % 5 === 0 && cIdx + 1 < size}
                      isMajorBottom={(rIdx + 1) % 5 === 0 && rIdx + 1 < size}
                      showCoords={prefs.showCoordinates && cellSize >= 28}
                      simulatedPiece={simItem ? simItem.piece : null}
                      simulatedColor={
                        simItem
                          ? simItem.piece === myPiece
                            ? theme.selfSimulatedColor || '#64748b'
                            : theme.opponentSimulatedColor || '#64748b'
                          : undefined
                      }
                      currentTurn={currentTurn}
                      boardDisabled={disabled}
                      pieceTheme={theme.pieceTheme}
                      xColor={theme.xColor}
                      oColor={theme.oColor}
                      onSelect={handleSelectCell}
                      onContextMenu={handleCellContextMenu}
                      onHover={handleHoverCell}
                    />
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Board chrome floats over the grid instead of taking a row above it.
            The frame is the tallest thing on the screen, so anything stacked
            around it comes straight out of the playable area. */}
        <div className="absolute bottom-3 left-3 flex items-center gap-0.5 rounded-full border border-line bg-surface/95 p-1 shadow-lg backdrop-blur-sm">
          <button
            type="button"
            onClick={() => setZoomOffset((z) => z - ZOOM_STEP)}
            disabled={!canZoomOut}
            className="btn btn-ghost btn-icon h-8 w-8 rounded-full"
            title="Smaller squares"
            aria-label="Zoom out"
          >
            <Minus size={15} strokeWidth={1.75} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={centreOnBoard}
            className="btn btn-ghost btn-icon h-8 w-8 rounded-full"
            title="Centre the board"
            aria-label="Centre the board"
          >
            <Crosshair size={15} strokeWidth={1.75} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setZoomOffset((z) => z + ZOOM_STEP)}
            disabled={!canZoomIn}
            className="btn btn-ghost btn-icon h-8 w-8 rounded-full"
            title="Bigger squares"
            aria-label="Zoom in"
          >
            <Plus size={15} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>

        <div
          className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full border border-line bg-surface/95 px-2.5 py-1 font-mono text-xs text-muted tabular-nums shadow-sm backdrop-blur-sm"
          title="Match elapsed time"
        >
          <Timer size={13} strokeWidth={1.75} aria-hidden="true" />
          <span>{formatElapsed(elapsedGameTime)}</span>
        </div>

        <p className="pointer-events-none absolute bottom-3 right-3 hidden rounded-full border border-line bg-surface/80 px-2.5 py-1 text-[11px] text-subtle backdrop-blur-sm lg:block">
          Drag to move the board · Scroll to zoom
        </p>

        {/* RESULT. Outcome, reason and next steps as one block, floating over
            the board so it lands where the player is already looking. */}
        {gameStatus === 'ended' && gameResult && (
          <div
            role="status"
            aria-live="polite"
            className="absolute left-1/2 top-3 z-20 w-[min(24rem,calc(100%-1.5rem))] -translate-x-1/2 rounded-lg border border-line-strong bg-surface p-4 text-center shadow-2xl"
          >
            <p
              className={`text-lg font-semibold tracking-tight ${
                gameResult.winner === 'Victory!'
                  ? 'text-accent-text'
                  : gameResult.winner === 'Defeat!'
                  ? 'text-danger'
                  : 'text-warning'
              }`}
            >
              {gameResult.winner}
            </p>
            {resultReason && <p className="mt-0.5 text-xs text-muted">{resultReason}</p>}
            {ratingNote && <p className="mt-1 font-mono text-[11px] text-subtle">{ratingNote}</p>}
            {resultActions && (
              <div className="mt-3 flex flex-wrap items-center justify-center gap-2">{resultActions}</div>
            )}
          </div>
        )}

        {countdown !== null && (
          <div
            role="status"
            aria-live="assertive"
            className="absolute inset-0 z-30 flex items-center justify-center rounded-lg bg-[var(--ui-scrim)] backdrop-blur-[2px]"
          >
            <div className="rounded-lg border border-line-strong bg-surface px-8 py-6 text-center shadow-2xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
                Get ready
              </p>
              <p className="mt-1 font-mono text-5xl font-semibold tabular-nums text-ink">
                {countdown}
              </p>
              <p className="mt-2 text-xs text-muted">
                {isMyTurn
                  ? `You move first, as ${myPiece}`
                  : `${opponent?.displayName || 'Your opponent'} moves first`}
              </p>
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  );
};
