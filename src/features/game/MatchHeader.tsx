import React from 'react';
import type { UserProfile } from '../auth/AuthContext';
import { getAvatarPublicUrl } from '../avatar/avatarService';
import { useTheme } from '../theme/ThemeContext';

interface MatchHeaderProps {
  myUser?: UserProfile | null;
  opponent?: UserProfile | null;
  myPiece: 'X' | 'O';
  currentTurn: 'X' | 'O';
  myTotalTimeLeft: number;
  opponentTotalTimeLeft: number;
  turnTimeLeft: number;
  gameStatus: 'lobby' | 'playing' | 'ended';
  /** Rounds won so far in this session, kept per seat rather than per name. */
  myScore: number;
  opponentScore: number;
  /** True while the bot is searching, so the wait reads as deliberate. */
  opponentThinking?: boolean;
  onViewMyProfile?: () => void;
  onViewOpponentProfile?: (opponent: UserProfile) => void;
}

/**
 * Piece colours are picked by the player in Settings, so no fixed ink is safe
 * on top of them. Relative luminance decides, and the crossover is the point
 * where white and INK_DARK are equally readable on the same colour - not the
 * midpoint of the range. Solving the WCAG ratio for those two inks puts it at
 * 0.2258; at the 0.42 this used to carry, a mid-bright colour took white when
 * dark ink was the readable choice, e.g. #10b981 at 2.54:1 instead of 5.71:1
 * and #f97316 at 2.80:1 instead of 5.17:1, both under the 3:1 floor.
 */
const INK_DARK = '#0d2b45';
const INK_LIGHT = '#ffffff';
const INK_CROSSOVER = 0.2258;

const readableInk = (hex: string) => {
  const c = hex.replace('#', '');
  if (c.length !== 6) return INK_LIGHT;
  const channel = (i: number) => {
    const v = parseInt(c.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const L = 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
  return L > INK_CROSSOVER ? INK_DARK : INK_LIGHT;
};

const formatClock = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

interface SeatProps {
  name: string;
  photoURL?: string;
  piece: 'X' | 'O';
  color: string;
  clock: number;
  isTurn: boolean;
  isUrgent: boolean;
  tag?: string;
  onClick?: () => void;
  disabled?: boolean;
  title: string;
}

/**
 * One player. The two seats sit one above the other in the side column with the
 * score between them, so each is centred on its own axis and the pair reads as
 * a single facing-off block rather than as two list rows.
 */
const Seat: React.FC<SeatProps> = ({
  name,
  photoURL,
  piece,
  color,
  clock,
  isTurn,
  isUrgent,
  tag,
  onClick,
  disabled,
  title,
}) => {
  /* The ring is the player's actual piece colour, so a seat and the marks it
     is putting on the board are visibly the same player. It thickens on turn
     rather than switching to a shared accent, which would have made both
     seats look alike at the one moment they must not. */
  const avatar = (
    <span
      className={`relative grid h-24 w-24 shrink-0 place-items-center rounded-full bg-surface transition-all ${
        isTurn ? 'animate-turn-bob border-[6px]' : 'border-4 border-line'
      }`}
      style={isTurn ? { borderColor: color, boxShadow: `0 0 0 6px ${color}33` } : undefined}
    >
      <img
        src={getAvatarPublicUrl(photoURL)}
        alt=""
        aria-hidden="true"
        onError={(e) => {
          e.currentTarget.onerror = null;
          e.currentTarget.src = getAvatarPublicUrl();
        }}
        className="h-full w-full rounded-full object-contain p-1.5"
      />
      {/* The piece rides on the portrait instead of sitting under the name:
          one glance answers "which one am I" without reading anything. */}
      <span
        className="absolute -bottom-1 -right-1 grid h-9 w-9 place-items-center rounded-full border-4 border-surface font-display text-lg font-extrabold leading-none"
        style={{ backgroundColor: color, color: readableInk(color) }}
      >
        {piece}
      </span>
    </span>
  );

  const details = (
    <span className="mt-3 flex min-w-0 flex-col items-center gap-2 text-center">
      <span className="flex flex-col items-center gap-1.5">
        <span className="max-w-[11rem] truncate font-display text-lg font-bold leading-tight text-ink">
          {name}
        </span>
        {tag && <span className="chip chip-accent shrink-0">{tag}</span>}
      </span>
      {(clock > 0 || isTurn) && (
        <span
          className={`min-w-[4.5rem] rounded-sm px-2.5 py-1 text-center text-sm font-semibold leading-tight transition-colors ${
            clock > 0 ? 'font-mono tabular-nums' : ''
          } ${
            isTurn
              ? isUrgent
                ? 'bg-danger-solid text-danger-fg'
                : 'bg-accent text-accent-fg'
              : 'bg-surface-3 text-muted'
          }`}
        >
          {clock > 0 ? formatClock(clock) : 'Turn'}
        </span>
      )}
    </span>
  );

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`flex w-full flex-col items-center rounded-md p-3 transition-colors ${
        disabled ? 'cursor-default' : 'hover:bg-surface-3'
      }`}
    >
      {avatar}
      {details}
    </button>
  );
};

export const MatchHeader: React.FC<MatchHeaderProps> = ({
  myUser,
  opponent,
  myPiece,
  currentTurn,
  myTotalTimeLeft,
  opponentTotalTimeLeft,
  turnTimeLeft,
  gameStatus,
  myScore,
  opponentScore,
  opponentThinking = false,
  onViewMyProfile,
  onViewOpponentProfile,
}) => {
  const { theme } = useTheme();
  const isPlaying = gameStatus === 'playing';
  const isMyTurn = isPlaying && currentTurn === myPiece;
  const isTheirTurn = isPlaying && currentTurn !== myPiece;
  const isUrgent = turnTimeLeft > 0 && turnTimeLeft <= 5;
  const opponentPiece: 'X' | 'O' = myPiece === 'X' ? 'O' : 'X';

  return (
    <div className="flex w-full flex-col items-center gap-6 px-4 py-8">
      <Seat
        name={myUser?.displayName || 'You'}
        photoURL={myUser?.photoURL}
        piece={myPiece}
        color={myPiece === 'X' ? theme.xColor : theme.oColor}
        clock={myTotalTimeLeft}
        isTurn={isMyTurn}
        isUrgent={isUrgent}
        tag="You"
        onClick={onViewMyProfile}
        title="View and edit your profile"
      />

      {/* Rounds won in this sitting. It is the only number both players watch
          between games, so it belongs between them rather than in a panel. */}
      <div className="flex flex-col items-center">
        <div className="mb-2 rounded-sm bg-accent px-4 py-1 font-display text-base font-extrabold tracking-wider text-accent-fg shadow-[0_3px_0_var(--ui-accent-shadow)]">
          VS
        </div>
        <div className="flex shrink-0 items-center gap-2.5 font-mono text-2xl font-bold tabular-nums text-subtle">
          <span className="text-ink">{myScore}</span>
          <span aria-hidden="true">-</span>
          <span className="text-ink">{opponentScore}</span>
          <span className="sr-only">
            Score: you {myScore}, opponent {opponentScore}
          </span>
        </div>
      </div>

      <Seat
        name={opponent?.displayName || 'Waiting…'}
        photoURL={opponent?.photoURL}
        piece={opponentPiece}
        color={opponentPiece === 'X' ? theme.xColor : theme.oColor}
        clock={opponentTotalTimeLeft}
        isTurn={isTheirTurn}
        isUrgent={isUrgent}
        tag={opponentThinking ? 'Thinking' : undefined}
        onClick={opponent ? () => onViewOpponentProfile?.(opponent) : undefined}
        disabled={!opponent}
        title={opponent ? "View opponent's profile and stats" : 'Waiting for an opponent'}
      />

      {/* Announced rather than drawn: the ring and the lit clock already carry
          this visually, and a screen reader needs it said once. */}
      <p aria-live="polite" className="sr-only">
        {isPlaying ? (isMyTurn ? 'Your turn' : 'Your opponent’s turn') : 'Match ended'}
      </p>
    </div>
  );
};
