import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Browser preview of the Settings screen with synthetic data. Real components
// and CSS; hooks, writes and device checks come from settings-fixture.js.
const FIXTURE = '/tests/browser/settings-fixture.js';
const STUBS = {
  '/src/hooks/useDoc.js': `export { useDoc, useQuery } from "${FIXTURE}";`,
  '/src/hooks/useLinks.js': `export { useLinks } from "${FIXTURE}";`,
  '/src/lib/notifications.js': `export { useDeviceStatus, enableOnThisDevice, disableOnThisDevice } from "${FIXTURE}";`,
  '/src/lib/guardianWrites.js': `export { saveDisplayName, setGuardianPrefs, deleteMyAccount, signOutNow } from "${FIXTURE}";`,
  '/src/lib/device.js': `export { isIOS, isStandalone } from "${FIXTURE}";`,
  '/src/firebase.js': 'export const app = {}, db = {}, auth = {}; export const appCheckReady = Promise.resolve(); export const callable = () => async () => ({});',
};

export default defineConfig({
  plugins: [{
    name: 'settings-preview-data', enforce: 'pre',
    load(id) {
      const path = id.replaceAll('\\', '/');
      for (const [end, code] of Object.entries(STUBS)) if (path.endsWith(`/parent${end}`)) return code;
    },
  }, react()],
  define: { __APP_BUILD__: JSON.stringify({ date: '2026-10-07', commit: 'preview' }) },
  server: { host: '127.0.0.1', port: 5189, strictPort: true },
  cacheDir: 'node_modules/.vite-settings-preview',
});
