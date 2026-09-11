import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Link2, UserMinus } from 'lucide-react';
import { getAvatarPublicUrl } from '../avatar/avatarService';
import { TEASE_PHRASE } from './protocol';
import type { Seat } from './protocol';
import { TEASE_PAIR_COOLDOWN_MS, TEASE_SENDER_COOLDOWN_MS } from './roomEngine';
import type { Member } from './roomEngine';

interface RoomRosterProps {
  members: Member[];
  seats: { X: string | null; O: string | null };
  myMemberId: string | null;
  capacity: number;
  graceSecondsLeft: (memberId: string) => number | null;
  onTease: (memberId: string) => void;
  /** The host's way to free a seat held by someone who is not coming back. */
  onClearSeat?: (seat: Seat) => void;
  onViewProfile?: (member: Member) => void;
  onCopyInvite?: () => void;
  /** Collapsed to one line until opened: a phone has no room for the list by default. */
  collapsible?: boolean;
}

/**
 * Everyone in the room, seated or watching, with the quick tease under each
 * name. The tease is the owner's in-joke for a viewer who keeps giving advice:
 * "if you're so good, you play". It stays in Vietnamese on purpose.
 */
export const RoomRoster: React.FC<RoomRosterProps> = ({
  members,
  seats,
  myMemberId,
  capacity,
  graceSecondsLeft,
  onTease,
  onClearSeat,
  onViewProfile,
  onCopyInvite,
  collapsible = false,
}) => {
  const [open, setOpen] = useState(!collapsible);
  // The host has the final say on cooldowns; this only keeps the button from
  // inviting a tap the host would refuse.
  const [sentTo, setSentTo] = useState<Record<string, number>>({});
  const [lastSentAt, setLastSentAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  const coolingDown = Object.values(sentTo).some((t) => now - t < TEASE_PAIR_COOLDOWN_MS);
  useEffect(() => {
    if (!coolingDown) return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [coolingDown]);

  const me = members.find((m) => m.id === myMemberId);
  const iAmHost = Boolean(me?.isHost);
  const watching = members.filter((m) => m.id !== seats.X && m.id !== seats.O).length;

  const seatOfMember = (id: string): Seat | null => (seats.X === id ? 'X' : seats.O === id ? 'O' : null);

  const waitFor = (id: string) => {
    const pair = sentTo[id] ? TEASE_PAIR_COOLDOWN_MS - (now - sentTo[id]) : 0;
    const sender = lastSentAt ? TEASE_SENDER_COOLDOWN_MS - (now - lastSentAt) : 0;
    return Math.max(0, pair, sender);
  };

  const tease = (member: Member) => {
    if (waitFor(member.id) > 0 || !member.connected) return;
    const at = Date.now();
    setSentTo((prev) => ({ ...prev, [member.id]: at }));
    setLastSentAt(at);
    setNow(at);
    onTease(member.id);
  };

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
            const wait = waitFor(member.id);
            const teaseBlocked = wait > 0 || !member.connected;
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
                    <p className="mt-0.5 text-[11px] font-medium text-warning">Reconnecting {grace}s</p>
                  )}
                  {!isMe && (
                    <button
                      type="button"
                      onClick={() => tease(member)}
                      aria-disabled={teaseBlocked}
                      aria-label={`Tease ${member.profile.name}: ${TEASE_PHRASE}`}
                      title={
                        !member.connected
                          ? `${member.profile.name} is reconnecting`
                          : wait > 0
                          ? `Wait ${Math.ceil(wait / 1000)}s`
                          : `Tease ${member.profile.name}`
                      }
                      className="btn btn-tonal btn-sm mt-1 h-7 px-2 text-[11px]"
                    >
                      {TEASE_PHRASE} <span aria-hidden="true">😡</span>
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
