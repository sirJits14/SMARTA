// Chrome and Android fire beforeinstallprompt once, shortly after load, and
// only show it if the page asks. main.jsx starts listening at startup so
// Settings > Install app can show it later.
export function createInstallPrompt(target) {
  let held = null;
  let installed = false;
  const listeners = new Set();
  const emit = () => listeners.forEach((fn) => fn());
  target.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); held = e; emit(); });
  target.addEventListener('appinstalled', () => { held = null; installed = true; emit(); });
  return {
    state: () => (installed ? 'installed' : held ? 'ready' : 'idle'),
    subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    async prompt() {
      if (!held) return 'unavailable';
      const e = held;
      held = null;
      try {
        await e.prompt();
        const { outcome } = await e.userChoice;
        if (outcome === 'accepted') installed = true;
        return outcome;
      } finally {
        emit();
      }
    },
  };
}

let shared;
// The app-wide instance, bound to window on first use.
export const installPrompt = () => (shared ??= createInstallPrompt(window));
