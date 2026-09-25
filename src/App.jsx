import { useEffect, useState, lazy, Suspense } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from './firebase.js';
import { currentSchoolYear } from './lib/constants.js';
import { useDoc } from './hooks/useCollection.js';
import { T } from './styles.js';
import Login from './components/Login.jsx';
import Shell from './components/Shell.jsx';
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

const PageFallback = () => <div style={{ fontFamily: T.body, color: T.inkMuted, padding: 24 }}>Loading…</div>;

function AttendanceArea({ schoolYear }) {
  const [tab, setTab] = useState('take');
  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 18 }}>
        {[['take', 'Take Attendance'], ['summary', 'Monthly Summary']].map(([key, label]) => {
          const active = tab === key;
          return (
            <button
              key={key}
              onClick={() => setTab(key)}
              style={{
                fontFamily: T.body, fontSize: 12, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase',
                cursor: 'pointer', padding: '9px 18px', borderRadius: T.pill, border: 'none',
                background: active ? T.primary : 'transparent',
                color: active ? '#fff' : T.inkMuted,
                transition: 'background 0.15s ease-out, color 0.15s ease-out',
              }}
            >{label}</button>
          );
        })}
      </div>
      <Suspense fallback={<PageFallback />}>
        {tab === 'take'
          ? <AttendanceTakePage schoolYear={schoolYear} />
          : <AttendanceSummaryPage schoolYear={schoolYear} />}
      </Suspense>
    </div>
  );
}

export default function App() {
  const [me, setMe] = useState(null);
  const [ready, setReady] = useState(false);
  const [page, setPageRaw] = useState('dashboard');
  const [pageParams, setPageParams] = useState(null);
  const setPage = (next, params = null) => { setPageRaw(next); setPageParams(params); };
  const settings = useDoc('settings/app');
  const schoolYear = settings?.currentSchoolYear || currentSchoolYear();

  useEffect(() => onAuthStateChanged(auth, async (u) => {
    if (u) { const s = await getDoc(doc(db, 'users', u.email.toLowerCase())); if (s.exists()) setMe({ email:u.email.toLowerCase(), ...s.data() }); }
    else setMe(null);
    setReady(true);
  }), []);

  if (!ready) return null;

  const reducedMotionGuard = (
    <style>{'@media (prefers-reduced-motion: reduce) { *, *::before, *::after { transition: none !important; animation: none !important; } }'}</style>
  );

  if (!me) return <>{reducedMotionGuard}<Login onSignedIn={setMe} /></>;

  return (
    <>
      {reducedMotionGuard}
      <Shell me={me} page={page} setPage={setPage} schoolYear={schoolYear} onLogout={()=>{ signOut(auth); setMe(null); }}>
        <Suspense fallback={<PageFallback />}>
          {page==='dashboard' && <DashboardPage schoolYear={schoolYear} setPage={setPage} />}
          {page==='students' && <StudentsPage schoolYear={schoolYear} initialGradeFilter={pageParams?.gradeFilter} initialStatus={pageParams?.status} />}
          {page==='sections' && <SectionsPage schoolYear={schoolYear} />}
          {page==='schedules' && <SchedulesPage />}
          {page==='enroll' && <EnrollPage schoolYear={schoolYear} />}
          {page==='attendance' && <AttendanceArea schoolYear={schoolYear} />}
          {page==='idcards' && <IDCardsPage schoolYear={schoolYear} />}
          {page==='guardians' && <GuardiansPage schoolYear={schoolYear} me={me} />}
          {page==='settings' && <SettingsPage />}
        </Suspense>
      </Shell>
    </>
  );
}
