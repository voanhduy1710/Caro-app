/**
 * Line shapes under the freestyle rule used by checkWin: five or more in a row
 * wins. A shape is what one line holds for a player once they put a stone on a
 * cell, judged from the 4 cells either side of it (every five through the cell
 * fits in that window).
 */
export const Shape = {
  NONE: 0,
  TWO: 1,
  OPEN2: 2,
  THREE: 3,
  OPEN3: 4,
  FOUR: 5,
  OPEN4: 6,
  FIVE: 7,
} as const;
export type Shape = (typeof Shape)[keyof typeof Shape];

/** Cells inspected on each side of the move. */
export const SPAN = 4;
const LINE = SPAN * 2 + 1;

/** Per-cell digits of a SHAPE_TABLE code. */
export const FREE = 0;
export const OWN = 1;
export const BLOCK = 2;

export const WIN_VALUE = 10_000_000;
/** Open four, double four or four-three: wins next move unless the opponent has a five. */
export const FORCED_WIN_VALUE = 1_000_000;
export const DOUBLE_THREE_VALUE = 100_000;

const SHAPE_VALUE: readonly number[] = [0, 10, 60, 50, 500, 600, 0, 0];

const hasFive = (line: number[]): boolean => {
  let run = 0;
  for (const cell of line) {
    run = cell === OWN ? run + 1 : 0;
    if (run >= 5) return true;
  }
  return false;
};

/**
 * A four needs one more stone for five (open when two different cells do), a
 * three needs one more stone for a four, a two one more stone for a three.
 */
const classify = (line: number[], memo: Map<string, Shape>): Shape => {
  const key = line.join('');
  const known = memo.get(key);
  if (known !== undefined) return known;

  let shape: Shape = Shape.NONE;
  if (hasFive(line)) {
    shape = Shape.FIVE;
  } else {
    let fives = 0;
    let best: Shape = Shape.NONE;
    for (let k = 0; k < LINE; k++) {
      if (line[k] !== FREE) continue;
      line[k] = OWN;
      if (hasFive(line)) fives++;
      else best = Math.max(best, classify(line, memo)) as Shape;
      line[k] = FREE;
    }
    if (fives >= 2) shape = Shape.OPEN4;
    else if (fives === 1) shape = Shape.FOUR;
    else if (best === Shape.OPEN4) shape = Shape.OPEN3;
    else if (best === Shape.FOUR) shape = Shape.THREE;
    else if (best === Shape.OPEN3) shape = Shape.OPEN2;
    else if (best === Shape.THREE) shape = Shape.TWO;
  }
  memo.set(key, shape);
  return shape;
};

/**
 * Shape for every arrangement of the 8 neighbour cells, encoded base 3 with the
 * cell 4 steps back as the least significant digit. Built once at load (~6.5k
 * entries, a few ms).
 */
export const SHAPE_TABLE: Uint8Array = (() => {
  const table = new Uint8Array(3 ** (LINE - 1));
  const memo = new Map<string, Shape>();
  const line = new Array<number>(LINE);
  for (let code = 0; code < table.length; code++) {
    let rest = code;
    for (let k = 0; k < LINE; k++) {
      if (k === SPAN) {
        line[k] = OWN;
        continue;
      }
      line[k] = rest % 3;
      rest = Math.floor(rest / 3);
    }
    table[code] = classify(line, memo);
  }
  return table;
})();

/** What a stone is worth given its shapes in the 4 directions, `shapes[at..at+3]`. */
export const cellValue = (shapes: ArrayLike<number>, at: number): number => {
  let fours = 0;
  let threes = 0;
  let openFour = false;
  let sum = 0;
  for (let d = 0; d < 4; d++) {
    const shape = shapes[at + d];
    if (shape === Shape.FIVE) return WIN_VALUE;
    if (shape === Shape.OPEN4) openFour = true;
    else if (shape === Shape.FOUR) fours++;
    else if (shape === Shape.OPEN3) threes++;
    sum += SHAPE_VALUE[shape];
  }
  if (openFour || fours >= 2 || (fours >= 1 && threes >= 1)) return FORCED_WIN_VALUE + sum;
  if (threes >= 2) return DOUBLE_THREE_VALUE + sum;
  return sum;
};
