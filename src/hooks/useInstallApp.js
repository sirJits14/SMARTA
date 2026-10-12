import { useSyncExternalStore } from 'react';
import { createInstallStore } from '../lib/install.js';

// One store per tab, created when src/main.jsx imports this module so it catches
// the browser's install offer even if Settings opens later.
const store = createInstallStore();
import.meta.hot?.dispose(() => store.dispose());

export function useInstallApp() {
  const status = useSyncExternalStore(store.subscribe, store.getStatus);
  return { status, install: store.install };
}
