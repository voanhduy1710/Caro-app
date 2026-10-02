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

/**
 * Returns rank tier title, color classes and badge image based on ELO score.
 */
export const getRankTitle = (elo: number): { title: string; color: string; badge: string } => {
  const tier = (title: string, color: string, slug: string) => ({
    title,
    color,
    badge: `/badges/${slug}.webp`,
  });
  if (elo >= 2100) return tier('Grand Master', 'text-purple-400 border-purple-500', 'grand-master');
  if (elo >= 1900) return tier('Master', 'text-rose-400 border-rose-500', 'master');
  if (elo >= 1700) return tier('Uranium', 'text-lime-400 border-lime-500', 'uranium');
  if (elo >= 1500) return tier('Platinum', 'text-teal-300 border-teal-400', 'platinum');
  if (elo >= 1400) return tier('Diamond', 'text-cyan-400 border-cyan-500', 'diamond');
  if (elo >= 1300) return tier('Gold', 'text-amber-400 border-amber-500', 'gold');
  if (elo >= 1200) return tier('Silver', 'text-slate-300 border-slate-400', 'silver');
  if (elo >= 1100) return tier('Bronze', 'text-amber-600 border-amber-700', 'bronze');
  if (elo >= 1000) return tier('Wood', 'text-amber-800 border-amber-900', 'wood');
  return tier('Stone', 'text-stone-400 border-stone-500', 'stone');
};
