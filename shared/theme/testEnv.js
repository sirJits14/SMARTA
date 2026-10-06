import { STORAGE_KEY } from './theme.js';

// A minimal browser stand-in: storage, a prefers-color-scheme query, <html>, the theme-color meta, and timers.
export function fakeEnv({ stored, dark = false, blocked = false } = {}) {
  const data = new Map(stored === undefined ? [] : [[STORAGE_KEY, stored]]);
  const storage = blocked
    ? { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } }
    : { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => { data.set(k, String(v)); } };
  const media = { matches: dark, handlers: new Set(),
    addEventListener: (type, h) => media.handlers.add(h), removeEventListener: (type, h) => media.handlers.delete(h) };
  const attrs = new Map();
  const classes = new Set();
  const meta = { attrs: new Map([['content', '#00A79D'], ['data-light', '#00A79D'], ['data-dark', '#0e1c1f']]),
    getAttribute(n) { return this.attrs.has(n) ? this.attrs.get(n) : null; }, setAttribute(n, v) { this.attrs.set(n, v); } };
  const doc = {
    documentElement: { getAttribute: (n) => (attrs.has(n) ? attrs.get(n) : null), setAttribute: (n, v) => attrs.set(n, v),
      classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c) } },
    querySelector: (sel) => (sel === 'meta[name="theme-color"]' ? meta : null),
  };
  const timers = [];
  const pending = new Map();
  const winHandlers = new Set();
  const win = { document: doc, localStorage: storage, matchMedia: () => media, setTimeout: (fn) => { timers.push(fn); pending.set(timers.length, fn); return timers.length; },
    clearTimeout: (id) => { const fn = pending.get(id); pending.delete(id); const i = timers.indexOf(fn); if (i >= 0) timers.splice(i, 1); },
    addEventListener: (type, h) => { if (type === 'storage') winHandlers.add(h); }, removeEventListener: (type, h) => winHandlers.delete(h) };
  return { data, storage, media, meta, doc, win, classes, timers, winHandlers,
    theme: () => attrs.get('data-theme'),
    flipSystem(d) { media.matches = d; media.handlers.forEach((h) => h({ matches: d })); },
    otherTab(v) { data.set(STORAGE_KEY, v); winHandlers.forEach((h) => h({ key: STORAGE_KEY })); } };
}
