/// <reference lib="webworker" />
import { getBestAiMove } from './aiEngine';
import type { BoardMatrix } from '../../shared/utils/gomokuLogic';

export interface AiRequest {
  id: number;
  board: BoardMatrix;
  size: number;
  aiPiece: 'X' | 'O';
  /** Wall-clock budget for the search; the engine default applies when absent. */
  timeLimitMs?: number;
}

export interface AiResponse {
  id: number;
  move: [number, number];
}

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
