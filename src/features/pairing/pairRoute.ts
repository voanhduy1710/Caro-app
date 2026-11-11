/**
 * Whether this tab is a paired phone. A pairing link opens the app with
 * `#pair=<offer>`; the hash is cleared at once so a reload never shows the
 * secret again, and the offer is kept in this tab's sessionStorage so a reload
 * mid-game tries the same pairing (the desktop will normally answer `used`,
 * since each secret works once).
 */
import { decodePairLink, readPairFromLocation, type PairOffer } from './pairLink';

export const PAIR_STORAGE_KEY = 'caro:pair';

export interface PairRoute {
  /** null when the link was a pairing link that did not decode. */
  offer: PairOffer | null;
  fromHash: boolean;
}

export const resolvePairRoute = (hash: string, stored: string | null): PairRoute | null => {
  if (hash.startsWith('#pair=')) return { offer: readPairFromLocation(hash), fromHash: true };
  const offer = stored ? decodePairLink(stored) : null;
  return offer ? { offer, fromHash: false } : null;
};

const readStored = (): string | null => {
  try {
    return sessionStorage.getItem(PAIR_STORAGE_KEY);
  } catch {
    return null;
  }
};

export const clearStoredPair = () => {
  try {
    sessionStorage.removeItem(PAIR_STORAGE_KEY);
  } catch {
    // Storage blocked: there is nothing to clear.
  }
};

/** Reads the route for the current location, then stores the offer and wipes the hash. */
export const takePairRoute = (): PairRoute | null => {
  const { hash } = window.location;
  const route = resolvePairRoute(hash, readStored());
  if (!route?.fromHash) return route;
  window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
  if (route.offer) {
    try {
      sessionStorage.setItem(PAIR_STORAGE_KEY, hash);
    } catch {
      // Without storage a reload simply returns to the home screen.
    }
  } else {
    clearStoredPair();
  }
  return route;
};
