import React, { useState } from 'react';
import { ArrowRightLeft, ChevronDown, ChevronUp, Link2, UserMinus, UserX } from 'lucide-react';
import { getAvatarPublicUrl } from '../avatar/avatarService';
import { formatReconnectDuration } from '../../shared/utils/formatDuration';
import { useT } from '../i18n/language';
import type { Seat } from './protocol';
import { SEATS } from './roomEngine';
import { IconButton } from '../../shared/ui/primitives';
import type { RoomRosterProps } from './RoomRoster';

/**
 * Orca style (PR 5): everyone in the room, seated or watching.
 * Clean IDE member list with compact 24px avatars, seat badges (X/O/T), Host tag, ELO tabular-nums,
 * profile click, and host Pass baton / Remove from seat / Kick icon buttons.
 */
export const RoomRosterOrca: React.FC<RoomRosterProps> = ({
  members,
  seats,
  myMemberId,
  capacity,
  graceSecondsLeft,
  onPassBaton,
  onClearSeat,
  onKick,
  onViewProfile,
  onCopyInvite,
  collapsible = false,
  showSeats = true,
}) => {
  const t = useT();
  const [open, setOpen] = useState(!collapsible);
  const me = members.find((m) => m.id === myMemberId);
  const iAmHost = Boolean(me?.isHost);
  const watching = showSeats
    ? members.filter((m) => !SEATS.some((seat) => seats[seat] === m.id)).length
    : 0;

  const seatOfMember = (id: string): Seat | null =>
    SEATS.find((seat) => seats[seat] === id) ?? null;

  const seatBadgeClass = (seat: Seat) => {
    switch (seat) {
      case 'X':
        return 'chip-accent text-accent-text font-bold';
      case 'O':
        return 'border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400 font-bold';
      case 'T':
        return 'border-purple-500/30 bg-purple-500/10 text-purple-600 dark:text-purple-400 font-bold';
      default:
        return 'text-muted';
    }
  };

  const header = (
    <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-line bg-surface-2/40">
      {collapsible ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex min-w-0 items-center gap-1.5 text-left text-xs font-semibold text-ink cursor-pointer"
        >
          <span>{t('room.roster.inRoom', { count: members.length, capacity })}</span>
          {watching > 0 && (
            <span className="chip px-1.5 py-0 text-[10px] text-muted">
              {t('room.roster.watchingCount', { count: watching })}
            </span>
          )}
          {open ? (
            <ChevronUp size={13} strokeWidth={1.75} aria-hidden="true" />
          ) : (
            <ChevronDown size={13} strokeWidth={1.75} aria-hidden="true" />
          )}
        </button>
      ) : (
        <div className="flex items-center gap-1.5 min-w-0">
          <h2 className="text-xs font-semibold text-ink">
            {t('room.roster.inRoom', { count: members.length, capacity })}
          </h2>
          {watching > 0 && (
            <span className="chip px-1.5 py-0 text-[10px] text-muted">
              {t('room.roster.watchingCount', { count: watching })}
            </span>
          )}
        </div>
      )}
      {onCopyInvite && (
        <IconButton
          size="sm"
          onClick={onCopyInvite}
          title={t('common.copyInviteLink')}
          aria-label={t('common.copyInviteLink')}
          className="text-muted hover:text-ink"
        >
          <Link2 size={13} strokeWidth={1.75} aria-hidden="true" />
        </IconButton>
      )}
    </div>
  );

  return (
    <section className="rounded-lg border border-line bg-surface overflow-hidden text-xs" aria-label={t('room.roster.people')}>
      {header}
      {open && (
        <ul className="max-h-80 space-y-0.5 overflow-y-auto px-1.5 py-1.5 scrollbar-orca">
          {members.map((member) => {
            const seat = seatOfMember(member.id);
            const isMe = member.id === myMemberId;
            const grace = graceSecondsLeft(member.id);

            return (
              <li
                key={member.id}
                className="flex items-center justify-between gap-1.5 rounded-md px-1.5 py-1 transition-colors hover:bg-surface-2/70"
              >
                <button
                  type="button"
                  onClick={() => onViewProfile?.(member)}
                  disabled={!onViewProfile}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left group cursor-pointer disabled:cursor-default"
                  title={t('room.roster.viewProfile', { name: member.profile.name })}
                  aria-label={t('room.roster.viewProfile', { name: member.profile.name })}
                >
                  <div className="relative shrink-0">
                    <img
                      src={getAvatarPublicUrl(member.profile.avatar)}
                      alt=""
                      aria-hidden="true"
                      onError={(e) => {
                        e.currentTarget.onerror = null;
                        e.currentTarget.src = getAvatarPublicUrl();
                      }}
                      className={`h-6 w-6 rounded-full border border-line bg-surface object-contain ${
                        member.connected ? '' : 'opacity-50 grayscale'
                      }`}
                    />
                    {!member.connected && (
                      <span
                        className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-surface bg-subtle"
                        aria-hidden="true"
                      />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1">
                      <span className="min-w-0 truncate text-xs font-medium text-ink group-hover:text-accent-text transition-colors">
                        {member.profile.name}
                      </span>
                      {member.isHost && (
                        <span className="chip px-1 py-0 text-[10px] font-semibold text-muted">
                          {t('common.host')}
                        </span>
                      )}
                      {showSeats && (
                        seat ? (
                          <span className={`chip px-1 py-0 text-[10px] font-mono ${seatBadgeClass(seat)}`}>
                            {seat}
                          </span>
                        ) : (
                          <span className="chip px-1 py-0 text-[10px] text-muted">
                            {t('room.roster.watching')}
                          </span>
                        )
                      )}
                      {isMe && (
                        <span className="chip chip-accent px-1 py-0 text-[10px]">
                          {t('common.you')}
                        </span>
                      )}
                      {member.profile.guest && !isMe && !/^guest\b/i.test(member.profile.name) && (
                        <span className="text-[10px] text-subtle">{t('room.roster.guest')}</span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      {grace !== null ? (
                        <p className="text-[10px] font-medium text-warning">
                          {t('room.reconnecting', { time: formatReconnectDuration(grace) })}
                        </p>
                      ) : typeof member.profile.elo === 'number' ? (
                        <span className="font-mono text-[10px] tabular-nums text-subtle">
                          {member.profile.elo} ELO
                        </span>
                      ) : null}
                    </div>
                  </div>
                </button>

                <div className="flex items-center gap-0.5 shrink-0">
                  {isMe && seat && watching > 0 && onPassBaton && (
                    <button
                      type="button"
                      onClick={onPassBaton}
                      title={t('room.roster.passBaton')}
                      aria-label={t('room.roster.passBaton')}
                      className="btn btn-secondary btn-sm h-6 px-1.5 text-[10.5px] gap-1 shrink-0"
                    >
                      <ArrowRightLeft size={11} strokeWidth={1.75} aria-hidden="true" />
                      <span className="hidden sm:inline">{t('room.roster.passBaton')}</span>
                    </button>
                  )}

                  {iAmHost && seat && !isMe && onClearSeat && (
                    <IconButton
                      size="sm"
                      onClick={() => onClearSeat(seat)}
                      className="h-6 w-6 text-muted hover:text-danger hover:bg-danger-soft/50 shrink-0"
                      title={t('room.roster.removeFromSeatTitle', { name: member.profile.name, seat })}
                      aria-label={t('room.roster.removeFromSeat', { name: member.profile.name, seat })}
                    >
                      <UserMinus size={13} strokeWidth={1.75} aria-hidden="true" />
                    </IconButton>
                  )}

                  {iAmHost && !isMe && !member.isHost && onKick && (
                    <IconButton
                      size="sm"
                      onClick={() => onKick(member)}
                      className="h-6 w-6 text-muted hover:text-danger hover:bg-danger-soft/50 shrink-0"
                      title={t('room.roster.kick', { name: member.profile.name })}
                      aria-label={t('room.roster.kick', { name: member.profile.name })}
                    >
                      <UserX size={13} strokeWidth={1.75} aria-hidden="true" />
                    </IconButton>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};
