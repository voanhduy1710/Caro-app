/* Orca mobile chrome (PR 5 src/app/shell/MobileChrome.tsx): 44px top bar and
   52px bottom tab bar, below 1024px. One live session. */
import React from 'react';
import {
  Bot,
  Hash,
  History,
  LayoutGrid,
  LogIn,
  MessageCircle,
  Moon,
  SlidersHorizontal,
  Sun,
  Trophy,
  X,
} from 'lucide-react';
import { useAuth } from '../../features/auth/AuthContext';
import { getAvatarPublicUrl } from '../../features/avatar/avatarService';
import { setLanguage, useLanguage, useT } from '../../features/i18n/language';
import { Button, IconButton, SegmentedControl } from '../../shared/ui/primitives';
import { cn } from '../../shared/ui/cn';
import type { SessionTabItem, WorkspaceSurface } from './types';
import { useAppVisualMode } from './useAppVisualMode';
import type { AppVisualMode } from './useAppVisualMode';

export interface MobileTopbarProps {
  activeSurface: WorkspaceSurface;
  onSelectSurface: (surface: WorkspaceSurface) => void;
  /** The one live room or bot game, if any (PR 5 allowed several). */
  sessionTab: SessionTabItem | null;
  onCloseSession: () => void;
  isDark: boolean;
  onToggleTheme: () => void;
}

const iconForSession = (kind: SessionTabItem['kind']) =>
  kind === 'bot' ? Bot : kind === 'chat' ? MessageCircle : Hash;

export const MobileTopbar: React.FC<MobileTopbarProps> = ({
  activeSurface,
  onSelectSurface,
  sessionTab,
  onCloseSession,
  isDark,
  onToggleTheme,
}) => {
  const t = useT();
  const lang = useLanguage();
  const { appMode, setAppMode } = useAppVisualMode();
  const { user, openAuthModal, openProfileModal } = useAuth();
  const signedIn = Boolean(user && !user.isGuest);

  const modeOptions: ReadonlyArray<{ value: AppVisualMode; label: React.ReactNode; title: string }> = [
    {
      value: 'orca',
      label: (
        <>
          <span className="sm:hidden">Orca</span>
          <span className="hidden sm:inline">{t('common.modeOrca')}</span>
        </>
      ),
      title: t('common.modeOrca'),
    },
    {
      value: 'sheets',
      label: t('common.modeSheets'),
      title: t('common.modeSheetsFull'),
    },
  ];

  return (
    <div className="flex lg:hidden w-full shrink-0 flex-col border-b border-line bg-sidebar select-none">
      <header className="flex h-11 min-h-[44px] w-full items-center justify-between gap-1.5 px-3">
        {/* Left: Brand */}
        <button
          type="button"
          onClick={() => onSelectSurface('lobby')}
          title={t('home.navBackHome')}
          aria-label={t('home.navLobby')}
          className="flex shrink-0 items-center gap-1.5 rounded-[6px] py-1 pr-1.5 transition-colors hover:bg-surface-2"
        >
          <img
            src="/caro-tab-logo.png?v=3"
            alt=""
            aria-hidden="true"
            className="h-[18px] w-[18px] shrink-0 rounded-[4px] object-contain"
          />
          <span className="text-[13.5px] font-semibold tracking-tight text-ink">Caro</span>
        </button>

        {/* Right: Mode Switcher, Lang, Theme, Avatar / Sign In */}
        <div className="flex min-w-0 shrink-0 items-center gap-1">
          <SegmentedControl
            size="xs"
            value={appMode}
            options={modeOptions}
            onChange={setAppMode}
            ariaLabel={t('settings.workspaceMode')}
          />

          <button
            type="button"
            onClick={() => setLanguage(lang === 'en' ? 'vi' : 'en')}
            aria-label={t('common.language')}
            title={`${t('common.language')}: ${lang === 'en' ? 'English' : 'Tiếng Việt'}`}
            className="inline-flex h-6 w-6 items-center justify-center rounded-[5px] border border-line bg-surface-2 font-mono text-[10.5px] font-medium uppercase text-muted transition-colors hover:bg-surface-3 hover:text-ink"
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

          {signedIn && user ? (
            <button
              type="button"
              onClick={openProfileModal}
              title={t('home.navEditProfile')}
              aria-label={t('home.navEditProfile')}
              className="inline-flex h-6 items-center gap-1.5 rounded-[5px] border border-line bg-surface-2 px-1 text-xs transition-colors hover:bg-surface-3 sm:pr-2"
            >
              <img
                src={getAvatarPublicUrl(user.photoURL)}
                alt=""
                aria-hidden="true"
                onError={(e) => {
                  e.currentTarget.onerror = null;
                  e.currentTarget.src = getAvatarPublicUrl();
                }}
                className="h-5 w-5 shrink-0 rounded-full bg-surface object-cover"
              />
              <span className="hidden font-mono text-[11px] tabular-nums text-muted sm:inline">
                {user.elo}
              </span>
            </button>
          ) : (
            <div className="flex items-center gap-1">
              {user && (
                <button
                  type="button"
                  onClick={openProfileModal}
                  title={t('home.navGuestProfile')}
                  aria-label={t('home.navGuestProfile')}
                  className="inline-flex h-6 w-6 items-center justify-center rounded-[5px] border border-line bg-surface-2 transition-colors hover:bg-surface-3"
                >
                  <img
                    src={getAvatarPublicUrl(user.photoURL)}
                    alt=""
                    aria-hidden="true"
                    onError={(e) => {
                      e.currentTarget.onerror = null;
                      e.currentTarget.src = getAvatarPublicUrl();
                    }}
                    className="h-[18px] w-[18px] rounded-full bg-surface object-cover"
                  />
                </button>
              )}
              <Button
                variant="primary"
                size="xs"
                onClick={() => openAuthModal('signin')}
                title={t('home.navSignIn')}
                className="px-2"
              >
                <LogIn size={12} strokeWidth={1.75} aria-hidden="true" />
                <span>{t('home.navSignIn')}</span>
              </Button>
            </div>
          )}
        </div>
      </header>

      {/* Mobile Open Session Tabs Strip (shown when one or more rooms/chats/bot are running) */}
      {sessionTab && (
        <div className="scrollbar-none flex items-center gap-1.5 overflow-x-auto border-t border-line px-3 py-1.5">
          {[sessionTab].map((tab) => {
            const active = activeSurface === 'match';
            const Icon = iconForSession(tab.kind);
            return (
              <div
                key="match"
                className={cn(
                  'inline-flex h-6 shrink-0 items-center gap-1 rounded-[5px] border pl-2 pr-1 text-xs transition-colors',
                  active
                    ? 'border-line-strong bg-surface-2 text-ink'
                    : 'border-line bg-surface text-muted',
                )}
              >
                <button
                  type="button"
                  onClick={() => onSelectSurface('match')}
                  className="inline-flex items-center gap-1 font-mono text-[11px] font-medium tabular-nums"
                >
                  <Icon size={12} strokeWidth={1.75} aria-hidden="true" />
                  <span>{tab.label}</span>
                  {tab.unreadCount > 0 && (
                    <span className="rounded-[3px] bg-surface-3 px-1 font-mono text-[10px] font-semibold text-ink">
                      {tab.unreadCount}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={onCloseSession}
                  aria-label={t('home.closeTab', { label: tab.label })}
                  className="inline-flex h-4 w-4 items-center justify-center rounded-[3px] text-subtle hover:text-ink"
                >
                  <X size={10} strokeWidth={2} aria-hidden="true" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export interface MobileBottomTabsProps {
  activeSurface: WorkspaceSurface;
  onSelectSurface: (surface: WorkspaceSurface) => void;
}

export const MobileBottomTabs: React.FC<MobileBottomTabsProps> = ({
  activeSurface,
  onSelectSurface,
}) => {
  const t = useT();

  const tabs: ReadonlyArray<{
    id: WorkspaceSurface;
    label: string;
    icon: typeof LayoutGrid;
  }> = [
    { id: 'lobby', label: t('home.navLobby'), icon: LayoutGrid },
    { id: 'leaderboard', label: t('home.navLeaderboard'), icon: Trophy },
    { id: 'history', label: t('home.navHistory'), icon: History },
    { id: 'settings', label: t('home.navSettings'), icon: SlidersHorizontal },
  ];

  return (
    <footer className="flex lg:hidden w-full shrink-0 border-t border-line bg-sidebar pb-[env(safe-area-inset-bottom)] select-none">
      <nav
        role="tablist"
        aria-label={t('home.workspaceSection')}
        className="grid h-[52px] w-full grid-cols-4"
      >
        {tabs.map((tab) => {
          const active = activeSurface === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onSelectSurface(tab.id)}
              className={cn(
                'relative flex flex-col items-center justify-center gap-0.5 px-1 transition-colors',
                active ? 'text-ink' : 'text-muted hover:text-ink',
              )}
            >
              {active && (
                <span
                  className="absolute inset-x-5 top-0 h-[2px] rounded-b-full bg-accent"
                  aria-hidden="true"
                />
              )}
              <Icon size={17} strokeWidth={active ? 2 : 1.75} aria-hidden="true" />
              <span className="max-w-full truncate text-[11px] font-medium leading-tight">
                {tab.label}
              </span>
            </button>
          );
        })}
      </nav>
    </footer>
  );
};
