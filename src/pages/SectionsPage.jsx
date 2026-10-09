import { usePrintReadiness } from '../hooks/usePrintReadiness.js';
import { useAsyncAction } from '../hooks/useAsyncAction.js';
import { ActionFeedback } from '../components/ui.jsx';
import { EditorResources, ResourceState } from '../components/ui.jsx';
import { useMemo, useRef, useState } from 'react';
import { useCollectionResource } from '../hooks/useCollection.js';
import { createSection, updateSection, deleteSection } from '../data/sections.js';
import { GRADES, isSHS, TRACKS, STRANDS } from '../lib/constants.js';
import { alphabeticalSort, depedSort } from '../lib/roster.js';
import { sectionMatches } from '../lib/search.js';
import { T, S } from '../styles.js';
import { Btn, Inp, Sel, Field, Modal, Card, Confirm, EmptyState } from '../components/ui.jsx';
import StudentForm from './StudentForm.jsx';
import SectionDetailModal from './SectionDetailModal.jsx';
import IdCardsPrintSheets from '../components/IdCardsPrintable.jsx';
import { useIdCardPrintConfirm } from '../components/IdCardPrintConfirm.jsx';
import GradePills from '../components/GradePills.jsx';
import { isAdmin, canPrintSectionQr, grades, singleGrade, scopeRoster } from '../lib/access.js';

function SectionForm({ editing, schoolYear, schedules, onClose }) {
  const action = useAsyncAction();
  const [f, setF] = useState(editing || { gradeLevel: '', name: '', track: '', strand: '', adviserName: '', scheduleId: '', schoolYear });
  const [err, setErr] = useState('');
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const setGrade = (v) => setF((p) => ({ ...p, gradeLevel: v, ...(isSHS(v) ? {} : { track: '', strand: '' }) }));
  const setTrack = (v) => setF((p) => ({ ...p, track: v, strand: '' }));
  const save = async () => {
    if (!f.name?.trim() || !f.gradeLevel) { setErr('Section name and grade level are required.'); return; }
    await action.run('save', async () => {
      editing ? await updateSection(editing.id, f) : await createSection(f);
      onClose();
    });
  };
  return (
    <Modal labelledBy="section-form-title" onClose={onClose} dismissible={!action.busy}>
      <ActionFeedback action={action}/>
      <h2 id="section-form-title" style={{ fontFamily: T.display, color: T.ink, marginTop: 0, fontSize: 17, fontWeight: 600 }}>{editing ? 'Edit section' : 'New section'}</h2>
      {err && <div style={{ fontFamily: T.body, background: 'rgba(139,58,47,0.12)', color: T.absent, borderRadius: T.radius, padding: '8px 10px', fontSize: 12, marginBottom: 12 }}>{err}</div>}
      <Field label="Section name"><Inp value={f.name || ''} onChange={(e) => set('name', e.target.value)} /></Field>
      <Field label="Grade level">
        <Sel value={f.gradeLevel || ''} onChange={(e) => setGrade(e.target.value)}>
          <option value="">—</option>
          {GRADES.map((g) => <option key={g} value={g}>Grade {g}</option>)}
        </Sel>
      </Field>
      {isSHS(f.gradeLevel) && (
        <div style={{ display: 'grid', gridTemplateColumns: 'var(--sims-form-columns, 1fr 1fr)', gap: 10 }}>
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
        <Btn variant="ghost" disabled={action.busy} onClick={onClose}>Cancel</Btn>
        <Btn disabled={action.busy} onClick={save}>{editing ? 'Save changes' : 'Add section'}</Btn>
      </div>
    </Modal>
  );
}

export default function SectionsPage({ me, schoolYear }) {
  const sectionsResource = useCollectionResource('sections');
  const schedulesResource = useCollectionResource('schedules');
  const schedules = schedulesResource.data;
  const enrollmentsResource = useCollectionResource('enrollments');
  const studentsResource = useCollectionResource('students');
  const admin = isAdmin(me);
  const canPrint = canPrintSectionQr(me);
  const oneGrade = singleGrade(me);
  const { sections, enrollments, students } = useMemo(() => scopeRoster(
    { sections: sectionsResource.data, enrollments: enrollmentsResource.data, students: studentsResource.data }, grades(me), schoolYear),
    [sectionsResource.data, enrollmentsResource.data, studentsResource.data, me, schoolYear]);
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
  const [sectionQuery, setSectionQuery] = useState('');
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
  const sectionSearchActive = sectionQuery.trim().length > 0;
  const matchingSections = useMemo(() => activeList.filter((section) => sectionMatches(sectionQuery, section)), [activeList, sectionQuery]);
  const detailRoster = useMemo(() => {
    if (!detailSection) return [];
    const ids = enrolledStudentIdsBySection.get(detailSection.id) || new Set();
    return students.filter((s) => ids.has(s.id));
  }, [detailSection, enrolledStudentIdsBySection, students]);
  const detailRosterAlpha = useMemo(() => alphabeticalSort(detailRoster), [detailRoster]);
  const detailRosterDeped = useMemo(() => depedSort(detailRoster), [detailRoster]);
  const detailEntries = useMemo(() => detailRosterDeped.map((student) => ({ student, section: detailSection })), [detailRosterDeped, detailSection]);
  const printRoot = useRef(null);
  const printKey = (detailSection?.id || '') + ':' + detailRosterDeped.map(s => s.id + s.lrn).join(',');
  const printReady = usePrintReadiness(printRoot, printKey, detailRosterDeped.length);
  const { printAndConfirm, confirmDialog } = useIdCardPrintConfirm(me);

  const resources = [sectionsResource,schedulesResource,enrollmentsResource,studentsResource];

  return (
    <EditorResources resources={resources}><div>
      <ResourceState resources={resources}>
      <div className="sections-page-chrome">
        <div className="sims-heading" style={S.plate}>
          <h1 style={S.h1}>{oneGrade ? `Grade ${oneGrade} Sections` : 'Sections'}</h1>
          {admin && <Btn onClick={() => setForm({ schoolYear })}>Add section</Btn>}
        </div>
        {rows.length === 0 ? (
          <Card style={{ padding: 20 }}>
            <EmptyState title="No sections yet" hint={admin ? `Add your first section for SY ${schoolYear} with the button above.` : `No sections for your grade levels in SY ${schoolYear} yet.`} />
          </Card>
        ) : (
          <>
            <div style={{ marginBottom: 18 }}>
              <GradePills
                options={groups.map(([grade, list]) => ({ value: grade, label: `Grade ${grade}`, count: list.length }))}
                value={activeGrade}
                onChange={setSelectedGrade}
                label="Grade level"
              />
            </div>
            <div style={{ marginBottom: 10 }}>
              <Inp
                type="search"
                value={sectionQuery}
                onChange={(event) => setSectionQuery(event.target.value)}
                aria-label={`Search sections in Grade ${activeGrade}`}
                placeholder={`Search Grade ${activeGrade} sections by name`}
              />
            </div>
            {sectionSearchActive && (
              <div aria-live="polite" style={{ fontFamily: T.body, fontSize: 12, color: T.inkMuted, marginBottom: 10 }}>
                {matchingSections.length} section{matchingSections.length === 1 ? '' : 's'} in Grade {activeGrade} match &quot;{sectionQuery}&quot;.
              </div>
            )}
            <Card style={{ padding: 0, overflow: 'hidden' }}>
              {sectionSearchActive && matchingSections.length === 0 ? (
                <EmptyState title="No matching sections" hint={`No Grade ${activeGrade} sections match "${sectionQuery}".`} />
              ) : <div className="sims-table-scroll" role="region" aria-label="Records" tabIndex={0}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead><tr style={S.thead}>
                  {['Section', 'Strand', 'Adviser', 'Schedule', 'Enrolled', ''].map((h) => <th key={h} style={S.th}>{h}</th>)}
                </tr></thead>
                <tbody>{matchingSections.map((s) => (
                  <tr key={s.id} onClick={() => setDetailSection(s)} style={{ cursor: 'pointer' }}>
                    <td style={{ ...S.td, fontWeight: 600 }}><button className="sims-section-link" aria-label={`View ${s.name} section details`} onClick={(event) => { event.stopPropagation(); setDetailSection(s); }}><span>{s.name}</span><span aria-hidden="true">›</span></button></td>
                    <td style={S.td}>{s.strand || '—'}</td>
                    <td style={S.td}>{s.adviserName || '—'}</td>
                    <td style={S.td}>{scheduleById.get(s.scheduleId)?.name || '—'}</td>
                    <td style={{ ...S.td, ...T.num }}>{enrolledCountBySection.get(s.id) || 0}</td>
                    <td style={{ ...S.td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {admin && <>
                        <Btn variant="ghost" onClick={(e) => { e.stopPropagation(); setForm(s); }} style={{ marginRight: 6 }}>Edit</Btn>
                        <Btn variant="ghost" onClick={(e) => { e.stopPropagation(); setConfirm(s); }} style={{ color: T.absent, borderColor: T.absent }}>Delete</Btn>
                      </>}
                    </td>
                  </tr>))}
                </tbody>
              </table></div>}
            </Card>
          </>
        )}
      </div>
      </ResourceState>
      {form && <SectionForm editing={form.id ? form : null} schoolYear={schoolYear} schedules={schedules} onClose={() => setForm(null)} />}
      {confirm && <Confirm message={`Delete ${confirm.name}? This cannot be undone.`} onYes={async () => { await deleteSection(confirm.id); setConfirm(null); }} onNo={() => setConfirm(null)} />}
      {detailSection && (
        <SectionDetailModal printReady={printReady} onPrint={canPrint ? () => printAndConfirm(detailRosterDeped) : undefined}
          section={detailSection}
          roster={detailRosterAlpha}
          onClose={() => setDetailSection(null)}
          onEditStudent={admin ? (s) => setEditingStudent(s) : null}
        />
      )}
      {canPrint && detailSection && <div ref={printRoot}><IdCardsPrintSheets entries={detailEntries} printOnly /></div>}
      {confirmDialog}
      {editingStudent && <StudentForm students={students} editing={editingStudent} sections={sections} enrollments={enrollments} schoolYear={schoolYear} onClose={() => setEditingStudent(null)} />}
    </div></EditorResources>
  );
}
