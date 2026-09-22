import { useRoute } from './hooks/useRoute.js';
import { useAuth } from './hooks/useAuth.js';
import Shell from './components/Shell.jsx';
import { Spinner, EmptyState } from './components/ui.jsx';
import S from './strings.js';
import SignIn from './screens/SignIn.jsx';
import Verify from './screens/Verify.jsx';
import Consent from './screens/Consent.jsx';
import Activate from './screens/Activate.jsx';
import Home from './screens/Home.jsx';
import History from './screens/History.jsx';
import Inbox from './screens/Inbox.jsx';
import Report from './screens/Report.jsx';
import RequestAccess from './screens/RequestAccess.jsx';
import Settings from './screens/Settings.jsx';

const CONSENT_KEY = 'bnhs-parent-consent';

export default function App() {
  const { route, navigate } = useRoute();
  const { user, profile } = useAuth();

  if (user === undefined) return <Spinner label={S.loading} />;
  if (!user) return <SignIn />;
  if (!user.emailVerified) return <Shell route={route} navigate={navigate}><Verify user={user} /></Shell>;
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
  return <Shell route={route} navigate={navigate}>{screen}</Shell>;
}
