export interface RoomSettings {
  boardSize: number; // 15, 19, 30, 50
  totalTimeMinutes: number; // 5, 15, 30, 0 (0 = Unlimited)
  turnTimeSeconds: number; // 10, 30, 60, 0 (0 = Unlimited)
  allowUndo: boolean;
}

/**
 * 15x15 is the size a new player can actually read on a phone. The larger
 * boards stay one tap away in Match rules for people who want them.
 */
export const DEFAULT_ROOM_SETTINGS: RoomSettings = {
  boardSize: 15,
  totalTimeMinutes: 0,
  turnTimeSeconds: 0,
  allowUndo: true,
};

/** How the win condition actually behaves, in the words a player would use. */
export const WIN_RULE_TEXT = 'Five or more of your pieces in a row wins: across, down or diagonally.';

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
  { label: 'Board', value: `${settings.boardSize}x${settings.boardSize}` },
  {
    label: 'Total time',
    value: settings.totalTimeMinutes === 0 ? 'Unlimited' : `${settings.totalTimeMinutes} min each`,
  },
  {
    label: 'Per move',
    value: settings.turnTimeSeconds === 0 ? 'Unlimited' : `${settings.turnTimeSeconds}s`,
  },
  { label: 'Take back', value: settings.allowUndo ? 'Allowed' : 'Off' },
];
