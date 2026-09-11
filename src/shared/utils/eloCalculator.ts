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
  if (elo >= 2000) return { title: 'Grandmaster', color: 'text-purple-400 border-purple-500' };
  if (elo >= 1700) return { title: 'Master', color: 'text-rose-400 border-rose-500' };
  if (elo >= 1500) return { title: 'Diamond', color: 'text-cyan-400 border-cyan-500' };
  if (elo >= 1350) return { title: 'Gold', color: 'text-amber-400 border-amber-500' };
  if (elo >= 1200) return { title: 'Silver', color: 'text-slate-300 border-slate-400' };
  return { title: 'Bronze', color: 'text-amber-700 border-amber-800' };
};
