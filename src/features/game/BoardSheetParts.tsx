import React, { memo } from 'react';
import type { CellValue } from '../../shared/utils/gomokuLogic';

/* The Spreadsheet theme's fixed geometry. Real Sheets keeps its row-number
   column and column-letter row at these sizes whatever the zoom, and the
   scroll maths in Board has to know them because both stay pinned over the grid. */
export const SHEET_ROW_HEADER_W = 46;
export const SHEET_COL_HEADER_H = 24;
export const SHEET_TRIANGLE_COLOR = '#7c3aed';
const SHEET_CELL_FONT = 'Arial, Helvetica, sans-serif';

/* A generic green page with a white grid for the browser tab. Deliberately
   not anyone's logo: it only has to read as "a spreadsheet" at 16px. */
export const SHEET_FAVICON = `data:image/svg+xml,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'>" +
    "<path d='M5 1h10l6 6v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2z' fill='#0F9D58'/>" +
    "<path d='M15 1v6h6z' fill='#87ceac'/>" +
    "<rect x='6.5' y='10.5' width='11' height='8' rx='0.5' fill='#fff'/>" +
    "<path d='M6.5 13.2h11M6.5 15.8h11M10.5 10.5v8' stroke='#0F9D58' stroke-width='1.1'/>" +
    '</svg>',
)}`;

interface SheetGlyphProps {
  piece: Exclude<CellValue, null>;
  color: string;
  fontSize: number;
  opacity?: number;
}

/**
 * A piece as the Spreadsheet theme draws it: plain cell text, the way a value
 * typed into a real sheet looks. It ignores the chosen piece style on purpose,
 * because a glowing laser X or a 3D stone would give the disguise away.
 */
export const SheetGlyph: React.FC<SheetGlyphProps> = ({ piece, color, fontSize, opacity }) => (
  <span
    className="pointer-events-none select-none leading-none"
    style={{ color, fontSize, fontFamily: SHEET_CELL_FONT, fontWeight: 400, opacity }}
  >
    {piece === 'T' ? '△' : piece}
  </span>
);

interface SheetHeaderProps {
  labels: string[];
  cellSize: number;
  /** Index of the header that belongs to the active cell, or -1. */
  active: number;
}

/**
 * The column-letter strip. Memoised on its label array (rebuilt only when the
 * column count changes) and the highlighted index, so hovering across the
 * board re-renders a strip only when the pointer changes column.
 */
export const SheetColumnHeader = memo<SheetHeaderProps>(({ labels, cellSize, active }) => (
  <div
    aria-hidden="true"
    className="sheet-col-header"
    style={{ gridRow: '1 / 3', gridColumn: 2, alignSelf: 'start', height: SHEET_COL_HEADER_H }}
  >
    {labels.map((label, index) => (
      <div
        key={label}
        className={`sheet-header-cell ${index === active ? 'sheet-header-cell--active' : ''}`}
        style={{ width: cellSize }}
      >
        {label}
      </div>
    ))}
  </div>
));

SheetColumnHeader.displayName = 'SheetColumnHeader';

/** The row-number strip; same memoisation story as the column strip. */
export const SheetRowHeader = memo<SheetHeaderProps>(({ labels, cellSize, active }) => (
  <div
    aria-hidden="true"
    className="sheet-row-header"
    style={{ gridRow: 2, gridColumn: '1 / 3', justifySelf: 'start', width: SHEET_ROW_HEADER_W }}
  >
    {labels.map((label, index) => (
      <div
        key={label}
        className={`sheet-header-cell ${index === active ? 'sheet-header-cell--active' : ''}`}
        style={{ height: cellSize }}
      >
        {label}
      </div>
    ))}
  </div>
));

SheetRowHeader.displayName = 'SheetRowHeader';
