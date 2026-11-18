import { RANK_TIERS } from '../../shared/utils/rankTiers';
import type { RankTier } from '../../shared/utils/rankTiers';

/** The Elo range a tier covers, from the tier above it (RANK_TIERS is highest first). */
export const formatEloRange = (tier: RankTier, index: number): string => {
  const nextMinElo = RANK_TIERS[index - 1]?.minElo;
  if (tier.minElo === null) return `Below ${nextMinElo} Elo`;
  if (typeof nextMinElo !== 'number') return `${tier.minElo}+ Elo`;
  return `${tier.minElo}–${nextMinElo - 1} Elo`;
};
