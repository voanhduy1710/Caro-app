import React from 'react';
import type { UserProfile } from '../auth/AuthContext';
import { getAvatarPublicUrl } from '../avatar/avatarService';

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
  const avatar = (
    <span
      className={`grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-xl bg-surface transition-colors ${
        isTurn ? 'ring-4 ring-accent shadow-[0_0_15px_rgba(0,185,92,0.5)]' : 'border border-line shadow-sm'
      }`}
    >
      <img src={getAvatarPublicUrl(photoURL)} alt="" aria-hidden="true" className="h-full w-full object-contain p-1" />
    </span>
  );

  const details = (
    <span className="flex min-w-0 flex-col items-center gap-1.5 text-center mt-2">
      <span className="flex flex-col items-center gap-1">
        <span className="truncate text-base font-semibold leading-none text-ink">{name}</span>
        {tag && (
          <span className="shrink-0 rounded-sm bg-surface-3 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted mt-0.5">
            {tag}
          </span>
        )}
        <span className="text-xl font-black mt-1" style={{ color }}>
          {piece}
        </span>
      </span>
      {(clock > 0 || isTurn) && (
        <span
          className={`mt-1 min-w-[4rem] rounded-md px-2 py-1 text-center text-xs leading-tight transition-colors ${
            clock > 0 ? 'font-mono tabular-nums' : 'font-semibold'
          } ${
            isTurn
              ? isUrgent
                ? 'bg-danger-solid font-bold text-danger-fg'
                : 'bg-accent font-bold text-accent-fg'
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
      className={`flex flex-col items-center gap-2 rounded-md p-3 transition-colors ${
        disabled ? 'cursor-default' : 'hover:bg-surface-2'
      } w-full`}
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
        color="var(--ui-accent-text)"
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
        <div className="bg-accent px-4 py-1.5 rounded text-white font-bold tracking-wider mb-2 shadow-sm">VS</div>
        <div className="flex shrink-0 items-center gap-2 font-mono text-lg font-bold tabular-nums text-subtle">
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
        color="var(--ui-danger)"
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
