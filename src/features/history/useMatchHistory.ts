import { useCallback, useEffect, useState } from 'react';
import { fetchUserMatchHistory, finalizeDueClaims } from './historyService';
import type { MatchRecord } from './types';

/**
 * The signed-in player's finished matches, loaded while `isOpen`. Shared by
 * both styles of the history dialog (and the Orca History page).
 *
 * The list is tagged with the account it was loaded for, so another account's
 * matches are never shown, and a load that finishes after an account switch or
 * a close is dropped. `reload` fetches again (the Orca Refresh button).
 */
export const useMatchHistory = (isOpen: boolean, uid: string | undefined) => {
  const [loaded, setLoaded] = useState<{ uid: string; history: MatchRecord[] } | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  // Keyed on the uid alone: the profile object changes on every rating refresh.
  useEffect(() => {
    if (!isOpen || !uid) return;
    let cancelled = false;
    void (async () => {
      await finalizeDueClaims();
      const data = await fetchUserMatchHistory(uid);
      if (cancelled) return;
      setLoaded({ uid, history: data });
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, uid, reloadTick]);

  const reload = useCallback(() => {
    setLoaded(null);
    setReloadTick((tick) => tick + 1);
  }, []);

  const loading = !loaded || loaded.uid !== uid;
  return { loading, history: loading ? [] : loaded.history, reload };
};
