import { useEffect, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from './firebase.js';
import { currentSchoolYear } from './lib/constants.js';
import { useDoc } from './hooks/useCollection.js';
import { T } from './styles.js';
import Login from './components/Login.jsx';
import Shell from './components/Shell.jsx';
import StudentsPage from './pages/StudentsPage.jsx';
import SectionsPage from './pages/SectionsPage.jsx';
import EnrollPage from './pages/EnrollPage.jsx';
import AttendanceTakePage from './pages/AttendanceTakePage.jsx';
import AttendanceSummaryPage from './pages/AttendanceSummaryPage.jsx';

function AttendanceArea({ schoolYear }) {
  const [tab, setTab] = useState('take');
  return (
    <div>
      <div style={{ display:'flex', gap:8, marginBottom:16 }}>
        {[['take', 'Take'], ['summary', 'Summary']].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{
              fontFamily:T.body, fontSize:13, fontWeight:600, cursor:'pointer',
              padding:'7px 16px', borderRadius:999,
              border:`1px solid ${tab === key ? T.maroon : T.line}`,
              background: tab === key ? T.maroon : 'transparent',
              color: tab === key ? '#fff' : T.ink,
            }}
          >{label}</button>
        ))}
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
  const [page, setPage] = useState('students');
  const settings = useDoc('settings/app');
  const schoolYear = settings?.currentSchoolYear || currentSchoolYear();

  useEffect(() => onAuthStateChanged(auth, async (u) => {
    if (u) { const s = await getDoc(doc(db, 'users', u.email.toLowerCase())); if (s.exists()) setMe({ email:u.email.toLowerCase(), ...s.data() }); }
    else setMe(null);
    setReady(true);
  }), []);

  if (!ready) return null;
  if (!me) return <Login onSignedIn={setMe} />;

  return (
    <Shell me={me} page={page} setPage={setPage} schoolYear={schoolYear} onLogout={()=>{ signOut(auth); setMe(null); }}>
      {page==='students' && <StudentsPage schoolYear={schoolYear} />}
      {page==='sections' && <SectionsPage schoolYear={schoolYear} />}
      {page==='enroll' && <EnrollPage schoolYear={schoolYear} />}
      {page==='attendance' && <AttendanceArea schoolYear={schoolYear} />}
    </Shell>
  );
}
