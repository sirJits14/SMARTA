import { useMemo, useState } from 'react';
import { useCollection } from '../hooks/useCollection.js';
import { fullName, depedSort } from '../lib/roster.js';
import { deleteStudent } from '../data/students.js';
import { STUDENT_STATUS } from '../lib/constants.js';
import { T, S } from '../styles.js';
import { Btn, Inp, Sel, Confirm, EmptyState } from '../components/ui.jsx';
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
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
        <h1 style={{ fontFamily:T.display, margin:0 }}>Students</h1>
        <Btn onClick={()=>setForm({})}>Add learner</Btn>
      </div>
      <div style={{ display:'flex', gap:10, marginBottom:14 }}>
        <Inp placeholder="Search name or LRN" value={q} onChange={(e)=>setQ(e.target.value)} style={{ maxWidth:320 }} />
        <Sel value={status} onChange={(e)=>setStatus(e.target.value)} style={{ maxWidth:180 }}><option value="">All statuses</option>{STUDENT_STATUS.map((s)=><option key={s} value={s}>{s}</option>)}</Sel>
      </div>
      {rows.length === 0 ? <EmptyState title="No learners yet" hint="Add your first learner with the button above." /> : (
        <div style={{ ...S.card, padding:0, overflow:'hidden' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
            <thead><tr style={{ background:T.paper, textAlign:'left' }}>
              {['LRN','Name','Sex','Status',''].map((h)=><th key={h} style={{ padding:'10px 12px', borderBottom:`1px solid ${T.line}` }}>{h}</th>)}
            </tr></thead>
            <tbody>{rows.map((s)=>(
              <tr key={s.id} style={{ borderBottom:`1px solid ${T.line}` }}>
                <td style={{ padding:'10px 12px', ...T.num }}>{s.lrn}</td>
                <td style={{ padding:'10px 12px' }}>{fullName(s)}</td>
                <td style={{ padding:'10px 12px' }}>{s.sex}</td>
                <td style={{ padding:'10px 12px' }}>{s.status}</td>
                <td style={{ padding:'10px 12px', textAlign:'right', whiteSpace:'nowrap' }}>
                  <Btn variant="ghost" onClick={()=>setForm(s)} style={{ marginRight:6 }}>Edit</Btn>
                  <Btn variant="ghost" onClick={()=>setConfirm(s)} style={{ color:T.absent }}>Delete</Btn>
                </td>
              </tr>))}
            </tbody>
          </table>
        </div>
      )}
      {form && <StudentForm students={students} editing={form.id ? form : null} onClose={()=>setForm(null)} />}
      {confirm && <Confirm message={`Delete ${fullName(confirm)}? This cannot be undone.`} onYes={async()=>{ await deleteStudent(confirm.id); setConfirm(null); }} onNo={()=>setConfirm(null)} />}
    </div>
  );
}
