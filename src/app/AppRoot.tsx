import React, { useCallback, useEffect, useState } from 'react';
import { RemoteMatchApp } from '../features/pairing/RemoteMatchApp';
import { takePairRoute, type PairRoute } from '../features/pairing/pairRoute';
import { App } from './App';

/**
 * The app, or — when this tab opened a pairing link — the phone remote for a
 * desktop game. A link scanned in-app only changes the hash, so that is
 * watched too.
 */
export const AppRoot: React.FC<{ initialRoute: PairRoute | null }> = ({ initialRoute }) => {
  const [route, setRoute] = useState<{ pair: PairRoute; id: number } | null>(
    () => (initialRoute ? { pair: initialRoute, id: 0 } : null),
  );

  useEffect(() => {
    const onHashChange = () => {
      if (!window.location.hash.startsWith('#pair=')) return;
      const pair = takePairRoute();
      if (pair) setRoute((current) => ({ pair, id: (current?.id ?? 0) + 1 }));
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const goHome = useCallback(() => setRoute(null), []);

  return route ? <RemoteMatchApp key={route.id} offer={route.pair.offer} onHome={goHome} /> : <App />;
};
