/**
 * Why a phone could not pair, or stopped trying. pairErrorFor runs the checks
 * that need no network, so a link the phone cannot use never opens a channel.
 */
import type { UserProfile } from '../auth/AuthContext';
import type { StringKey } from '../i18n/strings';
import type { PairOffer } from './pairLink';

export type PairError = 'not_signed_in' | 'other_account' | 'expired' | 'used' | 'no_desktop' | 'invalid_qr' | 'camera_denied';

export const pairErrorFor = (offer: PairOffer | null, user: UserProfile | null): PairError | null => {
  if (!offer) return 'invalid_qr';
  if (!user || user.isGuest) return 'not_signed_in';
  if (offer.uid !== user.uid) return 'other_account';
  return null;
};

export const pairErrorKey = (e: PairError): StringKey => `pair.error.${e}`;
