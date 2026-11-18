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
  { minElo: 900, title: 'Stone', color: 'text-stone-400 border-stone-500', badge: '/badges/stone.webp' },
  { minElo: 800, title: 'Plastic', color: 'text-sky-400 border-sky-500', badge: '/badges/plastic.webp' },
  { minElo: null, title: 'Cardboard', color: 'text-yellow-700 border-yellow-800', badge: '/badges/cardboard.webp' },
];

/** Returns rank title, color classes and badge image for an Elo score. */
export const getRankTitle = (elo: number): { title: string; color: string; badge: string } =>
  RANK_TIERS.find((tier) => tier.minElo === null || elo >= tier.minElo) ?? RANK_TIERS[RANK_TIERS.length - 1];
