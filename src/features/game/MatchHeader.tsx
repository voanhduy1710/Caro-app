import React from 'react';
import { getAvatarPublicUrl } from '../avatar/avatarService';
import { useTheme } from '../theme/ThemeContext';

/**
 * One seat as the header draws it. The header does not know whether it is a
 * practice game or a room, or whether "you" are in it at all: the caller says
 * who sits where, and a viewer simply gets two seats that are not theirs.
 */
export interface SeatView {
  name: string;
  photoURL?: string | null;
  piece: 'X' | 'O';
  /** Total time left in seconds; 0 when the game has no total clock. */
  clock: number;
  /** Seconds left for the move in hand. Only the seat on turn is given one. */
  moveClock: number;
  isTurn: boolean;
  tag?: string;
  onClick?: () => void;
  title: string;
  /** Nobody sits here: drawn as an open seat. */
  empty?: boolean;
  /** Seconds before a dropped player's seat opens, while they reconnect. */
  reconnectingSeconds?: number | null;
  /** The one thing to do with this seat: take it, or give it up. */
  action?: { label: string; onClick: () => void; tone?: 'primary' | 'secondary' };
}

interface MatchHeaderProps {
  /** Drawn left to right on a phone and top to bottom in the rail. */
  seats: [SeatView, SeatView];
  /** Rounds won in this sitting, in the same order as the seats. */
  score: [number, number];
  /** Said once to screen readers whenever it changes. */
  announcement: string;
  /** The score in words, for screen readers. */
  scoreLabel: string;
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

interface SeatProps extends SeatView {
  color: string;
  /** Set on the right-hand seat, which a phone lays out from its outer edge in. */
  mirrored?: boolean;
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
  title,
  empty = false,
  reconnectingSeconds = null,
  action,
}) => {
  /* The move clock ends the match when it runs out, so it has to be on screen
     rather than inferred. It sits beside the total clock, not in place of it,
     and it takes the warning colour itself: the total clock turning red at five
     seconds said the whole bank was nearly spent when only the move was. */
  const hasMoveClock = moveClock > 0;
  const isUrgent = hasMoveClock && moveClock <= 5;
  const away = reconnectingSeconds !== null;

  /* The ring is the player's actual piece colour, so a seat and the marks it
     is putting on the board are visibly the same player. It thickens on turn
     rather than switching to a shared accent, which would have made both
     seats look alike at the one moment they must not. The glow goes through a
     variable because an inline shadow cannot follow a breakpoint, and the
     rail's 6px would swamp a 36px portrait. An open seat is a dashed outline
     with nobody in it. */
  const avatar = (
    <span
      className={`relative grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface transition-all lg:h-24 lg:w-24 ${
        empty
          ? 'border-2 border-dashed border-line-strong bg-surface-2 lg:border-4'
          : isTurn
          ? 'animate-turn-bob border-[3px] shadow-[0_0_0_3px_var(--seat-glow)] lg:border-[6px] lg:shadow-[0_0_0_6px_var(--seat-glow)]'
          : 'border-2 border-line lg:border-4'
      }`}
      style={isTurn && !empty ? ({ borderColor: color, '--seat-glow': `${color}33` } as React.CSSProperties) : undefined}
    >
      {!empty && (
        <img
          src={getAvatarPublicUrl(photoURL)}
          alt=""
          aria-hidden="true"
          onError={(e) => {
            e.currentTarget.onerror = null;
            e.currentTarget.src = getAvatarPublicUrl();
          }}
          className={`h-full w-full rounded-full object-contain p-0.5 lg:p-1.5 ${away ? 'opacity-40 grayscale' : ''}`}
        />
      )}
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
        <span
          className={`min-w-0 truncate font-display text-sm font-bold leading-tight lg:max-w-[11rem] lg:text-lg ${
            empty ? 'text-subtle' : 'text-ink'
          }`}
        >
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
        } ${clock > 0 || isTurn || away ? '' : 'lg:hidden'}`}
      >
        {away && (
          <span className="chip shrink-0 px-1.5 py-0 text-[11px] leading-4 text-warning">
            Reconnecting {reconnectingSeconds}s
          </span>
        )}
        {tag === 'Thinking' && (
          <span className="chip chip-accent shrink-0 px-1.5 py-0 text-[11px] leading-4 lg:hidden">{tag}</span>
        )}
        {!away && clock > 0 && (
          <span className={`${clockPill(isTurn)} font-mono tabular-nums lg:min-w-[4.5rem]`}>
            {formatClock(clock)}
          </span>
        )}
        {!away && hasMoveClock && (
          <span className={`${clockPill(true, isUrgent)} font-mono tabular-nums`}>
            {moveClock}s<span className="sr-only"> left for this move</span>
          </span>
        )}
        {!away && clock <= 0 && isTurn && !hasMoveClock && (
          <span className={`${clockPill(true)} lg:min-w-[4.5rem]`}>Turn</span>
        )}
      </span>
    </span>
  );

  return (
    <div className="flex min-w-0 flex-1 flex-col lg:w-full lg:flex-none">
      <button
        type="button"
        onClick={onClick}
        disabled={!onClick}
        title={title}
        className={`flex min-w-0 items-center gap-1.5 rounded-md p-1 transition-colors lg:w-full lg:flex-col lg:gap-3 lg:p-3 ${
          mirrored ? 'flex-row-reverse' : ''
        } ${onClick ? 'hover:bg-surface-3' : 'cursor-default'}`}
      >
        {avatar}
        {details}
      </button>
      {/* A sibling rather than a child: a button inside a button is not a
          button anyone can press reliably. */}
      {action && (
        <div className={`flex px-1 pb-1 lg:justify-center ${mirrored ? 'justify-end' : 'justify-start'}`}>
          <button
            type="button"
            onClick={action.onClick}
            className={`btn btn-sm h-7 px-2.5 text-[11px] lg:h-8 lg:text-xs ${
              action.tone === 'primary' ? 'btn-primary' : 'btn-secondary'
            }`}
          >
            {action.label}
          </button>
        </div>
      )}
    </div>
  );
};

export const MatchHeader: React.FC<MatchHeaderProps> = ({ seats, score, announcement, scoreLabel }) => {
  const { theme } = useTheme();
  const colorOf = (piece: 'X' | 'O') => (piece === 'X' ? theme.xColor : theme.oColor);
  const [first, second] = seats;

  /* The phone row is sized for a 320px screen, where a seat showing both
     clocks beside a two-digit score is as wide as it gets: any larger and
     those clocks run over the score. Every size here has an lg: override, so
     the rail is untouched. */
  return (
    <div className="flex w-full items-center gap-1.5 p-2 lg:flex-col lg:gap-6 lg:px-4 lg:py-8">
      <Seat {...first} color={colorOf(first.piece)} />

      {/* Rounds won in this sitting. It is the only number both players watch
          between games, so it belongs between them rather than in a panel. */}
      <div className="flex shrink-0 flex-col items-center">
        <div className="mb-1 rounded-sm bg-accent px-2 py-0.5 font-display text-xs font-extrabold tracking-wider text-accent-fg shadow-[0_2px_0_var(--ui-accent-shadow)] lg:mb-2 lg:px-4 lg:py-1 lg:text-base lg:shadow-[0_3px_0_var(--ui-accent-shadow)]">
          VS
        </div>
        <div className="flex shrink-0 items-center gap-1 font-mono text-sm font-bold tabular-nums text-subtle lg:gap-2.5 lg:text-2xl">
          <span className="text-ink">{score[0]}</span>
          <span aria-hidden="true">-</span>
          <span className="text-ink">{score[1]}</span>
          <span className="sr-only">{scoreLabel}</span>
        </div>
      </div>

      <Seat {...second} color={colorOf(second.piece)} mirrored />

      {/* Announced rather than drawn: the ring and the lit clock already carry
          this visually, and a screen reader needs it said once. */}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
};
