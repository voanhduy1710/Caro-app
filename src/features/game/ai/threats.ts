import { opponentOf, type EngineBoard, type Stone } from './board';
import { FORCED_WIN_VALUE, SPAN, WIN_VALUE } from './patterns';

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

const DEFAULT_VCT_LIMITS: VcfLimits = { depth: 6, nodes: 3_000 };
/** findVct gave up (node budget or deadline) before it could rule out a win. */
export const VCT_UNKNOWN = -2;
/** Threat moves tried per attacking turn, strongest first. */
const VCT_WIDTH = 12;

/**
 * Victory by continuous threats: like VCF, but the attacker may also play open
 * threes, and the defender may answer a three at any cell that stops its open
 * four. Wins built from a quiet setup, such as completing a square and then
 * making a double three, show up here one move before they land.
 *
 * The defender's counter-fours are not tried, so this can report a win the
 * defender could still escape. That errs towards caution, which is what the
 * search wants when it uses this to defend. Returns the first attacking move,
 * -1 when no win exists within the limits, or VCT_UNKNOWN when it ran out of
 * nodes or reached `deadline` (a performance.now() time) first. Leaves the
 * board as found.
 */
export const findVct = (
  board: EngineBoard,
  attacker: Stone,
  limits: VcfLimits = DEFAULT_VCT_LIMITS,
  deadline = Infinity,
): number => {
  const fives = board.cellsWith(attacker, WIN_VALUE);
  if (fives.length > 0) return fives[0];
  const budget = { nodes: limits.nodes, exhausted: false };
  const move = searchThreats(board, attacker, limits.depth, budget, deadline);
  return move < 0 && budget.exhausted ? VCT_UNKNOWN : move;
};

const searchThreats = (
  board: EngineBoard,
  attacker: Stone,
  depth: number,
  budget: { nodes: number; exhausted: boolean },
  deadline: number,
): number => {
  if (depth <= 0) return -1;
  if (budget.nodes <= 0 || performance.now() > deadline) {
    budget.exhausted = true;
    return -1;
  }
  const defender = opponentOf(attacker);
  if (board.cellsWith(defender, WIN_VALUE).length > 0) return -1;

  const threats = board.candidates()
    .filter((i) => board.makesThreat(attacker, i))
    .sort((a, b) => board.value(attacker, b) - board.value(attacker, a))
    .slice(0, VCT_WIDTH);

  for (const move of threats) {
    if (--budget.nodes < 0) {
      budget.exhausted = true;
      return -1;
    }
    board.place(move, attacker);
    let wins = false;
    const completions = board.cellsWith(attacker, WIN_VALUE);
    if (completions.length >= 2) {
      wins = true;
    } else if (completions.length === 1 || board.cellsWith(attacker, FORCED_WIN_VALUE).length > 0) {
      // A four has one answer; a three has every cell that kills its open-four points.
      const replies = completions.length === 1 ? completions : threatDefences(board, attacker, move);
      wins = replies.every((reply) => {
        board.place(reply, defender);
        const held = searchThreats(board, attacker, depth - 1, budget, deadline) >= 0;
        board.undo();
        return held;
      });
    }
    board.undo();
    if (wins) return move;
  }
  return -1;
};

/**
 * Cells where the defender stops every open-four point the attacker has after
 * `move`: the open-four points themselves plus gaps and ends of the lines
 * through the move (blocking an end of a broken three works too). An empty
 * list means no single stone saves the defender, as against a double three.
 */
export const threatDefences = (board: EngineBoard, attacker: Stone, move: number): number[] => {
  const defender = opponentOf(attacker);
  const forced = board.cellsWith(attacker, FORCED_WIN_VALUE);
  // Only the lines from the move to its open-four points carry this threat.
  const dirs = [...new Set(forced.map((f) => board.lineBetween(move, f, SPAN + 1)).filter((d) => d >= 0))];
  const tries = new Set([...forced, ...board.lineCells(move, SPAN + 1, dirs)]);
  const out: number[] = [];
  for (const cell of tries) {
    board.place(cell, defender);
    // A defender stone only lowers attacker values, so only the known points need rechecking.
    if (forced.every((f) => board.value(attacker, f) < FORCED_WIN_VALUE)) out.push(cell);
    board.undo();
  }
  return out;
};
