/**
 * Orca shell workspace tabs. PR 5 had one tab per open room / bot game
 * (`bot`, `room:<slot>`); this port keeps one room or match at a time, so the
 * live session is the single `match` tab.
 */
export type WorkspaceSurface = 'lobby' | 'match' | 'leaderboard' | 'history' | 'settings';

/** The tabs that are pages rather than the lobby or the live session. */
export type WorkspacePage = 'leaderboard' | 'history' | 'settings';

export const isWorkspacePage = (surface: WorkspaceSurface): surface is WorkspacePage =>
  surface === 'leaderboard' || surface === 'history' || surface === 'settings';

/** The live session, as the titlebar, sidebar and mobile strip show it. */
export interface SessionTabItem {
  kind: 'bot' | 'room' | 'chat';
  label: string;
  subLabel?: string;
  roomCode?: string | null;
  isMyTurn: boolean;
  unreadCount: number;
}
