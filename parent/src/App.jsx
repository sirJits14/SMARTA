import { useCallback, useEffect, useRef, useState, lazy, Suspense } from 'react';
import { useRoute } from './hooks/useRoute.js';
import { useAuth } from './hooks/useAuth.js';
import { useDoc } from './hooks/useDoc.js';
import { callable } from './firebase.js';
import Shell from './components/Shell.jsx';
import { Spinner, EmptyState } from './components/ui.jsx';
import S from './strings.js';
import SignIn from './screens/SignIn.jsx';
import { portalView, notificationDestination } from './lib/nav.js';
import { readMode, writeMode, reconcileMode, schoolHome, canUseSchool } from './lib/portalMode.js';
import { openedToday, rememberOpened } from './lib/school.js';
import { useSchoolContext } from './hooks/useSchoolContext.js';
import { preloadAnnouncements } from './hooks/useAnnouncements.js';
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
const Verify = routeScreen(() => import('./screens/Verify.jsx'));
const Join = routeScreen(() => import('./screens/Join.jsx'));
const Home = routeScreen(() => import('./screens/Home.jsx'));
const History = routeScreen(() => import('./screens/History.jsx'));
const Inbox = routeScreen(() => import('./screens/Inbox.jsx'));
const Report = routeScreen(() => import('./screens/Report.jsx'));
const RequestAccess = routeScreen(() => import('./screens/RequestAccess.jsx'));
const Settings = routeScreen(() => import('./screens/Settings.jsx'));
const Announcements = routeScreen(() => import('./screens/Announcements.jsx'));
const AnnouncementDetail = routeScreen(() => import('./screens/AnnouncementDetail.jsx'));
const LearnerHistory = routeScreen(() => import('./screens/school/LearnerHistory.jsx'));
const School = routeScreen(() => import('./screens/School.jsx'));
const APP_SCREENS = [Home, History, Inbox, Report, Settings, Announcements, AnnouncementDetail];

const CONSENT_KEY = 'bnhs-parent-consent';
const hasLocalConsent = () => { try { return localStorage.getItem(CONSENT_KEY) !== null; } catch { return false; } };
// App routes an account without a profile cannot open yet; it registers through /join first.
const GATED = ['home', 'school', 'schoolLearner', 'learner', 'inbox', 'settings', 'report', 'announcements', 'announcement'];

export default function App() {
  const { route, navigate } = useRoute();
  const view = portalView(route);
  const scopedNavigate = useCallback((to, options) => {
    if (view === 'school' && /^\/settings(?:\/|\?|$)/.test(to)) {
      const url = new URL(to, window.location.origin);
      url.searchParams.set('view', 'school');
      navigate(`${url.pathname}${url.search}`, options);
    } else navigate(to, options);
  }, [view, navigate]);
  const { user, profile } = useAuth();
  const uid = user?.uid;
  const [mode, setModeState] = useState(() => readMode());
  // The saved choice belongs to the signed-in account.
  useEffect(() => { setModeState(readMode(uid)); }, [uid]);
  const setMode = useCallback((next) => { writeMode(uid, next); setModeState(next); }, [uid]);
  // Access is re-checked on every refresh: revoked, year-end and promotion all land here.
  // Asked for every admitted account, so Settings and the Class tab open on an answer already in hand.
  const school = useSchoolContext(uid, Boolean(profile));
  useEffect(() => {
    const { mode: next, changed } = reconcileMode(mode, school.data);
    if (!changed) return;
    setMode(next);
    if (next.view === 'family' && view === 'school') navigate('/', { replace: true });
  }, [school.data, mode, view, setMode, navigate]);
  // Lets SIMS show which assigned teachers have opened School mode (once a day at most).
  const openingRef = useRef(false);
  useEffect(() => {
    if (!uid || mode.view !== 'school' || !canUseSchool(school.data) || openingRef.current || openedToday(uid)) return;
    openingRef.current = true;
    callable('markSchoolOpenedFn')({}).then(() => rememberOpened(uid)).catch(() => {}).finally(() => { openingRef.current = false; });
  }, [uid, mode.view, school.data]);
  // School mode opens on the teacher's School home instead of the family list.
  useEffect(() => {
    if (profile && mode.view === 'school' && route.name === 'home') navigate(schoolHome(mode), { replace: true });
  }, [profile, mode, route.name, navigate]);
  // Consent.jsx reads this doc itself before the account profile exists.
  // Read for every signed-in account (rules allow it), so the profile created
  // during /join never flashes a loading screen that would reset the flow.
  const portal = useDoc(user ? 'settings/parent_portal' : null).data;
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

  // Once an account is admitted, fetch the other screens and the Notices list while idle.
  const accountReady = Boolean(profile);
  useEffect(() => {
    if (!accountReady) return;
    const idle = window.requestIdleCallback || ((f) => setTimeout(f, 1200));
    const cancel = window.cancelIdleCallback || clearTimeout;
    const id = idle(() => {
      APP_SCREENS.forEach((screen) => screen.preload().catch(() => {}));
      preloadAnnouncements(view).catch(() => {});
    });
    return () => cancel(id);
  }, [accountReady, view]);

  useEffect(() => {
    if (!user) return;
    let alive = true; let off = () => {};
    import('./lib/notifications.js').then(({ onForegroundMessage }) => onForegroundMessage((payload) => {
      if (alive) navigate(notificationDestination(payload?.data));
    })).then((unsub) => { if (alive) off = unsub; else unsub(); });
    return () => { alive = false; off(); };
  }, [user, navigate]);

  // Registration happens on /join, so the profile appearing mid-flow never swaps the screen underneath it.
  const mustJoin = profile === null && GATED.includes(route.name) && hasLocalConsent();
  useEffect(() => { if (mustJoin) navigate('/join', { replace: true }); }, [mustJoin, navigate]);

  if (user === undefined) return <Spinner label={S.loading} />;
  if (!user) return <SignIn />;
  if (!user.emailVerified && !verifiedOverride) return <Shell route={route} navigate={navigate} gate><Suspense fallback={<Spinner label={S.loading} />}><Verify user={user} onVerified={() => setVerifiedOverride(true)} /></Suspense></Shell>;
  if (profile === undefined) return <Spinner label={S.loading} />;

  // Re-consent gate: an admitted guardian (profile exists) whose
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

  // First-time flow: consent → /join (who are you?) → role steps. Deep links to /activate?c= and ?a= survive.
  // Registration records consent in the server-side profile, so returning accounts enter the app.
  const consented = Boolean(profile) || hasLocalConsent();
  const props = { user, profile, route, navigate: scopedNavigate, view, mode, setMode };
  let screen;
  let gate = false; // first-run Consent / Join have no PageHeader, so Shell adds the title row
  const toJoin = (v) => { try { localStorage.setItem(CONSENT_KEY, String(v)); } catch {} navigate(['activate', 'join'].includes(route.name) ? `/join${window.location.search}` : '/join', { replace: true }); };
  if (!profile && !consented && route.name !== 'requestAccess') { gate = true; screen = <Consent {...props} onAccepted={toJoin} />; }
  else if (!profile && GATED.includes(route.name)) { gate = true; screen = <Spinner label={S.loading} />; }
  else switch (route.name) {
    case 'home': screen = <Home {...props} />; break;
    case 'school': screen = <School {...props} />; break;
    case 'consent': screen = <Consent {...props} onAccepted={toJoin} />; break;
    case 'join': case 'activate': screen = <Join {...props} />; break;
    case 'schoolLearner': screen = <LearnerHistory {...props} sectionId={route.params.sectionId} studentId={route.params.studentId} />; break;
    case 'learner': screen = <History {...props} studentId={route.params.id} />; break;
    case 'inbox': screen = <Inbox {...props} />; break;
    case 'announcements': screen = <Announcements {...props} />; break;
    case 'announcement': screen = <AnnouncementDetail key={route.params.id} {...props} id={route.params.id} />; break;
    case 'report': screen = <Report {...props} eventId={route.params.eventId} studentId={route.query.student} />; break;
    case 'requestAccess': screen = <RequestAccess {...props} />; break;
    case 'settings': screen = <Settings {...props} />; break;
    default: screen = <EmptyState title={S.notFound} />;
  }
  return <Shell route={route} navigate={navigate} profile={profile} view={view} hasClass={mode.hasClass} gate={gate}><Suspense fallback={<Spinner label={S.loading} />}>{screen}</Suspense></Shell>;
}
