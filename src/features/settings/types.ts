import { t } from '../i18n/language';

export interface RoomSettings {
  boardSize: number; // 15, 19, 30, 50
  totalTimeMinutes: number; // 5, 15, 30, 0 (0 = Unlimited)
  turnTimeSeconds: number; // 10, 30, 60, 0 (0 = Unlimited)
  allowUndo: boolean;
  /** Normal keeps marks centred; LMAO lets marks sit at a chosen cell corner. */
  placementMode?: 'normal' | 'lmao';
  /** Three-player rooms are casual: X, O, then △ take turns. */
  playerMode?: 'oneVsOne' | 'oneVsOneVsOne';
  /** Default rotates the opening player after each completed game. */
  firstMoveMethod?: 'default' | 'coinFlip' | 'rockPaperScissors';
}

/**
 * A generous 30x30 board is the standard starting point. The smaller and
 * larger boards remain available in Match rules.
 */
export const DEFAULT_ROOM_SETTINGS: RoomSettings = {
  boardSize: 30,
  totalTimeMinutes: 0,
  turnTimeSeconds: 0,
  allowUndo: true,
  placementMode: 'normal',
  playerMode: 'oneVsOne',
  firstMoveMethod: 'default',
};

/** How the win condition actually behaves, in the words a player would use. */
export const WIN_RULE_TEXT = 'Five or more of your pieces in a row wins: across, down or diagonally.';
/** Translated at call time; prefer this over WIN_RULE_TEXT in render code. */
export const getWinRuleText = () => t('settings.winRule');

export interface RoomSettingsFact {
  label: string;
  value: string;
}

/**
 * The rules both players are about to play under, as short label/value pairs.
 * Rendered before a match starts so nobody discovers the board size or the
 * clock only once the first move is due.
 */
export const summariseRoomSettings = (settings: RoomSettings): RoomSettingsFact[] => [
  { label: t('settings.fact.board'), value: `${settings.boardSize}x${settings.boardSize}` },
  {
    label: t('settings.fact.totalTime'),
    value: settings.totalTimeMinutes === 0
      ? t('settings.fact.unlimited')
      : t('settings.fact.minEach', { n: settings.totalTimeMinutes }),
  },
  {
    label: t('settings.fact.perMove'),
    value: settings.turnTimeSeconds === 0 ? t('settings.fact.unlimited') : `${settings.turnTimeSeconds}s`,
  },
  { label: t('settings.fact.takeBack'), value: settings.allowUndo ? t('settings.allowed') : t('settings.off') },
  { label: t('settings.fact.mode'), value: settings.placementMode === 'lmao' ? 'LMAO' : t('settings.normal') },
  { label: t('settings.fact.players'), value: settings.playerMode === 'oneVsOneVsOne' ? '1v1v1' : '1v1' },
  {
    label: t('settings.fact.firstMove'),
    value: settings.firstMoveMethod === 'rockPaperScissors'
      ? t('settings.rockPaperScissors')
      : settings.firstMoveMethod === 'coinFlip'
      ? t('settings.coinFlip')
      : t('settings.default'),
  },
];
