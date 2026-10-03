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
