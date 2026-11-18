/* Orca desktop titlebar (PR 5 src/app/shell/OrcaTitlebar.tsx), one live session tab. */
import React from 'react';
import {
  Bot,
  Hash,
  History,
  LayoutGrid,
  MessageCircle,
  Moon,
  PanelLeft,
  Plus,
  SlidersHorizontal,
  Smartphone,
  Sun,
  Trophy,
  X,
} from 'lucide-react';
import { useAuth } from '../../features/auth/AuthContext';
import { setLanguage, useLanguage, useT } from '../../features/i18n/language';
import type { PairingContextValue } from '../../features/pairing/PairingContext';
import { Badge, Button, IconButton, SegmentedControl } from '../../shared/ui/primitives';
import type { SessionTabItem, WorkspaceSurface } from './types';
import { useAppVisualMode } from './useAppVisualMode';
import type { AppVisualMode } from './useAppVisualMode';

export interface OrcaTitlebarProps {
  activeSurface: WorkspaceSurface;
  onSelectSurface: (surface: WorkspaceSurface) => void;
  /** The one live room or bot game, if any (PR 5 allowed several). */
  sessionTab: SessionTabItem | null;
  onCloseSession: () => void;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  inMatch: boolean;
  pairingValue: PairingContextValue | null;
  isDark: boolean;
  onToggleTheme: () => void;
}

const iconForSession = (kind: SessionTabItem['kind']) =>
  kind === 'bot' ? Bot : kind === 'chat' ? MessageCircle : Hash;

export const OrcaTitlebar: React.FC<OrcaTitlebarProps> = ({
  activeSurface,
  onSelectSurface,
  sessionTab,
  onCloseSession,
  sidebarOpen,
  onToggleSidebar,
  inMatch,
  pairingValue,
  isDark,
  onToggleTheme,
}) => {
  const t = useT();
  const lang = useLanguage();
  const { appMode, setAppMode } = useAppVisualMode();
  const { openAuthModal } = useAuth();

  const modeOptions: ReadonlyArray<{ value: AppVisualMode; label: string; title: string }> = [
    { value: 'orca', label: t('common.modeOrca'), title: t('common.modeOrca') },
    { value: 'sheets', label: t('common.modeSheets'), title: t('common.modeSheetsFull') },
  ];

  return (
    <header className="orca-titlebar hidden lg:flex w-full shrink-0 justify-between gap-2 px-2">
      {/* Left: Brand Mark + Sidebar Toggle */}
      <div className="flex h-full shrink-0 items-center gap-1 pr-1">
        <button
          type="button"
          onClick={() => onSelectSurface('lobby')}
          title={t('home.navBackHome')}
          aria-label={t('home.navLobby')}
          className="flex h-7 items-center gap-1.5 rounded-[6px] px-1.5 transition-colors hover:bg-surface-2"
        >
          <img
            src="/caro-tab-logo.png?v=3"
            alt=""
            aria-hidden="true"
            className="h-4 w-4 shrink-0 rounded-[3px] object-contain"
          />
          <span className="text-[12.5px] font-semibold tracking-tight text-ink">Caro</span>
        </button>

        <IconButton
          size="sm"
          active={sidebarOpen}
          aria-pressed={sidebarOpen}
          onClick={onToggleSidebar}
          aria-label={t('common.toggleSidebar')}
          title={t('common.toggleSidebar')}
        >
          <PanelLeft size={15} strokeWidth={1.75} aria-hidden="true" />
        </IconButton>
      </div>

      {/* Center: Workspace & Multi-Session Tab Strip */}
      <nav
        role="tablist"
        aria-label={t('home.workspaceSection')}
        className="scrollbar-none flex h-full min-w-0 flex-1 items-end justify-between overflow-x-auto border-l border-line"
      >
        <div className="flex h-full items-end">
          <button
            type="button"
            role="tab"
            aria-selected={activeSurface === 'lobby'}
            data-active={activeSurface === 'lobby' ? 'true' : undefined}
            onClick={() => onSelectSurface('lobby')}
            className="orca-tab"
          >
            <LayoutGrid size={14} strokeWidth={1.75} aria-hidden="true" />
            <span>{t('home.navLobby')}</span>
          </button>

          {[sessionTab].filter((tab): tab is SessionTabItem => tab !== null).map((tab) => {
            const isActive = activeSurface === 'match';
            const SessionIcon = iconForSession(tab.kind);
            return (
              <div
                key="match"
                data-active={isActive ? 'true' : undefined}
                className="orca-tab group pr-1.5"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => onSelectSurface('match')}
                  className="flex h-full items-center gap-1.5 outline-none"
                >
                  <SessionIcon size={13.5} strokeWidth={1.75} aria-hidden="true" />
                  <span className="font-mono text-[12px] tabular-nums">{tab.label}</span>
                  {tab.isMyTurn && (
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full bg-ink/60 animate-pulse"
                      title={t('game.yourTurn')}
                      aria-label={t('game.yourTurn')}
                    />
                  )}
                  {tab.unreadCount > 0 && (
                    <span className="rounded-[4px] border border-line-strong bg-surface-2 px-1 py-0 font-mono text-[10px] font-semibold leading-4 text-ink tabular-nums">
                      {tab.unreadCount > 99 ? '99+' : tab.unreadCount}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={onCloseSession}
                  aria-label={t('home.closeTab', { label: tab.label })}
                  title={t('home.closeTab', { label: tab.label })}
                  className="ml-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] text-subtle opacity-65 transition-colors hover:bg-surface-3 hover:text-ink group-hover:opacity-100"
                >
                  <X size={11} strokeWidth={2} aria-hidden="true" />
                </button>
              </div>
            );
          })}

          {sessionTab && (
            <button
              type="button"
              onClick={() => onSelectSurface('lobby')}
              aria-label={t('home.newTabTitle')}
              title={t('home.newTabTitle')}
              className="mx-1 mb-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[5px] text-subtle transition-colors hover:bg-surface-2 hover:text-ink"
            >
              <Plus size={13.5} strokeWidth={1.85} aria-hidden="true" />
            </button>
          )}
        </div>

        <div className="flex h-full shrink-0 items-end border-l border-line">
          <button
            type="button"
            role="tab"
            aria-selected={activeSurface === 'leaderboard'}
            data-active={activeSurface === 'leaderboard' ? 'true' : undefined}
            onClick={() => onSelectSurface('leaderboard')}
            className="orca-tab"
          >
            <Trophy size={14} strokeWidth={1.75} aria-hidden="true" />
            <span>{t('home.navLeaderboard')}</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeSurface === 'history'}
            data-active={activeSurface === 'history' ? 'true' : undefined}
            onClick={() => onSelectSurface('history')}
            className="orca-tab"
          >
            <History size={14} strokeWidth={1.75} aria-hidden="true" />
            <span>{t('home.navHistory')}</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeSurface === 'settings'}
            data-active={activeSurface === 'settings' ? 'true' : undefined}
            onClick={() => onSelectSurface('settings')}
            className="orca-tab"
          >
            <SlidersHorizontal size={14} strokeWidth={1.75} aria-hidden="true" />
            <span>{t('home.navSettings')}</span>
          </button>
        </div>
      </nav>

      {/* Right: Mode Switcher, Pair Mobile, Lang, Theme (Profile lives in Sidebar) */}
      <div className="flex shrink-0 items-center gap-1.5">
        {appMode === 'sheets' && !inMatch && (
          <Badge tone="accent" className="px-1.5 py-0 font-mono text-[10.5px]">
            <span title={t('common.modeSheetsReady')}>GGS · Ctrl+Q</span>
          </Badge>
        )}

        <SegmentedControl
          size="xs"
          value={appMode}
          options={modeOptions}
          onChange={setAppMode}
          ariaLabel={t('settings.workspaceMode')}
        />

        {pairingValue && (
          <Button
            variant="secondary"
            size="xs"
            onClick={() => {
              if (pairingValue.canPair) pairingValue.openPairModal();
              else openAuthModal('signin');
            }}
            title={
              pairingValue.phoneConnected
                ? t('pair.connected')
                : pairingValue.canPair
                  ? t('pair.button')
                  : t('pair.signInFirst')
            }
            aria-label={t('pair.button')}
          >
            <Smartphone size={13} strokeWidth={1.75} aria-hidden="true" />
            <span className="hidden xl:inline">{t('pair.button')}</span>
            {pairingValue.phoneConnected && (
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-success" aria-hidden="true" />
            )}
          </Button>
        )}

        <button
          type="button"
          onClick={() => setLanguage(lang === 'en' ? 'vi' : 'en')}
          aria-label={t('common.language')}
          title={`${t('common.language')}: ${lang === 'en' ? 'English' : 'Tiếng Việt'}`}
          className="inline-flex h-6 items-center justify-center rounded-[5px] border border-line bg-surface-2 px-1.5 font-mono text-[11px] font-medium uppercase text-muted transition-colors hover:bg-surface-3 hover:text-ink"
        >
          {lang}
        </button>

        <IconButton
          size="sm"
          onClick={onToggleTheme}
          aria-label={t('common.toggleTheme')}
          title={t('common.toggleTheme')}
        >
          {isDark ? (
            <Sun size={14} strokeWidth={1.75} aria-hidden="true" />
          ) : (
            <Moon size={14} strokeWidth={1.75} aria-hidden="true" />
          )}
        </IconButton>
      </div>
    </header>
  );
};
