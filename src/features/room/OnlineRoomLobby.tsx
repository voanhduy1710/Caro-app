import React from 'react';
import { Check, Copy, Globe, Lock, Share2 } from 'lucide-react';
import { getAvatarPublicUrl } from '../avatar/avatarService';
import { summariseRoomSettings } from '../settings/types';
import { formatReconnectDuration } from '../../shared/utils/formatDuration';
import type { Member, RoomState } from './roomEngine';
import type { Seat } from './protocol';
import type { RoomApi } from './useRoom';

export interface OnlineRoomLobbyProps {
  room: RoomApi; s: RoomState; me: string | null; isViewer: boolean; connected: boolean;
  occupantOf: (seat: Seat) => Member | null;
  copyState: 'idle' | 'copied' | 'failed'; roomLink: string;
  copyRoomLink: () => Promise<void>; shareRoomLink: () => Promise<void>; onOpenRules: () => void; requestExit: () => void;
  roster: React.ReactNode; hostLostStrip: React.ReactNode; confirmDialog: React.ReactNode; teaseToast: React.ReactNode;
}

export const OnlineRoomLobby: React.FC<OnlineRoomLobbyProps> = ({ room, s, me, isViewer, connected, occupantOf, copyState, roomLink, copyRoomLink, shareRoomLink, onOpenRules, requestExit, roster, hostLostStrip, confirmDialog, teaseToast }) => {
    const seatRow = (seat: Seat) => {
      const occupant = occupantOf(seat);
      const isMine = occupant?.id === me;
      const grace = occupant ? room.graceSecondsLeft(occupant.id) : null;
      return (
        <li key={seat} className="flex items-center gap-3 rounded-md border border-line bg-surface p-3">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent font-display text-sm font-extrabold text-accent-fg">
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
              className={`h-10 w-10 shrink-0 rounded-full border-2 border-line bg-surface object-contain p-0.5 ${
                occupant.connected ? '' : 'opacity-50 grayscale'
              }`}
            />
          ) : (
            <span className="h-10 w-10 shrink-0 rounded-full border-2 border-dashed border-line-strong bg-surface-2" aria-hidden="true" />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1">
              <span className={`truncate text-sm font-semibold ${occupant ? 'text-ink' : 'text-subtle'}`}>
                {occupant ? occupant.profile.name : 'Open seat'}
              </span>
              {isMine && <span className="chip chip-accent px-1.5 py-0 text-[10px]">You</span>}
              {occupant?.isHost && <span className="chip px-1.5 py-0 text-[10px]">Host</span>}
            </div>
            {grace !== null && <p className="text-[11px] font-medium text-warning">Reconnecting {formatReconnectDuration(grace)}</p>}
          </div>
          {!occupant && isViewer && connected && (
            <button onClick={() => room.takeSeat(seat)} className="btn btn-primary btn-sm shrink-0">
              Take seat
            </button>
          )}
        </li>
      );
    };

    return (
      <div className="w-full max-w-md space-y-4 text-left">
        <div className="panel space-y-4 p-5">
          <div className="flex items-start justify-between gap-3 border-b border-line pb-3">
            <div>
              <span className="block text-xs font-semibold text-muted">Room code</span>
              <span className="mt-0.5 flex items-center gap-1.5 text-xs font-medium text-subtle">
                {s.isPublic ? (
                  <>
                    <Globe size={13} strokeWidth={2.25} aria-hidden="true" />
                    <span>Public room</span>
                  </>
                ) : (
                  <>
                    <Lock size={13} strokeWidth={2.25} aria-hidden="true" />
                    <span>Private room</span>
                  </>
                )}
              </span>
            </div>
            <span className="font-mono text-lg font-semibold tracking-widest text-accent-text">{s.roomId}</span>
          </div>

          <div className="flex gap-2">
            <button onClick={copyRoomLink} className="btn btn-tonal btn-sm flex-1">
              {copyState === 'copied' ? (
                <>
                  <Check size={14} strokeWidth={2} aria-hidden="true" />
                  <span>Link copied</span>
                </>
              ) : (
                <>
                  <Copy size={14} strokeWidth={2.25} aria-hidden="true" />
                  <span>Copy invite link</span>
                </>
              )}
            </button>
            {typeof navigator !== 'undefined' && 'share' in navigator && (
              <button onClick={shareRoomLink} className="btn btn-secondary btn-sm shrink-0">
                <Share2 size={14} strokeWidth={2.25} aria-hidden="true" />
                <span>Share</span>
              </button>
            )}
          </div>

          {/* When the clipboard is blocked, hand over the link itself
              rather than a success message that was never true. */}
          {copyState === 'failed' && (
            <div className="field">
              <label htmlFor="manual-room-link" className="field-label">
                Your browser blocked the clipboard. Copy this link by hand:
              </label>
              <input
                id="manual-room-link"
                type="text"
                readOnly
                value={roomLink}
                onFocus={(e) => e.currentTarget.select()}
                className="field-input text-xs"
              />
            </div>
          )}

          <ul className="space-y-2" aria-label="Seats">
            {seatRow('X')}
            {seatRow('O')}
            {s.settings.playerMode === 'oneVsOneVsOne' && seatRow('T')}
          </ul>
          <p className="text-xs text-muted">
            The game starts by itself when {s.settings.playerMode === 'oneVsOneVsOne' ? 'all three seats are filled' : 'both seats are filled'}.
            The opening turn rotates after every game.
          </p>

          <div className="space-y-2 rounded-md border border-line bg-surface-2 p-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {summariseRoomSettings(s.settings).map((fact) => (
                <span key={fact.label} className="chip">
                  <span>{fact.label}</span>
                  <span className="font-semibold text-ink">{fact.value}</span>
                </span>
              ))}
            </div>
            {room.isHost && (
              <button type="button" onClick={onOpenRules} className="btn btn-secondary btn-sm">
                Change rules
              </button>
            )}
          </div>

          <button onClick={requestExit} className="btn btn-secondary w-full">
            {room.isHost ? 'Close room' : 'Leave room'}
          </button>
        </div>

        <div className="-mx-3">{roster}</div>
        {hostLostStrip}
        {confirmDialog}
        {teaseToast}
      </div>
    );
  }
