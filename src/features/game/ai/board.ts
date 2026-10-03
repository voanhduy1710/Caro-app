import type { BoardMatrix } from '../../../shared/utils/gomokuLogic';
import { BLOCK, FREE, OWN, SHAPE_TABLE, SPAN, Shape, cellValue } from './patterns';

export type Stone = 1 | 2;
export const EMPTY = 0;
/** A cell nobody can use, such as the third player's stone in 3-player practice. */
export const WALL = 3;
export const opponentOf = (p: Stone): Stone => (p === 1 ? 2 : 1);

const DIRS: ReadonlyArray<readonly [number, number]> = [[0, 1], [1, 0], [1, 1], [1, -1]];
/** Empty cells this close to a stone are worth searching. */
const NEAR = 2;

/** Deterministic mulberry32 stream, so hashes and test runs repeat exactly. */
const randomInts = (count: number, seed: number): Int32Array => {
  const out = new Int32Array(count);
  let state = seed >>> 0;
  for (let k = 0; k < count; k++) {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    out[k] = t ^ (t >>> 14);
  }
  return out;
};

/**
 * Search board: flat cells plus, for every empty cell and both players, the
 * line shapes and value a stone there would have. place() and undo() refresh
 * only the 4 lines through the changed cell, so move ordering and evaluation
 * are table lookups.
 */
export class EngineBoard {
  readonly size: number;
  readonly area: number;
  readonly cells: Int8Array;
  /** Stones (not walls) within NEAR cells. */
  readonly near: Uint16Array;
  /** shapes[((p - 1) * area + i) * 4 + d] */
  readonly shapes: Uint8Array;
  /** values[(p - 1) * area + i]: worth of a stone of p on empty cell i, 0 if occupied. */
  readonly values: Int32Array;
  /** Sum of values per player; index 0 unused. */
  readonly totals = [0, 0, 0];
  readonly moves: number[] = [];
  hash = 0;
  private readonly zobrist: Int32Array;

  constructor(size: number) {
    this.size = size;
    this.area = size * size;
    this.cells = new Int8Array(this.area);
    this.near = new Uint16Array(this.area);
    this.shapes = new Uint8Array(this.area * 8);
    this.values = new Int32Array(this.area * 2);
    this.zobrist = randomInts(this.area * 2, 0x9e3779b9);
    for (let i = 0; i < this.area; i++) {
      for (let d = 0; d < 4; d++) this.refresh(i, d);
    }
  }

  value(p: Stone, i: number): number {
    return this.values[(p - 1) * this.area + i];
  }

  shape(p: Stone, i: number, d: number): Shape {
    return this.shapes[((p - 1) * this.area + i) * 4 + d] as Shape;
  }

  /** True when a stone of p on i makes a four (or better) in some direction. */
  makesFour(p: Stone, i: number): boolean {
    const at = ((p - 1) * this.area + i) * 4;
    for (let d = 0; d < 4; d++) {
      if (this.shapes[at + d] >= Shape.FOUR) return true;
    }
    return false;
  }

  /** Empty cells where a stone of p is worth at least `min`. */
  cellsWith(p: Stone, min: number): number[] {
    const out: number[] = [];
    const base = (p - 1) * this.area;
    for (let i = 0; i < this.area; i++) {
      if (this.values[base + i] >= min) out.push(i);
    }
    return out;
  }

  /** Empty cells near a stone; the centre (or any empty cell) when there is no stone. */
  candidates(): number[] {
    const out: number[] = [];
    for (let i = 0; i < this.area; i++) {
      if (this.cells[i] === EMPTY && this.near[i] > 0) out.push(i);
    }
    if (out.length > 0) return out;
    const mid = Math.floor(this.size / 2);
    const centre = mid * this.size + mid;
    if (this.cells[centre] === EMPTY) return [centre];
    const firstEmpty = this.cells.indexOf(EMPTY);
    return firstEmpty >= 0 ? [firstEmpty] : [];
  }

  place(i: number, p: Stone): void {
    this.cells[i] = p;
    this.hash ^= this.zobrist[(p - 1) * this.area + i];
    this.moves.push(i);
    this.addNear(i, 1);
    this.refreshLines(i);
  }

  undo(): void {
    const i = this.moves.pop();
    if (i === undefined) return;
    const p = this.cells[i] as Stone;
    this.cells[i] = EMPTY;
    this.hash ^= this.zobrist[(p - 1) * this.area + i];
    this.addNear(i, -1);
    this.refreshLines(i);
  }

  /** Blocks a cell for both players; walls are fixed for the whole search. */
  setWall(i: number): void {
    this.cells[i] = WALL;
    this.refreshLines(i);
  }

  private addNear(i: number, delta: number): void {
    const r0 = Math.floor(i / this.size);
    const c0 = i % this.size;
    const rEnd = Math.min(this.size - 1, r0 + NEAR);
    const cEnd = Math.min(this.size - 1, c0 + NEAR);
    for (let r = Math.max(0, r0 - NEAR); r <= rEnd; r++) {
      for (let c = Math.max(0, c0 - NEAR); c <= cEnd; c++) this.near[r * this.size + c] += delta;
    }
  }

  /** A stone only changes shapes on the 4 lines through it, within SPAN cells. */
  private refreshLines(i: number): void {
    const r0 = Math.floor(i / this.size);
    const c0 = i % this.size;
    for (let d = 0; d < 4; d++) {
      const [dr, dc] = DIRS[d];
      for (let k = -SPAN; k <= SPAN; k++) {
        const r = r0 + dr * k;
        const c = c0 + dc * k;
        if (r >= 0 && r < this.size && c >= 0 && c < this.size) this.refresh(r * this.size + c, d);
      }
    }
  }

  private refresh(i: number, d: number): void {
    const empty = this.cells[i] === EMPTY;
    for (let p = 1; p <= 2; p++) {
      const slot = (p - 1) * this.area + i;
      this.shapes[slot * 4 + d] = empty ? this.lineShape(i, d, p as Stone) : Shape.NONE;
      const v = empty ? cellValue(this.shapes, slot * 4) : 0;
      this.totals[p] += v - this.values[slot];
      this.values[slot] = v;
    }
  }

  private lineShape(i: number, d: number, p: Stone): Shape {
    const [dr, dc] = DIRS[d];
    const r0 = Math.floor(i / this.size);
    const c0 = i % this.size;
    let code = 0;
    let weight = 1;
    for (let k = -SPAN; k <= SPAN; k++) {
      if (k === 0) continue;
      const r = r0 + dr * k;
      const c = c0 + dc * k;
      let digit = BLOCK;
      if (r >= 0 && r < this.size && c >= 0 && c < this.size) {
        const cell = this.cells[r * this.size + c];
        digit = cell === EMPTY ? FREE : cell === p ? OWN : BLOCK;
      }
      code += digit * weight;
      weight *= 3;
    }
    return SHAPE_TABLE[code] as Shape;
  }
}

/** Engine view of a game board: `me` is stone 1, the other of X/O stone 2, T a wall. */
export const engineBoardFrom = (matrix: BoardMatrix, size: number, me: 'X' | 'O'): EngineBoard => {
  const board = new EngineBoard(size);
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const cell = matrix[r][c];
      if (cell === null) continue;
      const i = r * size + c;
      if (cell === 'T') board.setWall(i);
      else board.place(i, cell === me ? 1 : 2);
    }
  }
  return board;
};
