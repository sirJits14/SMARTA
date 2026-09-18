import { useMemo, useState } from 'react';
import { useCollection } from '../hooks/useCollection.js';
import { createSection, updateSection, deleteSection } from '../data/sections.js';
import { GRADES, isSHS, TRACKS, STRANDS } from '../lib/constants.js';
import { alphabeticalSort, depedSort } from '../lib/roster.js';
import { T, S } from '../styles.js';
import { Btn, Inp, Sel, Field, Modal, Card, Confirm, EmptyState } from '../components/ui.jsx';
import StudentForm from './StudentForm.jsx';
import SectionDetailModal from './SectionDetailModal.jsx';
import IdCardsPrintSheets from '../components/IdCardsPrintable.jsx';

function SectionForm({ editing, schoolYear, schedules, onClose }) {
  const [f, setF] = useState(editing || { gradeLevel: '', name: '', track: '', strand: '', adviserName: '', scheduleId: '', schoolYear });
  const [err, setErr] = useState('');
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const setGrade = (v) => setF((p) => ({ ...p, gradeLevel: v, ...(isSHS(v) ? {} : { track: '', strand: '' }) }));
  const setTrack = (v) => setF((p) => ({ ...p, track: v, strand: '' }));
  const save = async () => {
    if (!f.name?.trim() || !f.gradeLevel) { setErr('Section name and grade level are required.'); return; }
    editing ? await updateSection(editing.id, f) : await createSection(f);
    onClose();
  };
  return (
    <Modal onClose={onClose}>
      <h2 style={{ fontFamily: T.display, color: T.ink, marginTop: 0, fontSize: 17, fontWeight: 600 }}>{editing ? 'Edit section' : 'New section'}</h2>
      {err && <div style={{ fontFamily: T.body, background: 'rgba(139,58,47,0.12)', color: T.absent, borderRadius: T.radius, padding: '8px 10px', fontSize: 12, marginBottom: 12 }}>{err}</div>}
      <Field label="Section name"><Inp value={f.name || ''} onChange={(e) => set('name', e.target.value)} /></Field>
      <Field label="Grade level">
        <Sel value={f.gradeLevel || ''} onChange={(e) => setGrade(e.target.value)}>
          <option value="">—</option>
          {GRADES.map((g) => <option key={g} value={g}>Grade {g}</option>)}
        </Sel>
      </Field>
      {isSHS(f.gradeLevel) && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="Track">
            <Sel value={f.track || ''} onChange={(e) => setTrack(e.target.value)}>
              <option value="">—</option>
              {TRACKS.map((t) => <option key={t} value={t}>{t}</option>)}
            </Sel>
          </Field>
          <Field label="Strand">
            <Sel value={f.strand || ''} onChange={(e) => set('strand', e.target.value)} disabled={!f.track}>
              <option value="">—</option>
              {(STRANDS[f.track] || []).map((s) => <option key={s} value={s}>{s}</option>)}
            </Sel>
          </Field>
        </div>
      )}
      <Field label="Adviser name"><Inp value={f.adviserName || ''} onChange={(e) => set('adviserName', e.target.value)} /></Field>
      <Field label="Schedule">
        <Sel value={f.scheduleId || ''} onChange={(e) => set('scheduleId', e.target.value)}>
          <option value="">No schedule set</option>
          {schedules.map((sc) => <option key={sc.id} value={sc.id}>{sc.name}</option>)}
        </Sel>
      </Field>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={save}>{editing ? 'Save changes' : 'Add section'}</Btn>
      </div>
    </Modal>
  );
}

export default function SectionsPage({ schoolYear }) {
  const sections = useCollection('sections');
  const schedules = useCollection('schedules');
  const enrollments = useCollection('enrollments');
  const students = useCollection('students');
  const scheduleById = useMemo(() => new Map(schedules.map((s) => [s.id, s])), [schedules]);
  const enrolledCountBySection = useMemo(() => {
    const m = new Map();
    enrollments.forEach((e) => {
      if (e.schoolYear === schoolYear && e.status === 'enrolled') m.set(e.sectionId, (m.get(e.sectionId) || 0) + 1);
    });
    return m;
  }, [enrollments, schoolYear]);
  const enrolledStudentIdsBySection = useMemo(() => {
    const m = new Map();
    enrollments.forEach((e) => {
      if (e.status === 'enrolled') {
        if (!m.has(e.sectionId)) m.set(e.sectionId, new Set());
        m.get(e.sectionId).add(e.studentId);
      }
    });
    return m;
  }, [enrollments]);
  const [form, setForm] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [detailSection, setDetailSection] = useState(null);
  const [editingStudent, setEditingStudent] = useState(null);
  const rows = useMemo(() =>
    sections
      .filter((s) => s.schoolYear === schoolYear)
      .sort((a, b) => a.gradeLevel - b.gradeLevel || a.name.localeCompare(b.name)),
    [sections, schoolYear]);
  const groups = useMemo(() => {
    const m = new Map();
    rows.forEach((s) => { if (!m.has(s.gradeLevel)) m.set(s.gradeLevel, []); m.get(s.gradeLevel).push(s); });
    return [...m.entries()];
  }, [rows]);
  // Grade-level submenu: pick one grade's sections at a time instead of
  // stacking every grade's table on the page at once. `selectedGrade` is
  // sticky across data refreshes; activeGrade falls back to the first
  // available grade whenever the selection isn't (or is no longer, e.g.
  // after switching school year) one of the currently loaded grades.
  const [selectedGrade, setSelectedGrade] = useState(null);
  const activeGrade = groups.some(([g]) => g === selectedGrade) ? selectedGrade : (groups[0]?.[0] ?? null);
  const activeList = groups.find(([g]) => g === activeGrade)?.[1] || [];
  const detailRoster = useMemo(() => {
    if (!detailSection) return [];
    const ids = enrolledStudentIdsBySection.get(detailSection.id) || new Set();
    return students.filter((s) => ids.has(s.id));
  }, [detailSection, enrolledStudentIdsBySection, students]);
  const detailRosterAlpha = useMemo(() => alphabeticalSort(detailRoster), [detailRoster]);
  return (
    <div>
      <div style={S.plate}>
        <h1 style={S.h1}>Sections</h1>
        <Btn onClick={() => setForm({ schoolYear })}>Add section</Btn>
      </div>
      {rows.length === 0 ? (
        <Card style={{ padding: 20 }}>
          <EmptyState title="No sections yet" hint={`Add your first section for SY ${schoolYear} with the button above.`} />
        </Card>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 6, marginBottom: 18, flexWrap: 'wrap' }}>
            {groups.map(([grade, list]) => {
              const active = grade === activeGrade;
              return (
                <button
                  key={grade}
                  onClick={() => setSelectedGrade(grade)}
                  style={{
                    fontFamily: T.body, fontSize: 12, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase',
                    cursor: 'pointer', padding: '9px 18px', borderRadius: T.pill, border: 'none',
                    background: active ? T.primary : 'transparent',
                    color: active ? '#fff' : T.inkMuted,
                    transition: 'background 0.15s ease-out, color 0.15s ease-out',
                  }}
                >Grade {grade} ({list.length})</button>
              );
            })}
          </div>
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr style={S.thead}>
                {['Section', 'Strand', 'Adviser', 'Schedule', 'Enrolled', ''].map((h) => <th key={h} style={S.th}>{h}</th>)}
              </tr></thead>
              <tbody>{activeList.map((s) => (
                <tr key={s.id} onClick={() => setDetailSection(s)} style={{ cursor: 'pointer' }}>
                  <td style={{ ...S.td, fontWeight: 600 }}>{s.name}</td>
                  <td style={S.td}>{s.strand || '—'}</td>
                  <td style={S.td}>{s.adviserName || '—'}</td>
                  <td style={S.td}>{scheduleById.get(s.scheduleId)?.name || '—'}</td>
                  <td style={{ ...S.td, ...T.num }}>{enrolledCountBySection.get(s.id) || 0}</td>
                  <td style={{ ...S.td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <Btn variant="ghost" onClick={(e) => { e.stopPropagation(); setForm(s); }} style={{ marginRight: 6 }}>Edit</Btn>
                    <Btn variant="ghost" onClick={(e) => { e.stopPropagation(); setConfirm(s); }} style={{ color: T.absent, borderColor: T.absent }}>Delete</Btn>
                  </td>
                </tr>))}
              </tbody>
            </table>
          </Card>
        </>
      )}
      {form && <SectionForm editing={form.id ? form : null} schoolYear={schoolYear} schedules={schedules} onClose={() => setForm(null)} />}
      {confirm && <Confirm message={`Delete ${confirm.name}? This cannot be undone.`} onYes={async () => { await deleteSection(confirm.id); setConfirm(null); }} onNo={() => setConfirm(null)} />}
      {detailSection && (
        <SectionDetailModal
          section={detailSection}
          roster={detailRosterAlpha}
          onClose={() => setDetailSection(null)}
          onEditStudent={(s) => setEditingStudent(s)}
        />
      )}
      {detailSection && <IdCardsPrintSheets section={detailSection} roster={depedSort(detailRoster)} printOnly />}
      {editingStudent && <StudentForm students={students} editing={editingStudent} onClose={() => setEditingStudent(null)} />}
    </div>
  );
}
