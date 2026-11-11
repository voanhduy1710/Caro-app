import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Home, Loader2, MonitorSmartphone } from 'lucide-react';
import { PracticeMatchView } from '../../app/PracticeMatchView';
import { AuthModal } from '../auth/AuthModal';
import { useAuth, type UserProfile } from '../auth/AuthContext';
import type { StringKey } from '../i18n/strings';
import { useT } from '../i18n/language';
import { OpponentProfileModal } from '../profile/OpponentProfileModal';
import { ProfileModal } from '../profile/ProfileModal';
import { OnlineRoom } from '../room/OnlineRoom';
import { RoomConfirmDialog } from '../room/OnlineRoomOverlays';
import type { RoomApi } from '../room/useRoomCore';
import { SettingsAndThemeModal } from '../settings/SettingsAndThemeModal';
import { pairErrorFor, pairErrorKey } from './pairErrors';
import type { PairOffer } from './pairLink';
import { clearStoredPair } from './pairRoute';
import { usePairRemote } from './usePairRemote';

const END_KEYS: Record<string, StringKey> = {
  replaced: 'pair.ended.replaced',
  game_ended: 'pair.ended.game_ended',
  unpaired: 'pair.ended.unpaired',
  desktop_closed: 'pair.ended.desktop_closed',
};

/** A centred message: connecting, an error, or the pairing's end. */
const PairNotice: React.FC<{ busy?: boolean; text: string; hint?: string; children?: React.ReactNode }> = ({ busy, text, hint, children }) => (
  <div className="flex flex-1 items-center justify-center p-6">
    <div className="card flex w-full max-w-sm flex-col items-center gap-4 p-6 text-center" role={busy ? 'status' : 'alert'}>
      {busy
        ? <Loader2 size={28} className="animate-spin text-muted" aria-hidden="true" />
        : <AlertTriangle size={28} strokeWidth={2.25} className="text-muted" aria-hidden="true" />}
      <p className="text-ink">{text}</p>
      {hint && <p className="text-sm text-muted">{hint}</p>}
      {children}
    </div>
  </div>
);

const BackHome: React.FC<{ onHome: () => void }> = ({ onHome }) => {
  const t = useT();
  return (
    <button type="button" onClick={onHome} className="btn btn-primary w-full">
      <Home size={18} strokeWidth={2.25} aria-hidden="true" />
      <span>{t('pair.backHome')}</span>
    </button>
  );
};

/** The live pairing: handshake, then the desktop's game mirrored on this phone. */
const RemoteSession: React.FC<{ offer: PairOffer; user: UserProfile; onHome: () => void }> = ({ offer, user, onHome }) => {
  const t = useT();
  const { openProfileModal } = useAuth();
  const remote = usePairRemote(offer, user);
  const { unpair, status } = remote;
  const exitRef = useRef<(() => void) | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [opponent, setOpponent] = useState<UserProfile | null>(null);

  // Unpairing on the phone tells the desktop, then returns this phone home.
  const unpairAndGoHome = useCallback(() => {
    unpair();
    onHome();
  }, [unpair, onHome]);

  const over = status === 'ended' || status === 'error';
  useEffect(() => {
    if (over) clearStoredPair();
  }, [over]);

  const room = useMemo<RoomApi | null>(
    () => (remote.room ? { ...remote.room, leaveRoom: unpairAndGoHome } : null),
    [remote.room, unpairAndGoHome],
  );
  const practice = remote.practice
    ? { ...remote.practice, onExit: unpairAndGoHome, openProfileModal, setOpponent }
    : null;
  const { pendingRematch, dismissRematch } = remote;
  const rematchCopy = { title: t('home.newGameTitle'), body: t('home.newGameBody'), confirmLabel: t('home.newGameConfirm'), cancelLabel: t('home.keepPlaying') };
  const rematchConfirm = pendingRematch ? { ...rematchCopy, sheet: rematchCopy, onConfirm: pendingRematch } : null;

  if (status === 'error') {
    return <PairNotice text={t(pairErrorKey(remote.error ?? 'no_desktop'))}><BackHome onHome={onHome} /></PairNotice>;
  }
  if (status === 'ended') {
    return <PairNotice text={t(END_KEYS[remote.endReason ?? ''] ?? 'pair.ended.desktop_closed')}><BackHome onHome={onHome} /></PairNotice>;
  }
  if (status === 'connecting' || (!room && !practice)) return <PairNotice busy text={t('pair.connecting')} />;

  const phase = room?.state?.phase;
  return (
    <>
      <div className="flex items-center justify-between gap-2 border-b border-line bg-surface px-3 py-1.5 text-sm">
        <span className="flex min-w-0 items-center gap-2 text-muted">
          <MonitorSmartphone size={16} strokeWidth={2.25} aria-hidden="true" className="shrink-0" />
          <span className="truncate">{t('pair.pairedWithDesktop')}</span>
        </span>
        <button type="button" onClick={unpairAndGoHome} className="btn btn-ghost btn-sm text-danger hover:text-danger">
          {t('pair.unpair')}
        </button>
      </div>
      <main className="flex w-full flex-1 flex-col p-0">
        {room && (
          <OnlineRoom room={room} user={user} onOpenRules={() => setRulesOpen(true)} onViewMyProfile={openProfileModal} onViewProfile={setOpponent} exitRef={exitRef} />
        )}
        {practice && <PracticeMatchView {...practice} />}
      </main>
      {room?.state && (
        <SettingsAndThemeModal
          isOpen={rulesOpen}
          onClose={() => setRulesOpen(false)}
          settings={room.state.settings}
          onUpdateSettings={(next) => room.updateSettings(next)}
          isHost={room.isHost}
          gameStatus={phase === 'waiting' || phase === 'ended' ? 'lobby' : 'playing'}
          myPiece={room.mySeat ?? undefined}
        />
      )}
      <OpponentProfileModal opponent={opponent} isOpen={Boolean(opponent)} onClose={() => setOpponent(null)} />
      <RoomConfirmDialog spec={rematchConfirm} onDismiss={dismissRematch} />
      {remote.notice && (
        <div role="status" aria-live="polite" className="fixed bottom-24 left-1/2 z-[60] -translate-x-1/2 rounded-full bg-inverse px-4 py-2 text-xs font-medium text-inverse-fg shadow-lg">
          {t(remote.notice)}
        </div>
      )}
    </>
  );
};

/**
 * What a phone shows after opening a pairing link: sign-in and account checks
 * first, then the mirrored game. `offer` is null when the link did not decode.
 */
export const RemoteMatchApp: React.FC<{ offer: PairOffer | null; onHome: () => void }> = ({ offer, onHome }) => {
  const t = useT();
  const { user, loading, openAuthModal } = useAuth();
  const preError = loading ? null : pairErrorFor(offer, user);

  const goHome = useCallback(() => {
    clearStoredPair();
    onHome();
  }, [onHome]);

  // A signed-out phone is asked to sign in once; the button reopens it.
  const askedSignInRef = useRef(false);
  useEffect(() => {
    if (preError !== 'not_signed_in' || askedSignInRef.current) return;
    askedSignInRef.current = true;
    openAuthModal('signin');
  }, [preError, openAuthModal]);

  // Only a missing sign-in can still be fixed here; any other check failure ends this pairing.
  useEffect(() => {
    if (preError && preError !== 'not_signed_in') clearStoredPair();
  }, [preError]);

  let body: React.ReactNode;
  if (loading) body = <PairNotice busy text={t('pair.connecting')} />;
  else if (preError === 'not_signed_in') {
    body = (
      <PairNotice text={t(pairErrorKey(preError))} hint={t('pair.signInSameAccount')}>
        <button type="button" onClick={() => openAuthModal('signin')} className="btn btn-primary w-full">{t('pair.signInFirst')}</button>
        <button type="button" onClick={goHome} className="btn btn-ghost w-full">{t('pair.backHome')}</button>
      </PairNotice>
    );
  } else if (preError) {
    body = (
      <PairNotice text={t(pairErrorKey(preError))} hint={preError === 'other_account' ? t('pair.signInSameAccount') : undefined}>
        <BackHome onHome={goHome} />
      </PairNotice>
    );
  } else if (offer && user) {
    body = <RemoteSession key={offer.secret} offer={offer} user={user} onHome={goHome} />;
  }

  return (
    <div className="flex min-h-[100dvh] flex-col bg-surface-2 text-ink selection:bg-accent selection:text-accent-fg">
      {body}
      <AuthModal />
      <ProfileModal />
    </div>
  );
};
