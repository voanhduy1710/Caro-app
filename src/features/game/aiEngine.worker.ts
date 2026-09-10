/// <reference lib="webworker" />
import { getBestAiMove } from './aiEngine';
import type { BoardMatrix } from '../../shared/utils/gomokuLogic';

export interface AiRequest {
  id: number;
  board: BoardMatrix;
  size: number;
  aiPiece: 'X' | 'O';
}

export interface AiResponse {
  id: number;
  move: [number, number];
}

/**
 * Runs the minimax search off the main thread. The search cost grows with the
 * number of stones on the board, so on a 50x50 grid it would otherwise freeze
 * the UI mid-match.
 */
self.onmessage = (event: MessageEvent<AiRequest>) => {
  const { id, board, size, aiPiece } = event.data;
  const move = getBestAiMove(board, size, aiPiece);
  const response: AiResponse = { id, move };
  (self as unknown as Worker).postMessage(response);
};
