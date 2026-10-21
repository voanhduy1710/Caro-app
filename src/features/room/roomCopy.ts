import type { GameResult } from './roomEngine';
import { t } from '../i18n/language';
import type { StringKey } from '../i18n/strings';

/** Plain-language result and seat-departure copy for the room screen. */
export const RESULT_REASONS: Record<GameResult['reason'], StringKey> = {
  '5_in_a_row': 'room.reason.fiveInRow',
  board_full: 'room.reason.boardFull',
  turn_timeout: 'room.reason.turnTimeout',
  total_time_out: 'room.reason.totalTimeOut',
  resigned: 'room.reason.resigned',
  disconnected: 'room.reason.disconnected',
};

export const resultReason = (result: GameResult): string =>
  result.reason === '5_in_a_row' && result.settings.playerMode === 'oneVsOneVsOne'
    ? t('room.reason.fourInRow')
    : t(RESULT_REASONS[result.reason]);

export const LEFT_HOW: Record<string, StringKey> = {
  stood: 'room.left.stood',
  left: 'room.left.left',
  dropped: 'room.left.dropped',
  removed: 'room.left.removed',
};
