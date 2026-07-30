import { useMemo, useState } from 'react';
import { useCollection } from '../hooks/useCollection.js';
import { createSection, updateSection, deleteSection } from '../data/sections.js';
import { GRADES, isSHS, TRACKS, STRANDS } from '../lib/constants.js';
import { T, S } from '../styles.js';
import { Btn, Inp, Sel, Field, Modal, Card, Confirm, EmptyState } from '../components/ui.jsx';

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
  const scheduleById = useMemo(() => new Map(schedules.map((s) => [s.id, s])), [schedules]);
  const [form, setForm] = useState(null);
  const [confirm, setConfirm] = useState(null);
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
        groups.map(([grade, list]) => (
          <div key={grade} style={{ marginBottom: 20 }}>
            <div style={{ fontFamily: T.display, fontWeight: 700, fontSize: 14, color: T.ink, marginBottom: 8 }}>Grade {grade}</div>
            <Card style={{ padding: 0, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead><tr style={S.thead}>
                  {['Section', 'Strand', 'Adviser', 'Schedule', ''].map((h) => <th key={h} style={S.th}>{h}</th>)}
                </tr></thead>
                <tbody>{list.map((s) => (
                  <tr key={s.id}>
                    <td style={{ ...S.td, fontWeight: 600 }}>{s.name}</td>
                    <td style={S.td}>{s.strand || '—'}</td>
                    <td style={S.td}>{s.adviserName || '—'}</td>
                    <td style={S.td}>{scheduleById.get(s.scheduleId)?.name || '—'}</td>
                    <td style={{ ...S.td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <Btn variant="ghost" onClick={() => setForm(s)} style={{ marginRight: 6 }}>Edit</Btn>
                      <Btn variant="ghost" onClick={() => setConfirm(s)} style={{ color: T.absent, borderColor: T.absent }}>Delete</Btn>
                    </td>
                  </tr>))}
                </tbody>
              </table>
            </Card>
          </div>
        ))
      )}
      {form && <SectionForm editing={form.id ? form : null} schoolYear={schoolYear} schedules={schedules} onClose={() => setForm(null)} />}
      {confirm && <Confirm message={`Delete ${confirm.name}? This cannot be undone.`} onYes={async () => { await deleteSection(confirm.id); setConfirm(null); }} onNo={() => setConfirm(null)} />}
    </div>
  );
}
