import { memo } from 'react';

/* The Orca board's gutter geometry. Like the Spreadsheet headers, both strips
   stay pinned over the grid, so the scroll maths in Board has to know them. */
export const ORCA_GUTTER_W = 28;
export const ORCA_GUTTER_H = 20;

interface OrcaGutterProps {
  labels: string[];
  cellSize: number;
  /** Index of the label that belongs to the active cell, or -1. */
  active: number;
}

/** Column letters. Memoised like the sheet headers: re-renders only on a column change. */
export const OrcaColumnGutter = memo<OrcaGutterProps>(({ labels, cellSize, active }) => (
  <div
    aria-hidden="true"
    className="orca-gutter orca-gutter--cols"
    style={{ gridRow: '1 / 3', gridColumn: 2, alignSelf: 'start', height: ORCA_GUTTER_H }}
  >
    {labels.map((label, index) => (
      <div
        key={label}
        className={`orca-gutter__cell ${index === active ? 'orca-gutter__cell--active' : ''}`}
        style={{ width: cellSize }}
      >
        {label}
      </div>
    ))}
  </div>
));

OrcaColumnGutter.displayName = 'OrcaColumnGutter';

/** Row numbers, right-aligned like an editor's line numbers. */
export const OrcaRowGutter = memo<OrcaGutterProps>(({ labels, cellSize, active }) => (
  <div
    aria-hidden="true"
    className="orca-gutter orca-gutter--rows"
    style={{ gridRow: 2, gridColumn: '1 / 3', justifySelf: 'start', width: ORCA_GUTTER_W }}
  >
    {labels.map((label, index) => (
      <div
        key={label}
        className={`orca-gutter__cell ${index === active ? 'orca-gutter__cell--active' : ''}`}
        style={{ height: cellSize }}
      >
        {label}
      </div>
    ))}
  </div>
));

OrcaRowGutter.displayName = 'OrcaRowGutter';
