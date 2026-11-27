// Appearance preference (Auto / Light / Dark) for the SIMS and the Parents App.
// Saved per device in localStorage. The inline script in each index.html applies
// the same rules before first paint; boot.test.js keeps the two in step.
// Spec: docs/superpowers/specs/2026-10-06-dark-mode-design.md
export const PREFS = ['auto', 'light', 'dark'];
export const STORAGE_KEY = 'bnhs-theme';
const QUERY = '(prefers-color-scheme: dark)';
const SWITCH_MS = 250;
const STEP = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

export function readPref(storage) {
  try {
    const value = storage?.getItem(STORAGE_KEY);
    return PREFS.includes(value) ? value : 'auto';
  } catch {
    return 'auto';
  }
}

export function writePref(pref, storage) {
  try { storage?.setItem(STORAGE_KEY, pref); } catch { /* storage blocked: the choice still applies until reload */ }
}

export const resolveTheme = (pref, systemDark) => (pref === 'dark' || (pref === 'auto' && systemDark) ? 'dark' : 'light');

export function applyTheme(theme, doc) {
  doc.documentElement.setAttribute('data-theme', theme);
  const meta = doc.querySelector('meta[name="theme-color"]');
  const color = meta?.getAttribute(`data-${theme}`);
  if (color) meta.setAttribute('content', color);
}

// Shared keyboard order for the segmented control and the quick menu.
export function stepPref(pref, key) {
  if (key === 'Home') return PREFS[0];
  if (key === 'End') return PREFS[PREFS.length - 1];
  if (!Object.prototype.hasOwnProperty.call(STEP, key)) return null; // not Object.hasOwn: iOS < 15.4 lacks it
  const i = PREFS.indexOf(pref);
  return PREFS[(i + STEP[key] + PREFS.length) % PREFS.length];
}

function storageOf(win) {
  try { return win?.localStorage; } catch { return undefined; } // Safari throws on access when storage is blocked
}

function mediaOf(win) {
  try { return win?.matchMedia?.(QUERY) ?? null; } catch { return null; }
}

// One store per tab. It keeps following the device (Auto) and other tabs for the
// life of the page, so the login screens switch too; React subscribes for re-renders.
export function createThemeStore({ win = globalThis.window, doc = win?.document, storage = storageOf(win) } = {}) {
  let pref = readPref(storage);
  const media = mediaOf(win);
  let systemDark = !!media?.matches;
  const listeners = new Set();
  let switchTimer = null;
  const getTheme = () => resolveTheme(pref, systemDark);

  const update = () => {
    const theme = getTheme();
    if (doc) {
      const root = doc.documentElement;
      const before = root.getAttribute('data-theme');
      applyTheme(theme, doc);
      if (before && before !== theme && win?.setTimeout) {
        root.classList.add('theme-switching');
        if (switchTimer !== null) win.clearTimeout?.(switchTimer); // a quick second switch restarts the fade window
        switchTimer = win.setTimeout(() => { switchTimer = null; root.classList.remove('theme-switching'); }, SWITCH_MS);
      }
    }
    listeners.forEach((listener) => listener());
  };
  const onMedia = (event) => { systemDark = !!event.matches; update(); };
  const onStorage = (event) => {
    if (event.key !== STORAGE_KEY && event.key !== null) return;
    pref = readPref(storage);
    update();
  };

  if (media?.addEventListener) media.addEventListener('change', onMedia);
  else media?.addListener?.(onMedia);
  win?.addEventListener?.('storage', onStorage);
  if (doc) applyTheme(getTheme(), doc);

  return {
    getPref: () => pref,
    getTheme,
    setPref(next) {
      if (!PREFS.includes(next) || next === pref) return;
      pref = next;
      writePref(next, storage);
      update();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    dispose() {
      if (media?.removeEventListener) media.removeEventListener('change', onMedia);
      else media?.removeListener?.(onMedia);
      win?.removeEventListener?.('storage', onStorage);
      if (switchTimer !== null) { win?.clearTimeout?.(switchTimer); switchTimer = null; }
      listeners.clear();
    },
  };
}
