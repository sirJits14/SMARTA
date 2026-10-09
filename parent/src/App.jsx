import { useEffect, useState, lazy, Suspense } from 'react';
import { useRoute } from './hooks/useRoute.js';
import { useAuth } from './hooks/useAuth.js';
import { useDoc } from './hooks/useDoc.js';
import { callable } from './firebase.js';
import Shell from './components/Shell.jsx';
import { Spinner, EmptyState } from './components/ui.jsx';
import S from './strings.js';
import { onForegroundMessage } from './lib/notifications.js';
import SignIn from './screens/SignIn.jsx';
import Verify from './screens/Verify.jsx';
// Screens below are only needed once a route is resolved, so they're
// route-split out of the sign-in/verify chunk to keep the initial load light.
// Each can also be fetched ahead of time (preload); once it has loaded it
// renders directly instead of through lazy(), so a page transition never
// captures a loading spinner.
function routeScreen(load) {
  let Loaded = null; let pending = null;
  const preload = () => (pending ??= load().then((m) => { Loaded = m.default; return m; }, (e) => { pending = null; throw e; }));
  const Lazy = lazy(preload);
  // Chosen once per mount: swapping Lazy for Loaded mid-life would remount the screen.
  function Screen(props) {
    const [Component] = useState(() => Loaded ?? Lazy);
    return <Component {...props} />;
  }
  Screen.preload = preload;
  return Screen;
}
const Consent = routeScreen(() => import('./screens/Consent.jsx'));
const Activate = routeScreen(() => import('./screens/Activate.jsx'));
const Home = routeScreen(() => import('./screens/Home.jsx'));
const History = routeScreen(() => import('./screens/History.jsx'));
const Inbox = routeScreen(() => import('./screens/Inbox.jsx'));
const Report = routeScreen(() => import('./screens/Report.jsx'));
const RequestAccess = routeScreen(() => import('./screens/RequestAccess.jsx'));
const Settings = routeScreen(() => import('./screens/Settings.jsx'));
const Announcements = routeScreen(() => import('./screens/Announcements.jsx'));
const AnnouncementDetail = routeScreen(() => import('./screens/AnnouncementDetail.jsx'));
const APP_SCREENS = [Home, History, Inbox, Report, Settings, Announcements, AnnouncementDetail];

const CONSENT_KEY = 'bnhs-parent-consent';

export default function App() {
  const { route, navigate } = useRoute();
  const { user, profile } = useAuth();
  // Only subscribed once a profile exists -- Consent.jsx reads this same
  // doc itself for the pre-activation flow, so this is purely for the
  // already-linked re-consent gate below.
  const portal = useDoc(profile ? 'settings/parent_portal' : null).data;
  // Verify.jsx confirms email verification client-side (user.reload() +
  // a forced getIdToken(true)) without a page reload -- a hard navigation
  // here would race the SDK's async write of the refreshed token to
  // IndexedDB and can resurrect the pre-verification (unverified) token,
  // which then gets sent on the very next guardian-callable request. This
  // flag is the soft-transition signal in place of that reload.
  const [verifiedOverride, setVerifiedOverride] = useState(false);
  // Scoped to the signed-in uid so a stale true from a previous guardian
  // (e.g. a shared family device: A verifies and continues, signs out, B
  // signs in with a genuinely unverified account in the same tab) can never
  // let B skip the Verify gate -- onAuthStateChanged firing for a new user
  // is exactly the "identity changed" signal this resets on.
  useEffect(() => { setVerifiedOverride(false); }, [user?.uid]);

  // Once a linked guardian is in, fetch the other screens while idle.
  const linked = Boolean(profile);
  useEffect(() => {
    if (!linked) return;
    const idle = window.requestIdleCallback || ((f) => setTimeout(f, 1200));
    const cancel = window.cancelIdleCallback || clearTimeout;
    const id = idle(() => APP_SCREENS.forEach((screen) => screen.preload().catch(() => {})));
    return () => cancel(id);
  }, [linked]);

  useEffect(() => {
    if (!user) return;
    let off = () => {};
    onForegroundMessage((payload) => {
      const id = payload?.data?.announcementId;
      navigate(id ? `/announcements/${encodeURIComponent(id)}` : '/inbox');
    }).then((unsub) => { off = unsub; });
    return () => off();
  }, [user, navigate]);

  if (user === undefined) return <Spinner label={S.loading} />;
  if (!user) return <SignIn />;
  if (!user.emailVerified && !verifiedOverride) return <Shell route={route} navigate={navigate} gate><Verify user={user} onVerified={() => setVerifiedOverride(true)} /></Shell>;
  if (profile === undefined) return <Spinner label={S.loading} />;

  // Re-consent gate: an already-linked guardian (profile exists) whose
  // stored consentVersion has fallen behind the live
  // settings/parent_portal.consentVersion (staff raised it in Portal
  // Settings) is blocked here until they re-accept -- spec §7, "Re-shown
  // when consentVersion changes". activateCode's own reconciliation only
  // runs on a NEW activation, so this is the only path that catches a
  // guardian who never activates again. portal === undefined means still
  // loading; wait for it rather than flashing the app first.
  if (profile) {
    if (portal === undefined) return <Spinner label={S.loading} />;
    const liveConsentVersion = portal?.consentVersion ?? 1;
    if (profile.consentVersion !== liveConsentVersion) return <Shell route={route} navigate={navigate} gate><Suspense fallback={<Spinner label={S.loading} />}><Consent user={user} profile={profile} route={route} navigate={navigate} onAccepted={() => { callable('acceptConsentFn')({}).catch(() => {}); }} /></Suspense></Shell>;
  }

  // First-time flow: consent (stored locally until the first activation
  // records it server-side) → activation. Deep links to /activate?c= survive.
  let consented = false;
  try { consented = Boolean(profile) || localStorage.getItem(CONSENT_KEY) !== null; } catch { consented = Boolean(profile); }
  const props = { user, profile, route, navigate };
  let screen;
  let gate = false; // first-run Consent / Activate have no PageHeader, so Shell adds the title row
  if (!profile && !consented && route.name !== 'requestAccess') { gate = true; screen = <Consent {...props} onAccepted={(v) => { try { localStorage.setItem(CONSENT_KEY, String(v)); } catch {} navigate(route.name === 'activate' ? `/activate${window.location.search}` : '/activate', { replace: true }); }} />; }
  else if (!profile && ['home', 'learner', 'inbox', 'settings', 'report', 'announcements', 'announcement'].includes(route.name)) { gate = true; screen = <Activate {...props} />; }
  else switch (route.name) {
    case 'home': screen = <Home {...props} />; break;
    case 'consent': screen = <Consent {...props} onAccepted={() => navigate('/activate')} />; break;
    case 'activate': screen = <Activate {...props} />; break;
    case 'learner': screen = <History {...props} studentId={route.params.id} />; break;
    case 'inbox': screen = <Inbox {...props} />; break;
    case 'announcements': screen = <Announcements {...props} />; break;
    case 'announcement': screen = <AnnouncementDetail key={route.params.id} {...props} id={route.params.id} />; break;
    case 'report': screen = <Report {...props} eventId={route.params.eventId} studentId={route.query.student} />; break;
    case 'requestAccess': screen = <RequestAccess {...props} />; break;
    case 'settings': screen = <Settings {...props} />; break;
    default: screen = <EmptyState title={S.notFound} />;
  }
  return <Shell route={route} navigate={navigate} profile={profile} gate={gate}><Suspense fallback={<Spinner label={S.loading} />}>{screen}</Suspense></Shell>;
}
