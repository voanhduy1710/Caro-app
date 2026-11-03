import type { BoardPings, Seat } from '../room/protocol';
import { columnLabel } from '../../shared/utils/gomokuLogic';

/** Positioned inside the grid so markers follow every theme's zoom and scrolling. */
export function BoardPingOverlay({ pings, cellSize, colors }: { pings?: BoardPings; cellSize: number; colors: Record<Seat, string> }) {
  return (
    <div className="board-pings pointer-events-none absolute inset-0 z-[21]" aria-live="polite">
      {Object.entries(pings ?? {}).map(([seat, { row, col }]) => (
        <div
          key={`${seat}:${row}:${col}`}
          className="board-ping"
          role="img"
          aria-label={`${seat} ping: ${columnLabel(col)}${row + 1}`}
          data-ping-seat={seat}
          data-ping-row={row}
          data-ping-col={col}
          style={{ gridColumn: col + 1, gridRow: row + 1, width: cellSize, height: cellSize, color: colors[seat as Seat] }}
        >
          <span className="board-ping-wave" aria-hidden="true" />
          <span className="board-ping-wave board-ping-wave--delayed" aria-hidden="true" />
          <span className="board-ping-sign" aria-hidden="true">!</span>
          <span className="board-ping-owner" aria-hidden="true" style={{ left: seat === 'X' ? '0%' : seat === 'O' ? '40%' : '80%', backgroundColor: colors[seat as Seat] }}>{seat}</span>
        </div>
      ))}
    </div>
  );
}
