import React, { useEffect, useRef } from 'react';
import type { BoardMatrix, CellValue } from '../../shared/utils/gomokuLogic';
import { forcedFourMoves } from '../../shared/utils/forcedFour';
import { BOT_HINT_EVENT, countStones, hintSearchFor } from './botHint';
import { useAiEngine } from './useAiEngine';

const HINT_THINK_MS = 1000;

interface BotHintRunnerProps {
  board: BoardMatrix;
  size: number;
  piece: Exclude<CellValue, null>;
  threePlayer: boolean;
  onHint: (move: [number, number]) => void;
}

/**
 * Answers the rail's hint button. A component of its own so the engine's worker
 * is only started for the account that has the button.
 */
export const BotHintRunner: React.FC<BotHintRunnerProps> = ({ board, size, piece, threePlayer, onHint }) => {
  const { requestMove } = useAiEngine();
  const latest = useRef({ board, size, piece, threePlayer, onHint });
  useEffect(() => {
    latest.current = { board, size, piece, threePlayer, onHint };
  });

  useEffect(() => {
    const ask = async () => {
      const asked = latest.current;
      const search = hintSearchFor(asked.board, asked.piece);
      let move = await requestMove(search.board, asked.size, search.piece, HINT_THINK_MS);
      // A stone played during the search makes the answer stale.
      if (countStones(latest.current.board) !== countStones(asked.board)) return;
      // Three-player boards obey the forced-block rule the engine doesn't know.
      const forced = asked.threePlayer ? forcedFourMoves(asked.board, asked.piece) : null;
      if (forced && !forced.some(([row, col]) => row === move[0] && col === move[1])) move = forced[0];
      latest.current.onHint(move);
    };
    const handle = () => void ask();
    window.addEventListener(BOT_HINT_EVENT, handle);
    return () => window.removeEventListener(BOT_HINT_EVENT, handle);
  }, [requestMove]);

  return null;
};
