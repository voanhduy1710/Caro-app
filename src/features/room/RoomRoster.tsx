import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Link2, UserMinus } from 'lucide-react';
import { getAvatarPublicUrl } from '../avatar/avatarService';
import { formatReconnectDuration } from '../../shared/utils/formatDuration';
import type { Seat } from './protocol';
import { SEATS } from './roomEngine';
import type { Member } from './roomEngine';

interface RoomRosterProps {
  members: Member[];
  seats: Record<Seat, string | null>;
  myMemberId: string | null;
  capacity: number;
  graceSecondsLeft: (memberId: string) => number | null;
  /** A seated player gives their seat to the people already watching. */
  onPassBaton?: () => void;
  /** The host's way to free a seat held by someone who is not coming back. */
  onClearSeat?: (seat: Seat) => void;
  onViewProfile?: (member: Member) => void;
  onCopyInvite?: () => void;
  /** Collapsed to one line until opened: a phone has no room for the list by default. */
  collapsible?: boolean;
}

/**
 * Everyone in the room, seated or watching. A seated player can explicitly
 * pass their seat to the watching group from their own roster row.
 */
export const RoomRoster: React.FC<RoomRosterProps> = ({
  members,
  seats,
  myMemberId,
  capacity,
  graceSecondsLeft,
  onPassBaton,
  onClearSeat,
  onViewProfile,
  onCopyInvite,
  collapsible = false,
}) => {
  const [open, setOpen] = useState(!collapsible);
  const me = members.find((m) => m.id === myMemberId);
  const iAmHost = Boolean(me?.isHost);
  const watching = members.filter((m) => !SEATS.some((seat) => seats[seat] === m.id)).length;

  const seatOfMember = (id: string): Seat | null => SEATS.find((seat) => seats[seat] === id) ?? null;

  const header = (
    <div className="flex items-center justify-between gap-2 px-3 py-2">
      {collapsible ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex min-w-0 items-center gap-1.5 text-left text-xs font-semibold text-ink"
        >
          <span>In the room · {members.length}/{capacity}</span>
          {watching > 0 && <span className="chip px-1.5 py-0 text-[11px]">{watching} watching</span>}
          {open ? <ChevronUp size={13} aria-hidden="true" /> : <ChevronDown size={13} aria-hidden="true" />}
        </button>
      ) : (
        <h2 className="text-xs font-semibold text-ink">
          In the room · {members.length}/{capacity}
        </h2>
      )}
      {onCopyInvite && (
        <button
          type="button"
          onClick={onCopyInvite}
          className="btn btn-ghost btn-icon h-8 w-8 shrink-0 rounded-full"
          title="Copy invite link"
          aria-label="Copy invite link"
        >
          <Link2 size={15} strokeWidth={2.25} aria-hidden="true" />
        </button>
      )}
    </div>
  );

  return (
    <section className="panel mx-3 mb-3 overflow-hidden" aria-label="People in the room">
      {header}
      {open && (
        <ul className="max-h-72 space-y-1 overflow-y-auto border-t border-line px-2 py-2">
          {members.map((member) => {
            const seat = seatOfMember(member.id);
            const isMe = member.id === myMemberId;
            const grace = graceSecondsLeft(member.id);
            return (
              <li key={member.id} className="flex items-start gap-2 rounded-md px-1.5 py-1.5">
                <button
                  type="button"
                  onClick={() => onViewProfile?.(member)}
                  disabled={!onViewProfile}
                  className="relative shrink-0"
                  title={`View ${member.profile.name}'s profile`}
                  aria-label={`View ${member.profile.name}'s profile`}
                >
                  <img
                    src={getAvatarPublicUrl(member.profile.avatar)}
                    alt=""
                    aria-hidden="true"
                    onError={(e) => {
                      e.currentTarget.onerror = null;
                      e.currentTarget.src = getAvatarPublicUrl();
                    }}
                    className={`h-9 w-9 rounded-full border-2 border-line bg-surface object-contain p-0.5 ${
                      member.connected ? '' : 'opacity-50 grayscale'
                    }`}
                  />
                  {!member.connected && (
                    <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-surface bg-subtle" aria-hidden="true" />
                  )}
                </button>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="min-w-0 truncate text-[13px] font-semibold text-ink">{member.profile.name}</span>
                    {member.isHost && <span className="chip px-1.5 py-0 text-[10px]">Host</span>}
                    {seat ? (
                      <span className="chip chip-accent px-1.5 py-0 text-[10px]">{seat}</span>
                    ) : (
                      <span className="chip px-1.5 py-0 text-[10px]">Watching</span>
                    )}
                    {isMe && <span className="chip chip-accent px-1.5 py-0 text-[10px]">You</span>}
                    {/* Guests are already named "Guest 4821"; only a guest who
                        picked another name needs telling apart from an account. */}
                    {member.profile.guest && !isMe && !/^guest\b/i.test(member.profile.name) && (
                      <span className="text-[10px] text-subtle">guest</span>
                    )}
                  </div>
                  {grace !== null && (
                    <p className="mt-0.5 text-[11px] font-medium text-warning">Reconnecting {formatReconnectDuration(grace)}</p>
                  )}
                  {isMe && seat && watching > 0 && onPassBaton && (
                    <button type="button" onClick={onPassBaton} className="btn btn-secondary btn-sm mt-1 h-7 px-2 text-[11px]">
                      Pass baton
                    </button>
                  )}
                </div>

                {iAmHost && seat && !isMe && onClearSeat && (
                  <button
                    type="button"
                    onClick={() => onClearSeat(seat)}
                    className="btn btn-ghost btn-icon h-8 w-8 shrink-0 rounded-full text-muted hover:text-danger"
                    title={`Remove ${member.profile.name} from seat ${seat}. They stay in the room as a viewer.`}
                    aria-label={`Remove ${member.profile.name} from seat ${seat}`}
                  >
                    <UserMinus size={15} strokeWidth={2.25} aria-hidden="true" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};
