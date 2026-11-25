/**
 * Star points ("row:col") for the board sizes the game offers, so an empty
 * editor grid still has landmarks to count from.
 */
export function orcaStarPoints(size: number): Set<string> {
  const axis =
    size === 15
      ? [3, 7, 11]
      : size === 19
        ? [3, 9, 15]
        : size === 30
          ? [4, 11, 18, 25]
          : size === 50
            ? [4, 13, 22, 27, 36, 45]
            : size >= 9
              ? size % 2 === 1
                ? [3, (size - 1) / 2, size - 4]
                : [3, size - 4]
              : [];
  const points = new Set<string>();
  for (const row of axis) {
    for (const col of axis) {
      // 15x15 keeps the traditional five: the corners and the centre.
      if (size === 15 && (row === 7) !== (col === 7)) continue;
      points.add(`${row}:${col}`);
    }
  }
  return points;
}
