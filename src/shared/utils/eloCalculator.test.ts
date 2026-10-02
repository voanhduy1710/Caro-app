import { describe, expect, it } from 'vitest';
import { getRankTitle } from './eloCalculator';

describe('getRankTitle', () => {
  const cases: [number, string][] = [
    [999, 'Stone'], [1000, 'Wood'], [1099, 'Wood'],
    [1100, 'Bronze'], [1200, 'Silver'], [1300, 'Gold'],
    [1400, 'Diamond'], [1500, 'Platinum'], [1700, 'Uranium'],
    [1900, 'Master'], [2099, 'Master'], [2100, 'Grand Master'],
  ];

  it.each(cases)('maps %i Elo to %s', (elo, title) => {
    expect(getRankTitle(elo).title).toBe(title);
  });
});
