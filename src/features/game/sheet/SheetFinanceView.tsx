import React, { useEffect, useRef, useState } from 'react';
import { columnLabel } from '../../../shared/utils/gomokuLogic';
import { REPORTS, type ReportTable } from './financeData';
import { setReportCell } from './reportCell';
import { CELL_FONT } from './sheetStyle';

/**
 * The fake report behind the boss key. It fills its parent like a real sheet:
 * the report sits in the top-left corner and empty gridded cells carry on to
 * the right and below, with frozen column letters, row numbers and the
 * report's own title row. Clicking a cell selects it and feeds the formula
 * bar, so a glance at the top of the page shows a believable formula too.
 */

/**
 * The fewest empty columns after the report, and the total number of sheet
 * rows. A wide window gets more columns than the minimum (see ReportGrid).
 */
const MIN_FILLER_COLUMNS = 8;
const FILLER_WIDTH = 100;
const TOTAL_ROWS = 100;
const ROW_HEADER_WIDTH = 46;
const ROW_HEIGHT = 21;
const HEADER_HEIGHT = 24;

interface Selection {
  /** 0 is the report's title row, i.e. sheet row 1. */
  row: number;
  col: number;
}

const cellText = (table: ReportTable, row: number, col: number) => {
  if (row === 0) return table.headers[col] ?? '';
  return table.rows[row - 1]?.cells[col]?.raw ?? '';
};

const ReportGrid: React.FC<{ table: ReportTable }> = ({ table }) => {
  const [selected, setSelected] = useState<Selection>({ row: 0, col: 0 });
  const scrollRef = useRef<HTMLDivElement>(null);
  // Enough empty columns to run past the right edge of whatever width the
  // sheet has, so the gridlines never stop short and leave plain white beside
  // the report like a table pasted on a page. Sized off the scroller, which
  // the parent stretches; the table's own width never feeds back into it.
  const [fillerColumns, setFillerColumns] = useState(MIN_FILLER_COLUMNS);
  const reportWidth = ROW_HEADER_WIDTH + table.widths.reduce((sum, w) => sum + w, 0);
  useEffect(() => {
    const box = scrollRef.current;
    if (!box) return;
    const fit = () => {
      const needed = Math.ceil((box.clientWidth - reportWidth) / FILLER_WIDTH) + 1;
      const next = Math.max(MIN_FILLER_COLUMNS, needed);
      setFillerColumns((current) => (current === next ? current : next));
    };
    fit();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(fit);
    observer.observe(box);
    return () => observer.disconnect();
  }, [reportWidth]);
  const widths = [...table.widths, ...Array.from({ length: fillerColumns }, () => FILLER_WIDTH)];
  const columnCount = widths.length;
  const totalWidth = ROW_HEADER_WIDTH + widths.reduce((sum, w) => sum + w, 0);

  // The formula bar lives in SheetChrome; hand it the selected cell, and take
  // it back when the report goes away so the game view gets its own again.
  useEffect(() => {
    setReportCell({
      ref: `${columnLabel(selected.col)}${selected.row + 1}`,
      text: cellText(table, selected.row, selected.col),
    });
  }, [selected, table]);
  useEffect(() => () => setReportCell(null), []);

  const movedByKeyRef = useRef(false);
  const move = (rowStep: number, colStep: number) => {
    movedByKeyRef.current = true;
    setSelected((prev) => ({
      row: Math.min(TOTAL_ROWS - 1, Math.max(0, prev.row + rowStep)),
      col: Math.min(columnCount - 1, Math.max(0, prev.col + colStep)),
    }));
  };

  // Keep a keyboard-selected cell on screen. Scrolled by hand rather than
  // with scrollIntoView, which would also scroll the page around the sheet,
  // and offset past the frozen headers that would otherwise cover it.
  useEffect(() => {
    if (!movedByKeyRef.current) return;
    movedByKeyRef.current = false;
    const box = scrollRef.current;
    const cell = box?.querySelector<HTMLElement>('[data-report-selected="true"]');
    if (!box || !cell) return;
    const frozenTop = HEADER_HEIGHT + (selected.row > 0 ? ROW_HEIGHT : 0);
    if (cell.offsetTop - frozenTop < box.scrollTop) box.scrollTop = cell.offsetTop - frozenTop;
    else if (cell.offsetTop + cell.offsetHeight > box.scrollTop + box.clientHeight)
      box.scrollTop = cell.offsetTop + cell.offsetHeight - box.clientHeight;
    if (cell.offsetLeft - ROW_HEADER_WIDTH < box.scrollLeft) box.scrollLeft = cell.offsetLeft - ROW_HEADER_WIDTH;
    else if (cell.offsetLeft + cell.offsetWidth > box.scrollLeft + box.clientWidth)
      box.scrollLeft = cell.offsetLeft + cell.offsetWidth - box.clientWidth;
  }, [selected]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    const steps: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
      Enter: [1, 0],
    };
    const step = steps[event.key];
    if (!step || event.ctrlKey || event.metaKey || event.altKey) return;
    event.preventDefault();
    move(step[0], step[1]);
  };

  const headerCell =
    'h-6 border-r border-b border-[#c4c7c5] bg-[#f8f9fa] p-0 text-center text-[11px] font-medium text-[#5f6368] select-none';
  const headerActive = 'bg-[#d3e3fd]! font-bold! text-[#041e49]!';

  return (
    <div
      ref={scrollRef}
      tabIndex={0}
      role="region"
      aria-label={table.name}
      onKeyDown={onKeyDown}
      className="min-h-0 w-full flex-1 overflow-auto bg-white outline-none"
      style={{ fontFamily: CELL_FONT, cursor: 'cell' }}
    >
      <table className="border-separate border-spacing-0" style={{ tableLayout: 'fixed', width: totalWidth }}>
        <colgroup>
          <col style={{ width: ROW_HEADER_WIDTH }} />
          {widths.map((width, i) => (
            <col key={i} style={{ width }} />
          ))}
        </colgroup>
        <thead>
          <tr style={{ height: HEADER_HEIGHT }}>
            <th className="sticky top-0 left-0 z-30 border-r border-b border-[#c4c7c5] bg-[#f1f3f4] p-0" aria-hidden="true" />
            {widths.map((_, col) => (
              <th
                key={col}
                scope="col"
                className={`sticky top-0 z-20 ${headerCell} ${selected.col === col ? headerActive : ''}`}
              >
                {columnLabel(col)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: TOTAL_ROWS }, (_, row) => {
            const isTitleRow = row === 0;
            const data = row > 0 ? table.rows[row - 1] : undefined;
            return (
              <tr key={row} style={{ height: ROW_HEIGHT }}>
                <th
                  scope="row"
                  className={`sticky left-0 ${isTitleRow ? 'z-20' : 'z-10'} ${headerCell} ${selected.row === row ? headerActive : ''}`}
                  style={isTitleRow ? { top: HEADER_HEIGHT } : undefined}
                >
                  {row + 1}
                </th>
                {widths.map((_, col) => {
                  const isSelected = selected.row === row && selected.col === col;
                  let content = '';
                  let className = 'text-[#202124]';
                  let align: 'left' | 'right' | 'center' = 'left';
                  if (isTitleRow) {
                    content = table.headers[col] ?? '';
                    className = col < table.headers.length ? 'bg-[#edf2fa] font-semibold text-[#041e49]' : 'text-[#202124]';
                    align = 'center';
                  } else if (data && data.cells[col]) {
                    const cell = data.cells[col];
                    content = cell.display;
                    align = cell.align;
                    className = [
                      data.bold ? 'font-bold' : '',
                      cell.tone === 'pos' ? 'font-semibold text-[#0F9D58]' : cell.tone === 'neg' ? 'font-semibold text-[#d93025]' : 'text-[#202124]',
                    ].join(' ');
                  }
                  return (
                    <td
                      key={col}
                      data-report-selected={isSelected ? 'true' : undefined}
                      onMouseDown={() => setSelected({ row, col })}
                      className={`border-r border-b border-[#e1e3e1] px-1 py-0 text-[12px] leading-[20px] ${className} ${
                        isTitleRow ? 'sticky z-[15] border-b-[#c4c7c5]' : isSelected ? 'relative z-[5]' : 'relative'
                      } ${isTitleRow && col >= table.headers.length ? 'bg-white' : ''}`}
                      style={{ textAlign: align, ...(isTitleRow ? { top: HEADER_HEIGHT } : null) }}
                    >
                      {/* Clipped in an inner box, so the selection handle can
                          still poke out of the cell's corner like Sheets'. */}
                      <div className="overflow-hidden text-ellipsis whitespace-nowrap">{content}</div>
                      {isSelected && (
                        <span aria-hidden="true" className="pointer-events-none absolute -inset-px border-2 border-[#1a73e8]">
                          <span className="absolute -right-[4px] -bottom-[4px] h-[6px] w-[6px] border border-white bg-[#1a73e8]" />
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

/** One of the two fake reports, filling its parent with its own scroll. */
export const SheetFinanceView: React.FC<{ view: 'finance' | 'balance' }> = ({ view }) => (
  // Keyed by view so each report opens with its own selection back at A1.
  <ReportGrid key={view} table={REPORTS[view]} />
);
