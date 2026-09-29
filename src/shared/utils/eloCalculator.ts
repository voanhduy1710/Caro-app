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
 * Returns rank tier title based on ELO score.
 */
export const getRankTitle = (elo: number): { title: string; color: string } => {
  if (elo >= 2100) return { title: 'Grand Master', color: 'text-purple-400 border-purple-500' };
  if (elo >= 1900) return { title: 'Master', color: 'text-rose-400 border-rose-500' };
  if (elo >= 1700) return { title: 'Uranium', color: 'text-lime-400 border-lime-500' };
  if (elo >= 1500) return { title: 'Platinum', color: 'text-teal-300 border-teal-400' };
  if (elo >= 1400) return { title: 'Diamond', color: 'text-cyan-400 border-cyan-500' };
  if (elo >= 1300) return { title: 'Gold', color: 'text-amber-400 border-amber-500' };
  if (elo >= 1200) return { title: 'Silver', color: 'text-slate-300 border-slate-400' };
  if (elo >= 1100) return { title: 'Bronze', color: 'text-amber-600 border-amber-700' };
  if (elo >= 1000) return { title: 'Wood', color: 'text-amber-800 border-amber-900' };
  return { title: 'Stone', color: 'text-stone-400 border-stone-500' };
};
