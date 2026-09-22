import { useEffect, useState, lazy, Suspense } from 'react';
import { useRoute } from './hooks/useRoute.js';
import { useAuth } from './hooks/useAuth.js';
import Shell from './components/Shell.jsx';
import { Spinner, EmptyState } from './components/ui.jsx';
import S from './strings.js';
import { onForegroundMessage } from './lib/notifications.js';
import SignIn from './screens/SignIn.jsx';
import Verify from './screens/Verify.jsx';
// Screens below are only needed once a route is resolved, so they're
// route-split out of the sign-in/verify chunk to keep the initial load light.
const Consent = lazy(() => import('./screens/Consent.jsx'));
const Activate = lazy(() => import('./screens/Activate.jsx'));
const Home = lazy(() => import('./screens/Home.jsx'));
const History = lazy(() => import('./screens/History.jsx'));
const Inbox = lazy(() => import('./screens/Inbox.jsx'));
const Report = lazy(() => import('./screens/Report.jsx'));
const RequestAccess = lazy(() => import('./screens/RequestAccess.jsx'));
const Settings = lazy(() => import('./screens/Settings.jsx'));

const CONSENT_KEY = 'bnhs-parent-consent';

export default function App() {
  const { route, navigate } = useRoute();
  const { user, profile } = useAuth();
  // Verify.jsx confirms email verification client-side (user.reload() +
  // a forced getIdToken(true)) without a page reload -- a hard navigation
  // here would race the SDK's async write of the refreshed token to
  // IndexedDB and can resurrect the pre-verification (unverified) token,
  // which then gets sent on the very next guardian-callable request. This
  // flag is the soft-transition signal in place of that reload.
  const [verifiedOverride, setVerifiedOverride] = useState(false);

  useEffect(() => {
    if (!user) return;
    let off = () => {};
    onForegroundMessage(() => navigate('/inbox')).then((unsub) => { off = unsub; });
    return () => off();
  }, [user, navigate]);

  if (user === undefined) return <Spinner label={S.loading} />;
  if (!user) return <SignIn />;
  if (!user.emailVerified && !verifiedOverride) return <Shell route={route} navigate={navigate}><Verify user={user} onVerified={() => setVerifiedOverride(true)} /></Shell>;
  if (profile === undefined) return <Spinner label={S.loading} />;

  // First-time flow: consent (stored locally until the first activation
  // records it server-side) → activation. Deep links to /activate?c= survive.
  let consented = false;
  try { consented = Boolean(profile) || localStorage.getItem(CONSENT_KEY) !== null; } catch { consented = Boolean(profile); }
  const props = { user, profile, route, navigate };
  let screen;
  if (!profile && !consented && route.name !== 'requestAccess') screen = <Consent {...props} onAccepted={(v) => { try { localStorage.setItem(CONSENT_KEY, String(v)); } catch {} navigate(route.name === 'activate' ? `/activate${window.location.search}` : '/activate', { replace: true }); }} />;
  else if (!profile && ['home', 'learner', 'inbox', 'settings', 'report'].includes(route.name)) screen = <Activate {...props} />;
  else switch (route.name) {
    case 'home': screen = <Home {...props} />; break;
    case 'consent': screen = <Consent {...props} onAccepted={() => navigate('/activate')} />; break;
    case 'activate': screen = <Activate {...props} />; break;
    case 'learner': screen = <History {...props} studentId={route.params.id} />; break;
    case 'inbox': screen = <Inbox {...props} />; break;
    case 'report': screen = <Report {...props} eventId={route.params.eventId} studentId={route.query.student} />; break;
    case 'requestAccess': screen = <RequestAccess {...props} />; break;
    case 'settings': screen = <Settings {...props} />; break;
    default: screen = <EmptyState title={S.notFound} />;
  }
  return <Shell route={route} navigate={navigate}><Suspense fallback={<Spinner label={S.loading} />}>{screen}</Suspense></Shell>;
}
