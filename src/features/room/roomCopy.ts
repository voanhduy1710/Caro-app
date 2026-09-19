import type { GameResult } from './roomEngine';

/** Plain-language result and seat-departure copy for the room screen. */
export const RESULT_REASONS: Record<GameResult['reason'], string> = {
  '5_in_a_row': 'Five in a row completed the line.',
  board_full: 'The board filled up with nobody in a row.',
  turn_timeout: 'The clock for that move ran out.',
  total_time_out: 'A player used up their total time.',
  resigned: 'A player resigned.',
  disconnected: 'A player did not return before the reconnect time expired.',
};

export const LEFT_HOW: Record<string, string> = {
  stood: 'stood up',
  left: 'left the room',
  dropped: 'lost the connection',
  removed: 'was moved out of the seat',
};
