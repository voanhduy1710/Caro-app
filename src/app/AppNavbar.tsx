import React from 'react';
import { Navbar } from '../shared/components/Navbar';

export const AppNavbar: React.FC<{ inMatch: boolean; onLeaderboard: () => void; onHistory: () => void; onSettings: () => void; onHome: () => void }> = (p) => <Navbar inMatch={p.inMatch} onOpenLeaderboard={p.onLeaderboard} onOpenHistory={p.onHistory} onOpenSettingsAndTheme={p.onSettings} onNavigateHome={p.onHome} />;
