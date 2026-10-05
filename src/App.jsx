import { useEffect, useState, lazy, Suspense } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from './firebase.js';
import { shouldStartNavigation } from './lib/navigationState.js';
import { currentSchoolYear } from './lib/constants.js';
import { canOpen, profileRefusal, ownProfile, DISABLED_MESSAGE } from './lib/access.js';
import { useDoc } from './hooks/useCollection.js';
import { T } from './styles.js';
import Login from './components/Login.jsx';
import Shell from './components/Shell.jsx';
import ChangePassword from './components/ChangePassword.jsx';
import loadingGif from './assets/loading.gif';
// Route-split: each page (and everything only it imports, like exceljs for
// Students/Attendance-summary or qrcode for ID Cards/Guardians->Codes) loads
// only once actually navigated to, instead of all ten loading up front in
// the single initial bundle.
const DashboardPage = lazy(() => import('./pages/DashboardPage.jsx'));
const StudentsPage = lazy(() => import('./pages/StudentsPage.jsx'));
const SectionsPage = lazy(() => import('./pages/SectionsPage.jsx'));
const SchedulesPage = lazy(() => import('./pages/SchedulesPage.jsx'));
const EnrollPage = lazy(() => import('./pages/EnrollPage.jsx'));
const AttendanceTakePage = lazy(() => import('./pages/AttendanceTakePage.jsx'));
const AttendanceSummaryPage = lazy(() => import('./pages/AttendanceSummaryPage.jsx'));
const IDCardsPage = lazy(() => import('./pages/IDCardsPage.jsx'));
const GuardiansPage = lazy(() => import('./pages/GuardiansPage.jsx'));
const SettingsPage = lazy(() => import('./pages/SettingsPage.jsx'));
const AccountsPage = lazy(() => import('./pages/AccountsPage.jsx'));

const PageFallback = () => (
  <div style={{ display: 'grid', placeItems: 'center', padding: 40 }}>
    <img src={loadingGif} alt="Loading" width={56} height={56} />
  </div>
);

// Full-viewport boot screen, shown once while auth is resolving -- there is
// no Shell/nav to sit inside yet, unlike PageFallback.
const BootLoader = () => (
  <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', background: T.bg }}>
    <img src={loadingGif} alt="Loading" width={96} height={96} />
  </div>
);

function AttendanceArea({ me, schoolYear, entry }) {
  const [tab, setTab] = useState('take');
  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 18 }}>
        {[['take', 'Take Attendance'], ['summary', 'Monthly Summary']].map(([key, label]) => {
          const active = tab === key;
          return (
            <button
              key={key}
              className="sims-tab"
              aria-pressed={active}
              onClick={() => setTab(key)}
              style={{
                fontFamily: T.body, fontSize: 12, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase',
                cursor: 'pointer', padding: '9px 18px', borderRadius: T.pill, border: 'none',
                background: active ? T.primary : 'transparent',
                color: active ? '#fff' : T.inkMuted,
                transition: 'background 0.16s ease-out, color 0.16s ease-out, box-shadow 0.16s ease-out, transform 0.16s ease-out',
              }}
            >{label}</button>
          );
        })}
      </div>
      <Suspense fallback={<PageFallback />}>
        <div key={tab} className="sims-page-transition">
          {tab === 'take'
            ? <AttendanceTakePage me={me} schoolYear={schoolYear} entry={entry} />
            : <AttendanceSummaryPage me={me} schoolYear={schoolYear} />}
        </div>
      </Suspense>
    </div>
  );
}

export default function App() {
  // authUser: undefined while Firebase Auth resolves, then a user or null.
  // me: undefined while that user's profile loads, then the profile or null.
  const [authUser, setAuthUser] = useState(undefined);
  const [me, setMe] = useState(undefined);
  const [notice, setNotice] = useState('');
  const [page, setPageRaw] = useState('dashboard');
  const [pageParams, setPageParams] = useState(null);
  const [navigationSequence, setNavigationSequence] = useState(0);
  const setPage = (next, params = null) => { if (!shouldStartNavigation(page, next, params)) return; setPageRaw(next); setPageParams(params); setNavigationSequence(n => n + 1); };
  const settings = useDoc('settings/app');
  const schoolYear = settings?.currentSchoolYear || currentSchoolYear();

  useEffect(() => onAuthStateChanged(auth, setAuthUser), []);

  // Live profile: role/grade changes apply at once, and a disabled or deleted
  // profile signs the user out with an explanation on the login screen.
  useEffect(() => {
    if (authUser === undefined) return;
    if (!authUser) { setMe(null); return; }
    const email = authUser.email?.toLowerCase();
    const refuse = (message) => { setNotice(message); setMe(null); signOut(auth); };
    if (!email) { refuse('This account has no staff profile yet. Ask an administrator to add one.'); return; }
    setMe(undefined);
    let loaded = false;
    return onSnapshot(doc(db, 'users', email), (snap) => {
      const data = ownProfile(snap.exists() ? snap.data() : null, authUser.uid);
      const profile = data ? { email, ...data } : null;
      // A profile that vanishes after loading was deleted mid-session: same notice as disabled.
      const refusal = loaded && !profile ? DISABLED_MESSAGE : profileRefusal(profile);
      if (refusal) { refuse(refusal); return; }
      loaded = true;
      setMe(profile);
    // After a normal sign-out the listener can error before cleanup; only refuse while signed in.
    }, () => { if (auth.currentUser) refuse('Could not load your staff profile. Please sign in again.'); });
  }, [authUser]);

  if (authUser === undefined || (authUser && me === undefined)) return <BootLoader />;

  const reducedMotionGuard = (
    <style>{'@media (prefers-reduced-motion: reduce) { *, *::before, *::after { transition: none !important; animation: none !important; } }'}</style>
  );
  const logout = () => { setNotice(''); signOut(auth); };

  if (!me) return <>{reducedMotionGuard}<Login notice={notice} onAttempt={() => setNotice('')} /></>;
  if (me.mustChangePassword) return <>{reducedMotionGuard}<ChangePassword me={me} onLogout={logout} /></>;

  // A page this role can't open (stale state, or a role change) falls back to the dashboard.
  const shown = canOpen(me, page) ? page : 'dashboard';

  return (
    <>
      {reducedMotionGuard}
      <Shell me={me} page={shown} setPage={setPage} schoolYear={schoolYear} onLogout={logout}>
        <Suspense fallback={<PageFallback />}>
          {shown==='dashboard' && <DashboardPage me={me} schoolYear={schoolYear} setPage={setPage} />}
          {shown==='students' && <StudentsPage me={me} schoolYear={schoolYear} initialGradeFilter={pageParams?.gradeFilter} initialStatus={pageParams?.status} />}
          {shown==='sections' && <SectionsPage me={me} schoolYear={schoolYear} />}
          {shown==='schedules' && <SchedulesPage me={me} />}
          {shown==='enroll' && <EnrollPage schoolYear={schoolYear} />}
          {shown==='attendance' && <AttendanceArea me={me} key={navigationSequence} schoolYear={schoolYear} entry={pageParams?.attendanceEntry} />}
          {shown==='idcards' && <IDCardsPage me={me} schoolYear={schoolYear} />}
          {shown==='guardians' && <GuardiansPage schoolYear={schoolYear} me={me} />}
          {shown==='settings' && <SettingsPage />}
          {shown==='accounts' && <AccountsPage me={me} />}
        </Suspense>
      </Shell>
    </>
  );
}
