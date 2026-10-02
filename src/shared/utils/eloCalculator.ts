export interface EloResult {
  player1NewElo: number;
  player2NewElo: number;
  player1Delta: number;
  player2Delta: number;
}

/**
 * Calculates ELO rating updates for a Gomoku match.
 * Standard K-Factor = 32.
 * Actual outcome S: 1 for Win, 0.5 for Draw, 0 for Loss.
 */
export const calculateElo = (
  p1Elo: number,
  p2Elo: number,
  outcome: 'p1' | 'p2' | 'draw',
  kFactor: number = 32
): EloResult => {
  const expectedP1 = 1 / (1 + Math.pow(10, (p2Elo - p1Elo) / 400));
  const expectedP2 = 1 / (1 + Math.pow(10, (p1Elo - p2Elo) / 400));

  let actualP1 = 0.5;
  let actualP2 = 0.5;

  if (outcome === 'p1') {
    actualP1 = 1;
    actualP2 = 0;
  } else if (outcome === 'p2') {
    actualP1 = 0;
    actualP2 = 1;
  }

  const p1Delta = Math.round(kFactor * (actualP1 - expectedP1));
  const p2Delta = Math.round(kFactor * (actualP2 - expectedP2));

  return {
    player1NewElo: Math.max(100, p1Elo + p1Delta),
    player2NewElo: Math.max(100, p2Elo + p2Delta),
    player1Delta: p1Delta,
    player2Delta: p2Delta,
  };
};

export interface RankTier {
  minElo: number | null;
  title: string;
  color: string;
  badge: string;
}

export const RANK_TIERS: readonly RankTier[] = [
  { minElo: 2100, title: 'Grand Master', color: 'text-purple-400 border-purple-500', badge: '/badges/grand-master.webp' },
  { minElo: 1900, title: 'Master', color: 'text-rose-400 border-rose-500', badge: '/badges/master.webp' },
  { minElo: 1700, title: 'Uranium', color: 'text-lime-400 border-lime-500', badge: '/badges/uranium.webp' },
  { minElo: 1500, title: 'Platinum', color: 'text-teal-300 border-teal-400', badge: '/badges/platinum.webp' },
  { minElo: 1400, title: 'Diamond', color: 'text-cyan-400 border-cyan-500', badge: '/badges/diamond.webp' },
  { minElo: 1300, title: 'Gold', color: 'text-amber-400 border-amber-500', badge: '/badges/gold.webp' },
  { minElo: 1200, title: 'Silver', color: 'text-slate-300 border-slate-400', badge: '/badges/silver.webp' },
  { minElo: 1100, title: 'Bronze', color: 'text-amber-600 border-amber-700', badge: '/badges/bronze.webp' },
  { minElo: 1000, title: 'Wood', color: 'text-amber-800 border-amber-900', badge: '/badges/wood.webp' },
  { minElo: null, title: 'Stone', color: 'text-stone-400 border-stone-500', badge: '/badges/stone.webp' },
];

/** Returns rank title, color classes and badge image for an Elo score. */
export const getRankTitle = (elo: number): { title: string; color: string; badge: string } =>
  RANK_TIERS.find((tier) => tier.minElo === null || elo >= tier.minElo) ?? RANK_TIERS[RANK_TIERS.length - 1];
