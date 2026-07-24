import { useMemo, useState } from 'react';
import { useCollection } from '../hooks/useCollection.js';
import { fullName, depedSort } from '../lib/roster.js';
import { deleteStudent } from '../data/students.js';
import { STUDENT_STATUS } from '../lib/constants.js';
import { T, S } from '../styles.js';
import { Btn, Inp, Sel, Card, Confirm, EmptyState } from '../components/ui.jsx';
import StudentForm from './StudentForm.jsx';

export default function StudentsPage() {
  const students = useCollection('students');
  const [q, setQ] = useState(''); const [status, setStatus] = useState('');
  const [form, setForm] = useState(null); const [confirm, setConfirm] = useState(null);
  const rows = useMemo(() => depedSort(students.filter((s) => {
    const hit = `${s.lastName} ${s.firstName} ${s.lrn}`.toLowerCase().includes(q.toLowerCase());
    return hit && (!status || s.status === status);
  })), [students, q, status]);
  return (
    <div>
      <div style={S.plate}>
        <h1 style={S.h1}>Students</h1>
        <Btn onClick={() => setForm({})}>Add learner</Btn>
      </div>
      <Card style={{ padding: 20 }}>
        <div style={{ display: 'flex', gap: 20, marginBottom: 16, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 240, flex: 1 }}><Inp placeholder="Search name or LRN" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <div style={{ minWidth: 160 }}>
            <Sel value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All statuses</option>{STUDENT_STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
            </Sel>
          </div>
        </div>
        {rows.length === 0 ? <EmptyState title="No learners yet" hint="Add your first learner with the button above." /> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr style={S.thead}>
                {['LRN', 'Name', 'Sex', 'Status', ''].map((h) => <th key={h} style={S.th}>{h}</th>)}
              </tr></thead>
              <tbody>{rows.map((s) => (
                <tr key={s.id}>
                  <td style={{ ...S.td, ...T.num }}>{s.lrn}</td>
                  <td style={{ ...S.td, fontWeight: 600 }}>{fullName(s)}</td>
                  <td style={S.td}>{s.sex}</td>
                  <td style={S.td}>{s.status}</td>
                  <td style={{ ...S.td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <Btn variant="ghost" onClick={() => setForm(s)} style={{ marginRight: 6 }}>Edit</Btn>
                    <Btn variant="ghost" onClick={() => setConfirm(s)} style={{ color: T.absent, borderColor: T.absent }}>Delete</Btn>
                  </td>
                </tr>))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {form && <StudentForm students={students} editing={form.id ? form : null} onClose={() => setForm(null)} />}
      {confirm && <Confirm message={`Delete ${fullName(confirm)}? This cannot be undone.`} onYes={async () => { await deleteStudent(confirm.id); setConfirm(null); }} onNo={() => setConfirm(null)} />}
    </div>
  );
}
