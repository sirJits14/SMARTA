import { useMemo, useState } from 'react';
import { useCollection } from '../hooks/useCollection.js';
import { fullName, depedSort } from '../lib/roster.js';
import { deleteStudent } from '../data/students.js';
import { STUDENT_STATUS, GRADES, UNASSIGNED } from '../lib/constants.js';
import { T, S } from '../styles.js';
import { Btn, Inp, Sel, Card, Confirm, EmptyState } from '../components/ui.jsx';
import StudentForm from './StudentForm.jsx';
import ImportStudentsWizard from './ImportStudentsWizard.jsx';

export default function StudentsPage({ schoolYear, initialGradeFilter, initialStatus }) {
  const students = useCollection('students');
  const sections = useCollection('sections');
  const enrollments = useCollection('enrollments');
  const [q, setQ] = useState(''); const [status, setStatus] = useState(initialStatus || '');
  const [gradeFilter, setGradeFilter] = useState(initialGradeFilter || ''); const [sectionFilter, setSectionFilter] = useState('');
  const [form, setForm] = useState(null); const [confirm, setConfirm] = useState(null);
  const [importOpen, setImportOpen] = useState(false);

  const sectionsSY = useMemo(() =>
    sections.filter((s) => s.schoolYear === schoolYear).sort((a, b) => a.gradeLevel - b.gradeLevel || a.name.localeCompare(b.name)),
    [sections, schoolYear]);
  const sectionById = useMemo(() => new Map(sectionsSY.map((s) => [s.id, s])), [sectionsSY]);
  const enrollmentByStudent = useMemo(() => {
    const m = new Map();
    enrollments.forEach((e) => { if (e.schoolYear === schoolYear && e.status === 'enrolled') m.set(e.studentId, e); });
    return m;
  }, [enrollments, schoolYear]);
  const sectionsForGradeFilter = useMemo(() =>
    gradeFilter && gradeFilter !== UNASSIGNED ? sectionsSY.filter((s) => String(s.gradeLevel) === gradeFilter) : [],
    [sectionsSY, gradeFilter]);

  const setGradeFilterAndReset = (v) => { setGradeFilter(v); setSectionFilter(''); };

  const rows = useMemo(() => depedSort(students.filter((s) => {
    const hit = `${s.lastName} ${s.firstName} ${s.lrn}`.toLowerCase().includes(q.toLowerCase());
    if (!hit) return false;
    const en = enrollmentByStudent.get(s.id);
    if (status === UNASSIGNED) { if (en) return false; }
    else if (status && s.status !== status) return false;
    if (gradeFilter === UNASSIGNED || sectionFilter === UNASSIGNED) return !en;
    if (gradeFilter && (!en || String(en.gradeLevel) !== gradeFilter)) return false;
    if (sectionFilter && (!en || en.sectionId !== sectionFilter)) return false;
    return true;
  })), [students, q, status, gradeFilter, sectionFilter, enrollmentByStudent]);

  return (
    <div>
      <div style={S.plate}>
        <h1 style={S.h1}>Students</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn variant="ghost" onClick={() => setImportOpen(true)}>Import from Excel</Btn>
          <Btn onClick={() => setForm({})}>Add learner</Btn>
        </div>
      </div>
      <Card style={{ padding: 20 }}>
        <div style={{ display: 'flex', gap: 20, marginBottom: 16, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 240, flex: 1 }}><Inp placeholder="Search name or LRN" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <div style={{ minWidth: 160 }}>
            <Sel value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All statuses</option>{STUDENT_STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
              <option value={UNASSIGNED}>No Section Assigned</option>
            </Sel>
          </div>
          <div style={{ minWidth: 140 }}>
            <Sel value={gradeFilter} onChange={(e) => setGradeFilterAndReset(e.target.value)}>
              <option value="">All grades</option>
              {GRADES.map((g) => <option key={g} value={g}>Grade {g}</option>)}
              <option value={UNASSIGNED}>Unassigned</option>
            </Sel>
          </div>
          <div style={{ minWidth: 160 }}>
            <Sel value={sectionFilter} onChange={(e) => setSectionFilter(e.target.value)} disabled={gradeFilter === UNASSIGNED}>
              <option value="">All sections</option>
              {sectionsForGradeFilter.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              <option value={UNASSIGNED}>No Section Assigned</option>
            </Sel>
          </div>
        </div>
        {rows.length === 0 ? <EmptyState title="No learners yet" hint="Add your first learner with the button above." /> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr style={S.thead}>
                {['LRN', 'Name', 'Sex', 'Status', 'Grade', 'Section', ''].map((h) => <th key={h} style={S.th}>{h}</th>)}
              </tr></thead>
              <tbody>{rows.map((s) => {
                const en = enrollmentByStudent.get(s.id);
                const sec = en ? sectionById.get(en.sectionId) : null;
                return (
                  <tr key={s.id}>
                    <td style={{ ...S.td, ...T.num }}>{s.lrn}</td>
                    <td style={{ ...S.td, fontWeight: 600 }}>{fullName(s)}</td>
                    <td style={S.td}>{s.sex}</td>
                    <td style={S.td}>{s.status}</td>
                    <td style={S.td}>{en ? `Grade ${en.gradeLevel}` : 'Unassigned'}</td>
                    <td style={S.td}>{sec ? sec.name : 'Unassigned'}</td>
                    <td style={{ ...S.td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <Btn variant="ghost" onClick={() => setForm(s)} style={{ marginRight: 6 }}>Edit</Btn>
                      <Btn variant="ghost" onClick={() => setConfirm(s)} style={{ color: T.absent, borderColor: T.absent }}>Delete</Btn>
                    </td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        )}
      </Card>
      {form && <StudentForm students={students} editing={form.id ? form : null} onClose={() => setForm(null)} />}
      {confirm && <Confirm message={`Delete ${fullName(confirm)}? This cannot be undone.`} onYes={async () => { await deleteStudent(confirm.id); setConfirm(null); }} onNo={() => setConfirm(null)} />}
      {importOpen && <ImportStudentsWizard students={students} sections={sections} schoolYear={schoolYear} onClose={() => setImportOpen(false)} />}
    </div>
  );
}
