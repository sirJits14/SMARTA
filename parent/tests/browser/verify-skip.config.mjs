import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Runs the real App and useAuth; Firebase and the data hooks are fakes.
const FIXTURE = '/tests/browser/verify-skip-fixture.js';
const STUBS = {
  '/src/hooks/useRoute.js': `export { useRoute } from "${FIXTURE}";`,
  '/src/hooks/useLinks.js': `export { useLinks } from "${FIXTURE}";`,
  '/src/hooks/useDoc.js': `export { useDoc, useDocs, useQuery, clearLastSeen } from "${FIXTURE}";`,
  '/src/lib/notifications.js': `export { useDeviceStatus, onForegroundMessage, enableOnThisDevice, disableOnThisDevice } from "${FIXTURE}";`,
  '/src/lib/guardianWrites.js': `export { saveDisplayName, setGuardianPrefs, deleteMyAccount, signOutNow } from "${FIXTURE}";`,
  '/src/firebase.js': `export const app = {}, db = {}, googleProvider = {}; export const appCheckReady = Promise.resolve(); export { auth, callable } from "${FIXTURE}";`,
};

export default defineConfig({
  plugins: [{ name: 'verify-skip-preview-data', enforce: 'pre',
    resolveId(source) {
      if (source === 'firebase/auth') return '\0verify-skip-auth';
      if (source === 'firebase/firestore') return '\0verify-skip-firestore';
    },
    load(id) {
      if (id === '\0verify-skip-auth') return `export { onAuthStateChanged, updateProfile, sendEmailVerification, signOut } from "${FIXTURE}";
        export const signInWithPopup = async () => {}, signInWithRedirect = async () => {}, getRedirectResult = async () => null,
          signInWithEmailAndPassword = async () => {}, createUserWithEmailAndPassword = async () => {}, sendPasswordResetEmail = async () => {};`;
      if (id === '\0verify-skip-firestore') return `export { doc, onSnapshot } from "${FIXTURE}";
        const any = (...a) => ({ a }); export const collection = any, query = any, where = any, orderBy = any, limit = any, startAfter = any;
        export const serverTimestamp = () => null, updateDoc = async () => {}, setDoc = async () => {}, deleteDoc = async () => {};
        export const getDocs = async () => ({ docs: [], empty: true });`;
      const path = id.replaceAll('\\', '/');
      for (const [end, code] of Object.entries(STUBS)) if (path.endsWith(`/parent${end}`)) return code;
    } }, react()],
  define: { __APP_BUILD__: JSON.stringify({ date: '2026-10-16', commit: 'preview' }) },
  server: { host: '127.0.0.1', port: 5191, strictPort: true },
  cacheDir: 'node_modules/.vite-verify-skip-preview',
});
