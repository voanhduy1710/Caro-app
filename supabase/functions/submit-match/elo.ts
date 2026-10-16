export const K_FACTOR = 32;

export const expectedScore = (rating: number, opponentRating: number) =>
  1 / (1 + Math.pow(10, (opponentRating - rating) / 400));

/**
 * One player's rating change for a game: score is 1 for a win, 0 for a loss,
 * 0.5 for a draw. A decisive game always moves both ratings by at least 1, so
 * beating a much weaker player is never worth nothing; plain Elo rounds that
 * to 0 once the gap passes about 900. public.finalize_due_match_claims applies
 * the same rule to claimed results.
 */
export const ratingDelta = (score: number, rating: number, opponentRating: number): number => {
  const delta = Math.round(K_FACTOR * (score - expectedScore(rating, opponentRating)));
  if (score === 1) return Math.max(1, delta);
  if (score === 0) return Math.min(-1, delta);
  return delta;
};
