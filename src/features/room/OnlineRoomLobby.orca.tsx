/*
 * Orca style (PR 5) waiting room: one card with a header bar (room kind, code,
 * invite, pair phone, rules, leave), the rules as chips, a grid of seat cards,
 * the roster, and the auto-start note as a footer. Same props and actions as
 * the Default OnlineRoomLobby; there is still no "ready" / "start" button, the
 * game starts by itself (room.autoStart*).
 */
import React, { useContext } from 'react';
import { Check, Copy, Globe, Lock, LogOut, Share2, SlidersHorizontal, Smartphone, UserMinus } from 'lucide-react';
import { getAvatarPublicUrl } from '../avatar/avatarService';
import { summariseRoomSettings } from '../settings/types';
import { formatReconnectDuration } from '../../shared/utils/formatDuration';
import { DEFAULT_ELO } from '../../shared/constants';
import { useIsDesktop } from '../../shared/hooks/useMediaQuery';
import { useT } from '../i18n/language';
import { PairingContext } from '../pairing/PairingContext';
import { useTheme } from '../theme/ThemeContext';
import { pieceColor } from '../theme/types';
import type { Seat } from './protocol';
import type { OnlineRoomLobbyProps } from './OnlineRoomLobby';

export const OnlineRoomLobbyOrca: React.FC<OnlineRoomLobbyProps> = ({
  room,
  s,
  me,
  isViewer,
  connected,
  occupantOf,
  copyState,
  roomLink,
  copyRoomLink,
  shareRoomLink,
  onOpenRules,
  requestExit,
  roster,
  hostLostStrip,
  confirmDialog,
  teaseToast,
}) => {
  const t = useT();
  const pairing = useContext(PairingContext);
  const isDesktop = useIsDesktop();
  const { theme } = useTheme();
  const modeLabel = t(s.mode === 'casual' ? 'room.modeCasual' : 'room.modeRanked');
  // Today's piece colours (PR 5 used its muted palette, which is not ported).
  const seatColor = (seat: Seat) => pieceColor(theme, seat);

  const seatCard = (seat: Seat) => {
    const occupant = occupantOf(seat);
    const isMine = occupant?.id === me;
    const grace = occupant ? room.graceSecondsLeft(occupant.id) : null;
    const color = seatColor(seat);
    // A seat held by someone who dropped is free to take between games.
    const canTakeSeat =
      (!occupant || (!occupant.connected && !occupant.isHost && (s.phase === 'waiting' || s.phase === 'ended'))) &&
      isViewer &&
      connected;

    return (
      <li key={seat} className="flex items-center gap-3 rounded-md border border-line bg-surface-2 p-3 transition-colors">
        <span
          className="grid h-8 w-8 shrink-0 place-items-center rounded-md border font-mono text-xs font-semibold"
          style={{ backgroundColor: `${color}18`, color, borderColor: `${color}45` }}
        >
          {seat === 'T' ? '△' : seat}
        </span>

        {occupant ? (
          <img
            src={getAvatarPublicUrl(occupant.profile.avatar)}
            alt=""
            aria-hidden="true"
            onError={(e) => {
              e.currentTarget.onerror = null;
              e.currentTarget.src = getAvatarPublicUrl();
            }}
            className={`h-9 w-9 shrink-0 rounded-full border border-line-strong bg-surface object-contain p-0.5 ${
              occupant.connected ? '' : 'opacity-50 grayscale'
            }`}
          />
        ) : (
          <span className="h-9 w-9 shrink-0 rounded-full border border-dashed border-line-strong bg-surface" aria-hidden="true" />
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`truncate text-xs font-semibold ${occupant ? 'text-ink' : 'text-subtle'}`}>
              {occupant ? occupant.profile.name : t('room.openSeat')}
            </span>
            {isMine && <span className="chip chip-accent px-1.5 py-0 text-[10px]">{t('common.you')}</span>}
            {occupant?.isHost && <span className="chip px-1.5 py-0 text-[10px]">{t('common.host')}</span>}
          </div>

          {occupant && (
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-muted">
              <span className="font-mono tabular-nums">{occupant.profile.elo ?? DEFAULT_ELO} ELO</span>
              {grace !== null && (
                <span className="font-mono font-medium tabular-nums text-warning">
                  {t('room.reconnecting', { time: formatReconnectDuration(grace) })}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {canTakeSeat && (
            <button type="button" onClick={() => room.takeSeat(seat)} className="btn btn-primary btn-sm">
              {t('room.takeSeat')}
            </button>
          )}
          {isMine && connected && (
            <button
              type="button"
              onClick={() => room.becomeViewer()}
              title={t('room.becomeViewer')}
              aria-label={t('room.becomeViewer')}
              className="orca-icon-btn text-muted hover:text-ink"
            >
              <LogOut size={15} strokeWidth={1.75} aria-hidden="true" />
            </button>
          )}
          {room.isHost && occupant && !isMine && (
            <button
              type="button"
              onClick={() => room.clearSeat(seat)}
              title={t('room.roster.removeFromSeatTitle', { name: occupant.profile.name, seat })}
              aria-label={t('room.roster.removeFromSeat', { name: occupant.profile.name, seat })}
              className="orca-icon-btn text-muted hover:text-danger"
            >
              <UserMinus size={15} strokeWidth={1.75} aria-hidden="true" />
            </button>
          )}
        </div>
      </li>
    );
  };

  return (
    <div className="mx-auto my-auto w-full max-w-3xl space-y-3 text-left">
      <div className="w-full overflow-hidden rounded-lg border border-line bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-line bg-sidebar px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`chip ${s.mode === 'ranked' ? 'chip-accent' : ''}`}>
              {s.isPublic ? (
                <Globe size={13} strokeWidth={1.75} aria-hidden="true" />
              ) : (
                <Lock size={13} strokeWidth={1.75} aria-hidden="true" />
              )}
              <span>{t(s.isPublic ? 'room.kindPublic' : 'room.kindPrivate', { mode: modeLabel })}</span>
            </span>

            <div className="inline-flex items-center gap-1.5 rounded-md border border-line-strong bg-surface px-2.5 py-1">
              <span className="text-[11px] font-medium text-muted">{t('room.code')}</span>
              <span className="font-mono text-xs font-semibold tracking-wider text-accent-text tabular-nums">{s.roomId}</span>
            </div>

            <button type="button" onClick={copyRoomLink} className="btn btn-tonal btn-sm">
              {copyState === 'copied' ? (
                <>
                  <Check size={15} strokeWidth={1.75} aria-hidden="true" />
                  <span>{t('common.linkCopied')}</span>
                </>
              ) : (
                <>
                  <Copy size={15} strokeWidth={1.75} aria-hidden="true" />
                  <span>{t('common.copyInviteLink')}</span>
                </>
              )}
            </button>

            {typeof navigator !== 'undefined' && 'share' in navigator && (
              <button type="button" onClick={shareRoomLink} className="btn btn-secondary btn-sm">
                <Share2 size={15} strokeWidth={1.75} aria-hidden="true" />
                <span>{t('room.share')}</span>
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {pairing && isDesktop && (
              <button
                type="button"
                onClick={pairing.openPairModal}
                disabled={!pairing.canPair}
                title={pairing.needsSignIn ? t('pair.signInFirst') : pairing.phoneConnected ? t('pair.connected') : undefined}
                className={`btn btn-sm ${pairing.phoneConnected ? 'btn-tonal' : 'btn-secondary'}`}
              >
                <Smartphone size={15} strokeWidth={1.75} aria-hidden="true" />
                <span>{pairing.phoneConnected ? t('pair.connected') : t('pair.button')}</span>
              </button>
            )}

            {room.isHost && (
              <button type="button" onClick={onOpenRules} className="btn btn-secondary btn-sm">
                <SlidersHorizontal size={15} strokeWidth={1.75} aria-hidden="true" />
                <span>{t('room.changeRules')}</span>
              </button>
            )}

            <button type="button" onClick={requestExit} className="btn btn-secondary btn-sm">
              <LogOut size={15} strokeWidth={1.75} aria-hidden="true" />
              <span>{room.isHost ? t('common.closeRoom') : t('common.leaveRoom')}</span>
            </button>
          </div>
        </div>

        <div className="space-y-4 p-4">
          {/* When the clipboard is blocked, hand over the link itself
              rather than a success message that was never true. */}
          {copyState === 'failed' && (
            <div className="field">
              <label htmlFor="manual-room-link" className="field-label">
                {t('room.clipboardBlocked')}
              </label>
              <input
                id="manual-room-link"
                type="text"
                readOnly
                value={roomLink}
                onFocus={(e) => e.currentTarget.select()}
                className="field-input font-mono text-xs"
              />
            </div>
          )}

          <div className="flex flex-wrap items-center gap-1.5">
            {summariseRoomSettings(s.settings).map((fact) => (
              <span key={fact.label} className="chip">
                <span>{fact.label}</span>
                <span className="font-mono font-semibold text-ink tabular-nums">{fact.value}</span>
              </span>
            ))}
          </div>

          <ul
            className={`grid gap-2.5 ${s.settings.playerMode === 'oneVsOneVsOne' ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}
            aria-label={t('room.seats')}
          >
            {seatCard('X')}
            {seatCard('O')}
            {s.settings.playerMode === 'oneVsOneVsOne' && seatCard('T')}
          </ul>

          <div className="-mx-3 pt-1">{roster}</div>
        </div>

        <div className="border-t border-line bg-sidebar px-4 py-2.5">
          <p className="text-xs text-muted">
            {t(s.settings.playerMode === 'oneVsOneVsOne' ? 'room.autoStart3' : 'room.autoStart2')}
          </p>
        </div>
      </div>

      {hostLostStrip}
      {confirmDialog}
      {teaseToast}
    </div>
  );
};
