import { useSyncExternalStore } from 'react';
import { createThemeStore } from '../../shared/theme/theme.js';

// One store per tab: the saved choice, the device setting (Auto), and other tabs.
const store = createThemeStore();
import.meta.hot?.dispose(() => store.dispose());

export function useTheme() {
  const pref = useSyncExternalStore(store.subscribe, store.getPref);
  const theme = useSyncExternalStore(store.subscribe, store.getTheme);
  return { pref, theme, setPref: store.setPref };
}
