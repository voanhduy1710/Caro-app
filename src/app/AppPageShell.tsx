import React from 'react';
import { AppNavbar } from './AppNavbar';

export const AppPageShell: React.FC<{ inMatch: boolean; onLeaderboard: () => void; onHistory: () => void; onSettings: () => void; onHome: () => void; children: React.ReactNode }> = ({ inMatch, onLeaderboard, onHistory, onSettings, onHome, children }) => <div className="min-h-[100dvh] flex flex-col justify-between bg-surface-2 text-ink selection:bg-accent selection:text-accent-fg"><AppNavbar inMatch={inMatch} onLeaderboard={onLeaderboard} onHistory={onHistory} onSettings={onSettings} onHome={onHome} /><main className={`flex-1 w-full mx-auto flex flex-col ${inMatch ? 'max-w-[1760px] p-0 lg:px-6 lg:py-4' : 'max-w-7xl p-4 pt-8 sm:p-6 sm:pt-8 items-center justify-start'}`}>{children}</main></div>;
