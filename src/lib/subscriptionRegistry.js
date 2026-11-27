// Shares one live listener per key across every page that needs it, and
// keeps it a while after the last page leaves so going back is instant.
export const LINGER_MS = 5 * 60 * 1000;

export function createSubscriptionRegistry({ lingerMs = LINGER_MS } = {}) {
  const entries = new Map();

  function run(entry) {
    entry.stop = entry.start((state) => {
      entry.state = state;
      for (const listener of [...entry.listeners]) listener(state);
    }) || (() => {});
  }

  function drop(key) {
    const entry = entries.get(key);
    if (!entry) return;
    clearTimeout(entry.timer);
    entries.delete(key);
    entry.stop();
  }

  function restart(key) {
    const entry = entries.get(key);
    if (!entry) return;
    entry.stop();
    run(entry);
  }

  function acquire(key, start) {
    let entry = entries.get(key);
    if (!entry) {
      entry = { start, state: null, listeners: new Set(), users: 0, timer: null, stop: () => {} };
      entries.set(key, entry);
      run(entry);
    } else if (entry.state?.error) {
      // A failed listener gets a fresh attempt instead of serving the error forever.
      restart(key);
    }
    clearTimeout(entry.timer);
    entry.timer = null;
    entry.users += 1;
    let released = false;
    return {
      current: () => entry.state,
      listen(listener) {
        entry.listeners.add(listener);
        return () => { entry.listeners.delete(listener); };
      },
      release() {
        if (released) return;
        released = true;
        entry.users -= 1;
        if (entries.get(key) !== entry) return;
        if (entry.users === 0) {
          entry.timer = setTimeout(() => { if (entries.get(key) === entry) drop(key); }, lingerMs);
        }
      },
    };
  }

  return {
    acquire,
    peek: (key) => entries.get(key)?.state ?? null,
    restart,
    clear: () => [...entries.keys()].forEach(drop),
  };
}
