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
