import { describe, expect, it, vi } from 'vitest';
import { pendingBelongsTo, resendPendingRatedResults, submitRatedResult, worthKeeping } from './historyService';
import type { PendingRatedResult, RatedResultBody } from './historyService';

const fake = vi.hoisted(() => {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  });
  const state = { session: 'user-b' as string | null, posted: [] as string[] };
  const client = {
    auth: { getSession: async () => ({ data: { session: state.session ? { user: { id: state.session } } : null } }) },
    functions: {
      invoke: async (_name: string, { body }: { body: { gameId: string } }) => {
        state.posted.push(body.gameId);
        return { data: { ok: true }, error: null };
      },
    },
  };
  return { state, client, store };
});

vi.mock('../../config/supabase', () => ({ supabase: fake.client, isSupabaseConfigured: true }));

const KEY = 'caro_pending_ratings';

const body = (gameId: string, p1 = 'user-a', p2 = 'user-x'): RatedResultBody => ({
  mode: 'pvp', boardSize: 15, winnerUid: p1, player1Uid: p1, player1Name: 'A', player2Uid: p2, player2Name: 'X', gameId,
});

const queued = (): PendingRatedResult[] => JSON.parse(fake.store.get(KEY) ?? '[]');

describe('worthKeeping', () => {
  it('keeps offline, signed-out and waiting-for-ticket results only', () => {
    expect(worthKeeping({ status: 'network' })).toBe(true);
    expect(worthKeeping({ status: 'refused', code: 'http_401' })).toBe(true);
    expect(worthKeeping({ status: 'refused', code: 'caller_would_gain' })).toBe(false);
    expect(worthKeeping({ status: 'refused', code: 'seat_tickets_missing' })).toBe(true);
    expect(worthKeeping({ status: 'refused', code: 'game_too_short' })).toBe(false);
    expect(worthKeeping({ status: 'unrated', code: 'pair_daily_limit' })).toBe(false);
    expect(worthKeeping({ status: 'duplicate' })).toBe(false);
  });
});

describe('pendingBelongsTo', () => {
  it('uses the stored uid, or the players named in an old entry', () => {
    expect(pendingBelongsTo({ body: body('g'), createdAt: 0, uid: 'user-b' }, 'user-b')).toBe(true);
    expect(pendingBelongsTo({ body: body('g', 'user-b'), createdAt: 0, uid: 'user-a' }, 'user-b')).toBe(false);
    expect(pendingBelongsTo({ body: body('g', 'user-x', 'user-b'), createdAt: 0 }, 'user-b')).toBe(true);
    expect(pendingBelongsTo({ body: body('g'), createdAt: 0 }, 'user-b')).toBe(false);
  });
});

describe('pending rated results', () => {
  it('tags a queued result with the session that sent it', async () => {
    fake.store.clear();
    fake.state.session = 'user-a';
    fake.state.posted = [];
    // Offline: the result has to stay queued.
    fake.client.functions.invoke = async () => { throw new Error('offline'); };
    await submitRatedResult(body('g1'));
    expect(queued()).toMatchObject([{ uid: 'user-a', body: { gameId: 'g1' } }]);
  });

  it('resends only the signed-in player\'s entries and leaves the rest queued', async () => {
    const now = Date.now();
    fake.store.set(KEY, JSON.stringify([
      { body: body('a-tagged'), createdAt: now, uid: 'user-a' },
      { body: body('a-legacy'), createdAt: now },
      { body: body('b-legacy', 'user-x', 'user-b'), createdAt: now },
      { body: body('b-tagged'), createdAt: now, uid: 'user-b' },
    ]));
    fake.state.session = 'user-b';
    fake.state.posted = [];
    fake.client.functions.invoke = async (_name: string, { body: b }: { body: { gameId: string } }) => {
      fake.state.posted.push(b.gameId);
      return { data: { ok: true }, error: null };
    };
    await resendPendingRatedResults('user-b');
    expect(fake.state.posted).toEqual(['b-legacy', 'b-tagged']);
    expect(queued().map((e) => e.body.gameId)).toEqual(['a-tagged', 'a-legacy']);
  });

  it('sends nothing when the given player is not the session\'s', async () => {
    fake.state.session = 'user-a';
    fake.state.posted = [];
    await resendPendingRatedResults('user-b');
    expect(fake.state.posted).toEqual([]);
  });
});
