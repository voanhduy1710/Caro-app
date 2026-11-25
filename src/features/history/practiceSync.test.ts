import { describe, expect, it, vi } from 'vitest';
import { LOCAL_HISTORY_KEY, localPracticeRows, syncPracticeHistory } from './practiceSync';
import type { MatchRecord } from './types';

const fake = vi.hoisted(() => {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  });
  const uploads: string[][] = [];
  let release: (() => void) | null = null;
  const client = {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'user-1' } } } }) },
    from: () => ({
      upsert: (rows: { client_id: string }[]) => {
        uploads.push(rows.map((r) => r.client_id));
        // The first upload waits until the test releases it, so a second call lands mid-flight.
        if (uploads.length === 1) return new Promise((resolve) => { release = () => resolve({ error: null }); });
        return Promise.resolve({ error: null });
      },
    }),
  };
  return { uploads, client, release: () => release?.() };
});

vi.mock('../../config/supabase', () => ({ supabase: fake.client, isSupabaseConfigured: true }));

const UID = 'user-1';

const practice = (overrides: Partial<MatchRecord> = {}): MatchRecord => ({
  id: 'match_abc1234',
  mode: 'ai',
  player1Uid: UID,
  player1Name: 'Joy',
  player2Uid: 'ai_bot',
  player2Name: 'AI Bot',
  winnerUid: UID,
  winnerName: 'Joy',
  boardSize: 19,
  timerConfig: '10m / 30s',
  eloDeltaPlayer1: 0,
  eloDeltaPlayer2: 0,
  timestamp: Date.UTC(2026, 9, 15, 4, 0, 0),
  ...overrides,
});

describe('localPracticeRows', () => {
  it('maps a won practice game to a table row', () => {
    expect(localPracticeRows(UID, [practice()])).toEqual([{
      uid: UID,
      client_id: 'match_abc1234',
      player_name: 'Joy',
      result: 'win',
      board_size: 19,
      timer_config: '10m / 30s',
      played_at: '2026-10-15T04:00:00.000Z',
    }]);
  });

  it('maps losses and draws', () => {
    const rows = localPracticeRows(UID, [
      practice({ id: 'a', winnerUid: 'ai_bot' }),
      practice({ id: 'b', winnerUid: 'DRAW' }),
    ]);
    expect(rows.map((r) => r.result)).toEqual(['loss', 'draw']);
  });

  it('keeps only this player\'s practice games', () => {
    const rows = localPracticeRows(UID, [
      practice({ id: 'mine' }),
      practice({ id: 'other', player1Uid: 'user-2' }),
      practice({ id: 'pvp', mode: 'pvp' }),
    ]);
    expect(rows.map((r) => r.client_id)).toEqual(['mine']);
  });

  it('skips records the table would reject', () => {
    const rows = localPracticeRows(UID, [
      practice({ id: '' }),
      practice({ id: 'x', boardSize: 99 }),
      practice({ id: 'y', timestamp: Date.now() + 86_400_000 }),
      practice({ id: 'z', timestamp: Number.NaN }),
    ]);
    expect(rows).toEqual([]);
  });
});

describe('syncPracticeHistory', () => {
  it('runs once more when a game is finished during a running sync', async () => {
    localStorage.setItem(LOCAL_HISTORY_KEY, JSON.stringify([practice({ id: 'first' })]));
    const running = syncPracticeHistory(UID);
    await vi.waitFor(() => expect(fake.uploads).toHaveLength(1));

    localStorage.setItem(LOCAL_HISTORY_KEY, JSON.stringify([practice({ id: 'first' }), practice({ id: 'second' })]));
    const joined = syncPracticeHistory(UID);
    expect(joined).toBe(running);

    fake.release();
    await joined;
    expect(fake.uploads).toEqual([['first'], ['first', 'second']]);
  });
});
