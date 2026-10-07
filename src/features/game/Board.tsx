import React, { useRef, useState, useEffect, useLayoutEffect, useCallback, useMemo } from 'react';
import confetti from 'canvas-confetti';
import type { CellValue } from '../../shared/utils/gomokuLogic';
import { columnLabel } from '../../shared/utils/gomokuLogic';
import { useTheme } from '../theme/ThemeContext';
import { useDisplayPrefs } from './displayPrefs';
import { BoardCell } from './BoardCells';
import {
  SHEET_COL_HEADER_H,
  SHEET_FAVICON,
  SHEET_ROW_HEADER_W,
  SheetColumnHeader,
  SheetRowHeader,
} from './BoardSheetParts';
import { SheetChrome, SheetTabs, SheetFinanceView } from './SheetChrome';
import {
  useDisguiseMode,
  applyDisguiseDefault,
  resetDisguise,
  toggleDisguised,
  SHEET_DISGUISE_ATTR,
  SHEET_VIEW_ATTR,
} from './disguiseMode';
import { useSheetUi, updateSheetUi, sheetUiStore } from './sheetBridge';
import { showSheetSnackbar } from './sheet/sheetSnackbar';
import type { BoardCorner, BoardProps, SimulatedMove } from './BoardTypes';
export type { BoardCorner, SimulatedMove } from './BoardTypes';

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
  coinFlip = null,
  rpsReveal = null,
  preGame = null,
  paused = null,
  lmaoMode = false,
  threePlayer = false,
  placementCorners,
}) => {
  const { theme } = useTheme();
  const prefs = useDisplayPrefs();
  const disguised = useDisguiseMode();
  const sheetUi = useSheetUi();
  const isSheetTheme = theme.boardTheme === 'spreadsheet';
  // The disguise is only on screen when the toggle is set AND the board is the
  // Spreadsheet theme; a stale flag under any other theme hides nothing.
  const sheetDisguiseOn = isSheetTheme && disguised;
  // A fake report tab only exists on the Spreadsheet board. Any other theme
  // always shows the game, whatever the store last said.
  const sheetView = isSheetTheme ? sheetUi.view : 'game';

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
  // The grid is hidden with display:none while a fake report tab shows, and a
  // hidden scroller forgets its offset. Remember it so flipping back after the
  // boss walks past lands on exactly the same part of the board.
  const savedSheetScrollRef = useRef({ left: 0, top: 0 });

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

  // The disguise is the point of the Spreadsheet theme, not an extra step on
  // top of it: picking the theme (or starting a new game already on it) hides
  // the rest of the app immediately. The star stays as the one way to peek
  // back — this only sets the default, once per game and theme, so it never
  // fights a manual toggle even if this Board is mounted again for the same
  // game.
  useEffect(() => {
    applyDisguiseDefault(`${gameId ?? 'practice'}|${theme.boardTheme}`, theme.boardTheme === 'spreadsheet');
  }, [gameId, theme.boardTheme]);

  // Leaving the match takes the disguise and the report view with it, so the
  // next match starts from its own defaults and nothing outside a match is
  // ever styled as a sheet.
  useEffect(
    () => () => {
      resetDisguise();
      updateSheetUi({ view: 'game', commentsOpen: false, helpOpen: false });
    },
    [],
  );

  // A new game opens on its own sheet, not on whichever fake report was up
  // when the last one ended. Only an actual change of game counts: the boss
  // key may have just switched to a report, and mounting is not a new game.
  // Read from the store rather than the hook so this stays keyed on the game.
  const viewResetGameIdRef = useRef(gameId);
  useEffect(() => {
    if (viewResetGameIdRef.current === gameId) return;
    viewResetGameIdRef.current = gameId;
    if (sheetUiStore.get().view !== 'game') updateSheetUi({ view: 'game' });
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
  // A real sheet's rows sit around 21px, so the Spreadsheet board keeps its
  // cells close to that band before the toolbar's zoom scales them, rather
  // than blowing a 15x15 board up into obviously square game tiles.
  const cellSize = isSheetTheme
    ? Math.min(96, Math.max(12, Math.round(Math.min(34, Math.max(22, fittedCell + DEFAULT_ZOOM_OFFSET)) * sheetUi.zoom)))
    : Math.min(MAX_CELL, Math.max(MIN_CELL, fittedCell + DEFAULT_ZOOM_OFFSET));
  // The frame's visible size, for the Spreadsheet theme's filler cells.
  const [frameBox, setFrameBox] = useState({ w: 0, h: 0 });

  useEffect(() => {
    if (gameStatus !== 'ended' || (!gameResult && !resultView)) {
      setIsResultToastVisible(false);
      return;
    }
    setIsResultToastVisible(true);
    const timer = window.setTimeout(() => setIsResultToastVisible(false), 4500);
    return () => window.clearTimeout(timer);
  }, [gameStatus, gameResult?.winner, resultView?.headline]);

  // On the Spreadsheet board the result is told in Sheets' own words, through
  // the chrome's single snackbar slot: "saved" for a win, "restored" for a
  // loss, "no changes" for a draw. The game's headline and reason are English
  // game talk, and a second dark box beside the chrome's own snackbar would
  // not look like Sheets either.
  const sheetResultText = !isSheetTheme
    ? null
    : winnerPiece === null
    ? 'Không có thay đổi mới'
    : winnerPiece === myPiece
    ? 'Đã lưu tất cả thay đổi'
    : 'Đã khôi phục phiên bản trước';
  useEffect(() => {
    if (isResultToastVisible && sheetResultText) showSheetSnackbar(sheetResultText);
  }, [isResultToastVisible, sheetResultText]);

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
      // The sheet's filler cells are sized off the frame. Capped by the window
      // so that a frame whose height ever followed its content could not chase
      // the filler it is itself producing.
      const w = Math.min(frame.clientWidth, window.innerWidth);
      const h = Math.min(frame.clientHeight, window.innerHeight);
      setFrameBox((current) => (current.w === w && current.h === h ? current : { w, h }));
    };

    // Both are watched: the column drives the width, the frame's viewport-unit
    // height changes on its own when the window is resized. Re-measuring from
    // the frame is safe because the frame's width is not an input.
    const observer = new ResizeObserver(measure);
    observer.observe(column);
    observer.observe(frame);
    measure();
    return () => observer.disconnect();
    // The Spreadsheet theme renders a different frame element, so a theme
    // switch has to re-attach the observer to it.
  }, [size, isSheetTheme]);

  // Read by centreOnBoard through a ref so its identity stays stable for the
  // event listener below, while still centring with the current geometry.
  // Refreshed in a layout effect, which runs before the centring effect below.
  const layoutRef = useRef({ sheet: isSheetTheme, cellSize, size });
  useLayoutEffect(() => {
    layoutRef.current = { sheet: isSheetTheme, cellSize, size };
  }, [isSheetTheme, cellSize, size]);

  const centreOnBoard = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const layout = layoutRef.current;
    if (!layout.sheet) {
      el.scrollLeft = Math.max(0, (el.scrollWidth - el.clientWidth) / 2);
      el.scrollTop = Math.max(0, (el.scrollHeight - el.clientHeight) / 2);
      return;
    }
    // The sheet is anchored top-left and continues past the board, so the
    // scroll range's middle is not the board's middle. Centre the board in
    // the part of the frame the pinned headers leave visible.
    const half = (layout.size * layout.cellSize) / 2;
    const left = SHEET_ROW_HEADER_W + half - (SHEET_ROW_HEADER_W + el.clientWidth) / 2;
    const top = SHEET_COL_HEADER_H + half - (SHEET_COL_HEADER_H + el.clientHeight) / 2;
    el.scrollLeft = Math.min(Math.max(0, el.scrollWidth - el.clientWidth), Math.max(0, left));
    el.scrollTop = Math.min(Math.max(0, el.scrollHeight - el.clientHeight), Math.max(0, top));
  }, []);

  // The sheet's filler only exists once the frame has been measured, and
  // centring before then would hit the end of a too-short scroll range.
  const sheetMeasured = isSheetTheme && frameBox.w > 0;
  useEffect(() => {
    centreOnBoard();
  }, [size, centreOnBoard, sheetMeasured]);

  // A board wider than its frame can put the move that just landed off screen,
  // which is how a player loses their place on a 50x50 grid. Scroll it back
  // into view, but only when it is actually outside.
  useEffect(() => {
    const el = containerRef.current;
    if (!lastMove) {
      lastAutoScrolledMoveRef.current = null;
      return;
    }
    // A hidden grid (a fake report is showing) has no viewport to scroll yet.
    // Leave the move unmarked so it is brought into view on the way back.
    if (!el || el.clientWidth === 0) return;

    const [row, col] = lastMove;
    const moveKey = `${row}:${col}`;
    if (lastAutoScrolledMoveRef.current === moveKey) return;
    lastAutoScrolledMoveRef.current = moveKey;

    // The sheet's pinned headers cover the frame's top and left edges, so the
    // visible part of the grid starts past them.
    const offsetX = isSheetTheme ? SHEET_ROW_HEADER_W : 0;
    const offsetY = isSheetTheme ? SHEET_COL_HEADER_H : 0;
    const x = offsetX + col * cellSize;
    const y = offsetY + row * cellSize;
    const margin = cellSize * 2;

    let left = el.scrollLeft;
    let top = el.scrollTop;
    if (x - margin < left + offsetX) left = Math.max(0, x - margin - offsetX);
    else if (x + cellSize + margin > left + el.clientWidth) left = x + cellSize + margin - el.clientWidth;
    if (y - margin < top + offsetY) top = Math.max(0, y - margin - offsetY);
    else if (y + cellSize + margin > top + el.clientHeight) top = y + cellSize + margin - el.clientHeight;

    if (left === el.scrollLeft && top === el.scrollTop) return;
    el.scrollTo({ left, top, behavior: 'smooth' });
  }, [lastMove, cellSize, isSheetTheme, sheetView]);

  // Coming back to the game tab: put the grid back where the player left it.
  // Layout effect, so the frame never paints scrolled to the top-left first.
  useLayoutEffect(() => {
    if (sheetView !== 'game') return;
    const el = containerRef.current;
    if (!el) return;
    const { left, top } = savedSheetScrollRef.current;
    if (el.scrollLeft !== left) el.scrollLeft = left;
    if (el.scrollTop !== top) el.scrollTop = top;
  }, [sheetView]);

  const handleFrameScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    // A frame on its way to display:none can report a reset offset; that is
    // not where the player was.
    if (el.clientWidth === 0) return;
    savedSheetScrollRef.current = { left: el.scrollLeft, top: el.scrollTop };
  };

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

  // While disguised the whole browser tab plays along: global CSS restyles
  // dialogs off the <html> flag, and the tab's favicon is a green sheet rather
  // than the game's logo. Everything is put back exactly as it was found.
  useEffect(() => {
    if (!sheetDisguiseOn) return;
    const root = document.documentElement;
    const previousFlag = root.dataset[SHEET_DISGUISE_ATTR];
    root.dataset[SHEET_DISGUISE_ATTR] = 'on';
    // Confetti from a win just before the boss key would keep falling over
    // the sheet for a few seconds.
    confetti.reset();

    const icon = document.querySelector<HTMLLinkElement>('link[rel~="icon"]');
    const previousHref = icon?.getAttribute('href') ?? null;
    const previousType = icon?.getAttribute('type') ?? null;
    if (icon) {
      icon.setAttribute('type', 'image/svg+xml');
      icon.setAttribute('href', SHEET_FAVICON);
    }

    return () => {
      if (previousFlag === undefined) delete root.dataset[SHEET_DISGUISE_ATTR];
      else root.dataset[SHEET_DISGUISE_ATTR] = previousFlag;
      if (icon) {
        if (previousHref === null) icon.removeAttribute('href');
        else icon.setAttribute('href', previousHref);
        if (previousType === null) icon.removeAttribute('type');
        else icon.setAttribute('type', previousType);
      }
    };
  }, [sheetDisguiseOn]);

  // Tells the rest of the page that a fake report is what is on screen: global
  // CSS keeps the game's own dialogs out of sight under it, and the game's
  // sounds stay quiet (see useSheetAwareSound).
  const sheetReportOn = sheetDisguiseOn && sheetView !== 'game';
  useEffect(() => {
    if (!sheetReportOn) return;
    const root = document.documentElement;
    root.dataset[SHEET_VIEW_ATTR] = 'report';
    confetti.reset();
    return () => {
      delete root.dataset[SHEET_VIEW_ATTR];
    };
  }, [sheetReportOn]);

  // The tab title follows the document name the player can rename.
  useEffect(() => {
    if (!sheetDisguiseOn) return;
    const previousTitle = document.title;
    document.title = `${sheetUi.title} - Google Trang tính`;
    return () => {
      document.title = previousTitle;
    };
  }, [sheetDisguiseOn, sheetUi.title]);

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
    if (theme.boardTheme === 'spreadsheet') return 'board-theme-spreadsheet';
    return 'board-theme-graph-paper';
  };
  // The formula bar reacts to whatever cell the eye would land on: the one
  // under the pointer, falling back to the move that just landed.
  // Memoised on the two numbers, so a pointer moving between corners of one
  // cell (LMAO mode) or a clock tick re-creating lastMove leaves the memoised
  // chrome alone; only reaching a different cell re-renders the formula bar.
  const focusRow = hoveredCell ? hoveredCell.row : lastMove ? lastMove[0] : -1;
  const focusCol = hoveredCell ? hoveredCell.col : lastMove ? lastMove[1] : -1;
  const sheetActiveCell = useMemo(
    () => (focusRow < 0 ? null : { row: focusRow, col: focusCol }),
    [focusRow, focusCol],
  );

  // The sheet runs on past the board like a real one: enough empty columns and
  // rows to fill the frame again, so the board can always be scrolled to the
  // middle and the grid never visibly ends.
  const sheetFillerCols = isSheetTheme ? Math.max(4, Math.ceil(frameBox.w / cellSize) + 2) : 0;
  const sheetFillerRows = isSheetTheme ? Math.max(6, Math.ceil(frameBox.h / cellSize) + 2) : 0;
  const sheetTotalCols = size + sheetFillerCols;
  const sheetTotalRows = size + sheetFillerRows;
  const sheetColLabels = useMemo(
    () => (isSheetTheme ? Array.from({ length: sheetTotalCols }, (_, i) => columnLabel(i)) : []),
    [isSheetTheme, sheetTotalCols],
  );
  const sheetRowLabels = useMemo(
    () => (isSheetTheme ? Array.from({ length: sheetTotalRows }, (_, i) => String(i + 1)) : []),
    [isSheetTheme, sheetTotalRows],
  );
  const sheetActiveCol = sheetActiveCell && sheetActiveCell.col < size ? sheetActiveCell.col : -1;
  const sheetActiveRow = sheetActiveCell && sheetActiveCell.row < size ? sheetActiveCell.row : -1;

  const isWinningCell = (r: number, c: number) =>
    Boolean(winningLine?.some(([wr, wc]) => wr === r && wc === c));

  const isMyTurn = myPiece === currentTurn;

  // One lookup instead of a scan of every sketch for each of up to 2,500 cells.
  const simulatedByKey = new Map<string, SimulatedMove>();
  for (const move of simulatedMoves) simulatedByKey.set(`${move.row}:${move.col}`, move);

  const cells = board.map((row, rIdx) =>
    row.map((cell, cIdx) => {
      const simItem = simulatedByKey.get(`${rIdx}:${cIdx}`);
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
          // A real sheet has one even gridline weight and no labels inside
          // its cells; the headers carry the coordinates instead.
          isMajorRight={!isSheetTheme && (cIdx + 1) % 5 === 0 && cIdx + 1 < size}
          isMajorBottom={!isSheetTheme && (rIdx + 1) % 5 === 0 && rIdx + 1 < size}
          showCoords={!isSheetTheme && prefs.showCoordinates && cellSize >= 28}
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
          sheet={isSheetTheme}
          onSelect={handleSelectCell}
          onContextMenu={handleCellContextMenu}
          onHover={handleHoverCell}
        />
      );
    })
  );

  const frameHandlers = {
    onMouseDown: handleMouseDown,
    onMouseMove: handleMouseMove,
    onMouseUp: handleMouseUp,
    onTouchStart: handleTouchStart,
    onTouchMove: handleTouchMove,
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    onMouseLeave: () => {
      setIsPanning(false);
      setHoveredCell(null);
    },
  };

  if (isSheetTheme) {
    return (
      // A full-height column when disguised (the page is nothing but this
      // sheet), and an ordinary block inside the match layout while the player
      // peeks at the real UI with the star.
      <div
        ref={columnRef}
        className={`sheet-board flex w-full flex-col bg-white ${sheetDisguiseOn ? 'h-full min-h-0 flex-1' : ''}`}
      >
        <SheetChrome
          board={board}
          activeCell={sheetActiveCell}
          disguised={disguised}
          onToggleDisguise={toggleDisguised}
          simulationCount={simulatedMoves.length}
        />
        <div className={`relative flex w-full flex-col ${sheetDisguiseOn ? 'min-h-0 flex-1' : ''}`}>
          {/* The game stays mounted under a fake report, so its scroll
              position, hover and sketches all survive the boss key. */}
          <div
            className={`relative w-full select-none flex-col ${sheetDisguiseOn ? 'min-h-0 flex-1' : ''} ${
              sheetView === 'game' ? 'flex' : 'hidden'
            }`}
          >
            <div
              ref={containerRef}
              {...frameHandlers}
              onScroll={handleFrameScroll}
              // isolate: the pinned headers sit above the cells, but must stay
              // under the count-in and paused layers drawn beside this frame.
              className={`board-scroll-container board-frame board-theme-spreadsheet relative isolate w-full overflow-auto ${
                sheetDisguiseOn ? 'board-frame--fill' : ''
              } ${isPanning ? 'cursor-grabbing' : 'cursor-cell'}`}
            >
              {/* Anchored top-left like a real sheet. The headers span the
                  whole grid on their cross axis because a grid item is only
                  sticky within its own grid area. */}
              <div
                className="sheet-grid"
                style={{
                  gridTemplateColumns: `${SHEET_ROW_HEADER_W}px ${sheetTotalCols * cellSize}px`,
                  gridTemplateRows: `${SHEET_COL_HEADER_H}px ${sheetTotalRows * cellSize}px`,
                }}
              >
                <div
                  aria-hidden="true"
                  className="sheet-corner"
                  style={{
                    gridRow: '1 / 3',
                    gridColumn: '1 / 3',
                    alignSelf: 'start',
                    justifySelf: 'start',
                    width: SHEET_ROW_HEADER_W,
                    height: SHEET_COL_HEADER_H,
                  }}
                />
                <SheetColumnHeader labels={sheetColLabels} cellSize={cellSize} active={sheetActiveCol} />
                <SheetRowHeader labels={sheetRowLabels} cellSize={cellSize} active={sheetActiveRow} />
                {/* The filler past the board is only a painted gridline
                    pattern, so a 50x50 board does not grow thousands of
                    empty nodes to look endless. */}
                <div
                  className="sheet-body"
                  style={{ gridRow: 2, gridColumn: 2, backgroundSize: `${cellSize}px ${cellSize}px` }}
                >
                  <div
                    className="grid shrink-0 board-grid-inner"
                    onMouseLeave={() => setHoveredCell(null)}
                    style={{
                      gridTemplateColumns: `repeat(${size}, ${cellSize}px)`,
                      gridTemplateRows: `repeat(${size}, ${cellSize}px)`,
                      width: 'max-content',
                      height: 'max-content',
                    }}
                  >
                    {cells}
                  </div>
                </div>
              </div>
            </div>

            {/* The first-move pickers (rock-paper-scissors, coin toss) wait on
                the player, so they stay usable here; global CSS dresses their
                modal panel as a Sheets dialog while disguised. */}
            {preGame && <div className="absolute inset-0 z-40">{preGame}</div>}

            {paused && countdown === null && !preGame && (
              <div className="absolute inset-0 z-[25] flex items-center justify-center bg-white/60 p-4">
                <div role="status" aria-live="polite" className="sheet-dialog w-[min(28rem,100%)] p-6">
                  <p className="sheet-dialog__title">{paused.title}</p>
                  {paused.body && <p className="sheet-dialog__body mt-3">{paused.body}</p>}
                  {paused.actions && (
                    <div className="sheet-dialog-actions mt-6 flex flex-wrap justify-end gap-2">{paused.actions}</div>
                  )}
                </div>
              </div>
            )}

            {/* The count-in as a Sheets loading notice. The transparent layer
                still blocks clicks on the grid until play opens. */}
            {countdown !== null && !preGame && (
              <div role="status" aria-live="assertive" className="absolute inset-0 z-30">
                <div className="sheet-notice absolute left-1/2 top-2 -translate-x-1/2">
                  Đang tải… <span className="tabular-nums">{countdown}</span>
                </div>
              </div>
            )}
          </div>
          {sheetView !== 'game' && (
            <div className={`board-frame flex w-full flex-col overflow-hidden ${sheetDisguiseOn ? 'board-frame--fill' : ''}`}>
              <SheetFinanceView view={sheetView} />
            </div>
          )}
        </div>
        <SheetTabs board={board} />
      </div>
    );
  }

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
          {...frameHandlers}
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
              {cells}
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
        {preGame && <div className="absolute inset-0 z-40">{preGame}</div>}

        {paused && countdown === null && !preGame && (
          <div className="absolute inset-0 z-[25] flex items-center justify-center rounded-lg bg-[var(--ui-scrim)] p-4 backdrop-blur-[2px]">
            <div role="status" aria-live="polite" className="modal-panel w-[min(24rem,100%)] p-6 text-center">
              <p className="display text-2xl text-ink">{paused.title}</p>
              {paused.body && <p className="mt-2 text-sm text-muted">{paused.body}</p>}
              {paused.actions && <div className="mt-5 flex flex-col gap-2">{paused.actions}</div>}
            </div>
          </div>
        )}

        {countdown !== null && !preGame && (
          <div
            role="status"
            aria-live="assertive"
            className="absolute inset-0 z-30 flex items-center justify-center rounded-lg bg-[var(--ui-scrim)] backdrop-blur-[2px]"
          >
            <div className="rounded-lg border border-line-strong bg-surface px-8 py-6 text-center shadow-2xl">
              {coinFlip && (
                <div className="coin-stage mx-auto mb-3">
                  <span className="coin-stage__halo" aria-hidden="true" />
                  <div className="coin-toss grid h-16 w-16 place-items-center rounded-full border-4 border-[#f5c542] bg-gradient-to-br from-[#fff4a8] via-[#dcae24] to-[#8b5a00] font-display text-2xl font-extrabold text-[#5a3900] shadow-lg">
                    {coinFlip.winner}
                  </div>
                </div>
              )}
              {rpsReveal && (
                <div className="rps-reveal mb-3" aria-label={`Hands revealed: X ${rpsReveal.X}, O ${rpsReveal.O}. ${rpsReveal.winner} goes first.`}>
                  <span className="rps-reveal__hand">{rpsReveal.X === 'rock' ? '✊' : rpsReveal.X === 'paper' ? '✋' : '✌️'}</span>
                  <span className="rps-reveal__vs">VS</span>
                  <span className="rps-reveal__hand">{rpsReveal.O === 'rock' ? '✊' : rpsReveal.O === 'paper' ? '✋' : '✌️'}</span>
                </div>
              )}
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
