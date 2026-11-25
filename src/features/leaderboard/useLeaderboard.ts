import { useCallback, useEffect, useState } from 'react';
import { fetchTopLeaderboard } from './leaderboardService';
import { finalizeDueClaims } from '../history/historyService';
import type { UserProfile } from '../auth/AuthContext';

const TOP_N = 25;

/**
 * The top players, loaded while `isOpen` (claims that are due are settled
 * first, so the table includes them). Shared by both styles of the
 * leaderboard. A load that lands after the dialog closed is dropped.
 */
export const useLeaderboard = (isOpen: boolean) => {
  const [players, setPlayers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    void (async () => {
      await finalizeDueClaims();
      const data = await fetchTopLeaderboard(TOP_N);
      if (!active) return;
      setPlayers(data);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [isOpen, reloadTick]);

  const reload = useCallback(() => {
    setLoading(true);
    setReloadTick((tick) => tick + 1);
  }, []);

  return { players, loading, reload };
};
