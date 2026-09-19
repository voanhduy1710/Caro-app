import type { GameResult } from './roomEngine';
import { otherSeat } from './roomEngine';
import type { Seat } from './protocol';

const signed = (value: number) => `${value >= 0 ? '+' : '−'}${Math.abs(value)}`;

/** Text shown on a result card for the room's rating outcome. */
export const describeRating = (result: GameResult, mine: Seat | null, local: string | undefined): string | null => {
  const rating = result.rating;
  const { X, O } = result.players;
  if (rating.status === 'saved') {
    if (rating.deltas) return mine ? (mine === 'T' ? 'Casual three-player match.' : `Rating ${signed(rating.deltas[mine])}`) : `Rated: ${X.name} ${signed(rating.deltas.X)}, ${O.name} ${signed(rating.deltas.O)}`;
    return local ?? 'Rating saved.';
  }
  if (local) return local;
  switch (rating.status) {
    case 'pending': return 'Saving the rating…';
    case 'unrated': {
      const names = rating.guestSeats.map((seat) => result.players[seat].name);
      const who = names.join(' and ');
      return rating.why === 'guest' ? `Unrated: ${who} ${names.length > 1 ? 'are' : 'is'} playing as a guest.` : `Unrated: ${who} ${names.length > 1 ? 'are' : 'is'} not using an online account.`;
    }
    case 'failed': return 'The rating could not be saved.';
    case 'unknown': return 'The rating may have been saved. Check History.';
    case 'skipped': {
      const loser = result.winner === 'DRAW' ? null : result.players[otherSeat(result.winner)];
      if (rating.why === 'disputed') return 'Not rated: the result was disputed.';
      if (rating.why === 'claim_pending') return 'Rating pending: recorded in 10 minutes unless disputed.';
      if (rating.why === 'unverified') return `Not rated: the result could not be confirmed on ${loser?.name ?? 'the other'}'s device.`;
      if (rating.why === 'no_session') return `Not rated: ${loser?.name ?? 'the player'} was not signed in on that device.`;
      return 'Not rated.';
    }
  }
};
