/* Orca left sidebar (PR 5 src/app/shell/OrcaSidebar.tsx), one live session. */
import React, { useState } from 'react';
import {
  ArrowRight,
  Bot,
  Globe,
  Hash,
  LogIn,
  LogOut,
  MessageCircle,
  Plus,
  Swords,
  UserPlus,
  X,
} from 'lucide-react';
import { useAuth } from '../../features/auth/AuthContext';
import { getAvatarPublicUrl } from '../../features/avatar/avatarService';
import { useT } from '../../features/i18n/language';
import type { RoomMode } from '../../features/room/roomEngineTypes';
import type { ActiveRoomInfo } from '../../features/webrtc/roomDiscoveryService';
import { RankBadge } from '../../shared/components/RankBadge';
import { Badge, Button, IconButton } from '../../shared/ui/primitives';
import { cn } from '../../shared/ui/cn';
import { getRankTitle } from '../../shared/utils/rankTiers';
import type { SessionTabItem, WorkspaceSurface } from './types';

export interface OrcaSidebarProps {
  open: boolean;
  activeSurface: WorkspaceSurface;
  onSelectSurface: (surface: WorkspaceSurface) => void;
  /** The one live room or bot game, if any (PR 5 allowed several). */
  sessionTab: SessionTabItem | null;
  onCloseSession: () => void;
  onOpenBotTab: () => void;
  onOpenRoomTab: (isPublic: boolean, mode: RoomMode) => void;
  onJoinRoomTab: (roomCode: string) => void;
  availableRooms: ActiveRoomInfo[];
}

const iconForSession = (kind: SessionTabItem['kind']) =>
  kind === 'bot' ? Bot : kind === 'chat' ? MessageCircle : Hash;

export const OrcaSidebar: React.FC<OrcaSidebarProps> = ({
  open,
  activeSurface,
  onSelectSurface,
  sessionTab,
  onCloseSession,
  onOpenBotTab,
  onOpenRoomTab,
  onJoinRoomTab,
  availableRooms,
}) => {
  const t = useT();
  const { user, openAuthModal, openProfileModal, signOut } = useAuth();
  const signedIn = Boolean(user && !user.isGuest);
  const rank = getRankTitle(user?.elo ?? 1200);
  const [joinCode, setJoinCode] = useState('');

  if (!open) return null;

  const submitQuickJoin = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = joinCode.trim();
    if (!trimmed) return;
    onJoinRoomTab(trimmed);
    setJoinCode('');
  };

  return (
    <aside
      aria-label={t('home.workspaceSection')}
      className="hidden lg:flex w-[232px] shrink-0 flex-col border-r border-line bg-sidebar select-none"
    >
      {/* Top Account Card */}
      <div className="border-b border-line p-2.5">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={openProfileModal}
            title={signedIn ? t('home.navEditProfile') : t('home.navGuestProfile')}
            className="flex min-w-0 flex-1 items-center gap-2.5 rounded-[6px] p-1 text-left transition-colors hover:bg-surface-2"
          >
            <img
              src={getAvatarPublicUrl(user?.photoURL)}
              alt=""
              aria-hidden="true"
              onError={(e) => {
                e.currentTarget.onerror = null;
                e.currentTarget.src = getAvatarPublicUrl();
              }}
              className="h-8 w-8 shrink-0 rounded-full border border-line bg-surface object-cover"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-[13px] font-semibold leading-tight text-ink">
                  {user?.displayName ?? t('home.navGuest')}
                </span>
                <Badge
                  tone={signedIn ? 'accent' : 'neutral'}
                  className="shrink-0 px-1 py-0 text-[10px]"
                >
                  {signedIn ? rank.title : t('home.navGuest')}
                </Badge>
              </div>
              <div className="mt-0.5 flex items-center gap-1 font-mono text-[11px] tabular-nums text-muted">
                {signedIn && user ? (
                  <>
                    <RankBadge elo={user.elo} size={14} />
                    <span>
                      {user.elo} ELO · {user.wins}W–{user.losses}L
                    </span>
                  </>
                ) : (
                  <span>
                    {user?.elo ?? 1200} ELO · {user?.wins ?? 0}W–{user?.losses ?? 0}L
                  </span>
                )}
              </div>
            </div>
          </button>

          {signedIn && (
            <IconButton
              size="sm"
              onClick={signOut}
              aria-label={t('home.navSignOut')}
              title={t('home.navSignOut')}
            >
              <LogOut size={14} strokeWidth={1.75} aria-hidden="true" />
            </IconButton>
          )}
        </div>

        {!signedIn && (
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            <Button
              variant="secondary"
              size="xs"
              onClick={() => openAuthModal('signin')}
              title={t('home.navSignIn')}
              className="w-full"
            >
              <LogIn size={12} strokeWidth={1.75} aria-hidden="true" />
              <span>{t('home.navSignIn')}</span>
            </Button>
            <Button
              variant="primary"
              size="xs"
              onClick={() => openAuthModal('create')}
              title={t('home.navCreateAccount')}
              className="w-full"
            >
              <UserPlus size={12} strokeWidth={1.75} aria-hidden="true" />
              <span>{t('home.navSignUp')}</span>
            </Button>
          </div>
        )}
      </div>

      {/* Scrollable Session Explorer */}
      <div className="scrollbar-orca flex flex-1 min-h-0 flex-col gap-3 overflow-y-auto px-2 py-2.5">
        {/* 1. Open Session Tabs (Rooms, Chats, Bot) */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between px-2 pb-0.5">
            <span className="text-[11px] font-medium uppercase tracking-wider text-subtle">
              {t('home.openTabsSection')}
            </span>
            {sessionTab && (
              <span className="font-mono text-[10.5px] text-subtle tabular-nums">1</span>
            )}
          </div>

          {!sessionTab ? (
            <p className="px-2 py-1.5 text-[11.5px] text-subtle">{t('home.noOpenTabs')}</p>
          ) : (
            [sessionTab].map((tab) => {
              const active = activeSurface === 'match';
              const Icon = iconForSession(tab.kind);
              return (
                <div
                  key="match"
                  className={cn(
                    'group flex items-center gap-1 rounded-[6px] border px-1.5 py-1 transition-colors',
                    active
                      ? 'border-line-strong bg-surface-2 text-ink'
                      : 'border-transparent text-muted hover:bg-surface-2/70 hover:text-ink',
                  )}
                >
                  <button
                    type="button"
                    aria-current={active ? 'page' : undefined}
                    onClick={() => onSelectSurface('match')}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left outline-none"
                  >
                    <Icon
                      size={14}
                      strokeWidth={active ? 2 : 1.75}
                      aria-hidden="true"
                      className={cn('shrink-0', active ? 'text-ink' : 'text-subtle')}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate font-mono text-[12px] font-medium leading-4 tabular-nums">
                          {tab.label}
                        </span>
                        {tab.isMyTurn && (
                          <span
                            className="h-1.5 w-1.5 shrink-0 rounded-full bg-ink/60 animate-pulse"
                            title={t('game.yourTurn')}
                            aria-label={t('game.yourTurn')}
                          />
                        )}
                      </div>
                      {tab.subLabel && (
                        <p className="truncate text-[10.5px] leading-3.5 text-subtle">
                          {tab.subLabel}
                        </p>
                      )}
                    </div>

                    {tab.unreadCount > 0 && (
                      <span className="shrink-0 rounded-[4px] border border-line-strong bg-surface-3 px-1.5 py-0 font-mono text-[10px] font-semibold leading-4 text-ink tabular-nums">
                        {tab.unreadCount > 99 ? '99+' : tab.unreadCount}
                      </span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={onCloseSession}
                    aria-label={t('home.closeTab', { label: tab.label })}
                    title={t('home.closeTab', { label: tab.label })}
                    className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-[4px] text-subtle opacity-60 transition-colors hover:bg-surface-3 hover:text-ink group-hover:opacity-100"
                  >
                    <X size={12} strokeWidth={1.85} aria-hidden="true" />
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* 2. Open New Tab (Inline Code Join + Concurrent Room/Chat/Bot Launchers) */}
        <div className="flex flex-col gap-1 border-t border-line pt-2.5">
          <div className="px-2 pb-0.5 text-[11px] font-medium uppercase tracking-wider text-subtle">
            {t('home.newTabSection')}
          </div>

          <form onSubmit={submitQuickJoin} className="flex items-center gap-1 px-1 pb-1">
            <input
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              placeholder={t('home.joinCodePlaceholder')}
              aria-label={t('home.joinWithCode')}
              className="h-7 min-w-0 flex-1 rounded-[5px] border border-line-strong bg-surface px-2 font-mono text-[11.5px] uppercase tracking-wide text-ink placeholder:font-sans placeholder:normal-case placeholder:tracking-normal placeholder:text-subtle focus:border-ink/40 focus:outline-none"
            />
            <button
              type="submit"
              disabled={!joinCode.trim()}
              title={t('home.joinAction')}
              aria-label={t('home.joinAction')}
              className="inline-flex h-7 shrink-0 items-center gap-1 rounded-[5px] border border-line-strong bg-surface-2 px-2 text-[11.5px] font-medium text-ink transition-colors hover:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span>{t('home.joinAction')}</span>
              <ArrowRight size={11} strokeWidth={2} aria-hidden="true" />
            </button>
          </form>

          <button
            type="button"
            onClick={() => onOpenRoomTab(false, 'chat')}
            className="flex h-7 w-full items-center gap-2 rounded-[6px] px-2 text-left text-[12.5px] font-medium text-muted transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <MessageCircle size={14} strokeWidth={1.75} aria-hidden="true" className="shrink-0 text-subtle" />
            <span className="min-w-0 flex-1 truncate">{t('home.justChatting')}</span>
            <Plus size={12} strokeWidth={1.75} aria-hidden="true" className="shrink-0 text-subtle" />
          </button>

          <button
            type="button"
            onClick={() => onOpenRoomTab(true, 'ranked')}
            className="flex h-7 w-full items-center gap-2 rounded-[6px] px-2 text-left text-[12.5px] font-medium text-muted transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <Swords size={14} strokeWidth={1.75} aria-hidden="true" className="shrink-0 text-subtle" />
            <span className="min-w-0 flex-1 truncate">{t('home.orcaCreateRanked')}</span>
            <Plus size={12} strokeWidth={1.75} aria-hidden="true" className="shrink-0 text-subtle" />
          </button>

          <button
            type="button"
            onClick={() => onOpenRoomTab(true, 'casual')}
            className="flex h-7 w-full items-center gap-2 rounded-[6px] px-2 text-left text-[12.5px] font-medium text-muted transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <Globe size={14} strokeWidth={1.75} aria-hidden="true" className="shrink-0 text-subtle" />
            <span className="min-w-0 flex-1 truncate">{t('home.orcaCreateCasual')}</span>
            <Plus size={12} strokeWidth={1.75} aria-hidden="true" className="shrink-0 text-subtle" />
          </button>

          <button
            type="button"
            onClick={onOpenBotTab}
            className="flex h-7 w-full items-center gap-2 rounded-[6px] px-2 text-left text-[12.5px] font-medium text-muted transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <Bot size={14} strokeWidth={1.75} aria-hidden="true" className="shrink-0 text-subtle" />
            <span className="min-w-0 flex-1 truncate">{t('home.playVsBot')}</span>
            <Plus size={12} strokeWidth={1.75} aria-hidden="true" className="shrink-0 text-subtle" />
          </button>
        </div>

        {/* 3. Live Public Rooms (1-Click Open Tab) */}
        {availableRooms.length > 0 && (
          <div className="flex flex-col gap-1 border-t border-line pt-2.5">
            <div className="flex items-center justify-between px-2 pb-0.5">
              <span className="text-[11px] font-medium uppercase tracking-wider text-subtle">
                {t('home.publicRooms')}
              </span>
              <span className="font-mono text-[10.5px] text-subtle tabular-nums">
                {availableRooms.length}
              </span>
            </div>

            {availableRooms.slice(0, 6).map((rm) => {
              const alreadyOpen = sessionTab?.roomCode === rm.roomId;
              return (
                <button
                  key={rm.roomId}
                  type="button"
                  onClick={() => onJoinRoomTab(rm.roomId)}
                  className={cn(
                    'flex w-full items-center justify-between gap-2 rounded-[6px] px-2 py-1.5 text-left transition-colors hover:bg-surface-2',
                    alreadyOpen ? 'text-ink' : 'text-muted hover:text-ink',
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-[11.5px] font-semibold text-ink tabular-nums">
                        #{rm.roomId}
                      </span>
                      <span className="truncate text-[11px] text-subtle">{rm.hostName}</span>
                    </div>
                  </div>
                  <span className="shrink-0 font-mono text-[10.5px] text-subtle tabular-nums">
                    {rm.seatsFilled}/{rm.seats}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
};
