// Install state for the "Install app" button in Settings. Chrome and Edge fire
// beforeinstallprompt once per page load, usually before Settings is opened, so the
// store is created at startup (src/main.jsx). The event is not cancelled: staff who
// never open Settings still get the browser's own install prompt.
const STANDALONE = '(display-mode: standalone)';

// iPadOS reports itself as a Mac; touch support gives it away.
export const isIos = nav => /iPad|iPhone|iPod/.test(nav?.userAgent || '') || (nav?.platform === 'MacIntel' && nav?.maxTouchPoints > 1);

function runningInstalled(win) {
  try { return !!win?.matchMedia?.(STANDALONE)?.matches || win?.navigator?.standalone === true; } catch { return false; }
}

// Status: 'installed' | 'available' (button) | 'dismissed' | 'ios' (Add to Home Screen) | 'unavailable'.
export function createInstallStore({ win = globalThis.window } = {}) {
  let prompt = null;
  let installed = runningInstalled(win);
  let dismissed = false;
  const listeners = new Set();
  const emit = () => listeners.forEach((listener) => listener());
  const onPrompt = (event) => { prompt = event; emit(); };
  const onInstalled = () => { prompt = null; installed = true; emit(); };
  win?.addEventListener?.('beforeinstallprompt', onPrompt);
  win?.addEventListener?.('appinstalled', onInstalled);

  return {
    getStatus: () => (installed ? 'installed' : prompt ? 'available' : dismissed ? 'dismissed' : isIos(win?.navigator) ? 'ios' : 'unavailable'),
    // Resolves to the browser's outcome ('accepted' | 'dismissed'), or 'unavailable'.
    async install() {
      const event = prompt;
      if (!event) return 'unavailable';
      prompt = null; // a prompt event can be used only once
      try {
        await event.prompt();
        const { outcome } = await event.userChoice;
        dismissed = outcome === 'dismissed';
        return outcome;
      } catch {
        return 'unavailable';
      } finally {
        emit();
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    dispose() {
      win?.removeEventListener?.('beforeinstallprompt', onPrompt);
      win?.removeEventListener?.('appinstalled', onInstalled);
      listeners.clear();
    },
  };
}
