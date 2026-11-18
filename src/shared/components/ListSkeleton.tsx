import React from 'react';
import { useIsOrca } from '../../features/theme/uiStyle';

interface ListSkeletonProps {
  /** How many placeholder rows to draw. */
  rows?: number;
  /** Draws a round leading block instead of a square one, for avatar lists. */
  round?: boolean;
}

/**
 * Placeholder for a list that is still loading.
 *
 * It mirrors the shape of the real row (leading block, two lines of text, a
 * trailing figure) so the panel does not resize when the data lands. A generic
 * spinner would tell the player nothing about what is coming.
 */
export const ListSkeleton: React.FC<ListSkeletonProps> = (props) =>
  useIsOrca() ? <ListSkeletonOrca {...props} /> : <ListSkeletonDefault {...props} />;

/**
 * Orca (PR 5): the rows of a 1px hairline list, the shape of the Orca
 * leaderboard and history tables, so nothing jumps when the data lands.
 */
const ListSkeletonOrca: React.FC<ListSkeletonProps> = ({ rows = 4, round = false }) => (
  <div className="divide-y divide-line overflow-hidden rounded-md border border-line bg-surface" aria-hidden="true">
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className={`skeleton h-8 w-8 shrink-0 ${round ? 'rounded-full' : 'rounded-sm'}`} />
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="skeleton h-3 w-2/5 rounded-xs" />
            <div className="skeleton h-2.5 w-1/4 rounded-xs" />
          </div>
        </div>
        <div className="skeleton h-3.5 w-14 shrink-0 rounded-xs" />
      </div>
    ))}
  </div>
);

const ListSkeletonDefault: React.FC<ListSkeletonProps> = ({ rows = 4, round = false }) => (
  <div className="space-y-2" aria-hidden="true">
    {Array.from({ length: rows }).map((_, i) => (
      <div
        key={i}
        className="flex items-center justify-between gap-3 rounded-md border border-line bg-surface-2 p-3"
      >
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className={`skeleton h-8 w-8 shrink-0 ${round ? 'rounded-full' : ''}`} />
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="skeleton h-3 w-1/2" />
            <div className="skeleton h-2.5 w-1/3" />
          </div>
        </div>
        <div className="skeleton h-4 w-12 shrink-0" />
      </div>
    ))}
  </div>
);
