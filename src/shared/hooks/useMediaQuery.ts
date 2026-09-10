import { useEffect, useState } from 'react';

/**
 * Subscribes to a CSS media query and re-renders when it starts or stops matching.
 * Used to pick structurally different layouts (in-flow sidebar vs. fixed bottom dock)
 * instead of trying to express both with responsive utility classes.
 */
export const useMediaQuery = (query: string): boolean => {
  const [matches, setMatches] = useState<boolean>(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia(query);
    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches);

    setMatches(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return matches;
};

/** True on viewports wide enough for the board and the chat rail to sit side by side. */
export const useIsDesktop = () => useMediaQuery('(min-width: 1024px)');
