export interface RoomSettings {
  boardSize: number; // 15, 19, 30, 50
  totalTimeMinutes: number; // 5, 15, 30, 0 (0 = Unlimited)
  turnTimeSeconds: number; // 10, 30, 60, 0 (0 = Unlimited)
  allowUndo: boolean;
}

export const DEFAULT_ROOM_SETTINGS: RoomSettings = {
  boardSize: 50,
  totalTimeMinutes: 0,
  turnTimeSeconds: 0,
  allowUndo: true,
};
