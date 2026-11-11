import { createContext } from 'react';

/** What the in-game rail needs to offer "Pair mobile". Absent outside a game. */
export interface PairingContextValue {
  canPair: boolean;
  needsSignIn: boolean;
  phoneConnected: boolean;
  openPairModal: () => void;
}

export const PairingContext = createContext<PairingContextValue | null>(null);
