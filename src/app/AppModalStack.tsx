import React from 'react';
import { SettingsAndThemeModal } from '../features/settings/SettingsAndThemeModal';
import { LeaderboardModal } from '../features/leaderboard/LeaderboardModal';
import { HistoryModal } from '../features/history/HistoryModal';
import { AuthModal } from '../features/auth/AuthModal';
import { ProfileModal } from '../features/profile/ProfileModal';
import { OpponentProfileModal } from '../features/profile/OpponentProfileModal';
import type { RoomSettings } from '../features/settings/types';
import type { UserProfile } from '../features/auth/AuthContext';
import type { ConfirmSpec } from './AppViewShared';

export interface AppModalStackProps { settingsOpen: boolean; onCloseSettings: () => void; settings: RoomSettings; onUpdateSettings: (settings: RoomSettings) => void; isHost: boolean; gameStatus: 'lobby' | 'playing' | 'ended'; myPiece?: 'X' | 'O' | 'T'; leaderboardOpen: boolean; onCloseLeaderboard: () => void; historyOpen: boolean; onCloseHistory: () => void; onSelectOpponent: (profile: UserProfile | null) => void; onPlayNow: () => void; opponent: UserProfile | null; confirmRoomExit: (spec: ConfirmSpec) => void; }
export const AppModalStack: React.FC<AppModalStackProps> = (p) => <><SettingsAndThemeModal isOpen={p.settingsOpen} onClose={p.onCloseSettings} settings={p.settings} onUpdateSettings={p.onUpdateSettings} isHost={p.isHost} gameStatus={p.gameStatus} myPiece={p.myPiece} /><LeaderboardModal isOpen={p.leaderboardOpen} onClose={p.onCloseLeaderboard} onSelectPlayer={p.onSelectOpponent} /><HistoryModal isOpen={p.historyOpen} onClose={p.onCloseHistory} onPlayNow={p.onPlayNow} /><AuthModal /><ProfileModal /><OpponentProfileModal opponent={p.opponent} isOpen={Boolean(p.opponent)} onClose={() => p.onSelectOpponent(null)} /></>;
