import { lazy, Suspense, useState } from 'react';
import { createRoot } from 'react-dom/client';
import Shell from '/src/components/Shell.jsx';
import Login from '/src/components/Login.jsx';
import { Btn, Card, Confirm, EmptyState, Field, Inp, Modal, Sel } from '/src/components/ui.jsx';
import { S } from '/src/styles.js';
import '/shared/theme/theme.css';
import '/src/registrar.css';

// Visual check for the shell, page header and shared components. Synthetic data only.
const ROWS = [
  ['Dela Cruz, Juan', '123456789012', 'Grade 7 · Sampaguita', 'Active'],
  ['Santos, Maria', '123456789013', 'Grade 7 · Sampaguita', 'Active'],
  ['Reyes, Jose', '123456789014', 'Grade 8 · Narra', 'Withdrawn'],
];
function Sample() {
  const [modal, setModal] = useState(null);
  return <>
    <div className="sims-heading" style={S.plate}>
      <h1 style={S.h1}>Students</h1>
      <div style={{ display: 'flex', gap: 8 }}><Btn variant="ghost">Import from Excel</Btn><Btn onClick={() => setModal('form')}>Add learner</Btn></div>
    </div>
    <Card style={{ padding: 20, marginBottom: 16 }}>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220 }}><Field label="Search learners"><Inp placeholder="Search name or LRN" /></Field></div>
        <div style={{ width: 200 }}><Field label="Grade"><Sel><option>All grades</option><option>Grade 7</option></Sel></Field></div>
        <div style={{ width: 200 }}><Field label="LRN" error="LRN must be exactly 12 digits."><Inp defaultValue="12345" /></Field></div>
        <div style={{ width: 200 }}><Field label="Disabled"><Inp disabled defaultValue="Read only" /></Field></div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Btn>Primary</Btn><Btn variant="ghost">Secondary</Btn><Btn variant="quiet">Quiet</Btn><Btn variant="danger" onClick={() => setModal('confirm')}>Delete</Btn>
        <Btn loading>Saving…</Btn><Btn disabled>Disabled</Btn><Btn variant="ghost" disabled>Disabled</Btn>
      </div>
    </Card>
    <Card style={{ padding: 0, overflow: 'hidden', marginBottom: 16 }}>
      <div className="sims-table-scroll" role="region" aria-label="Learners" tabIndex={0}><table>
        <thead><tr style={S.thead}>{['Name', 'LRN', 'Section', 'Status'].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
        <tbody>{ROWS.map(r => <tr key={r[1]}>{r.map((c, i) => <td key={i} style={S.td}>{c}</td>)}</tr>)}</tbody>
      </table></div>
    </Card>
    <Card><EmptyState title="No schedules yet" hint="Add your first shift schedule with the button above." /></Card>
    {modal === 'form' && <Modal title="Add learner" onClose={() => setModal(null)}>
      <Field label="Last name"><Inp /></Field><Field label="First name"><Inp /></Field>
      <div className="sims-dialog-actions"><Btn variant="ghost" onClick={() => setModal(null)}>Cancel</Btn><Btn>Save</Btn></div>
    </Modal>}
    {modal === 'confirm' && <Confirm title="Delete learner" message="Delete Juan Dela Cruz? This cannot be undone." onYes={() => setModal(null)} onNo={() => setModal(null)} />}
  </>;
}
const params = new URLSearchParams(location.search);
const me = { role: 'admin', name: 'Maria Clara Santos', email: 'preview@example.test' };
// ?page=students|sections|dashboard|attendance renders the real page on the harness's synthetic rows.
const PAGES = {
  students: lazy(() => import('/src/pages/StudentsPage.jsx')),
  sections: lazy(() => import('/src/pages/SectionsPage.jsx')),
  dashboard: lazy(() => import('/src/pages/DashboardPage.jsx')),
  attendance: lazy(() => import('/src/pages/AttendanceTakePage.jsx')),
};
const page = params.get('page');
const Page = PAGES[page];
createRoot(document.getElementById('root')).render(params.has('login')
  ? <Login notice={params.get('login') || ''} />
  : <Shell me={me} page={Page ? page : 'students'} setPage={() => {}} schoolYear="2026-2027" onLogout={() => {}}>
    {Page ? <Suspense fallback={null}><Page me={me} schoolYear="2026-2027" setPage={() => {}} /></Suspense> : <Sample />}
  </Shell>);
