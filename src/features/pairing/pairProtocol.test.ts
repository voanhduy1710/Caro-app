import { describe, expect, it } from 'vitest';
import { pairTopic, parsePairMessage, type PairMessage } from './pairProtocol';

const valid: PairMessage[] = [
  { t: 'hello', phoneId: 'p1', secret: 's3cret' },
  { t: 'call', phoneId: 'p1', method: 'makeMove', args: [3, 4] },
  { t: 'call', phoneId: 'p1', method: 'resign', args: [] },
  { t: 'ping', phoneId: 'p1' },
  { t: 'bye', phoneId: 'p1' },
  { t: 'welcome', phoneId: 'p1' },
  { t: 'reject', phoneId: 'p1', reason: 'expired' },
  { t: 'reject', phoneId: 'p1', reason: 'used' },
  { t: 'snapshot', phoneId: 'p1', seq: 7, kind: 'room', data: { board: [[0]] } },
  { t: 'snapshot', phoneId: 'p1', seq: 0, kind: 'practice', data: null },
  { t: 'chatImage', phoneId: 'p1', id: 'img1', image: 'data:image/png;base64,AAA' },
  { t: 'end', phoneId: 'p1', reason: 'replaced' },
  { t: 'end', phoneId: 'p1', reason: 'game_ended' },
  { t: 'end', phoneId: 'p1', reason: 'unpaired' },
  { t: 'end', phoneId: 'p1', reason: 'desktop_closed' },
];

describe('parsePairMessage', () => {
  it.each(valid)('round-trips $t', (msg) => {
    expect(parsePairMessage(JSON.parse(JSON.stringify(msg)))).toEqual(msg);
  });

  it('returns null for non-objects', () => {
    expect(parsePairMessage(null)).toBeNull();
    expect(parsePairMessage('x')).toBeNull();
  });

  it('returns null for an unknown t', () => {
    expect(parsePairMessage({ t: 'nope', phoneId: 'p1' })).toBeNull();
  });

  it('returns null when phoneId is missing', () => {
    expect(parsePairMessage({ t: 'ping' })).toBeNull();
  });

  it('returns null for call with non-array args', () => {
    expect(parsePairMessage({ t: 'call', phoneId: 'p1', method: 'm', args: 'a' })).toBeNull();
  });

  it('returns null for call whose args exceed 64 KB', () => {
    const big = 'x'.repeat(65536);
    expect(parsePairMessage({ t: 'call', phoneId: 'p1', method: 'm', args: [big] })).toBeNull();
  });

  it('returns null for snapshot with non-number seq', () => {
    expect(
      parsePairMessage({ t: 'snapshot', phoneId: 'p1', seq: '1', kind: 'room', data: {} }),
    ).toBeNull();
  });

  it('returns null for reject with unknown reason', () => {
    expect(parsePairMessage({ t: 'reject', phoneId: 'p1', reason: 'nah' })).toBeNull();
  });

  it('never throws', () => {
    const cyclic: unknown[] = [];
    cyclic.push(cyclic);
    const inputs: unknown[] = [
      undefined,
      1,
      [],
      { t: 'call' },
      { t: 'call', phoneId: 'p1', method: 'm', args: cyclic },
      { t: 'call', phoneId: 'p1', method: 'm', args: [10n] },
    ];
    for (const raw of inputs) {
      expect(() => parsePairMessage(raw)).not.toThrow();
      expect(parsePairMessage(raw)).toBeNull();
    }
  });
});

describe('pairTopic', () => {
  it('formats pair:uid:sessionId', () => {
    expect(pairTopic('u1', 's1')).toBe('pair:u1:s1');
  });
});
