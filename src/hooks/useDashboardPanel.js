import { useCallback, useEffect, useState } from 'react';

// The dashboard's open drawer, mirrored in ?panel=<id> so a refresh or a shared link reopens it.
// This is SIMS's only URL state: written with replaceState, never adding history entries.
export const PANEL_IDS = ['attendance', 'sex', 'enrollment', 'coverage', 'attention', 'notices', 'calendar', 'activity'];
const ALIASES = { upcoming: 'calendar' };

export function readPanel(search) {
  const raw = new URLSearchParams(search).get('panel');
  const id = ALIASES[raw] || raw;
  return PANEL_IDS.includes(id) ? id : null;
}

export function panelHref(href, id) {
  const url = new URL(href);
  if (id) url.searchParams.set('panel', id);
  else url.searchParams.delete('panel');
  return `${url.pathname}${url.search}${url.hash}`;
}

const writePanel = (id) => {
  const { pathname, search, hash, href } = window.location;
  const next = panelHref(href, id);
  if (next !== `${pathname}${search}${hash}`) window.history.replaceState(window.history.state, '', next);
};

let mounted = 0;

export function useDashboardPanel() {
  const [panel, setPanel] = useState(() => readPanel(window.location.search));
  useEffect(() => {
    mounted += 1;
    writePanel(readPanel(window.location.search)); // drops an unknown id and rewrites an alias
    return () => {
      mounted -= 1;
      // StrictMode unmounts and remounts once in development; only a real exit from the dashboard clears the URL.
      setTimeout(() => { if (mounted === 0) writePanel(null); }, 0);
    };
  }, []);
  const open = useCallback((id) => { setPanel(id); writePanel(id); }, []);
  const close = useCallback(() => { setPanel(null); writePanel(null); }, []);
  return { panel, open, close };
}
