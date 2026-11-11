import { describe, expect, it } from 'vitest';
import { encodePairLink, type PairOffer } from './pairLink';
import { resolvePairRoute } from './pairRoute';

const offer: PairOffer = { v: 1, uid: 'u1', sessionId: 's1', secret: 'k1', kind: 'practice' };
const hash = new URL(encodePairLink('https://caro.test', offer)).hash;

describe('resolvePairRoute', () => {
  it('takes a pairing link from the hash', () => {
    expect(resolvePairRoute(hash, null)).toEqual({ offer, fromHash: true });
  });

  it('routes a broken pairing hash to the remote with no offer, so it can say why', () => {
    expect(resolvePairRoute('#pair=not-a-code', null)).toEqual({ offer: null, fromHash: true });
  });

  it('prefers a fresh hash over the stored pairing', () => {
    const other = new URL(encodePairLink('https://caro.test', { ...offer, secret: 'k2' })).hash;
    expect(resolvePairRoute(hash, other)).toEqual({ offer, fromHash: true });
  });

  it('reconnects to the pairing stored in this tab', () => {
    expect(resolvePairRoute('', hash)).toEqual({ offer, fromHash: false });
  });

  it('is the normal app for any other hash and no usable stored pairing', () => {
    expect(resolvePairRoute('', null)).toBeNull();
    expect(resolvePairRoute('#room=ABC123', null)).toBeNull();
    expect(resolvePairRoute('', 'garbage')).toBeNull();
  });
});
