import { describe, expect, it } from 'vitest';
import type { UserProfile } from '../auth/AuthContext';
import { STRINGS } from '../i18n/strings';
import type { PairOffer } from './pairLink';
import { pairErrorFor, pairErrorKey, type PairError } from './pairErrors';

const offer: PairOffer = { v: 1, uid: 'user-1', sessionId: 's1', secret: 'k1', kind: 'room' };

const userWith = (over: Partial<UserProfile> = {}): UserProfile => ({
  uid: 'user-1',
  displayName: 'Ann',
  photoURL: '',
  email: 'ann@gomoku.app',
  elo: 1200,
  wins: 0,
  losses: 0,
  draws: 0,
  streak: 0,
  ...over,
});

describe('pairErrorFor', () => {
  it('rejects a link that did not decode to an offer', () => {
    expect(pairErrorFor(null, userWith())).toBe('invalid_qr');
  });

  it('asks a guest or a signed-out phone to sign in', () => {
    expect(pairErrorFor(offer, userWith({ uid: 'guest_abc', isGuest: true }))).toBe('not_signed_in');
    expect(pairErrorFor(offer, null)).toBe('not_signed_in');
  });

  it('rejects a code made by another account', () => {
    expect(pairErrorFor(offer, userWith({ uid: 'user-2' }))).toBe('other_account');
  });

  it('lets the same account through', () => {
    expect(pairErrorFor(offer, userWith())).toBeNull();
  });
});

describe('pairErrorKey', () => {
  const errors: PairError[] = ['not_signed_in', 'other_account', 'expired', 'used', 'no_desktop', 'invalid_qr', 'camera_denied'];

  it.each(errors)('names an existing pair.* string for %s', (error) => {
    const key = pairErrorKey(error);
    expect(key.startsWith('pair.')).toBe(true);
    expect(Object.hasOwn(STRINGS.en, key)).toBe(true);
    expect(Object.hasOwn(STRINGS.vi, key)).toBe(true);
  });
});
