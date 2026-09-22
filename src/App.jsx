import { useEffect, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from './firebase.js';
import { currentSchoolYear } from './lib/constants.js';
import { useDoc } from './hooks/useCollection.js';
import { T } from './styles.js';
import Login from './components/Login.jsx';
import Shell from './components/Shell.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import StudentsPage from './pages/StudentsPage.jsx';
import SectionsPage from './pages/SectionsPage.jsx';
import SchedulesPage from './pages/SchedulesPage.jsx';
import EnrollPage from './pages/EnrollPage.jsx';
import AttendanceTakePage from './pages/AttendanceTakePage.jsx';
import AttendanceSummaryPage from './pages/AttendanceSummaryPage.jsx';
import IDCardsPage from './pages/IDCardsPage.jsx';
import GuardiansPage from './pages/GuardiansPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';

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
      {tab === 'take'
        ? <AttendanceTakePage schoolYear={schoolYear} />
        : <AttendanceSummaryPage schoolYear={schoolYear} />}
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
        {page==='dashboard' && <DashboardPage schoolYear={schoolYear} setPage={setPage} />}
        {page==='students' && <StudentsPage schoolYear={schoolYear} initialGradeFilter={pageParams?.gradeFilter} initialStatus={pageParams?.status} />}
        {page==='sections' && <SectionsPage schoolYear={schoolYear} />}
        {page==='schedules' && <SchedulesPage />}
        {page==='enroll' && <EnrollPage schoolYear={schoolYear} />}
        {page==='attendance' && <AttendanceArea schoolYear={schoolYear} />}
        {page==='idcards' && <IDCardsPage schoolYear={schoolYear} />}
        {page==='guardians' && <GuardiansPage schoolYear={schoolYear} me={me} />}
        {page==='settings' && <SettingsPage />}
      </Shell>
    </>
  );
}
