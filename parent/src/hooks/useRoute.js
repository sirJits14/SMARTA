import { useCallback, useEffect, useState } from 'react';
import { matchRoute } from '../lib/router.js';

const current = () => matchRoute(window.location.pathname, window.location.search);

export function useRoute() {
  const [route, setRoute] = useState(current);
  useEffect(() => {
    const on = () => setRoute(current());
    window.addEventListener('popstate', on);
    return () => window.removeEventListener('popstate', on);
  }, []);
  const navigate = useCallback((to, { replace = false } = {}) => {
    window.history[replace ? 'replaceState' : 'pushState'](null, '', to);
    setRoute(current());
    window.scrollTo(0, 0);
  }, []);
  return { route, navigate };
}
