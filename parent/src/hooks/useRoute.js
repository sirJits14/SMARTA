import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { matchRoute } from '../lib/router.js';
import { navDirection } from '../lib/navMotion.js';

const current = () => matchRoute(window.location.pathname, window.location.search);

let latestTransition = 0;

// Swaps screens inside a View Transition so the change slides or fades
// (html[data-nav=...] styles in glass.css). Falls back to an instant swap
// where View Transitions are unsupported, when the page is hidden, or when
// there's no direction (same screen).
function swap(dir, update) {
  const root = document.documentElement;
  if (!dir || !document.startViewTransition || document.visibilityState !== 'visible') { update(); return; }
  const id = ++latestTransition;
  root.dataset.nav = dir;
  const t = document.startViewTransition(() => flushSync(update));
  t.ready.catch(() => {}); // a newer navigation skipped this one
  t.finished.finally(() => { if (id === latestTransition) delete root.dataset.nav; });
}

export function useRoute() {
  const [route, setRoute] = useState(current);
  const routeRef = useRef(route);
  routeRef.current = route;
  useEffect(() => {
    // A back/forward swipe the browser already animated itself
    // (hasUAVisualTransition) swaps instantly, so it isn't animated twice.
    const on = (e) => {
      const next = current();
      swap(e.hasUAVisualTransition ? null : navDirection(routeRef.current, next), () => setRoute(next));
    };
    window.addEventListener('popstate', on);
    return () => window.removeEventListener('popstate', on);
  }, []);
  const navigate = useCallback((to, { replace = false } = {}) => {
    window.history[replace ? 'replaceState' : 'pushState'](null, '', to);
    const next = current();
    swap(navDirection(routeRef.current, next), () => { setRoute(next); window.scrollTo(0, 0); });
  }, []);
  return { route, navigate };
}
