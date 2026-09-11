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

/** One shape for every clock on a seat, lit only on the seat whose move it is. */
const clockPill = (lit: boolean, urgent = false) =>
  `rounded-sm px-1 py-0.5 text-center text-[11px] font-semibold leading-4 transition-colors lg:px-2.5 lg:py-1 lg:text-sm lg:leading-tight ${
    lit ? (urgent ? 'bg-danger-solid text-danger-fg' : 'bg-accent text-accent-fg') : 'bg-surface-3 text-muted'
  }`;

interface SeatProps {
  name: string;
  photoURL?: string;
  piece: 'X' | 'O';
  color: string;
  clock: number;
  /** Seconds left for the move in hand. Only the seat on turn is given one. */
  moveClock: number;
  isTurn: boolean;
  /** Set on the right-hand seat, which a phone lays out from its outer edge in. */
  mirrored?: boolean;
  tag?: string;
  onClick?: () => void;
  disabled?: boolean;
  title: string;
}

/**
 * One player. From lg up the two seats sit one above the other in the side
 * column with the score between them, so each is centred on its own axis and
 * the pair reads as a single facing-off block rather than as two list rows.
 *
 * Below lg that column lands above the board, where a 96px portrait per seat
 * pushed the board off the first screen and then scrolled your own clock away
 * once you reached it. There the seats face each other across the score in one
 * short row instead, the right-hand one mirrored so both names sit against
 * their own portraits.
 */
const Seat: React.FC<SeatProps> = ({
  name,
  photoURL,
  piece,
  color,
  clock,
  moveClock,
  isTurn,
  mirrored = false,
  tag,
  onClick,
  disabled,
  title,
}) => {
  /* The move clock ends the match when it runs out, so it has to be on screen
     rather than inferred. It sits beside the total clock, not in place of it,
     and it takes the warning colour itself: the total clock turning red at five
     seconds said the whole bank was nearly spent when only the move was. */
  const hasMoveClock = moveClock > 0;
  const isUrgent = hasMoveClock && moveClock <= 5;

  /* The ring is the player's actual piece colour, so a seat and the marks it
     is putting on the board are visibly the same player. It thickens on turn
     rather than switching to a shared accent, which would have made both
     seats look alike at the one moment they must not. The glow goes through a
     variable because an inline shadow cannot follow a breakpoint, and the
     rail's 6px would swamp a 36px portrait. */
  const avatar = (
    <span
      className={`relative grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface transition-all lg:h-24 lg:w-24 ${
        isTurn
          ? 'animate-turn-bob border-[3px] shadow-[0_0_0_3px_var(--seat-glow)] lg:border-[6px] lg:shadow-[0_0_0_6px_var(--seat-glow)]'
          : 'border-2 border-line lg:border-4'
      }`}
      style={isTurn ? ({ borderColor: color, '--seat-glow': `${color}33` } as React.CSSProperties) : undefined}
    >
      <img
        src={getAvatarPublicUrl(photoURL)}
        alt=""
        aria-hidden="true"
        onError={(e) => {
          e.currentTarget.onerror = null;
          e.currentTarget.src = getAvatarPublicUrl();
        }}
        className="h-full w-full rounded-full object-contain p-0.5 lg:p-1.5"
      />
      {/* The piece rides on the portrait instead of sitting under the name:
          one glance answers "which one am I" without reading anything. */}
      <span
        className="absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center rounded-full border-2 border-surface font-display text-xs font-extrabold leading-none lg:h-9 lg:w-9 lg:border-4 lg:text-lg"
        style={{ backgroundColor: color, color: readableInk(color) }}
      >
        {piece}
      </span>
    </span>
  );

  const details = (
    <span
      className={`flex min-w-0 flex-1 flex-col gap-0.5 lg:flex-none lg:items-center lg:gap-2 lg:text-center ${
        mirrored ? 'items-end text-right' : 'items-start text-left'
      }`}
    >
      <span
        className={`flex min-w-0 max-w-full items-center gap-1 lg:flex-col lg:gap-1.5 ${
          mirrored ? 'flex-row-reverse' : ''
        }`}
      >
        <span className="min-w-0 truncate font-display text-sm font-bold leading-tight text-ink lg:max-w-[11rem] lg:text-lg">
          {name}
        </span>
        {/* The chip keeps its own size in the rail and only tightens on a
            phone, where it shares one line with the name. "Thinking" comes
            and goes with every bot move, so on a phone it sits on the clock
            row instead: on the name line it squeezed the bot's name to
            nothing at 320px, and the name flickered back after each move. */}
        {tag && (
          <span
            className={`chip chip-accent shrink-0 max-lg:px-1.5 max-lg:py-0 max-lg:text-[11px] max-lg:leading-4 ${
              tag === 'Thinking' ? 'max-lg:hidden' : ''
            }`}
          >
            {tag}
          </span>
        )}
      </span>
      {/* Always laid out on a phone, even empty, so the name does not jump each
          time the turn passes. The rail still drops it when there is nothing
          to show, as it always has. */}
      <span
        className={`flex h-5 items-center gap-0.5 lg:h-auto lg:gap-1.5 ${
          mirrored ? 'flex-row-reverse lg:flex-row' : ''
        } ${clock > 0 || isTurn ? '' : 'lg:hidden'}`}
      >
        {tag === 'Thinking' && (
          <span className="chip chip-accent shrink-0 px-1.5 py-0 text-[11px] leading-4 lg:hidden">{tag}</span>
        )}
        {clock > 0 && (
          <span className={`${clockPill(isTurn)} font-mono tabular-nums lg:min-w-[4.5rem]`}>
            {formatClock(clock)}
          </span>
        )}
        {hasMoveClock && (
          <span className={`${clockPill(true, isUrgent)} font-mono tabular-nums`}>
            {moveClock}s<span className="sr-only"> left for this move</span>
          </span>
        )}
        {clock <= 0 && isTurn && !hasMoveClock && (
          <span className={`${clockPill(true)} lg:min-w-[4.5rem]`}>Turn</span>
        )}
      </span>
    </span>
  );

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`flex min-w-0 flex-1 items-center gap-1.5 rounded-md p-1 transition-colors lg:w-full lg:flex-none lg:flex-col lg:gap-3 lg:p-3 ${
        mirrored ? 'flex-row-reverse' : ''
      } ${disabled ? 'cursor-default' : 'hover:bg-surface-3'}`}
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
  const opponentPiece: 'X' | 'O' = myPiece === 'X' ? 'O' : 'X';

  /* The phone row is sized for a 320px screen, where a seat showing both
     clocks beside a two-digit score is as wide as it gets: any larger and
     those clocks run over the score. Every size here has an lg: override, so
     the rail is untouched. */
  return (
    <div className="flex w-full items-center gap-1.5 p-2 lg:flex-col lg:gap-6 lg:px-4 lg:py-8">
      <Seat
        name={myUser?.displayName || 'You'}
        photoURL={myUser?.photoURL}
        piece={myPiece}
        color={myPiece === 'X' ? theme.xColor : theme.oColor}
        clock={myTotalTimeLeft}
        moveClock={isMyTurn ? turnTimeLeft : 0}
        isTurn={isMyTurn}
        tag="You"
        onClick={onViewMyProfile}
        title="View and edit your profile"
      />

      {/* Rounds won in this sitting. It is the only number both players watch
          between games, so it belongs between them rather than in a panel. */}
      <div className="flex shrink-0 flex-col items-center">
        <div className="mb-1 rounded-sm bg-accent px-2 py-0.5 font-display text-xs font-extrabold tracking-wider text-accent-fg shadow-[0_2px_0_var(--ui-accent-shadow)] lg:mb-2 lg:px-4 lg:py-1 lg:text-base lg:shadow-[0_3px_0_var(--ui-accent-shadow)]">
          VS
        </div>
        <div className="flex shrink-0 items-center gap-1 font-mono text-sm font-bold tabular-nums text-subtle lg:gap-2.5 lg:text-2xl">
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
        moveClock={isTheirTurn ? turnTimeLeft : 0}
        isTurn={isTheirTurn}
        mirrored
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
