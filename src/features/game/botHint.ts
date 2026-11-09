import type { BoardMatrix, CellValue } from '../../shared/utils/gomokuLogic';

/**
 * "What would the bot play?" for one account. This is a client-side check, so
 * it decides who sees the button and is not an access control.
 */
const BOT_HINT_USERNAME = 'smurf_account';

export const BOT_HINT_EVENT = 'caro:bot-hint';

export const hasBotHint = (username: string | null | undefined) => username === BOT_HINT_USERNAME;

export const countStones = (board: BoardMatrix) =>
  board.reduce((total, row) => total + row.filter((cell) => cell !== null).length, 0);

/**
 * The engine only plays X or O and treats T as a wall, so a player on T is
 * searched with T and X swapped: their stones count and X's become the walls.
 */
export const hintSearchFor = (
  board: BoardMatrix,
  piece: Exclude<CellValue, null>,
): { board: BoardMatrix; piece: 'X' | 'O' } => {
  if (piece !== 'T') return { board, piece };
  return {
    board: board.map((row) => row.map((cell) => (cell === 'T' ? 'X' : cell === 'X' ? 'T' : cell))),
    piece: 'X',
  };
};
