import React, { memo, useRef } from 'react';
import type { CellValue } from '../../shared/utils/gomokuLogic';
import { columnLabel } from '../../shared/utils/gomokuLogic';
import { pieceColor, type PieceTheme } from '../theme/types';
import type { BoardCorner } from './BoardTypes';
import { SheetGlyph } from './BoardSheetParts';
import { useT } from '../i18n/language';

interface PieceGlyphProps {
  piece: Exclude<CellValue, null>;
  pieceTheme: PieceTheme;
  xColor: string;
  oColor: string;
  isSimulated?: boolean;
  isWinning?: boolean;
  customColor?: string;
  /** Orca style's code grid (PR 5): finer strokes, smaller glyphs. */
  orca?: boolean;
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
  orca = false,
}) => {
  const isX = piece === 'X';
  const isTriangle = piece === 'T';
  const simClass = isSimulated ? (orca ? 'opacity-55 scale-95' : 'opacity-60 scale-95') : '';
  const winClass = !isSimulated && isWinning ? 'animate-winning-cell' : '';

  if (pieceTheme === 'calligraphic') {
    const strokeColor = customColor || pieceColor({ xColor, oColor }, piece);
    return (
      <svg
        viewBox="0 0 24 24"
        className={`${orca ? 'h-[70%] w-[70%]' : 'w-[78%] h-[78%]'} transition-transform shrink-0 ${simClass} ${winClass}`}
        fill="none"
        stroke={strokeColor}
        strokeWidth={orca ? '3.1' : '4.2'}
        strokeLinecap="round"
        strokeLinejoin={orca ? 'round' : undefined}
      >
        {isTriangle ? <path d={orca ? 'M12 4.2 19.8 18.8H4.2Z' : 'M12 4 20 19H4Z'} /> : isX ? (
          <>
            <line x1="5" y1="5" x2="19" y2="19" />
            <line x1="19" y1="5" x2="5" y2="19" />
          </>
        ) : (
          <circle cx="12" cy="12" r={orca ? '7.4' : '7.5'} />
        )}
      </svg>
    );
  }

  if (pieceTheme === 'laser') {
    const laserColor = customColor || pieceColor({ xColor, oColor }, piece, true);
    return (
      <svg
        viewBox="0 0 24 24"
        className={`${orca ? 'h-[74%] w-[74%]' : 'w-[82%] h-[82%]'} transition-transform shrink-0 ${simClass} ${winClass}`}
        style={{ filter: orca ? `drop-shadow(0 0 2px ${laserColor}88)` : `drop-shadow(0 0 4px ${laserColor}) drop-shadow(0 0 10px ${laserColor})` }}
        fill="none"
        stroke={laserColor}
        strokeWidth={orca ? '2.8' : '3.8'}
        strokeLinecap="round"
        strokeLinejoin={orca ? 'round' : undefined}
      >
        {isTriangle ? <path d={orca ? 'M12 4.2 19.8 18.8H4.2Z' : 'M12 4 20 19H4Z'} /> : isX ? (
          orca ? (
            <>
              <line x1="5.2" y1="5.2" x2="18.8" y2="18.8" />
              <line x1="18.8" y1="5.2" x2="5.2" y2="18.8" />
            </>
          ) : (
            <>
              <line x1="5" y1="5" x2="19" y2="19" />
              <line x1="19" y1="5" x2="5" y2="19" />
            </>
          )
        ) : (
          <circle cx="12" cy="12" r={orca ? '7.4' : '7.5'} />
        )}
      </svg>
    );
  }

  if (pieceTheme === 'gomoku_3d') {
    const activeColor = customColor || pieceColor({ xColor, oColor }, piece);
    const stoneBg = activeColor ? `radial-gradient(circle at 35% 35%, ${activeColor}, #0f172a)` : undefined;
    return (
      <div
        className={`${isX ? 'stone-black' : 'stone-white'} ${simClass} ${
          !isSimulated && isWinning ? `animate-winning-cell ${orca ? 'ring-2' : 'ring-4'} ring-warning` : ''
        }`}
        style={stoneBg ? { background: stoneBg } : undefined}
      >
        {orca && isTriangle && (
          <svg viewBox="0 0 24 24" className="h-[56%] w-[56%] stroke-white/90" fill="none" strokeWidth="2.2" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 5 19 18H5Z" />
          </svg>
        )}
      </div>
    );
  }

  const color = customColor || pieceColor({ xColor, oColor }, piece);
  if (orca) {
    return (
      <svg
        viewBox="0 0 24 24"
        className={`h-[62%] w-[62%] shrink-0 transition-transform ${simClass} ${winClass}`}
        fill="none"
        stroke={color}
        strokeWidth="2.05"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {isTriangle ? (
          <path d="M12 4.8 19.3 18.4H4.7Z" />
        ) : isX ? (
          <>
            <line x1="5.8" y1="5.8" x2="18.2" y2="18.2" />
            <line x1="18.2" y1="5.8" x2="5.8" y2="18.2" />
          </>
        ) : (
          <circle cx="12" cy="12" r="7" />
        )}
      </svg>
    );
  }
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
  isForced: boolean;
  /** The bot's suggested move; drawn like a forced move but restricts nothing. */
  isBotHint: boolean;
  isHovered: boolean;
  /** Sits on a promoted grid line, every fifth column or row. */
  isMajorRight: boolean;
  isMajorBottom: boolean;
  /** Row/column numbers, drawn only in empty cells so pieces stay legible. */
  showCoords: boolean;
  /** Orca board: a star point, drawn only while the cell is empty. */
  isStar: boolean;
  /** Orca code grid (PR 5): its pieces, last-move brackets, win and hint looks. */
  orca?: boolean;
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
  isForced,
  isBotHint,
  isHovered,
  isMajorRight,
  isMajorBottom,
  showCoords,
  isStar,
  orca = false,
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
  const t = useT();
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
  // A cell keeps focus after a mouse click, so a later stray Space/Enter would
  // place a stone there. Keyboard activation (a click with detail 0) is only
  // honoured when the cell was reached with the keyboard. :focus-visible is
  // read on focus, because a key press can turn it on for a mouse-focused cell.
  const coord = `${columnLabel(col)}${row + 1}`;
  const cellLabel = cell ? t('game.coordinate', { coord, cell }) : t('game.coordinateEmpty', { coord });
  const keyboardFocusRef = useRef(false);
  const keyboardFocusProps = {
    onFocus: (event: React.FocusEvent<HTMLButtonElement>) => {
      keyboardFocusRef.current = event.currentTarget.matches(':focus-visible');
    },
    onBlur: () => {
      keyboardFocusRef.current = false;
    },
    onPointerDown: () => {
      keyboardFocusRef.current = false;
    },
  };
  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (event.detail === 0) {
      // LMAO needs a pointer position to pick one of the eight slots.
      if (lmaoMode || !keyboardFocusRef.current) return;
      onSelect(row, col, 'center');
      return;
    }
    const corner = clickCorner(event);
    // LMAO has eight peripheral slots; the centre is deliberately blank.
    if (lmaoMode && corner === 'center') return;
    onSelect(row, col, corner);
  };

  if (sheet) {
    // A corner slot is a little over half the cell, so its text shrinks with it.
    const fontSize = Math.max(8, Math.round(cellSize * (lmaoMode ? 0.4 : 0.5)));
    return (
      <button
        type="button"
        onClick={handleClick}
        {...keyboardFocusProps}
        onContextMenu={(event) => onContextMenu(event, row, col)}
        onMouseEnter={(event) => onHover(row, col, clickCorner(event))}
        onMouseMove={(event) => onHover(row, col, clickCorner(event))}
        aria-label={cellLabel}
        // The move that just landed wears a collaborator's cursor in the colour
        // of whoever played it, the way Sheets shows another editor's cell, so
        // it reads as a colleague typing rather than a game marking a move.
        style={{
          width: `${cellSize}px`,
          height: `${cellSize}px`,
          boxShadow: isLast && cell ? `inset 0 0 0 2px ${pieceColor({ xColor, oColor }, cell)}` : undefined,
        }}
        data-forced-move={isForced || undefined}
        title={isForced ? t('game.forcedMove') : undefined}
        className={`board-cell ${isForced || isBotHint ? 'board-cell--forced' : ''} relative flex shrink-0 items-center justify-center ${
          cell ? 'board-cell--filled' : ''
        } ${isLast ? 'board-cell--sheet-last' : ''} ${isWinning ? 'board-cell--sheet-win' : ''}`}
      >
        {cell ? (
          <span className={placementClass}>
            <SheetGlyph piece={cell} color={pieceColor({ xColor, oColor }, cell)} fontSize={fontSize} />
          </span>
        ) : simulatedPiece ? (
          <>
            <SheetGlyph
              piece={simulatedPiece}
              color={simulatedColor || pieceColor({ xColor, oColor }, simulatedPiece)}
              fontSize={fontSize}
              opacity={0.6}
            />
            {simulatedLabel}
          </>
        ) : isHovered && !boardDisabled ? (
          <div className={`opacity-35 ${placementClass}`}>
            <SheetGlyph piece={currentTurn} color={pieceColor({ xColor, oColor }, currentTurn)} fontSize={fontSize} />
          </div>
        ) : null}
      </button>
    );
  }

  if (orca) {
    // PR 5's code grid cell: a faint tint and corner brackets for the last
    // move, a flat ring for the winning line, a dashed target for the bot hint.
    const glyph = (piece: Exclude<CellValue, null>, extra: Partial<PieceGlyphProps> = {}) => (
      <PieceGlyph piece={piece} pieceTheme={pieceTheme} xColor={xColor} oColor={oColor} orca {...extra} />
    );
    return (
      <button
        type="button"
        onClick={handleClick}
        {...keyboardFocusProps}
        onContextMenu={(event) => onContextMenu(event, row, col)}
        onMouseEnter={(event) => onHover(row, col, clickCorner(event))}
        onMouseMove={(event) => onHover(row, col, clickCorner(event))}
        aria-label={cellLabel}
        style={{ width: `${cellSize}px`, height: `${cellSize}px` }}
        data-forced-move={isForced || undefined}
        data-bot-hint={isBotHint || undefined}
        title={isForced ? t('game.forcedMove') : isBotHint ? t('game.botHint') : undefined}
        className={`board-cell ${isForced ? 'board-cell--forced' : ''} relative flex shrink-0 aspect-square items-center justify-center ${
          cell ? 'board-cell--filled' : ''
        } ${isMajorRight ? 'board-cell--gx' : ''} ${isMajorBottom ? 'board-cell--gy' : ''} ${
          isLast && !isWinning ? 'z-10 bg-ink/[0.045]' : ''
        } ${isWinning ? 'z-20 bg-surface-3/80 ring-[1.5px] ring-inset ring-line-strong' : ''}`}
      >
        {isLast && !isWinning && (
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className="pointer-events-none absolute inset-[1.5px] z-[11] h-[calc(100%-3px)] w-[calc(100%-3px)]"
            fill="none"
            stroke="var(--ui-text-subtle)"
            strokeWidth="1.75"
            strokeLinecap="square"
          >
            <path d="M2 7V2h5M17 2h5v5M22 17v5h-5M7 22H2v-5" />
          </svg>
        )}
        {isBotHint && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-[2px] z-[23] flex items-center justify-center rounded-[3px] border-[1.5px] border-dashed border-success bg-success-soft animate-pulse"
          >
            {!cell && !simulatedPiece && !isHovered && <span className="h-1.5 w-1.5 rotate-45 rounded-[1px] bg-success" />}
          </span>
        )}
        {cell ? (
          isLast ? (
            <span className={`animate-piece-drop ${placementClass}`}>{glyph(cell, { isWinning })}</span>
          ) : (
            <span className={placementClass}>{glyph(cell, { isWinning })}</span>
          )
        ) : simulatedPiece ? (
          <>
            {glyph(simulatedPiece, { isSimulated: true, customColor: simulatedColor })}
            {simulatedLabel}
          </>
        ) : isHovered && !boardDisabled ? (
          <div className={`opacity-35 ${placementClass}`}>{glyph(currentTurn, { isSimulated: true })}</div>
        ) : isStar ? (
          <span aria-hidden="true" className="orca-star" />
        ) : showCoords ? (
          <span className="pointer-events-none select-none font-mono text-[9px] tabular-nums leading-none text-subtle opacity-75">
            {columnLabel(col)}{row + 1}
          </span>
        ) : null}
      </button>
    );
  }

  return (
  <button
    type="button"
    onClick={handleClick}
    {...keyboardFocusProps}
    onContextMenu={(event) => onContextMenu(event, row, col)}
    onMouseEnter={(event) => onHover(row, col, clickCorner(event))}
    onMouseMove={(event) => onHover(row, col, clickCorner(event))}
    aria-label={cellLabel}
    style={{ width: `${cellSize}px`, height: `${cellSize}px` }}
    data-forced-move={isForced || undefined}
    title={isForced ? t('game.forcedMove') : undefined}
    className={`board-cell ${isForced || isBotHint ? 'board-cell--forced' : ''} relative flex shrink-0 aspect-square items-center justify-center transition-all duration-100 ${
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
    ) : isStar ? (
      <span aria-hidden="true" className="orca-star" />
    ) : showCoords ? (
      <span className="pointer-events-none select-none font-mono text-[9px] leading-none text-subtle opacity-70">
        {columnLabel(col)}{row + 1}
      </span>
    ) : null}
  </button>
  );
});

BoardCell.displayName = 'BoardCell';
