import { opponentOf, type EngineBoard, type Stone } from './board';
import { FORCED_WIN_VALUE, WIN_VALUE } from './patterns';
import { findVcf, findVct, type VcfLimits } from './threats';

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
/** Share of the move budget the forced-win defence may use before the main search. */
/** Share of the move budget spent looking for our own chain of threes. */
const ATTACK_SHARE = 0.3;
const ATTACK_VCT: VcfLimits = { depth: 6, nodes: 3_000 };
const DEFENCE_SHARE = 0.6;
const DEFENCE_WIDTH = 40;
/** Opponent strong points tried when looking for a move that stops a chain of threes. */
const DEFENCE_VCT_WIDTH = 12;
const DEFENCE_VCF: VcfLimits = { depth: 12, nodes: 3_000 };
const DEFENCE_VCT: VcfLimits = { depth: 6, nodes: 2_000 };
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
  // A chain of threes wins only while the opponent has no four to break it with.
  if (!board.candidates().some((i) => board.makesFour(opp, i))) {
    const attackDeadline = performance.now() + (deadline - performance.now()) * ATTACK_SHARE;
    const vct = findVct(board, me, ATTACK_VCT, attackDeadline);
    if (vct >= 0) return vct;
  }

  let rootMoves = orderMoves(board, me, ROOT_WIDTH);
  if (rootMoves.length <= 1) return rootMoves.length === 1 ? rootMoves[0] : -1;

  // Keep only moves after which the opponent has no forced win, if any exist:
  // first chains of fours, otherwise chains of threes (a square turning into a
  // double three). Saving moves sit on the opponent's own strong points, so
  // those are tried first, whatever our move ordering thinks of them.
  const defenceDeadline = performance.now() + (deadline - performance.now()) * DEFENCE_SHARE;
  let defence: { stillLost: () => boolean; moves: number[] } | null = null;
  if (findVcf(board, opp, DEFENCE_VCF) >= 0) {
    defence = { stillLost: () => findVcf(board, opp, DEFENCE_VCF) >= 0, moves: orderMoves(board, me, DEFENCE_WIDTH) };
  } else if (findVct(board, opp, DEFENCE_VCT, defenceDeadline) >= 0) {
    defence = {
      // Only a proven -1 counts as safe; VCT_UNKNOWN means the check gave up.
      stillLost: () => findVct(board, opp, DEFENCE_VCT, defenceDeadline) !== -1,
      moves: board.candidates()
        .sort((a, b) => board.value(opp, b) - board.value(opp, a))
        .slice(0, DEFENCE_VCT_WIDTH),
    };
  }
  if (defence) {
    const safe: number[] = [];
    for (const i of defence.moves) {
      if (performance.now() > defenceDeadline) break;
      board.place(i, me);
      // A four of ours only delays: the reply to it is forced, so it proves nothing here.
      const refuted = board.cellsWith(me, WIN_VALUE).length === 0 && !defence.stillLost();
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
