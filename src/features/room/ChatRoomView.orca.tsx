/*
 * Orca style (PR 5) chat room: a channel bar (`# code`, invite, pair phone,
 * people, leave), the conversation filling the editor, and the roster as a
 * collapsible 260px right sidebar on desktop or a drawer on a phone. The chat
 * itself (feed, composer, lightbox) comes from ChatRoomView, which runs
 * useGameChat once for both styles.
 */
import React, { useContext, useState } from 'react';
import { Check, Copy, Hash, LogOut, Smartphone, Users, X } from 'lucide-react';
import { useT } from '../i18n/language';
import { Button, IconButton } from '../../shared/ui/primitives';
import { useIsDesktop } from '../../shared/hooks/useMediaQuery';
import { PairingContext } from '../pairing/PairingContext';
import type { ChatRoomViewProps } from './ChatRoomView';

export interface ChatRoomLayoutOrcaProps extends ChatRoomViewProps {
  chat: { feed: React.ReactNode; composer: React.ReactNode; lightbox: React.ReactNode };
}

export const ChatRoomLayoutOrca: React.FC<ChatRoomLayoutOrcaProps> = ({
  room,
  s,
  members,
  copyState,
  roomLink,
  copyRoomLink,
  requestExit,
  roster,
  hostLostStrip,
  confirmDialog,
  chat,
}) => {
  const t = useT();
  const isDesktop = useIsDesktop();
  const pairing = useContext(PairingContext);
  const [desktopRosterOpen, setDesktopRosterOpen] = useState(true);
  const [mobileRosterOpen, setMobileRosterOpen] = useState(false);

  const isRosterOpen = isDesktop ? desktopRosterOpen : mobileRosterOpen;
  const toggleRoster = () => {
    if (isDesktop) setDesktopRosterOpen((open) => !open);
    else setMobileRosterOpen((open) => !open);
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-editor text-ink">
      <header className="flex h-11 shrink-0 select-none items-center justify-between border-b border-line bg-sidebar px-3">
        <div className="flex min-w-0 items-center gap-2">
          <Hash size={15} strokeWidth={2} className="shrink-0 text-muted" aria-hidden="true" />
          <span className="font-mono text-sm font-semibold tracking-wider text-ink">{s.roomId}</span>
          <span className="hidden border-l border-line pl-2 text-xs font-medium text-muted sm:inline">
            {t('room.chat.title')}
          </span>
          <span className="chip px-1.5 py-0 font-mono text-[10px] tabular-nums text-muted">{members.length}</span>
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            variant={copyState === 'copied' ? 'tonal' : 'secondary'}
            size="sm"
            onClick={() => void copyRoomLink()}
            className="gap-1.5"
            title={copyState === 'copied' ? t('common.linkCopied') : t('common.copyInviteLink')}
            aria-label={copyState === 'copied' ? t('common.linkCopied') : t('common.copyInviteLink')}
          >
            {copyState === 'copied' ? (
              <Check size={13} strokeWidth={2} aria-hidden="true" />
            ) : (
              <Copy size={13} strokeWidth={1.75} aria-hidden="true" />
            )}
            <span className="hidden xs:inline">
              {copyState === 'copied' ? t('common.linkCopied') : t('common.copyInviteLink')}
            </span>
          </Button>

          {pairing && isDesktop && (
            <Button
              variant={pairing.phoneConnected ? 'tonal' : 'secondary'}
              size="sm"
              onClick={pairing.openPairModal}
              disabled={!pairing.canPair}
              title={
                pairing.needsSignIn
                  ? t('pair.signInFirst')
                  : pairing.phoneConnected
                    ? t('pair.connected')
                    : t('pair.title')
              }
              className="gap-1.5"
            >
              <Smartphone size={13} strokeWidth={1.75} aria-hidden="true" />
              <span className="hidden md:inline">{pairing.phoneConnected ? t('pair.connected') : t('pair.button')}</span>
            </Button>
          )}

          <IconButton
            size="sm"
            active={isRosterOpen}
            onClick={toggleRoster}
            aria-expanded={isRosterOpen}
            title={t('room.roster.people')}
            aria-label={t('room.roster.people')}
          >
            <Users size={15} strokeWidth={1.75} aria-hidden="true" />
          </IconButton>

          <Button
            variant="ghost"
            size="sm"
            onClick={requestExit}
            className="gap-1 text-muted hover:bg-danger-soft/50 hover:text-danger"
            aria-label={room.isHost ? t('common.closeRoom') : t('common.leaveRoom')}
          >
            <LogOut size={13} strokeWidth={1.75} aria-hidden="true" className="sm:hidden" />
            <span className="hidden sm:inline">{room.isHost ? t('common.closeRoom') : t('common.leaveRoom')}</span>
          </Button>
        </div>
      </header>

      {copyState === 'failed' && (
        <div className="flex items-center gap-2 border-b border-line bg-surface-2 px-3 py-1.5">
          <span className="shrink-0 text-xs text-muted">{t('room.chat.inviteLink')}:</span>
          <input
            type="text"
            readOnly
            value={roomLink}
            onFocus={(e) => e.currentTarget.select()}
            aria-label={t('room.chat.inviteLink')}
            className="field-input py-1 text-xs"
          />
        </div>
      )}

      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <main className="flex min-h-0 min-w-0 flex-1 flex-col bg-editor">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{chat.feed}</div>
          {chat.composer}
        </main>

        {desktopRosterOpen && (
          <aside className="scrollbar-orca hidden w-[260px] shrink-0 flex-col overflow-y-auto border-l border-line bg-sidebar p-2 lg:flex">
            {roster}
          </aside>
        )}

        {mobileRosterOpen && (
          <div
            className="scrollbar-orca animate-pop-in absolute inset-y-0 right-0 z-30 flex w-72 max-w-[85vw] flex-col overflow-y-auto border-l border-line-strong bg-sidebar p-2 shadow-e2 lg:hidden"
            role="dialog"
            aria-label={t('room.roster.people')}
          >
            <div className="mb-2 flex items-center justify-between border-b border-line px-1 pb-2">
              <span className="text-xs font-semibold text-ink">{t('room.roster.people')}</span>
              <IconButton size="sm" onClick={() => setMobileRosterOpen(false)} aria-label={t('common.close')}>
                <X size={14} strokeWidth={1.75} aria-hidden="true" />
              </IconButton>
            </div>
            {roster}
          </div>
        )}
      </div>

      {hostLostStrip}
      {confirmDialog}
      {chat.lightbox}
    </div>
  );
};
