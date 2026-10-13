import React, { memo } from 'react';
import type { CellValue } from '../../shared/utils/gomokuLogic';
import { columnLabel } from '../../shared/utils/gomokuLogic';
import type { PieceTheme } from '../theme/types';
import type { BoardCorner } from './BoardTypes';
import { SheetGlyph, SHEET_TRIANGLE_COLOR } from './BoardSheetParts';

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
  /** Position of this sketch among its piece's sketches, drawn as a subscript. */
  simulatedNumber: number | null;
  currentTurn: Exclude<CellValue, null>;
  boardDisabled: boolean;
  pieceTheme: PieceTheme;
  xColor: string;
  oColor: string;
  placementCorner: BoardCorner;
  lmaoMode: boolean;
  /** Spreadsheet theme: pieces as cell text, Sheets' selection and collaborator looks. */
  sheet: boolean;
  onSelect: (row: number, col: number, corner: BoardCorner) => void;
  onContextMenu: (event: React.MouseEvent, row: number, col: number) => void;
  onHover: (row: number, col: number, corner: BoardCorner) => void;
}

/**
 * Memoised so that moving the pointer across a 50x50 grid re-renders the two
 * cells whose hover state changed instead of all 2,500 of them.
 */
export const BoardCell = memo<BoardCellProps>(({
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
  simulatedNumber,
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
  sheet,
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
  const simulatedLabel = simulatedNumber !== null ? (
    <span
      className="pointer-events-none absolute bottom-0 right-0.5 select-none font-mono font-bold leading-none"
      style={{ fontSize: `${Math.max(7, Math.round(cellSize * 0.3))}px`, color: simulatedColor }}
    >
      {simulatedNumber}
    </span>
  ) : null;
  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    // Space/Enter on a focused cell fires a click with detail 0; only
    // pointer clicks may place a move.
    if (event.detail === 0) return;
    const corner = clickCorner(event);
    // LMAO has eight peripheral slots; the centre is deliberately blank.
    if (lmaoMode && corner === 'center') return;
    onSelect(row, col, corner);
  };

  if (sheet) {
    const pieceColor = (piece: Exclude<CellValue, null>) =>
      piece === 'X' ? xColor : piece === 'T' ? SHEET_TRIANGLE_COLOR : oColor;
    // A corner slot is a little over half the cell, so its text shrinks with it.
    const fontSize = Math.max(8, Math.round(cellSize * (lmaoMode ? 0.4 : 0.5)));
    return (
      <button
        type="button"
        onClick={handleClick}
        onContextMenu={(event) => onContextMenu(event, row, col)}
        onMouseEnter={(event) => onHover(row, col, clickCorner(event))}
        onMouseMove={(event) => onHover(row, col, clickCorner(event))}
        aria-label={`Coordinate ${columnLabel(col)}${row + 1}${cell ? `, ${cell}` : ', empty'}`}
        // The move that just landed wears a collaborator's cursor in the colour
        // of whoever played it, the way Sheets shows another editor's cell, so
        // it reads as a colleague typing rather than a game marking a move.
        style={{
          width: `${cellSize}px`,
          height: `${cellSize}px`,
          boxShadow: isLast && cell ? `inset 0 0 0 2px ${pieceColor(cell)}` : undefined,
        }}
        className={`board-cell relative flex shrink-0 items-center justify-center ${
          cell ? 'board-cell--filled' : ''
        } ${isLast ? 'board-cell--sheet-last' : ''} ${isWinning ? 'board-cell--sheet-win' : ''}`}
      >
        {cell ? (
          <span className={placementClass}>
            <SheetGlyph piece={cell} color={pieceColor(cell)} fontSize={fontSize} />
          </span>
        ) : simulatedPiece ? (
          <>
            <SheetGlyph
              piece={simulatedPiece}
              color={simulatedColor || pieceColor(simulatedPiece)}
              fontSize={fontSize}
              opacity={0.6}
            />
            {simulatedLabel}
          </>
        ) : isHovered && !boardDisabled ? (
          <div className={`opacity-35 ${placementClass}`}>
            <SheetGlyph piece={currentTurn} color={pieceColor(currentTurn)} fontSize={fontSize} />
          </div>
        ) : null}
      </button>
    );
  }

  return (
  <button
    type="button"
    onClick={handleClick}
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
      <>
        <PieceGlyph
          piece={simulatedPiece}
          pieceTheme={pieceTheme}
          xColor={xColor}
          oColor={oColor}
          isSimulated
          customColor={simulatedColor}
        />
        {simulatedLabel}
      </>
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
