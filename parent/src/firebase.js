import { initializeApp } from 'firebase/app';
import { initializeFirestore, persistentLocalCache, persistentSingleTabManager, connectFirestoreEmulator } from 'firebase/firestore';
import { getAuth, GoogleAuthProvider, connectAuthEmulator } from 'firebase/auth';

export const app = initializeApp({
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
});

if (import.meta.env.VITE_APPCHECK_DEBUG_TOKEN) self.FIREBASE_APPCHECK_DEBUG_TOKEN = import.meta.env.VITE_APPCHECK_DEBUG_TOKEN;
// firebase/app-check pulls in the reCAPTCHA client; load it in the background
// instead of blocking the initial chunk on it. initializeAppCheck() itself is
// fire-and-forget (nothing downstream awaits its return value), so a brief
// async hop before it runs is behaviorally transparent.
if (import.meta.env.VITE_RECAPTCHA_SITE_KEY) {
  import('firebase/app-check').then(({ initializeAppCheck, ReCaptchaV3Provider }) => {
    initializeAppCheck(app, { provider: new ReCaptchaV3Provider(import.meta.env.VITE_RECAPTCHA_SITE_KEY), isTokenAutoRefreshEnabled: true });
  });
}

export const db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentSingleTabManager() }) });
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// firebase/functions is only needed when a callable is actually invoked
// (Activate/Report/RequestAccess/Settings actions), so it's loaded on first
// call instead of on initial page load. `callable(name)` keeps returning a
// plain function synchronously, matching every existing `callable(name)(data)`
// call site — only the module fetch inside it is deferred.
let _functions;
async function functionsInstance() {
  if (_functions) return _functions;
  const { getFunctions, connectFunctionsEmulator } = await import('firebase/functions');
  _functions = getFunctions(app, import.meta.env.VITE_FUNCTIONS_REGION || 'asia-southeast1');
  if (import.meta.env.VITE_USE_EMULATORS === 'true') connectFunctionsEmulator(_functions, '127.0.0.1', 5001);
  return _functions;
}
export const callable = (name) => async (data) => {
  const [{ httpsCallable }, fns] = await Promise.all([import('firebase/functions'), functionsInstance()]);
  return httpsCallable(fns, name)(data);
};

if (import.meta.env.VITE_USE_EMULATORS === 'true') {
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
}
