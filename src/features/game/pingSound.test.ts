import { describe, expect, it } from 'vitest';
import { createPingSoundNotifier } from './pingSound';

describe('shared ping sound notifications', () => {
  it('plays for a new ping and enforces a five-second cooldown across all players', () => {
    const notify = createPingSoundNotifier();
    const sounds: number[] = [];
    const play = () => { sounds.push(sounds.length); };
    notify('game', {}, 0, play);
    notify('game', { X: { row: 1, col: 1 } }, 100, play);
    notify('game', { O: { row: 2, col: 2 } }, 1_000, play);
    notify('game', { T: { row: 3, col: 3 } }, 5_099, play);
    expect(sounds).toHaveLength(1);
    notify('game', { T: { row: 3, col: 4 } }, 5_100, play);
    expect(sounds).toHaveLength(2);
  });

  it('does not replay sounds for snapshots, removals, wave repeats, or game changes', () => {
    const notify = createPingSoundNotifier();
    const sounds: string[] = [];
    const play = () => { sounds.push('ping'); };
    notify('game', { X: { row: 1, col: 1 } }, 0, play);
    notify('game', { X: { row: 1, col: 1 } }, 7_000, play);
    notify('game', {}, 8_000, play);
    notify('next', { O: { row: 2, col: 2 } }, 9_000, play);
    expect(sounds).toEqual([]);
    notify('next', { O: { row: 2, col: 3 } }, 10_000, play);
    expect(sounds).toEqual(['ping']);
  });

  it('does not queue suppressed sounds to play after cooldown expires', () => {
    const notify = createPingSoundNotifier();
    const sounds: string[] = [];
    const play = () => { sounds.push('ping'); };
    notify('game', {}, 0, play);
    notify('game', { X: { row: 1, col: 1 } }, 100, play);
    notify('game', { X: { row: 1, col: 2 } }, 200, play);
    notify('game', { X: { row: 1, col: 2 } }, 10_000, play);
    expect(sounds).toEqual(['ping']);
  });
});
