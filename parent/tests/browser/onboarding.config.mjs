import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const FIXTURE = '/tests/browser/onboarding-fixture.js';
const STUBS = {
  '/src/hooks/useAuth.js': `export { useAuth } from "${FIXTURE}";`,
  '/src/hooks/useRoute.js': `export { useRoute } from "${FIXTURE}";`,
  '/src/hooks/useLinks.js': `export { useLinks } from "${FIXTURE}";`,
  '/src/hooks/useDoc.js': `export { useDoc, useDocs, useQuery } from "${FIXTURE}";`,
  '/src/lib/notifications.js': `export { useDeviceStatus, onForegroundMessage, enableOnThisDevice, disableOnThisDevice } from "${FIXTURE}";`,
  '/src/lib/guardianWrites.js': `export { saveDisplayName, setGuardianPrefs, deleteMyAccount, signOutNow } from "${FIXTURE}";`,
  '/src/firebase.js': `export const app = {}, db = {}, auth = {}, googleProvider = {}; export const appCheckReady = Promise.resolve(); export { callable } from "${FIXTURE}";`,
};

export default defineConfig({
  plugins: [{ name: 'onboarding-preview-data', enforce: 'pre',
    resolveId(source) { if (source === 'firebase/firestore') return '\0onboarding-firestore'; },
    load(id) {
    if (id === '\0onboarding-firestore') return `
      export const doc = (...parts) => ({ parts });
      export const collection = doc;
      export const query = doc;
      export const where = doc;
      export const orderBy = doc;
      export const limit = doc;
      export const serverTimestamp = () => null;
      export const updateDoc = async () => {};
      export const getDocs = async () => ({ docs: [], empty: true });
      export const startAfter = doc;
    `;
    const path = id.replaceAll('\\', '/');
    for (const [end, code] of Object.entries(STUBS)) if (path.endsWith(`/parent${end}`)) return code;
  } }, react()],
  define: { __APP_BUILD__: JSON.stringify({ date: '2026-10-13', commit: 'preview' }) },
  server: { host: '127.0.0.1', port: 5190, strictPort: true },
  cacheDir: 'node_modules/.vite-onboarding-preview',
});
