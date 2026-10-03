# Strong Lightweight AI Bot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the depth-2 practice bot with one fixed-strength, strong gomoku engine that runs entirely in the browser (Web Worker, no server, no new dependencies) on a 15x15 practice board.

**Architecture:** A precomputed line-shape table (3^8 entries) classifies every 9-cell line in O(1). An incremental `EngineBoard` keeps, for every empty cell and both players, the shape and value a stone there would make, refreshing only the 4 lines through a changed cell. On top of that: a VCF (victory by continuous fours) threat solver, then iterative-deepening alpha-beta negamax with a transposition table, threat-restricted move generation and a wall-clock budget. The public `getBestAiMove` signature stays the same, so the worker and hook only gain an optional time budget.

**Tech Stack:** TypeScript (Vite, `erasableSyntaxOnly`, `verbatimModuleSyntax`), Vitest, Web Worker. No new packages.

**Spec:** This document. Requirements came from the user in conversation: no difficulty levels, one fixed strong level, light enough for a static Vercel frontend, 15x15 board for the bot.

## Global Constraints

- No new npm dependencies. No server, edge function or WASM.
- One difficulty only: no difficulty setting, no randomness. Same position gives the same move.
- Practice-vs-bot board is 15x15 (`AI_BOARD_SIZE = 15`). Online rooms keep their own board sizes (15/19/30/50) unchanged.
- Win rule must match `checkWin` in `src/shared/utils/gomokuLogic.ts`: five **or more** in a row wins (freestyle, overlines count, no blocked-ends rule).
- Think time per move: at most 900 ms, and at most a quarter of the turn timer when one is set.
- Engine must still work, within its time budget, on any board size it receives (15/19/30/50), even though practice uses 15.
- `T` cells (third player in 3-player practice) are walls for the engine: never played on, block lines for both players.
- Work on branch `feat/strong-ai-bot`, not `main`.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **3-player practice:** the O bot must never pick a cell holding a `T` stone, and must treat `T` stones as blockers. Test in Task 4 (`never plays on a T stone`).
2. **Short turn timers (10 s):** the bot must answer well inside the timer. Tests in Task 4 (`respects the time budget`) and Task 5 (`aiThinkMs`).
3. **Board edges:** a line touching the edge counts as blocked, not open. Test in Task 2 (`treats the board edge as a blocker`).
4. **Nearly full board:** the engine must return the remaining empty cell, never `-1` or an occupied cell. Test in Task 4 (`finds the last empty cell`).
5. **Already lost positions** (opponent has an open four): the engine must still return a legal blocking move instead of crashing or returning an occupied cell. Test in Task 4 (`still blocks when the position is lost`).

---

## Expected Result

What the player gets when this plan is done:

| | Before | After |
|---|---|---|
| Practice board | 30x30 (room default) | 15x15, fixed |
| Search | Fixed depth 2, top 15 moves, full rescoring each node | Iterative deepening, typically depth 6–10 in 0.9 s, plus forced-win (VCF) search up to 16 fours deep |
| Forced wins | Missed unless within 2 plies | Found and played (double fours, four chains) |
| Defence | Blocks obvious fours and threes | Also refutes the opponent's forced four chains before they start |
| Think time | Unbounded, grows with stones | Capped at 900 ms (or a quarter of the turn timer) |
| Size | ~320 lines | ~550 lines across 4 small files, no dependencies (roughly 5 KB gzipped) |
| Difficulty | One level | One level, much stronger |

Strength target, checked by the arena in Task 6: the new engine beats the old engine in at least 90% of 20 seeded games while thinking only 300 ms per move. Against people, expect a bot that punishes any unblocked open three and most four-three setups. It is not Rapfi/Stockfish level (no neural net, no opening book), but should beat nearly all casual and intermediate players.

Out of scope: VCT (forced wins through threes), opening book, pondering on the player's time, making the `T` bot in 3-player mode smart.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src/features/game/ai/patterns.ts` | Create | Shape enum, precomputed `SHAPE_TABLE`, `cellValue` scoring |
| `src/features/game/ai/board.ts` | Create | `EngineBoard` (flat cells, incremental shapes/values, Zobrist hash, candidates), `engineBoardFrom` |
| `src/features/game/ai/threats.ts` | Create | `findVcf` forced-win solver |
| `src/features/game/ai/search.ts` | Create | `searchBestMove`: root tactics, defence filter, iterative deepening negamax, TT |
| `src/features/game/ai/testBoards.ts` | Create | `boardWith` helper to build `BoardMatrix` positions in tests |
| `src/features/game/ai/arena/legacyEngine.ts` | Create | Copy of the old engine, used only by the arena benchmark |
| `src/features/game/aiEngine.ts` | Rewrite | Thin adapter: `getBestAiMove(board, size, aiPiece, options)` |
| `src/features/game/aiEngine.worker.ts` | Modify | Pass `timeLimitMs` through |
| `src/features/game/useAiEngine.ts` | Modify | `requestMove(..., timeLimitMs?)` |
| `src/app/AppViewShared.ts` | Modify | `AI_BOARD_SIZE`, `aiThinkMs` |
| `src/app/AppView.tsx` | Modify | Practice uses 15x15 and passes the think budget |
| Tests | Create | `ai/patterns.test.ts`, `ai/board.test.ts`, `ai/threats.test.ts`, `aiEngine.test.ts`, `ai/arena.test.ts`, `src/app/AppViewShared.test.ts` |

Test files are excluded from `tsc -b` by `tsconfig.app.json`. Non-test helpers (`testBoards.ts`, `legacyEngine.ts`) are type-checked; they are never imported by app code, so Vite drops them from the bundle.

---

### Task 0: Branch

- [ ] **Step 1: Create the branch**

```bash
git checkout -b feat/strong-ai-bot
```

---

### Task 1: Line-shape table and cell scoring

**Files:**
- Create: `src/features/game/ai/patterns.ts`
- Test: `src/features/game/ai/patterns.test.ts`

**Interfaces:**
- Produces: `Shape` (const object + type: `NONE 0, TWO 1, OPEN2 2, THREE 3, OPEN3 4, FOUR 5, OPEN4 6, FIVE 7`), `SPAN = 4`, `FREE = 0`, `OWN = 1`, `BLOCK = 2`, `SHAPE_TABLE: Uint8Array` (length 6561, indexed by base-3 code of the 8 neighbour cells, offset −4 = least significant digit, skipping offset 0), `WIN_VALUE = 10_000_000`, `FORCED_WIN_VALUE = 1_000_000`, `DOUBLE_THREE_VALUE = 100_000`, `cellValue(shapes: ArrayLike<number>, at: number): number` (reads `shapes[at..at+3]`).

- [ ] **Step 1: Write the failing test**

`src/features/game/ai/patterns.test.ts`:

```ts
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
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run src/features/game/ai/patterns.test.ts`
Expected: FAIL, cannot resolve `./patterns`.

- [ ] **Step 3: Implement**

`src/features/game/ai/patterns.ts`:

```ts
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
```

- [ ] **Step 4: Run tests, confirm pass**

Run: `npx vitest run src/features/game/ai/patterns.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/features/game/ai/patterns.ts src/features/game/ai/patterns.test.ts
git commit -m "feat(ai): add precomputed gomoku line-shape table"
```

---

### Task 2: Incremental engine board

**Files:**
- Create: `src/features/game/ai/board.ts`
- Create: `src/features/game/ai/testBoards.ts`
- Test: `src/features/game/ai/board.test.ts`

**Interfaces:**
- Consumes (Task 1): `SHAPE_TABLE`, `SPAN`, `FREE`, `OWN`, `BLOCK`, `Shape`, `cellValue`, `WIN_VALUE` (tests only).
- Produces:
  - `type Stone = 1 | 2`, `EMPTY = 0`, `WALL = 3`, `opponentOf(p: Stone): Stone`
  - `class EngineBoard` with `size`, `area`, `cells: Int8Array`, `near: Uint16Array`, `shapes: Uint8Array`, `values: Int32Array`, `totals: number[]` (index 1 and 2), `moves: number[]`, `hash: number`, and methods `value(p, i): number`, `shape(p, i, d): Shape`, `makesFour(p, i): boolean`, `cellsWith(p, min): number[]`, `candidates(): number[]`, `place(i, p): void`, `undo(): void`, `setWall(i): void`
  - `engineBoardFrom(matrix: BoardMatrix, size: number, me: 'X' | 'O'): EngineBoard` (me → 1, other X/O → 2, `T` → wall)
  - `boardWith(size: number, stones: Array<[number, number, 'X' | 'O' | 'T']>): BoardMatrix` (testBoards.ts)

- [ ] **Step 1: Write the test helper**

`src/features/game/ai/testBoards.ts`:

```ts
import type { BoardMatrix } from '../../../shared/utils/gomokuLogic';
import { createEmptyBoard } from '../../../shared/utils/gomokuLogic';

/** Builds a test position from [row, col, piece] triples. */
export const boardWith = (size: number, stones: Array<[number, number, 'X' | 'O' | 'T']>): BoardMatrix => {
  const board = createEmptyBoard(size);
  for (const [row, col, piece] of stones) board[row][col] = piece;
  return board;
};
```

- [ ] **Step 2: Write the failing test**

`src/features/game/ai/board.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { EngineBoard, engineBoardFrom, type Stone } from './board';
import { WIN_VALUE } from './patterns';
import { boardWith } from './testBoards';

const SIZE = 15;
const at = (r: number, c: number) => r * SIZE + c;

const rng = (seed: number) => () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed;
};

describe('EngineBoard', () => {
  it('offers only the centre on an empty board', () => {
    expect(new EngineBoard(SIZE).candidates()).toEqual([at(7, 7)]);
  });

  it('offers the 24 cells around a lone stone', () => {
    const board = new EngineBoard(SIZE);
    board.place(at(7, 7), 1);
    expect(board.candidates()).toHaveLength(24);
  });

  it('keeps incremental state equal to a fresh build after place and undo', () => {
    const next = rng(42);
    const board = new EngineBoard(SIZE);
    for (let n = 0; n < 60; n++) {
      const free = board.candidates();
      board.place(free[next() % free.length], (n % 2 === 0 ? 1 : 2) as Stone);
    }
    for (let n = 0; n < 25; n++) board.undo();

    const fresh = new EngineBoard(SIZE);
    board.moves.forEach((i, n) => fresh.place(i, (n % 2 === 0 ? 1 : 2) as Stone));

    expect(Array.from(board.cells)).toEqual(Array.from(fresh.cells));
    expect(Array.from(board.near)).toEqual(Array.from(fresh.near));
    expect(Array.from(board.shapes)).toEqual(Array.from(fresh.shapes));
    expect(Array.from(board.values)).toEqual(Array.from(fresh.values));
    expect(board.totals).toEqual(fresh.totals);
    expect(board.hash).toBe(fresh.hash);
  });

  it('returns to a zero hash when every move is undone', () => {
    const board = new EngineBoard(SIZE);
    board.place(at(7, 7), 1);
    board.place(at(7, 8), 2);
    board.undo();
    board.undo();
    expect(board.hash).toBe(0);
  });

  it('finds the five-completing cells of an open four', () => {
    const board = new EngineBoard(SIZE);
    for (const c of [4, 5, 6, 7]) board.place(at(7, c), 1);
    expect(board.cellsWith(1, WIN_VALUE).sort((a, b) => a - b)).toEqual([at(7, 3), at(7, 8)]);
    expect(board.cellsWith(2, WIN_VALUE)).toEqual([]);
  });

  it('treats the board edge as a blocker', () => {
    const board = new EngineBoard(SIZE);
    for (const c of [0, 1, 2, 3]) board.place(at(0, c), 1);
    expect(board.cellsWith(1, WIN_VALUE)).toEqual([at(0, 4)]);
  });

  it('treats walls as blockers for both players', () => {
    const board = engineBoardFrom(
      boardWith(SIZE, [[7, 3, 'O'], [7, 4, 'O'], [7, 5, 'O'], [7, 6, 'O'], [7, 7, 'T']]),
      SIZE,
      'O',
    );
    expect(board.cellsWith(1, WIN_VALUE)).toEqual([at(7, 2)]);
    expect(board.candidates()).not.toContain(at(7, 7));
  });

  it('maps the bot piece to stone 1 and the opponent to stone 2', () => {
    const board = engineBoardFrom(boardWith(SIZE, [[0, 0, 'X'], [0, 1, 'O']]), SIZE, 'X');
    expect(board.cells[at(0, 0)]).toBe(1);
    expect(board.cells[at(0, 1)]).toBe(2);
  });

  it('reports fours', () => {
    const board = new EngineBoard(SIZE);
    for (const c of [4, 5, 6]) board.place(at(7, c), 1);
    expect(board.makesFour(1, at(7, 7))).toBe(true);
    expect(board.makesFour(1, at(0, 0))).toBe(false);
  });
});
```

- [ ] **Step 3: Run it and confirm it fails**

Run: `npx vitest run src/features/game/ai/board.test.ts`
Expected: FAIL, cannot resolve `./board`.

- [ ] **Step 4: Implement**

`src/features/game/ai/board.ts`:

```ts
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
```

- [ ] **Step 5: Run tests, confirm pass**

Run: `npx vitest run src/features/game/ai/board.test.ts`
Expected: PASS. If the "fresh build" test fails, the bug is in `refreshLines`/`refresh` (a cell whose shape depends on the changed stone was not refreshed).

- [ ] **Step 6: Commit**

```bash
git add src/features/game/ai/board.ts src/features/game/ai/testBoards.ts src/features/game/ai/board.test.ts
git commit -m "feat(ai): add incremental engine board with zobrist hashing"
```

---

### Task 3: VCF forced-win solver

**Files:**
- Create: `src/features/game/ai/threats.ts`
- Test: `src/features/game/ai/threats.test.ts`

**Interfaces:**
- Consumes (Task 2): `EngineBoard`, `Stone`, `opponentOf`, `engineBoardFrom`; (Task 1) `WIN_VALUE`.
- Produces: `interface VcfLimits { depth: number; nodes: number }`, `findVcf(board: EngineBoard, attacker: Stone, limits?: VcfLimits): number` (first winning move index, or `-1`; board restored on return). Default limits `{ depth: 16, nodes: 20_000 }`.

- [ ] **Step 1: Write the failing test**

`src/features/game/ai/threats.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { EngineBoard, engineBoardFrom } from './board';
import { findVcf } from './threats';
import { boardWith } from './testBoards';

const SIZE = 15;
const at = (r: number, c: number) => r * SIZE + c;

/** O has two blocked threes that cross at (7,6): playing there makes a double four. */
const doubleFour = () => engineBoardFrom(
  boardWith(SIZE, [
    [7, 3, 'O'], [7, 4, 'O'], [7, 5, 'O'], [7, 2, 'X'],
    [4, 6, 'O'], [5, 6, 'O'], [6, 6, 'O'], [3, 6, 'X'],
  ]),
  SIZE,
  'O',
);

describe('findVcf', () => {
  it('finds a double four', () => {
    expect(findVcf(doubleFour(), 1)).toBe(at(7, 6));
  });

  it('returns an existing five first', () => {
    const board = new EngineBoard(SIZE);
    for (const c of [3, 4, 5, 6]) board.place(at(7, c), 1);
    board.place(at(7, 2), 2);
    expect(findVcf(board, 1)).toBe(at(7, 7));
  });

  it('returns -1 when there is no forcing win', () => {
    const board = new EngineBoard(SIZE);
    board.place(at(7, 7), 1);
    board.place(at(7, 8), 2);
    expect(findVcf(board, 1)).toBe(-1);
  });

  it('gives up when the defender has a four to play first', () => {
    const board = doubleFour();
    for (const c of [10, 11, 12, 13]) board.place(at(12, c), 2);
    expect(findVcf(board, 1)).toBe(-1);
  });

  it('leaves the board unchanged', () => {
    const board = doubleFour();
    const hash = board.hash;
    const moves = board.moves.length;
    findVcf(board, 1);
    findVcf(board, 2);
    expect(board.hash).toBe(hash);
    expect(board.moves).toHaveLength(moves);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run src/features/game/ai/threats.test.ts`
Expected: FAIL, cannot resolve `./threats`.

- [ ] **Step 3: Implement**

`src/features/game/ai/threats.ts`:

```ts
import { opponentOf, type EngineBoard, type Stone } from './board';
import { WIN_VALUE } from './patterns';

export interface VcfLimits {
  /** Most attacking fours in one line of play. */
  depth: number;
  /** Most attacking moves tried in total. */
  nodes: number;
}

const DEFAULT_LIMITS: VcfLimits = { depth: 16, nodes: 20_000 };

/**
 * Victory by continuous fours: the attacker plays only fours, so every reply is
 * forced, until a move leaves two ways to make five. Returns the first move of
 * such a win (or of an existing five), otherwise -1. Leaves the board as found.
 */
export const findVcf = (board: EngineBoard, attacker: Stone, limits: VcfLimits = DEFAULT_LIMITS): number => {
  const fives = board.cellsWith(attacker, WIN_VALUE);
  if (fives.length > 0) return fives[0];
  return searchFours(board, attacker, limits.depth, { nodes: limits.nodes });
};

const searchFours = (board: EngineBoard, attacker: Stone, depth: number, budget: { nodes: number }): number => {
  if (depth <= 0 || budget.nodes <= 0) return -1;
  const defender = opponentOf(attacker);
  // A defender four must be answered first, which breaks the chain of forced replies.
  if (board.cellsWith(defender, WIN_VALUE).length > 0) return -1;

  const fours = board.candidates().filter((i) => board.makesFour(attacker, i));
  fours.sort((a, b) => board.value(attacker, b) - board.value(attacker, a));

  for (const move of fours) {
    if (--budget.nodes < 0) return -1;
    board.place(move, attacker);
    const completions = board.cellsWith(attacker, WIN_VALUE);
    let wins = completions.length >= 2;
    if (completions.length === 1) {
      board.place(completions[0], defender);
      wins = searchFours(board, attacker, depth - 1, budget) >= 0;
      board.undo();
    }
    board.undo();
    if (wins) return move;
  }
  return -1;
};
```

- [ ] **Step 4: Run tests, confirm pass**

Run: `npx vitest run src/features/game/ai/threats.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/game/ai/threats.ts src/features/game/ai/threats.test.ts
git commit -m "feat(ai): add VCF forced-win solver"
```

---

### Task 4: Search and public adapter

**Files:**
- Create: `src/features/game/ai/search.ts`
- Rewrite: `src/features/game/aiEngine.ts` (whole file replaced; old code is restored from git history in Task 6)
- Test: `src/features/game/aiEngine.test.ts`

**Interfaces:**
- Consumes: `EngineBoard`, `Stone`, `opponentOf`, `engineBoardFrom` (Task 2); `findVcf`, `VcfLimits` (Task 3); `WIN_VALUE`, `FORCED_WIN_VALUE` (Task 1).
- Produces:
  - `interface SearchOptions { timeLimitMs?: number; maxDepth?: number }`
  - `searchBestMove(board: EngineBoard, me: Stone, options?: SearchOptions): number` (cell index or `-1` when the board is full)
  - `getBestAiMove(board: BoardMatrix, size: number, aiPiece?: 'X' | 'O', options?: SearchOptions): [number, number]` (same name and first three params as today)
  - `export type { SearchOptions }` from `aiEngine.ts`

- [ ] **Step 1: Write the failing test**

`src/features/game/aiEngine.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { getBestAiMove } from './aiEngine';
import { engineBoardFrom } from './ai/board';
import { findVcf } from './ai/threats';
import { boardWith } from './ai/testBoards';
import type { BoardMatrix } from '../../shared/utils/gomokuLogic';

const SIZE = 15;
const FAST = { timeLimitMs: 300 };

const play = (board: BoardMatrix, piece: 'X' | 'O' = 'O') => getBestAiMove(board, SIZE, piece, FAST);

describe('getBestAiMove', () => {
  it('opens in the centre', () => {
    expect(play(boardWith(SIZE, []))).toEqual([7, 7]);
  });

  it('takes a win', () => {
    const board = boardWith(SIZE, [
      [7, 4, 'O'], [7, 5, 'O'], [7, 6, 'O'], [7, 7, 'O'],
      [6, 4, 'X'], [6, 5, 'X'], [6, 6, 'X'], [8, 8, 'X'],
    ]);
    expect([[7, 3], [7, 8]]).toContainEqual(play(board));
  });

  it('prefers its own win over blocking', () => {
    const board = boardWith(SIZE, [
      [7, 4, 'O'], [7, 5, 'O'], [7, 6, 'O'], [7, 7, 'O'],
      [3, 3, 'X'], [3, 4, 'X'], [3, 5, 'X'], [3, 6, 'X'],
    ]);
    expect([[7, 3], [7, 8]]).toContainEqual(play(board));
  });

  it('plays as X too', () => {
    const board = boardWith(SIZE, [
      [7, 4, 'X'], [7, 5, 'X'], [7, 6, 'X'], [7, 7, 'X'],
      [6, 4, 'O'], [6, 5, 'O'], [6, 6, 'O'],
    ]);
    expect([[7, 3], [7, 8]]).toContainEqual(play(board, 'X'));
  });

  it('blocks a four', () => {
    const board = boardWith(SIZE, [
      [7, 3, 'X'], [7, 4, 'X'], [7, 5, 'X'], [7, 6, 'X'],
      [7, 2, 'O'], [6, 6, 'O'],
    ]);
    expect(play(board)).toEqual([7, 7]);
  });

  it('blocks an open three at an end', () => {
    const board = boardWith(SIZE, [[7, 5, 'X'], [7, 6, 'X'], [7, 7, 'X'], [8, 6, 'O']]);
    expect([[7, 4], [7, 8]]).toContainEqual(play(board));
  });

  it('finds a double four', () => {
    const board = boardWith(SIZE, [
      [7, 3, 'O'], [7, 4, 'O'], [7, 5, 'O'], [7, 2, 'X'],
      [4, 6, 'O'], [5, 6, 'O'], [6, 6, 'O'], [3, 6, 'X'],
    ]);
    expect(play(board)).toEqual([7, 6]);
  });

  it("refutes the opponent's double four", () => {
    const board = boardWith(SIZE, [
      [7, 3, 'X'], [7, 4, 'X'], [7, 5, 'X'], [7, 2, 'O'],
      [4, 6, 'X'], [5, 6, 'X'], [6, 6, 'X'], [3, 6, 'O'],
    ]);
    const [r, c] = play(board);
    board[r][c] = 'O';
    expect(findVcf(engineBoardFrom(board, SIZE, 'O'), 2)).toBe(-1);
  });

  it('never plays on a T stone', () => {
    const board = boardWith(SIZE, [
      [7, 4, 'O'], [7, 5, 'O'], [7, 6, 'O'], [7, 7, 'O'], [7, 8, 'T'],
      [6, 4, 'X'], [6, 5, 'X'],
    ]);
    expect(play(board)).toEqual([7, 3]);
  });

  it('still blocks when the position is lost', () => {
    const board = boardWith(SIZE, [
      [7, 3, 'X'], [7, 4, 'X'], [7, 5, 'X'], [7, 6, 'X'], [9, 9, 'O'],
    ]);
    expect([[7, 2], [7, 7]]).toContainEqual(play(board));
  });

  it('finds the last empty cell', () => {
    // (r + 2c) mod 4 < 2 never puts five of one piece in a row in any direction.
    const board: BoardMatrix = Array.from({ length: SIZE }, (_, r) =>
      Array.from({ length: SIZE }, (_, c) => ((r + 2 * c) % 4 < 2 ? 'X' : 'O')));
    board[0][0] = null;
    expect(play(board)).toEqual([0, 0]);
  });

  it('respects the time budget', () => {
    const stones: Array<[number, number, 'X' | 'O']> = [];
    for (let r = 4; r <= 10; r++) {
      for (let c = 4; c <= 10; c++) {
        if ((r * 7 + c) % 5 !== 0) stones.push([r, c, (r + 2 * c) % 4 < 2 ? 'X' : 'O']);
      }
    }
    const started = performance.now();
    const [r, c] = getBestAiMove(boardWith(SIZE, stones), SIZE, 'O', { timeLimitMs: 200 });
    expect(performance.now() - started).toBeLessThan(800);
    expect(boardWith(SIZE, stones)[r][c]).toBeNull();
  });

  it('is deterministic', () => {
    const board = boardWith(SIZE, [[7, 7, 'X'], [7, 8, 'O'], [8, 7, 'X']]);
    const options = { maxDepth: 4, timeLimitMs: 5000 };
    expect(getBestAiMove(board, SIZE, 'O', options)).toEqual(getBestAiMove(board, SIZE, 'O', options));
  });

  it('still works on a 30x30 board', () => {
    const board = boardWith(30, [[15, 15, 'X'], [15, 16, 'O'], [16, 15, 'X']]);
    const [r, c] = getBestAiMove(board, 30, 'O', { timeLimitMs: 200 });
    expect(board[r][c]).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run src/features/game/aiEngine.test.ts`
Expected: FAIL. The old engine has no `ai/` modules to import, and the import errors stop the suite.

- [ ] **Step 3: Implement the search**

`src/features/game/ai/search.ts`:

```ts
import { opponentOf, type EngineBoard, type Stone } from './board';
import { FORCED_WIN_VALUE, WIN_VALUE } from './patterns';
import { findVcf, type VcfLimits } from './threats';

export interface SearchOptions {
  /** Wall-clock budget for one move. */
  timeLimitMs?: number;
  /** Deepest iteration; mainly for tests. */
  maxDepth?: number;
}

const DEFAULT_TIME_MS = 900;
const DEFAULT_MAX_DEPTH = 12;
const ROOT_WIDTH = 20;
const NODE_WIDTH = 10;
const DEFENCE_WIDTH = 40;
const DEFENCE_VCF: VcfLimits = { depth: 12, nodes: 3_000 };
const WIN = 1_000_000_000;
/** Scores this close to WIN are decided games. */
const DECIDED = WIN - 1_000;
const SIDE_KEY = 0x5bd1e995;
const TT_LIMIT = 500_000;

const EXACT = 0;
const LOWER = 1;
const UPPER = 2;

interface TtEntry {
  depth: number;
  score: number;
  flag: number;
  move: number;
}

class SearchTimeout extends Error {}

/**
 * Moves worth searching for p, best first. If the opponent can make five only
 * the blocks are returned; if they threaten a forced win, only cells that stop
 * it and our own fours are.
 */
const orderMoves = (board: EngineBoard, p: Stone, width: number): number[] => {
  const o = opponentOf(p);
  const blocks = board.cellsWith(o, WIN_VALUE);
  if (blocks.length > 0) return blocks;

  let moves = board.candidates();
  if (moves.some((i) => board.value(o, i) >= FORCED_WIN_VALUE)) {
    moves = moves.filter((i) => board.value(o, i) >= FORCED_WIN_VALUE || board.makesFour(p, i));
  }
  return moves
    .map((i) => ({ i, score: board.value(p, i) + board.value(o, i) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, width)
    .map((m) => m.i);
};

/** Static score for the side to move; its own threats count a bit more since it moves first. */
const evaluate = (board: EngineBoard, p: Stone): number =>
  board.totals[p] * 1.1 - board.totals[opponentOf(p)];

/**
 * Picks the move for `me`: an immediate five, a forced block, a forced win
 * found by VCF, otherwise iterative-deepening alpha-beta within the time budget.
 * Returns -1 only when the board has no empty cell.
 */
export const searchBestMove = (board: EngineBoard, me: Stone, options: SearchOptions = {}): number => {
  const opp = opponentOf(me);
  // The budget covers everything below, including the threat checks.
  const deadline = performance.now() + (options.timeLimitMs ?? DEFAULT_TIME_MS);

  const wins = board.cellsWith(me, WIN_VALUE);
  if (wins.length > 0) return wins[0];
  const blocks = board.cellsWith(opp, WIN_VALUE);
  if (blocks.length > 0) return blocks[0];
  const vcf = findVcf(board, me);
  if (vcf >= 0) return vcf;

  let rootMoves = orderMoves(board, me, ROOT_WIDTH);
  if (rootMoves.length <= 1) return rootMoves.length === 1 ? rootMoves[0] : -1;

  // Keep only moves after which the opponent has no forced four chain, if any exist.
  if (findVcf(board, opp, DEFENCE_VCF) >= 0) {
    const safe: number[] = [];
    for (const i of orderMoves(board, me, DEFENCE_WIDTH)) {
      if (performance.now() > deadline) break;
      board.place(i, me);
      const refuted = findVcf(board, opp, DEFENCE_VCF) < 0;
      board.undo();
      if (refuted) safe.push(i);
    }
    if (safe.length > 0) rootMoves = safe.slice(0, ROOT_WIDTH);
  }

  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const table = new Map<number, TtEntry>();
  let nodes = 0;

  const child = (move: number, p: Stone, depth: number, alpha: number, beta: number, ply: number): number => {
    board.place(move, p);
    try {
      return -negamax(opponentOf(p), depth, -beta, -alpha, ply);
    } finally {
      board.undo();
    }
  };

  const negamax = (p: Stone, depth: number, alpha: number, beta: number, ply: number): number => {
    if ((++nodes & 1023) === 0 && performance.now() > deadline) throw new SearchTimeout();
    if (board.cellsWith(p, WIN_VALUE).length > 0) return WIN - ply;
    if (depth === 0) return evaluate(board, p);

    const key = (board.hash ^ (p === 2 ? SIDE_KEY : 0)) | 0;
    const hit = table.get(key);
    if (hit && hit.depth >= depth) {
      if (hit.flag === EXACT) return hit.score;
      if (hit.flag === LOWER && hit.score >= beta) return hit.score;
      if (hit.flag === UPPER && hit.score <= alpha) return hit.score;
    }

    const moves = orderMoves(board, p, NODE_WIDTH);
    if (moves.length === 0) return 0;
    if (hit) {
      const at = moves.indexOf(hit.move);
      if (at > 0) {
        moves.splice(at, 1);
        moves.unshift(hit.move);
      }
    }

    const startAlpha = alpha;
    let best = -Infinity;
    let bestMove = moves[0];
    for (const move of moves) {
      const score = child(move, p, depth - 1, alpha, beta, ply + 1);
      if (score > best) {
        best = score;
        bestMove = move;
      }
      if (score > alpha) alpha = score;
      if (alpha >= beta) break;
    }

    if (table.size >= TT_LIMIT) table.clear();
    const flag = best <= startAlpha ? UPPER : best >= beta ? LOWER : EXACT;
    table.set(key, { depth, score: best, flag, move: bestMove });
    return best;
  };

  let bestMove = rootMoves[0];
  for (let depth = 1; depth <= maxDepth; depth++) {
    try {
      let alpha = -Infinity;
      let iterationBest = bestMove;
      for (const move of [bestMove, ...rootMoves.filter((m) => m !== bestMove)]) {
        const score = child(move, me, depth - 1, alpha, Infinity, 1);
        if (score > alpha) {
          alpha = score;
          iterationBest = move;
        }
      }
      bestMove = iterationBest;
      if (alpha >= DECIDED || alpha <= -DECIDED) break;
    } catch (error) {
      if (error instanceof SearchTimeout) break;
      throw error;
    }
  }
  return bestMove;
};
```

- [ ] **Step 4: Rewrite the adapter**

Replace the whole of `src/features/game/aiEngine.ts` with:

```ts
import type { BoardMatrix } from '../../shared/utils/gomokuLogic';
import { engineBoardFrom } from './ai/board';
import { searchBestMove, type SearchOptions } from './ai/search';

export type { SearchOptions };

/**
 * Picks the bot's move. A third player's stones (T) are walls to the engine.
 * Falls back to the centre only if the board has no empty cell at all.
 */
export const getBestAiMove = (
  board: BoardMatrix,
  size: number,
  aiPiece: 'X' | 'O' = 'O',
  options: SearchOptions = {},
): [number, number] => {
  const move = searchBestMove(engineBoardFrom(board, size, aiPiece), 1, options);
  if (move < 0) {
    const centre = Math.floor(size / 2);
    return [centre, centre];
  }
  return [Math.floor(move / size), move % size];
};
```

- [ ] **Step 5: Run tests, confirm pass**

Run: `npx vitest run src/features/game`
Expected: PASS for `aiEngine.test.ts` and all `ai/*.test.ts`.

If `refutes the opponent's double four` fails, check `orderMoves` keeps cells where the opponent's value is `>= FORCED_WIN_VALUE`. If `respects the time budget` fails, check the `(++nodes & 1023)` timeout check is reached (the throw must come from `negamax`, and `child` must undo in `finally`).

- [ ] **Step 6: Type-check and lint**

Run: `npx tsc -b; npm run lint`
Expected: no errors. The worker and hook still compile, since `getBestAiMove(board, size, aiPiece)` keeps its first three parameters.

- [ ] **Step 7: Commit**

```bash
git add src/features/game/ai/search.ts src/features/game/aiEngine.ts src/features/game/aiEngine.test.ts
git commit -m "feat(ai): replace depth-2 bot with VCF + iterative deepening search"
```

---

### Task 5: Time budget and 15x15 practice board

**Files:**
- Modify: `src/features/game/aiEngine.worker.ts`
- Modify: `src/features/game/useAiEngine.ts:45-60`
- Modify: `src/app/AppViewShared.ts`
- Modify: `src/app/AppView.tsx` (practice code paths, listed below)
- Test: `src/app/AppViewShared.test.ts`

**Interfaces:**
- Consumes (Task 4): `getBestAiMove(board, size, aiPiece, { timeLimitMs })`.
- Produces: `AI_BOARD_SIZE = 15`, `aiThinkMs(turnTimeSeconds: number): number`, `requestMove(board, size, aiPiece, timeLimitMs?)`, `AiRequest.timeLimitMs?: number`.

- [ ] **Step 1: Write the failing test**

`src/app/AppViewShared.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { AI_BOARD_SIZE, aiThinkMs } from './AppViewShared';

describe('practice bot settings', () => {
  it('uses a 15x15 board', () => {
    expect(AI_BOARD_SIZE).toBe(15);
  });

  it('thinks 900 ms without a turn timer', () => {
    expect(aiThinkMs(0)).toBe(900);
  });

  it('uses at most a quarter of a short turn timer', () => {
    expect(aiThinkMs(2)).toBe(500);
    expect(aiThinkMs(10)).toBe(900);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run src/app/AppViewShared.test.ts`
Expected: FAIL, `AI_BOARD_SIZE` is not exported.

- [ ] **Step 3: Add the constants**

Append to `src/app/AppViewShared.ts`:

```ts
/** The practice bot always plays on 15x15: small enough to search deeply in the browser. */
export const AI_BOARD_SIZE = 15;

const AI_MAX_THINK_MS = 900;

/** Bot think time: 900 ms, or a quarter of the turn timer when that is shorter. */
export const aiThinkMs = (turnTimeSeconds: number): number =>
  turnTimeSeconds > 0 ? Math.min(AI_MAX_THINK_MS, (turnTimeSeconds * 1000) / 4) : AI_MAX_THINK_MS;
```

- [ ] **Step 4: Run test, confirm pass**

Run: `npx vitest run src/app/AppViewShared.test.ts`
Expected: PASS.

- [ ] **Step 5: Pass the budget through the worker**

In `src/features/game/aiEngine.worker.ts`, add the field and pass it on:

```ts
export interface AiRequest {
  id: number;
  board: BoardMatrix;
  size: number;
  aiPiece: 'X' | 'O';
  /** Wall-clock budget for the search; the engine default applies when absent. */
  timeLimitMs?: number;
}
```

```ts
/**
 * Runs the search off the main thread so the board stays responsive while the
 * bot uses its whole think budget.
 */
self.onmessage = (event: MessageEvent<AiRequest>) => {
  const { id, board, size, aiPiece, timeLimitMs } = event.data;
  const move = getBestAiMove(board, size, aiPiece, { timeLimitMs });
  const response: AiResponse = { id, move };
  (self as unknown as Worker).postMessage(response);
};
```

In `src/features/game/useAiEngine.ts`, replace `requestMove`:

```ts
  /** Resolves with the chosen move, or never resolves if a newer request wins. */
  const requestMove = useCallback((board: BoardMatrix, size: number, aiPiece: 'X' | 'O', timeLimitMs?: number) => {
    const worker = workerRef.current;
    if (!worker) {
      return Promise.resolve(getBestAiMove(board, size, aiPiece, { timeLimitMs }));
    }

    // Abandon every earlier search: only the latest board matters.
    pendingRef.current.clear();

    const id = ++requestIdRef.current;
    return new Promise<[number, number]>((resolve) => {
      pendingRef.current.set(id, resolve);
      const request: AiRequest = { id, board, size, aiPiece, timeLimitMs };
      worker.postMessage(request);
    });
  }, []);
```

- [ ] **Step 6: Make practice use 15x15**

In `src/app/AppView.tsx`:

1. Add `AI_BOARD_SIZE` and `aiThinkMs` to the existing import from `./AppViewShared` (or add `import { AI_BOARD_SIZE, aiThinkMs } from './AppViewShared';` if no import exists).
2. Find every practice use of the board size: `rg -n "roomSettings.boardSize" src/app/AppView.tsx`. Replace `roomSettings.boardSize` with `AI_BOARD_SIZE` in these practice-only places, and drop `roomSettings.boardSize` from their `useCallback` dependency arrays:
   - `saveMatchRecord({ mode: 'ai', ... boardSize: ... })` (around line 271)
   - `executeUndoMove` (around line 308)
   - `makeAiMove` (around line 335)
   - `handleCellClick` → `checkWin(nextBoard, row, col, ...)` (around line 411)
   - `resetMatchState` (around line 438)
   - the start-practice handler that calls `setIsAiMode(true)` (around line 464)

   Leave the lobby sync effect (around line 162) and the initial `useState` board (line 73) unchanged: they serve the online lobby.
3. In `makeAiMove`, pass the budget:

```ts
        [aiRow, aiCol] = await requestAiMove(currentBoard, size, aiPiece, aiThinkMs(roomSettings.turnTimeSeconds));
```

   and add `roomSettings.turnTimeSeconds` to its dependency array if it is not already there (it is today).
4. So the board renders and the rules panel shows 15x15, add near the other derived values:

```ts
  const practiceSettings = useMemo(() => ({ ...roomSettings, boardSize: AI_BOARD_SIZE }), [roomSettings]);
```

   (import `useMemo` from `react` if not already imported). Then pass `settings: practiceSettings` instead of `settings: roomSettings` in the `practice={practiceInMatch ? { ... } : null}` props (line ~610), and in `AppModalStack` change `settings={roomActive && room.state ? room.state.settings : roomSettings}` to `settings={roomActive && room.state ? room.state.settings : isAiMode ? practiceSettings : roomSettings}`.

- [ ] **Step 7: Verify**

Run: `npx vitest run; npx tsc -b; npm run lint`
Expected: all tests PASS, no type or lint errors.

Then run `npm run dev`, open `http://localhost:5175`, and start a bot game:
- the board is 15x15 even though the room default is 30x30;
- the bot replies in about 1 s or less;
- an open three you make gets blocked at an end, and an unblocked double threat from the bot leads to its win;
- 3-player practice still runs, and the O bot never plays on a △ cell;
- leave practice and open a room lobby: board size is still the room setting (30).

- [ ] **Step 8: Commit**

```bash
git add src/features/game/aiEngine.worker.ts src/features/game/useAiEngine.ts src/app/AppViewShared.ts src/app/AppViewShared.test.ts src/app/AppView.tsx
git commit -m "feat(practice): play the bot on 15x15 with a bounded think time"
```

---

### Task 6: Arena benchmark against the old bot

**Files:**
- Create: `src/features/game/ai/arena/legacyEngine.ts` (restored from git)
- Test: `src/features/game/ai/arena.test.ts` (opt-in, does not run in `npm test`)

**Interfaces:**
- Consumes: `getBestAiMove` (Task 4), legacy `getBestAiMove(board, size, aiPiece)`, `checkWin`, `createEmptyBoard`.

- [ ] **Step 1: Restore the old engine**

```bash
mkdir -p src/features/game/ai/arena
git show 36666a9:src/features/game/aiEngine.ts > src/features/game/ai/arena/legacyEngine.ts
```

Then in `legacyEngine.ts`, change the first line's import path from `'../../shared/utils/gomokuLogic'` to `'../../../../shared/utils/gomokuLogic'`, and add this comment above it:

```ts
// The pre-2026-10 depth-2 bot, kept only so the arena test can measure the new engine against it.
```

- [ ] **Step 2: Write the arena**

`src/features/game/ai/arena.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { checkWin, createEmptyBoard } from '../../../shared/utils/gomokuLogic';
import { getBestAiMove } from '../aiEngine';
import { getBestAiMove as getLegacyMove } from './arena/legacyEngine';

const SIZE = 15;
const GAMES = 20;
type Result = 'new' | 'legacy' | 'draw';

/** One game from a seeded two-stone opening near the centre. */
const playGame = (newPiece: 'X' | 'O', seed: number): Result => {
  let state = seed;
  const rand = (n: number) => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state % n;
  };
  const board = createEmptyBoard(SIZE);
  const xr = 6 + rand(3);
  const xc = 6 + rand(3);
  board[xr][xc] = 'X';
  const around: Array<[number, number]> = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
  const [dr, dc] = around[rand(around.length)];
  board[xr + dr][xc + dc] = 'O';

  let turn: 'X' | 'O' = 'X';
  for (let n = 2; n < SIZE * SIZE; n++) {
    const mover: Result = turn === newPiece ? 'new' : 'legacy';
    const [r, c] = mover === 'new'
      ? getBestAiMove(board, SIZE, turn, { timeLimitMs: 300 })
      : getLegacyMove(board, SIZE, turn);
    if (board[r][c] !== null) return mover === 'new' ? 'legacy' : 'new';
    board[r][c] = turn;
    if (checkWin(board, r, c, SIZE)) return mover;
    turn = turn === 'X' ? 'O' : 'X';
  }
  return 'draw';
};

describe.runIf(process.env.AI_ARENA === '1')('arena: new engine vs legacy', () => {
  it('wins at least 90% of games', { timeout: 900_000 }, () => {
    const tally: Record<Result, number> = { new: 0, legacy: 0, draw: 0 };
    for (let g = 0; g < GAMES; g++) tally[playGame(g % 2 === 0 ? 'X' : 'O', 1000 + g)]++;
    console.log('arena result', tally);
    expect(tally.new / GAMES).toBeGreaterThanOrEqual(0.9);
  });
});
```

- [ ] **Step 3: Run the arena**

PowerShell:

```powershell
$env:AI_ARENA='1'; npx vitest run src/features/game/ai/arena.test.ts; Remove-Item Env:AI_ARENA
```

Expected: PASS and a log line like `arena result { new: 19, legacy: 0, draw: 1 }`. Runtime is a few minutes.

- [ ] **Step 4: Tune only if the target is missed**

If the new engine wins fewer than 18 of 20, adjust in this order and re-run Step 3 after each change:
1. `evaluate` attacker factor in `search.ts`: try `1.2`, then `1.0`.
2. `NODE_WIDTH` in `search.ts`: try `12`, then `8`.
3. `SHAPE_VALUE` in `patterns.ts`: raise OPEN3 from `500` to `800`.

Re-run `npx vitest run src/features/game` after any change; the puzzle tests must stay green.

- [ ] **Step 5: Confirm the arena is skipped by default**

Run: `npx vitest run`
Expected: arena suite reported as skipped; everything else passes.

- [ ] **Step 6: Commit**

```bash
git add src/features/game/ai/arena src/features/game/ai/arena.test.ts
git commit -m "test(ai): add opt-in arena benchmark against the legacy bot"
```

If Step 4 changed any engine constants, include those files in this commit too.
