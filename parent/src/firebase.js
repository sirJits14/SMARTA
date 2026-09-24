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
// instead of blocking the initial chunk on it (first paint must not wait on
// the reCAPTCHA download). `appCheckReady` resolves once initializeAppCheck()
// has actually run (or immediately, if no site key is configured), so a
// listener call site can `await appCheckReady` right before subscribing --
// closing the race where a Firestore permission-denied fires before App
// Check has attached and never self-heals once it does. This adds at most
// one async hop before a listener attaches, never before the app renders.
export const appCheckReady = import.meta.env.VITE_RECAPTCHA_SITE_KEY
  ? import('firebase/app-check').then(({ initializeAppCheck, ReCaptchaEnterpriseProvider }) => {
      initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(import.meta.env.VITE_RECAPTCHA_SITE_KEY), isTokenAutoRefreshEnabled: true });
    })
  : Promise.resolve();

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
// The SDK's cached ID token can lag behind auth.currentUser's own profile
// flags -- most importantly, right after a guardian verifies their email:
// user.reload() updates currentUser.emailVerified immediately, but the
// cached ID token (whatever getIdToken() returns without forcing) can keep
// carrying the pre-verification email_verified:false claim for a while
// after that, through some further async settling inside the SDK that a
// single force-refresh issued right next to reload() doesn't reliably
// outlast. Every guardian-callable request sends exactly that cached
// claim, so a guardian who just verified and moves straight to Activate
// gets rejected with "Verify your email first" even though the UI has
// already moved on. Rather than chase that internal timing, catch the
// mismatch right before the network call that actually depends on it:
// if the profile says verified but the cached token disagrees, force one
// fresh mint here. This only costs an extra round trip in that specific
// mismatch window, not on every call.
function decodeJwtPayload(token) {
  const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)));
}
async function freshEnoughToken() {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) return;
  const cached = await user.getIdToken();
  if (!decodeJwtPayload(cached).email_verified) await user.getIdToken(true);
}

export const callable = (name) => async (data) => {
  const [{ httpsCallable }, fns] = await Promise.all([import('firebase/functions'), functionsInstance()]);
  await freshEnoughToken();
  return httpsCallable(fns, name)(data);
};

if (import.meta.env.VITE_USE_EMULATORS === 'true') {
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
}
