import { usePrintReadiness } from '../hooks/usePrintReadiness.js';
import { useAsyncAction } from '../hooks/useAsyncAction.js';
import { ActionFeedback } from '../components/ui.jsx';
import { EditorResources, ResourceState } from '../components/ui.jsx';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useCollectionResource } from '../hooks/useCollection.js';
import { createSection, updateSection, deleteSection } from '../data/sections.js';
import { getCoordinatorSectionOptions, updateCoordinatorSection } from '../data/coordinatorSections.js';
import { GRADES, isSHS, TRACKS, STRANDS } from '../lib/constants.js';
import { alphabeticalSort, capsName, depedSort } from '../lib/roster.js';
import { sectionMatches } from '../lib/search.js';
import { T, S } from '../styles.js';
import { Btn, Inp, Sel, Field, Modal, Card, Confirm, EmptyState, RowMenu } from '../components/ui.jsx';
import StudentForm from './StudentForm.jsx';
import SectionDetailModal from './SectionDetailModal.jsx';
import IdCardsPrintSheets from '../components/IdCardsPrintable.jsx';
import { useIdCardPrintConfirm } from '../components/IdCardPrintConfirm.jsx';
import GradePills from '../components/GradePills.jsx';
import { isAdmin, grades, singleGrade, scopeRoster, canEditSection, sectionEditSchoolYears, canIssueAdvisorySlip } from '../lib/access.js';
import { callableMessage } from '../../parent/src/lib/school.js';
import { useAdvisoryStatus } from '../hooks/useAdvisoryStatus.js';
import { issueAdvisorySlips, revokeAdvisorySlip } from '../data/advisorySlips.js';
import { adviserStatusText, slipCandidates, slipConfirmMessage, showAdvisoryPanel, withoutRevokedSlip,
  needingSlip, withSelected, selectedSections, selectionText } from '../lib/advisoryStatus.js';
import AdvisorySlipsPanel from './sections/AdvisorySlipsPanel.jsx';

export function SectionForm({ editing, schoolYear, schedules, onClose, restricted = false }) {
  const action = useAsyncAction();
  const [f, setF] = useState(editing || { gradeLevel: '', name: '', track: '', strand: '', adviserName: '', scheduleId: '', schoolYear });
  const adviserManaged = Boolean(editing?.schoolAdviserUid);
  useEffect(() => {
    setF(previous => editing?.schoolAdviserUid || previous.schoolAdviserUid
      ? { ...previous, adviserName: editing?.adviserName || '', schoolAdviserUid: editing?.schoolAdviserUid }
      : previous);
  }, [editing?.schoolAdviserUid, editing?.adviserName]);
  const [err, setErr] = useState('');
  const [optionsAttempt, setOptionsAttempt] = useState(0);
  const [options, setOptions] = useState({ data: [], loading: true, error: null });
  useEffect(() => {
    if (!restricted) return;
    let live = true;
    setOptions({ data: [], loading: true, error: null });
    getCoordinatorSectionOptions(editing.id).then(result => {
      if (live) setOptions({ data: result.schedules, loading: false, error: null });
    }).catch(error => { if (live) setOptions({ data: [], loading: false, error }); });
    return () => { live = false; };
  }, [restricted, editing?.id, optionsAttempt]);
  const scheduleChoices = restricted ? options.data : schedules;
  const optionsUnavailable = restricted && (options.loading || options.error);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const setGrade = (v) => setF((p) => ({ ...p, gradeLevel: v, ...(isSHS(v) ? {} : { track: '', strand: '' }) }));
  const setTrack = (v) => setF((p) => ({ ...p, track: v, strand: '' }));
  const save = async () => {
    if (optionsUnavailable) return;
    if (!f.name?.trim() || !f.gradeLevel) { setErr('Section name and grade level are required.'); return; }
    await action.run('save', async () => {
      if (restricted) await updateCoordinatorSection(editing.id, f);
      else if (editing) await updateSection(editing.id, f);
      else await createSection(f);
      onClose();
    });
  };
  return (
    <Modal labelledBy="section-form-title" onClose={onClose} dismissible={!action.busy}>
      <ActionFeedback action={action}/>
      <h2 id="section-form-title" style={{ fontFamily: T.display, color: T.ink, marginTop: 0, fontSize: 17, fontWeight: 600 }}>{editing ? 'Edit section' : 'New section'}</h2>
      {restricted && <p style={{ color: T.inkMuted, fontSize: 13 }}>Grade {editing.gradeLevel} · SY {editing.schoolYear}{editing.strand ? ` · ${editing.strand}` : ''}</p>}
      {err && <div style={{ fontFamily: T.body, background: 'rgba(139,58,47,0.12)', color: T.absent, borderRadius: T.radius, padding: '8px 10px', fontSize: 12, marginBottom: 12 }}>{err}</div>}
      <Field label="Section name"><Inp value={f.name || ''} onChange={(e) => set('name', e.target.value)} /></Field>
      {!restricted && <Field label="Grade level">
        <Sel value={f.gradeLevel || ''} onChange={(e) => setGrade(e.target.value)} disabled={adviserManaged}>
          <option value="">—</option>
          {GRADES.map((g) => <option key={g} value={g}>Grade {g}</option>)}
        </Sel>
      </Field>}
      {!restricted && isSHS(f.gradeLevel) && (
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
      <Field label="Adviser name"><Inp className="sims-caps" readOnly={adviserManaged} aria-describedby={adviserManaged ? 'section-adviser-source' : undefined} value={adviserManaged ? editing.adviserName || '' : f.adviserName || ''} onChange={(e) => set('adviserName', e.target.value)} /></Field>
      {adviserManaged && <p id="section-adviser-source" style={{ color: T.inkMuted, fontSize: 12 }}>Synced from School Access. Change the Class Adviser assignment there.</p>}
      <ResourceState resources={restricted ? [{ ...options, retry: () => setOptionsAttempt(value => value + 1) }] : []} label="available schedules">
      <Field label="Schedule / shift">
        <Sel value={f.scheduleId || ''} onChange={(e) => set('scheduleId', e.target.value)}>
          <option value="">No schedule set</option>
          {f.scheduleId && !scheduleChoices.some(sc => sc.id === f.scheduleId) && <option value={f.scheduleId} disabled>Schedule unavailable — choose another</option>}
          {scheduleChoices.map((sc) => <option key={sc.id} value={sc.id}>{sc.name}</option>)}
        </Sel>
      </Field>
      </ResourceState>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Btn variant="ghost" disabled={action.busy} onClick={onClose}>Cancel</Btn>
        <Btn disabled={action.busy || !!optionsUnavailable} onClick={save}>{action.busy ? 'Saving…' : editing ? 'Save changes' : 'Add section'}</Btn>
      </div>
    </Modal>
  );
}

export default function SectionsPage({ me, schoolYear }) {
  const admin = isAdmin(me);
  const oneGrade = singleGrade(me);
  const yearOptions = canEditSection(me, { gradeLevel: oneGrade, schoolYear }, schoolYear)
    ? sectionEditSchoolYears(schoolYear) : [schoolYear];
  const [yearSelection, setYearSelection] = useState(null);
  const selectedYear = yearOptions.includes(yearSelection) ? yearSelection : schoolYear;
  const canViewRoster = selectedYear === schoolYear;
  const sectionsResource = useCollectionResource('sections');
  const schedulesResource = useCollectionResource('schedules');
  const schedules = schedulesResource.data;
  const enrollmentsResource = useCollectionResource('enrollments');
  // Preserve production roster subscriptions; next-year setup edits metadata only.
  const studentsResource = useCollectionResource('students');
  const { sections, enrollments, students } = useMemo(() => scopeRoster(
    { sections: sectionsResource.data, enrollments: enrollmentsResource.data, students: studentsResource.data }, grades(me), selectedYear),
    [sectionsResource.data, enrollmentsResource.data, studentsResource.data, me, selectedYear]);
  const scheduleById = useMemo(() => new Map(schedules.map((s) => [s.id, s])), [schedules]);
  const enrolledCountBySection = useMemo(() => {
    const m = new Map();
    enrollments.forEach((e) => {
      if (e.schoolYear === selectedYear && e.status === 'enrolled') m.set(e.sectionId, (m.get(e.sectionId) || 0) + 1);
    });
    return m;
  }, [enrollments, selectedYear]);
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
  // Advisory slips belong to the current school year only.
  const advisory = useAdvisoryStatus(canViewRoster);
  const [advisorySlips, setAdvisorySlips] = useState(null);
  const [slipConfirm, setSlipConfirm] = useState(null);
  const [slipError, setSlipError] = useState('');
  // Ticked section ids; kept across grade tabs so one print run can span grades.
  const [slipSelection, setSlipSelection] = useState(() => new Set());
  const toggleSlip = (id) => setSlipSelection((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const runSlips = async ({ kind, sections: targets }) => {
    setSlipError('');
    try {
      if (kind === 'revoke') {
        await revokeAdvisorySlip({ sectionId: targets[0].id });
        setAdvisorySlips((current) => withoutRevokedSlip(current, targets[0].id));
      } else {
        setAdvisorySlips(await issueAdvisorySlips({ sectionIds: targets.map((s) => s.id) }));
        setSlipSelection(new Set());
      }
    } catch (e) { setSlipError(callableMessage(e) || 'Could not update advisory slips.'); }
    finally { setSlipConfirm(null); advisory.reload(); }
  };
  const rows = useMemo(() =>
    sections
      .filter((s) => s.schoolYear === selectedYear)
      .sort((a, b) => a.gradeLevel - b.gradeLevel || a.name.localeCompare(b.name)),
    [sections, selectedYear]);
  const slipTargets = useMemo(() => (canViewRoster ? slipCandidates(rows, advisory.bySection, me) : []), [canViewRoster, rows, advisory.bySection, me]);
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
  const slipTargetIds = useMemo(() => new Set(slipTargets.map((s) => s.id)), [slipTargets]);
  const ticked = useMemo(() => selectedSections(slipSelection, slipTargets), [slipSelection, slipTargets]);
  const untickedNeedingSlip = useMemo(() => needingSlip(matchingSections.filter((s) => slipTargetIds.has(s.id) && !slipSelection.has(s.id)), advisory.bySection),
    [matchingSections, slipTargetIds, slipSelection, advisory.bySection]);
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
      {showAdvisoryPanel(advisorySlips, detailSection) && <AdvisorySlipsPanel result={advisorySlips} onClose={() => setAdvisorySlips(null)} />}
      <div className="sections-page-chrome">
        <div className="sims-heading" style={S.plate}>
          <h1 style={S.h1}>{oneGrade ? `Grade ${oneGrade} Sections` : 'Sections'}</h1>
          {admin && <Btn onClick={() => setForm({ schoolYear: selectedYear })}>Add section</Btn>}
        </div>
        {slipError && <p role="alert" className="sims-feedback">{slipError}</p>}
        {advisory.error && <p role="alert" className="sims-feedback">{advisory.error}</p>}
        {yearOptions.length > 1 && <div style={{ maxWidth: 300 }}>
          <Field label="School year">
            <Sel value={selectedYear} onChange={event => {
              setYearSelection(event.target.value); setForm(null); setConfirm(null); setDetailSection(null); setEditingStudent(null);
            }}>
              {yearOptions.map((year, index) => <option key={year} value={year}>{year} ({index === 0 ? 'Current' : 'Next'})</option>)}
            </Sel>
          </Field>
        </div>}
        {!canViewRoster && <p style={{ color: T.inkMuted, fontSize: 13 }}>Next-year section setup. Learner rosters are available for the current school year.</p>}
        {rows.length === 0 ? (
          <Card style={{ padding: 20 }}>
            <EmptyState title="No sections yet" hint={admin ? `Add your first section for SY ${selectedYear} with the button above.` : `No sections for your grade levels in SY ${selectedYear} yet.`} />
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
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <div style={{ flex: '1 1 260px' }}>
                <Inp
                  type="search"
                  value={sectionQuery}
                  onChange={(event) => setSectionQuery(event.target.value)}
                  aria-label={`Search sections in Grade ${activeGrade}`}
                  placeholder={`Search Grade ${activeGrade} sections by name`}
                />
              </div>
              {untickedNeedingSlip.length > 0 && <Btn variant="ghost" onClick={() => setSlipSelection((prev) => withSelected(prev, untickedNeedingSlip))}>
                {`Select ${untickedNeedingSlip.length} ${untickedNeedingSlip.length === 1 ? 'section' : 'sections'} without a slip`}</Btn>}
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
                  {slipTargets.length > 0 && <th style={{ ...S.th, width: 44 }} aria-label="Select for advisory slips" />}
                  {['Section', 'Strand', 'Adviser', 'Schedule', ...(canViewRoster ? ['Enrolled'] : []), ''].map((h) => <th key={h} style={S.th}>{h}</th>)}
                </tr></thead>
                <tbody>{matchingSections.map((s) => (
                  <tr key={s.id} onClick={canViewRoster ? () => setDetailSection(s) : undefined} style={{ cursor: canViewRoster ? 'pointer' : undefined }}>
                    {slipTargets.length > 0 && <td style={S.td} onClick={(e) => e.stopPropagation()}>
                      {slipTargetIds.has(s.id) && <input type="checkbox" aria-label={`Select ${s.name} for an advisory slip`} checked={slipSelection.has(s.id)}
                        onChange={() => toggleSlip(s.id)} style={{ width: 18, height: 18, cursor: 'pointer' }} />}
                    </td>}
                    <td style={S.tdStrong}>{canViewRoster ? <button className="sims-section-link" aria-label={`View ${s.name} section details`} onClick={(event) => { event.stopPropagation(); setDetailSection(s); }}><span>{s.name}</span><span aria-hidden="true">›</span></button> : s.name}</td>
                    <td style={S.td}>{s.strand || '—'}</td>
                    <td style={S.td}>
                      <div>{capsName(s.adviserName) || '—'}</div>
                      {canViewRoster && <div style={{ fontSize: 12, color: T.inkMuted }}>{adviserStatusText(advisory.bySection.get(s.id))}</div>}
                    </td>
                    <td style={S.td}>{scheduleById.get(s.scheduleId)?.name || '—'}</td>
                    {canViewRoster && <td style={{ ...S.td, ...T.num }}>{enrolledCountBySection.get(s.id) || 0}</td>}
                    <td style={S.tdActions}>
                      <span className="sims-row-actions">
                        {canEditSection(me, s, schoolYear) &&
                          <Btn variant="ghost" onClick={(e) => { e.stopPropagation(); setForm(s); }}>Edit</Btn>}
                        <RowMenu label={`More actions for ${s.name}`} items={[
                          canViewRoster && canIssueAdvisorySlip(me, s) && advisory.bySection.has(s.id) && !advisory.bySection.get(s.id).adviser &&
                            { label: 'Advisory slip', onSelect: () => setSlipConfirm({ kind: 'issue', sections: [s] }) },
                          canViewRoster && canIssueAdvisorySlip(me, s) && advisory.bySection.get(s.id)?.slip &&
                            { label: 'Revoke slip', danger: true, onSelect: () => setSlipConfirm({ kind: 'revoke', sections: [s] }) },
                          admin && { label: 'Delete', danger: true, disabled: !!s.schoolAdviserUid,
                            hint: s.schoolAdviserUid ? 'Revoke the Class Adviser assignment in School Access before deleting this section.' : undefined,
                            onSelect: () => setConfirm(s) },
                        ]} />
                      </span>
                    </td>
                  </tr>))}
                </tbody>
              </table></div>}
            </Card>
            {ticked.length > 0 && <div className="school-bulk-bar" role="region" aria-label="Advisory slips to print" style={{ marginTop: 16 }}>
              <span style={{ fontWeight: 600 }}>{selectionText(ticked, advisory.bySection)}</span>
              <Btn variant="ghost" onClick={() => setSlipSelection(new Set())}>Clear</Btn>
              <Btn onClick={() => setSlipConfirm({ kind: 'issue', sections: ticked })}>{`Print ${ticked.length === 1 ? 'slip' : `${ticked.length} slips`}`}</Btn>
            </div>}
          </>
        )}
      </div>
      </ResourceState>
      {form && form.schoolYear === selectedYear && (form.id ? canEditSection(me, form, schoolYear) : admin)
        && <SectionForm key={`${form.id || 'new'}:${selectedYear}:${me?.role}:${oneGrade}`} editing={form.id ? sections.find(section => section.id === form.id) || form : null} restricted={!admin} schoolYear={selectedYear} schedules={schedules} onClose={() => setForm(null)} />}
      {confirm && <Confirm message={`Delete ${confirm.name}? This cannot be undone.`} onYes={async () => { await deleteSection(confirm.id); setConfirm(null); }} onNo={() => setConfirm(null)} />}
      {slipConfirm && <Confirm title="Advisory slip" label={slipConfirm.kind === 'revoke' ? 'Revoke' : 'Issue'} danger={slipConfirm.kind === 'revoke'}
        message={slipConfirmMessage(slipConfirm.kind, slipConfirm.sections, advisory.bySection)}
        onYes={() => runSlips(slipConfirm)} onNo={() => setSlipConfirm(null)} />}
      {detailSection && (
        <SectionDetailModal printReady={printReady} onPrint={admin ? () => printAndConfirm(detailRosterDeped) : undefined}
          section={sections.find(section => section.id === detailSection.id) || detailSection}
          roster={detailRosterAlpha}
          onClose={() => setDetailSection(null)}
          onEditStudent={admin ? (s) => setEditingStudent(s) : null}
        />
      )}
      {admin && detailSection && <div ref={printRoot}><IdCardsPrintSheets entries={detailEntries} printOnly /></div>}
      {confirmDialog}
      {editingStudent && <StudentForm students={students} editing={editingStudent} sections={sections} enrollments={enrollments} schoolYear={schoolYear} onClose={() => setEditingStudent(null)} />}
    </div></EditorResources>
  );
}
