import React from 'react';
import type { UserProfile } from '../../features/auth/AuthContext';
import { HistoryModalOrca } from '../../features/history/HistoryModal.orca';
import { LeaderboardModalOrca } from '../../features/leaderboard/LeaderboardModal.orca';
import { SettingsAndThemeModalOrca } from '../../features/settings/SettingsAndThemeModal.orca';
import type { RoomSettings } from '../../features/settings/types';
import type { WorkspaceSurface } from './types';

export interface OrcaWorkspaceSettingsProps {
  settings: RoomSettings;
  onUpdateSettings: (settings: RoomSettings) => void;
  isHost: boolean;
  gameStatus: 'lobby' | 'playing' | 'ended';
  myPiece?: 'X' | 'O' | 'T';
}

export interface OrcaWorkspaceProps {
  /** Never 'match': the live session renders in its own stage beside this. */
  surface: Exclude<WorkspaceSurface, 'match'>;
  /** The lobby page (HomeLobbyMeta + HomePlayActions + PublicRoomList). */
  lobby: React.ReactNode;
  /** Closes a Leaderboard / History / Settings tab, back to where it was opened from. */
  onClosePage: () => void;
  onSelectPlayer: (profile: UserProfile) => void;
  onPlayNow: () => void;
  settingsProps: OrcaWorkspaceSettingsProps;
}

/**
 * The centre workbench of the Orca shell for every tab except the live match:
 * the lobby, and the Leaderboard / History / Settings pages (PR 5 AppView,
 * "workspace tabs"). Scrolls on its own, inside the editor surface.
 *
 * The three pages are PR 5's embedded forms of the Orca dialogs
 * (`*.orca.tsx`, `embedded`): no scrim, no close button (closing the tab is
 * the way out), inside PR 5's containers.
 */
export const OrcaWorkspace: React.FC<OrcaWorkspaceProps> = ({
  surface,
  lobby,
  onClosePage,
  onSelectPlayer,
  onPlayNow,
  settingsProps,
}) => (
  <div className="scrollbar-orca flex-1 min-h-0 w-full overflow-y-auto">
    {surface === 'lobby' && (
      <div className="home-lobby mx-auto flex w-full max-w-5xl flex-col gap-4 px-3 py-3 lg:gap-5 lg:px-6 lg:py-6">
        {lobby}
      </div>
    )}

    {surface === 'leaderboard' && (
      <div className="mx-auto w-full max-w-4xl px-3 py-3 lg:px-6 lg:py-6">
        <LeaderboardModalOrca isOpen embedded onClose={onClosePage} onSelectPlayer={onSelectPlayer} />
      </div>
    )}

    {surface === 'history' && (
      <div className="mx-auto w-full max-w-4xl px-3 py-3 lg:px-6 lg:py-6">
        <HistoryModalOrca isOpen embedded onClose={onClosePage} onPlayNow={onPlayNow} />
      </div>
    )}

    {surface === 'settings' && (
      <div className="mx-auto w-full max-w-4xl px-3 py-3 lg:px-6 lg:py-6">
        <SettingsAndThemeModalOrca isOpen embedded onClose={onClosePage} {...settingsProps} />
      </div>
    )}
  </div>
);
