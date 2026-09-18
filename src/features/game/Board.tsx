import React, { useRef, useState, useEffect, useCallback, memo } from 'react';
import type { BoardMatrix, CellValue } from '../../shared/utils/gomokuLogic';
import { useTheme } from '../theme/ThemeContext';
import type { PieceTheme } from '../theme/types';
import type { UserProfile } from '../auth/AuthContext';
import { useDisplayPrefs } from './displayPrefs';

export type BoardCorner =
  | 'center'
  | 'top-left'
  | 'top'
  | 'top-right'
  | 'left'
  | 'right'
  | 'bottom-left'
  | 'bottom'
  | 'bottom-right';

export interface SimulatedMove {
  row: number;
  col: number;
  piece: Exclude<CellValue, null>;
}

/** Spreadsheet-style column label: 0 → A, 25 → Z, 26 → AA. */
const columnLabel = (index: number) => {
  let value = index + 1;
  let label = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    value = Math.floor((value - 1) / 26);
  }
  return label;
};

interface BoardProps {
  board: BoardMatrix;
  size: number;
  /** Changes for every online rematch, resetting board-local presentation state. */
  gameId?: string;
  onCellClick: (row: number, col: number, corner: BoardCorner) => void;
  lmaoMode?: boolean;
  /** Simulations mirror the active match: O/X in 1v1, O/X/T in 1v1v1. */
  threePlayer?: boolean;
  placementCorners?: Record<string, BoardCorner>;
  lastMove: [number, number] | null;
  winningLine: Array<[number, number]> | null;
  currentTurn: Exclude<CellValue, null>;
  disabled: boolean;
  myPiece?: Exclude<CellValue, null>;
  /** Only for naming who moves first in the count-in. */
  opponent?: UserProfile | null;
  gameStatus?: 'lobby' | 'playing' | 'ended';
  gameResult?: { winner: string; reason: string } | null;
  /** Plain-language explanation of how the match ended. */
  resultReason?: string;
  /** Only shown once a rating change is known, never as a guess. */
  ratingNote?: string | null;
  /** Seconds left before the first move, or null when play is already open. */
  countdown?: number | null;
  /** Replaces the player-centred result, for a viewer or anyone the room words it for. */
  resultView?: { headline: string; tone: string; winnerPiece: Exclude<CellValue, null> | null } | null;
  /** The count-in's title and small print, when the room knows better than "you" and "your opponent". */
  countdownTitle?: string;
  countdownCaption?: string;
  /** A paused game. The clocks are stopped, and the board says why and what can be done. */
  paused?: { title: string; body?: string; actions?: React.ReactNode } | null;
}

interface PieceGlyphProps {
  piece: Exclude<CellValue, null>;
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
  const isTriangle = piece === 'T';
  const simClass = isSimulated ? 'opacity-60 scale-95' : '';
  const winClass = !isSimulated && isWinning ? 'animate-winning-cell' : '';

  if (pieceTheme === 'calligraphic') {
    const strokeColor = customColor || (isX ? xColor || '#006699' : isTriangle ? '#7c3aed' : oColor || '#e11d24');
    return (
      <svg
        viewBox="0 0 24 24"
        className={`w-[78%] h-[78%] transition-transform shrink-0 ${simClass} ${winClass}`}
        fill="none"
        stroke={strokeColor}
        strokeWidth="4.2"
        strokeLinecap="round"
      >
        {isTriangle ? <path d="M12 4 20 19H4Z" /> : isX ? (
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
    const laserColor = customColor || (isX ? xColor || '#00f0ff' : isTriangle ? '#a855f7' : oColor || '#ff007f');
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
        {isTriangle ? <path d="M12 4 20 19H4Z" /> : isX ? (
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
    const activeColor = customColor || (isX ? xColor : isTriangle ? '#7c3aed' : oColor);
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

  const color = customColor || (isX ? xColor || '#2563eb' : isTriangle ? '#7c3aed' : oColor || '#dc2626');
  return (
    <span
      className={`select-none font-black text-xl sm:text-2xl transition-transform ${simClass} ${
        isX ? 'piece-blue-x' : 'piece-red-o'
      } ${winClass}`}
      style={{ color }}
    >
      {isTriangle ? '△' : piece}
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
  simulatedPiece: Exclude<CellValue, null> | null;
  simulatedColor?: string;
  currentTurn: Exclude<CellValue, null>;
  boardDisabled: boolean;
  pieceTheme: PieceTheme;
  xColor: string;
  oColor: string;
  placementCorner: BoardCorner;
  lmaoMode: boolean;
  onSelect: (row: number, col: number, corner: BoardCorner) => void;
  onContextMenu: (event: React.MouseEvent, row: number, col: number) => void;
  onHover: (row: number, col: number, corner: BoardCorner) => void;
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
  placementCorner,
  lmaoMode,
}) => {
  const placementClass =
    !lmaoMode || placementCorner === 'center'
      ? 'flex h-full w-full items-center justify-center'
      : `absolute flex h-[58%] w-[58%] items-center justify-center ${
          placementCorner === 'top-left'
            ? 'left-0 top-0'
            : placementCorner === 'top'
            ? 'left-1/2 top-0 -translate-x-1/2'
            : placementCorner === 'top-right'
            ? 'right-0 top-0'
            : placementCorner === 'left'
            ? 'left-0 top-1/2 -translate-y-1/2'
            : placementCorner === 'right'
            ? 'right-0 top-1/2 -translate-y-1/2'
            : placementCorner === 'bottom-left'
            ? 'bottom-0 left-0'
            : placementCorner === 'bottom'
            ? 'bottom-0 left-1/2 -translate-x-1/2'
            : 'bottom-0 right-0'
        }`;
  const clickCorner = (event: React.MouseEvent<HTMLButtonElement>): BoardCorner => {
    if (!lmaoMode) return 'center';
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.min(2, Math.floor(((event.clientX - rect.left) / rect.width) * 3));
    const y = Math.min(2, Math.floor(((event.clientY - rect.top) / rect.height) * 3));
    const slots: BoardCorner[][] = [
      ['top-left', 'top', 'top-right'],
      ['left', 'center', 'right'],
      ['bottom-left', 'bottom', 'bottom-right'],
    ];
    return slots[y][x];
  };
  return (
  <button
    type="button"
    onClick={(event) => {
      const corner = clickCorner(event);
      // LMAO has eight peripheral slots; the centre is deliberately blank.
      if (lmaoMode && corner === 'center') return;
      onSelect(row, col, corner);
    }}
    onContextMenu={(event) => onContextMenu(event, row, col)}
    onMouseEnter={(event) => onHover(row, col, clickCorner(event))}
    onMouseMove={(event) => onHover(row, col, clickCorner(event))}
    aria-label={`Coordinate ${columnLabel(col)}${row + 1}${cell ? `, ${cell}` : ', empty'}`}
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
        <span className={`animate-piece-drop ${placementClass}`}>
          <PieceGlyph piece={cell} pieceTheme={pieceTheme} xColor={xColor} oColor={oColor} isWinning={isWinning} />
        </span>
      ) : (
        <span className={placementClass}>
          <PieceGlyph piece={cell} pieceTheme={pieceTheme} xColor={xColor} oColor={oColor} isWinning={isWinning} />
        </span>
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
      <div className={`opacity-35 ${placementClass}`}>
        <PieceGlyph piece={currentTurn} pieceTheme={pieceTheme} xColor={xColor} oColor={oColor} isSimulated />
      </div>
    ) : showCoords ? (
      <span className="pointer-events-none select-none font-mono text-[9px] leading-none text-subtle opacity-70">
        {columnLabel(col)}{row + 1}
      </span>
    ) : null}
  </button>
  );
});

BoardCell.displayName = 'BoardCell';

export const Board: React.FC<BoardProps> = ({
  board,
  size,
  gameId,
  onCellClick,
  lastMove,
  winningLine,
  currentTurn,
  disabled,
  myPiece = 'X',
  opponent,
  gameStatus = 'playing',
  gameResult,
  resultReason,
  ratingNote,
  countdown = null,
  resultView = null,
  countdownTitle,
  countdownCaption,
  paused = null,
  lmaoMode = false,
  threePlayer = false,
  placementCorners,
}) => {
  const { theme } = useTheme();
  const prefs = useDisplayPrefs();

  const isWin = gameResult?.winner === 'Victory!';
  const isLoss = gameResult?.winner === 'Defeat!';
  const playerWinnerPiece: Exclude<CellValue, null> | null = isWin ? myPiece ?? null : isLoss ? (myPiece === 'X' ? 'O' : 'X') : null;
  const winnerPiece = resultView ? resultView.winnerPiece : playerWinnerPiece;
  const winnerColor = winnerPiece === 'X' ? theme.xColor : winnerPiece === 'T' ? '#7c3aed' : theme.oColor;
  const outcome = resultView
    ? { headline: resultView.headline, tone: resultView.tone }
    : isWin
    ? { headline: 'You win!', tone: 'text-accent-text' }
    : isLoss
    ? { headline: 'You lose', tone: 'text-danger' }
    : { headline: 'Draw', tone: 'text-warning' };
  const [isResultToastVisible, setIsResultToastVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  // Full-width wrapper, used only as the width source for the cell measurement.
  const columnRef = useRef<HTMLDivElement>(null);
  // Online clock ticks can recreate the last-move tuple without a new move.
  // Remember the coordinate already brought into view so those renders never
  // pull a player away from a manually scrolled part of the board.
  const lastAutoScrolledMoveRef = useRef<string | null>(null);
  // Mirror of the board so the memoised cell callbacks stay identity-stable.
  const boardRef = useRef(board);
  boardRef.current = board;

  // Private local right-click simulated moves state
  const [simulatedMoves, setSimulatedMoves] = useState<SimulatedMove[]>([]);
  const [hoveredCell, setHoveredCell] = useState<{ row: number; col: number; corner: BoardCorner } | null>(null);

  // A room rematch keeps this component mounted while replacing the game. Its
  // grid is empty, but a hover preview or locally simulated stone from the old
  // game otherwise remains visible until the pointer happens to leave a cell.
  useEffect(() => {
    setSimulatedMoves([]);
    setHoveredCell(null);
    lastAutoScrolledMoveRef.current = null;
  }, [gameId]);

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
  // Start two zoom steps larger than the fitted board: large boards feel like
  // a playing surface rather than a thumbnail, while the viewport still lets
  // people pan naturally around the position.
  const DEFAULT_ZOOM_OFFSET = 12;
  /** Fitted size for this frame, and the player's offset from it. */
  const [fittedCell, setFittedCell] = useState(() =>
    Math.min(MAX_CELL, Math.max(MIN_CELL, Math.round(560 / size)))
  );
  const cellSize = Math.min(MAX_CELL, Math.max(MIN_CELL, fittedCell + DEFAULT_ZOOM_OFFSET));

  useEffect(() => {
    if (gameStatus !== 'ended' || (!gameResult && !resultView)) {
      setIsResultToastVisible(false);
      return;
    }
    setIsResultToastVisible(true);
    const timer = window.setTimeout(() => setIsResultToastVisible(false), 4500);
    return () => window.clearTimeout(timer);
  }, [gameStatus, gameResult?.winner, resultView?.headline]);

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
    if (!lastMove) {
      lastAutoScrolledMoveRef.current = null;
      return;
    }
    if (!el) return;

    const [row, col] = lastMove;
    const moveKey = `${row}:${col}`;
    if (lastAutoScrolledMoveRef.current === moveKey) return;
    lastAutoScrolledMoveRef.current = moveKey;

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

  // The match action rail owns the buttons; the board owns their local state.
  useEffect(() => {
    const clearSimulations = () => setSimulatedMoves([]);
    const centre = () => centreOnBoard();
    window.addEventListener('caro:clear-simulations', clearSimulations);
    window.addEventListener('caro:center-board', centre);
    return () => {
      window.removeEventListener('caro:clear-simulations', clearSimulations);
      window.removeEventListener('caro:center-board', centre);
    };
  }, [centreOnBoard]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent<number>('caro:simulation-count', { detail: simulatedMoves.length }));
  }, [simulatedMoves.length]);

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
  const handleSelectCell = useCallback((r: number, c: number, corner: BoardCorner) => {
    if (touchStartRef.current.isMoved) return;
    onCellClick(r, c, corner);
  }, [onCellClick]);

  const handleHoverCell = useCallback((r: number, c: number, corner: BoardCorner) => {
    setHoveredCell((prev) =>
      prev && prev.row === r && prev.col === c && prev.corner === corner ? prev : { row: r, col: c, corner },
    );
  }, []);

  // Right-click to toggle a private local simulated move
  const handleCellContextMenu = useCallback((e: React.MouseEvent, r: number, c: number) => {
    e.preventDefault();
    if (boardRef.current?.[r]?.[c] != null) return; // never sketch over a real piece
    setSimulatedMoves((prev) => {
      const existingIdx = prev.findIndex((m) => m.row === r && m.col === c);
      if (existingIdx >= 0) return prev.filter((_, idx) => idx !== existingIdx);
      const lastSim = prev[prev.length - 1];
      // Begin with the player who is actually due to move. From there the
      // analysis line follows the match's active-player order: X/O in 1v1,
      // X/O/T in 1v1v1.
      const nextPiece: Exclude<CellValue, null> = !lastSim
        ? currentTurn
        : threePlayer
        ? lastSim.piece === 'X'
          ? 'O'
          : lastSim.piece === 'O'
          ? 'T'
          : 'X'
        : lastSim.piece === 'X'
        ? 'O'
        : 'X';
      return [...prev, { row: r, col: c, piece: nextPiece }];
    });
  }, [currentTurn, threePlayer]);

  const getBoardThemeClass = () => {
    if (theme.boardTheme === 'light_wood') return 'board-theme-light-wood';
    if (theme.boardTheme === 'laser_futuristic') return 'board-theme-laser-futuristic';
    if (theme.boardTheme === 'classic_wood') return 'board-theme-classic-wood';
    return 'board-theme-graph-paper';
  };

  const isWinningCell = (r: number, c: number) =>
    Boolean(winningLine?.some(([wr, wc]) => wr === r && wc === c));

  const isMyTurn = myPiece === currentTurn;

  return (
    // The outer element stays full width so the cell measurement has a source
    // the board's own size cannot feed back into. The inner stack is capped to
    // the board, so the toolbar, the match header and the frame share one edge.
    <div ref={columnRef} className="flex w-full justify-center select-none">
      {/* Keep the viewport wide when zooming out. Coupling its width to the
          shrunken grid made the whole board collapse into a small square. */}
      <div
        style={{ maxWidth: Math.max(fittedCell, MIN_CELL + DEFAULT_ZOOM_OFFSET) * size + 40 }}
        className="flex w-full max-w-[1200px] flex-col items-center justify-center"
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
                      isHovered={Boolean(
                        hoveredCell &&
                          hoveredCell.row === rIdx &&
                          hoveredCell.col === cIdx &&
                          (!lmaoMode || hoveredCell.corner !== 'center'),
                      )}
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
                      placementCorner={
                        cell
                          ? placementCorners?.[`${rIdx}:${cIdx}`] ?? 'center'
                          : lmaoMode
                          ? hoveredCell?.row === rIdx && hoveredCell.col === cIdx
                            ? hoveredCell.corner
                            : 'center'
                          : 'center'
                      }
                      lmaoMode={lmaoMode}
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

        {isResultToastVisible && (
          <div role="status" aria-live="polite" className="pointer-events-none absolute left-1/2 top-4 z-20 w-[min(24rem,calc(100%-2rem))] -translate-x-1/2 rounded-lg border border-line-strong bg-surface/95 px-4 py-3 text-center shadow-e2 backdrop-blur-sm">
            <div className="flex items-center justify-center gap-2.5">
              <span className="grid h-9 w-9 place-items-center rounded-full border-2 font-display text-xl font-extrabold leading-none" style={winnerPiece ? { borderColor: winnerColor, color: winnerColor } : undefined}>
                {winnerPiece ?? '='}
              </span>
              <p className={`display text-xl ${outcome.tone}`}>{outcome.headline}</p>
            </div>
            {resultReason && <p className="mt-1 text-xs text-muted">{resultReason}</p>}
            {ratingNote && <p className="mt-0.5 text-[11px] text-subtle">{ratingNote}</p>}
          </div>
        )}

        {/* PAUSED. Between the result and the count-in: a seat is empty or its
            player is reconnecting, and the clocks wait for them. */}
        {paused && countdown === null && (
          <div className="absolute inset-0 z-[25] flex items-center justify-center rounded-lg bg-[var(--ui-scrim)] p-4 backdrop-blur-[2px]">
            <div role="status" aria-live="polite" className="modal-panel w-[min(24rem,100%)] p-6 text-center">
              <p className="display text-2xl text-ink">{paused.title}</p>
              {paused.body && <p className="mt-2 text-sm text-muted">{paused.body}</p>}
              {paused.actions && <div className="mt-5 flex flex-col gap-2">{paused.actions}</div>}
            </div>
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
                {countdownTitle ?? 'Get ready'}
              </p>
              <p className="mt-1 font-mono text-5xl font-semibold tabular-nums text-ink">
                {countdown}
              </p>
              <p className="mt-2 text-xs text-muted">
                {countdownCaption ??
                  (isMyTurn
                    ? `You move first, as ${myPiece}`
                    : `${opponent?.displayName || 'Your opponent'} moves first`)}
              </p>
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  );
};
