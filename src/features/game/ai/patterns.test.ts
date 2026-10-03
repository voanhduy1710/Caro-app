import { describe, expect, it } from 'vitest';
import {
  BLOCK, DOUBLE_THREE_VALUE, FORCED_WIN_VALUE, FREE, OWN, SHAPE_TABLE, Shape, WIN_VALUE, cellValue,
} from './patterns';

/** '.' free, 'x' own, '#' blocked; 9 characters with the move at index 4. */
const shapeOf = (line: string): number => {
  expect(line).toHaveLength(9);
  expect(line[4]).toBe('x');
  let code = 0;
  let weight = 1;
  for (let k = 0; k < 9; k++) {
    if (k === 4) continue;
    const v = line[k] === 'x' ? OWN : line[k] === '#' ? BLOCK : FREE;
    code += v * weight;
    weight *= 3;
  }
  return SHAPE_TABLE[code];
};

describe('SHAPE_TABLE', () => {
  it.each([
    ['xxxxx....', Shape.FIVE],
    ['..xxxxx..', Shape.FIVE],
    ['...xxxx..', Shape.OPEN4],
    ['..#xxxx..', Shape.FOUR],
    ['..xxx.x..', Shape.FOUR],
    ['...xxx...', Shape.OPEN3],
    ['#..xxx..#', Shape.OPEN3],
    ['..#xxx...', Shape.THREE],
    ['#.xxx.#..', Shape.THREE],
    ['...xx....', Shape.OPEN2],
    ['....x....', Shape.NONE],
    ['###.x.###', Shape.NONE],
  ])('classifies %s', (line, shape) => {
    expect(shapeOf(line)).toBe(shape);
  });
});

describe('cellValue', () => {
  const at = (...s: number[]) => cellValue(Uint8Array.from(s), 0);

  it('makes a five the top value', () => {
    expect(at(Shape.FIVE, 0, 0, 0)).toBe(WIN_VALUE);
  });

  it('treats open four, double four and four-three as forced wins', () => {
    expect(at(Shape.OPEN4, 0, 0, 0)).toBeGreaterThanOrEqual(FORCED_WIN_VALUE);
    expect(at(Shape.FOUR, Shape.FOUR, 0, 0)).toBeGreaterThanOrEqual(FORCED_WIN_VALUE);
    expect(at(Shape.FOUR, Shape.OPEN3, 0, 0)).toBeGreaterThanOrEqual(FORCED_WIN_VALUE);
    expect(at(Shape.FOUR, Shape.OPEN3, 0, 0)).toBeLessThan(WIN_VALUE);
  });

  it('ranks double three below forced wins and above single shapes', () => {
    const doubleThree = at(Shape.OPEN3, Shape.OPEN3, 0, 0);
    expect(doubleThree).toBeGreaterThanOrEqual(DOUBLE_THREE_VALUE);
    expect(doubleThree).toBeLessThan(FORCED_WIN_VALUE);
    expect(at(Shape.FOUR, 0, 0, 0)).toBeLessThan(DOUBLE_THREE_VALUE);
  });

  it('orders single shapes', () => {
    expect(at(Shape.FOUR, 0, 0, 0)).toBeGreaterThan(at(Shape.OPEN3, 0, 0, 0));
    expect(at(Shape.OPEN3, 0, 0, 0)).toBeGreaterThan(at(Shape.OPEN2, 0, 0, 0));
    expect(at(Shape.OPEN2, 0, 0, 0)).toBeGreaterThan(at(Shape.TWO, 0, 0, 0));
    expect(at(0, 0, 0, 0)).toBe(0);
  });
});
