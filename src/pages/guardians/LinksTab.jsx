import { useAsyncAction } from '../../hooks/useAsyncAction.js';
import { usePrintReadiness } from '../../hooks/usePrintReadiness.js';
import { ActionFeedback } from '../../components/ui.jsx';
import { ResourceState } from '../../components/ui.jsx';
import { useDeferredValue, useMemo, useRef, useState } from 'react';
import { collection, query, where, limit } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { useCollectionResource, useQueryResource, useDoc, useSchoolYearEnrollments } from '../../hooks/useCollection.js';
import { call } from '../../data/guardians.js';
import { depedSort, fullName } from '../../lib/roster.js';
import { localDate } from '../../lib/dates.js';
import { buildLearnerIndex, searchLearners } from '../../lib/search.js';
import { currentEnrollmentByStudent } from '../../lib/enrollmentChange.js';
import { slotsFreeText } from '../../lib/slipIssue.js';
import { GRADES, UNASSIGNED } from '../../lib/constants.js';
import { T, S } from '../../styles.js';
import { Btn, Inp, Sel, Field, Card, EmptyState } from '../../components/ui.jsx';
import GradePills from '../../components/GradePills.jsx';
import ActivationSlipsPrintable from '../../components/ActivationSlipsPrintable.jsx';
import SlipPrintControls, { useSlipPaper, PORTAL_URL } from '../../components/SlipPrintControls.jsx';
import { Table, when } from './RequestsTab.jsx';

// The guardian's own profile wins (they can rename themselves in the portal);
// the name/email copied onto the link at activation covers deleted profiles.
function GuardianCell({ link }) {
  const profile = useDoc(`guardians/${link.guardianUid}`);
  const name = profile?.displayName || link.guardianName;
  const email = profile?.email || link.guardianEmail;
  return (
    <td style={S.td}>
      {name ? <strong>{name}</strong> : <span style={{ color: T.inkMuted }}>Name not given</span>}
      {email && <><br /><span style={{ color: T.inkMuted }}>{email}</span></>}
      <br /><span style={{ ...T.num, fontSize: 11, color: T.inkMuted }}>{link.guardianUid}</span>
    </td>
  );
}

export default function LinksTab({ schoolYear }) {
  const action = useAsyncAction();
  const studentsResource = useCollectionResource('students');
  const students = studentsResource.data;
  const enrollmentsResource = useSchoolYearEnrollments(schoolYear);
  const enrollments = enrollmentsResource.data;
  const sectionsResource = useCollectionResource('sections');
  const sections = sectionsResource.data;
  const [q, setQ] = useState(''); const [studentId, setStudentId] = useState('');
  const [gradeFilter, setGradeFilter] = useState('');
  const enrollmentByStudent = useMemo(() => currentEnrollmentByStudent(enrollments, schoolYear), [enrollments, schoolYear]);
  const sectionById = useMemo(() => new Map(sections.map((section) => [section.id, section])), [sections]);
  const enrolledGrades = useMemo(() => new Set([...enrollmentByStudent.values()].map((enrollment) => Number(enrollment.gradeLevel))), [enrollmentByStudent]);
  const gradeOptions = useMemo(() => [
    { value: '', label: 'All' },
    ...GRADES.filter((grade) => enrolledGrades.has(grade)).map((grade) => ({ value: grade, label: `Grade ${grade}` })),
    { value: UNASSIGNED, label: 'Unassigned' },
  ], [enrolledGrades]);
  const learnerIndex = useMemo(() => buildLearnerIndex(depedSort(students)), [students]);
  const searchQuery = useDeferredValue(q);
  // One extra hit tells us there are more than 20 without counting them all.
  const found = useMemo(() => searchQuery.trim() ? searchLearners(learnerIndex, searchQuery, { includeLrn: true, limit: 21, accept: (candidate) => {
    const enrollment = enrollmentByStudent.get(candidate.id);
    return gradeFilter === '' ||
      (gradeFilter === UNASSIGNED ? !enrollment : Number(enrollment?.gradeLevel) === Number(gradeFilter));
  } }) : [], [enrollmentByStudent, gradeFilter, learnerIndex, searchQuery]);
  const matches = found.slice(0, 20);
  const student = students.find((s) => s.id === studentId);
  const linksResource = useQueryResource(() => studentId && query(collection(db, 'guardian_links'), where('studentId', '==', studentId), limit(20)), [studentId]);
  const links = linksResource.data;
  const [reason, setReason] = useState('');
  const [manual, setManual] = useState({ kind: 'in', date: localDate(), time: '', reason: '' });
  // A reissued slip's raw code lives only here, for the learner it was
  // issued for; picking another learner drops it.
  const [reissued, setReissued] = useState(null);
  const [reissueErr, setReissueErr] = useState('');
  const [paper, setPaper] = useSlipPaper();
  const printRoot = useRef(null);
  const printReady = usePrintReadiness(printRoot, reissued, reissued ? 1 : 0);

  // Always the learner currently shown, so a call that settles after staff
  // pick someone else cannot show the first learner's slip or error.
  const studentIdRef = useRef(studentId);
  studentIdRef.current = studentId;

  const pickLearner = (id) => { setStudentId(id); setQ(''); setReissued(null); setReissueErr(''); };
  // Errors are caught here (not by action.run) so the server's own message,
  // e.g. "All guardian and adviser slots are linked", reaches staff.
  const reissue = async () => {
    if (!window.confirm(`Issue a new slip for ${fullName(student)}? Their current slip stops working. Guardians already linked keep access.`)) return;
    const forId = student.id;
    setReissued(null); setReissueErr('');
    try {
      const result = await call.reissueActivationCode({ studentId: forId, schoolYear, reason });
      if (studentIdRef.current === forId) setReissued(result);
    } catch (e) {
      if (studentIdRef.current === forId) setReissueErr(e.message || 'Could not reissue the slip.');
    }
  };

  const resources = [studentsResource, enrollmentsResource, sectionsResource];
  if (resources.some(r => r.loading || r.error)) return <ResourceState resources={resources}/>;

  return (
    <>
      <div className="slips-print-hide"><ActionFeedback action={action}/></div>
      <Card className="slips-print-hide" style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ marginBottom: 14 }}><GradePills options={gradeOptions} value={gradeFilter} onChange={setGradeFilter} label="Learner grade" /></div>
        <Field label="Find a learner (name or LRN)"><Inp type="search" value={q} onChange={(e) => setQ(e.target.value)} /></Field>
        {matches.map((s) => {
          const enrollment = enrollmentByStudent.get(s.id);
          const section = enrollment ? sectionById.get(enrollment.sectionId) : null;
          const placement = enrollment ? `Grade ${enrollment.gradeLevel} ${section?.name || 'Section unavailable'}` : 'Unassigned';
          return <Btn key={s.id} variant="ghost" onClick={() => pickLearner(s.id)} style={{ marginRight: 6, marginBottom: 6, maxWidth: '100%', whiteSpace: 'normal', textAlign: 'left' }}>{fullName(s)} · {s.lrn} · {placement}</Btn>;
        })}
        {found.length > 20 && <div aria-live="polite" style={{ fontFamily: T.body, fontSize: 12, color: T.inkMuted }}>Showing the first 20 — keep typing to narrow down.</div>}
      </Card>
      {!student && <div className="slips-print-hide"><EmptyState title="Choose a learner" hint="See who can view their gate scans, reissue or revoke their slip, restrict self-service activation, or add a manual scan." /></div>}
      {student && (
        <>
          <Card className="slips-print-hide" style={{ padding: 20, marginBottom: 16 }}>
            <h2 style={S.h2}>{fullName(student)} · {student.lrn} {student.activationRestricted && <span style={{ color: T.absent }}>· RESTRICTED</span>}</h2>
            <Field label="Reason (recorded in the audit log)"><Inp value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Btn variant="ghost" disabled={action.busy || !reason.trim() || student.activationRestricted} onClick={() => action.run('reissue', reissue)}>Reissue slip</Btn>
              <Btn variant="ghost" disabled={action.busy || !reason.trim()} onClick={() => action.run('action', async () => { await call.revokeCode({ studentId: student.id, schoolYear, reason }); setReissued(null); setReissueErr(''); })}>Revoke slip</Btn>
              <Btn variant="ghost" disabled={action.busy || !reason.trim()} style={{ color: T.absent, borderColor: T.absent }} onClick={() => action.run('action', async () => { await call.setActivationRestricted({ studentId: student.id, restricted: !student.activationRestricted, reason }); setReissued(null); setReissueErr(''); })}>{student.activationRestricted ? 'Lift restriction' : 'Restrict (custody) — revokes all access'}</Btn>
            </div>
            {reissueErr && <p role="alert" className="sims-feedback" style={{ marginTop: 10 }}>{reissueErr}</p>}
          </Card>
          {reissued && (
            <>
              <Card className="slips-print-hide" style={{ padding: 20, marginBottom: 16 }}>
                <h2 style={S.h2}>Reissued slip</h2>
                <p role="status" style={{ fontFamily: T.body, fontSize: 13, margin: 0 }}>{slotsFreeText(reissued.slotsFree)}</p>
                <SlipPrintControls paper={paper} onPaperChange={setPaper} printReady={printReady} />
              </Card>
              <div ref={printRoot} style={{ marginBottom: 16 }}><ActivationSlipsPrintable slips={[reissued.slip]} portalUrl={PORTAL_URL} paper={paper} /></div>
            </>
          )}
          <ResourceState resources={[linksResource]}><Card className="slips-print-hide" style={{ marginBottom: 16 }}>
            {links.length === 0 ? <EmptyState title="No guardians linked" /> : (
              <Table head={['Guardian', 'Relationship', 'Status', 'Activated', 'Via', 'Revoked', '']} rows={links.map((l) => (
                <tr key={l.id}>
                  <GuardianCell link={l} /><td style={S.td}>{l.relationship}</td><td style={S.td}>{l.status}</td>
                  <td style={S.td}>{when(l.activatedAt)}</td><td style={S.td}>{l.activatedVia}</td>
                  <td style={S.td}>{l.status === 'revoked' ? `${when(l.revokedAt)} — ${l.revokedReason || ''}` : '—'}</td>
                  <td style={S.td}>{l.status === 'active' && <Btn variant="ghost" disabled={action.busy || !reason.trim()} onClick={() => action.run('action', () => call.revokeLink({ linkId: l.id, reason }))}>Revoke</Btn>}</td>
                </tr>
              ))} />
            )}
          </Card></ResourceState>
          <Card className="slips-print-hide" style={{ padding: 20 }}>
            <h2 style={S.h2}>Add a manual gate scan (e.g. kiosk was down)</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'var(--sims-form-columns, auto auto auto 1fr auto)', gap: 12, alignItems: 'end' }}>
              <Field label="Kind"><Sel value={manual.kind} onChange={(e) => setManual({ ...manual, kind: e.target.value })}><option value="in">Entered</option><option value="out">Left</option></Sel></Field>
              <Field label="Date"><Inp type="date" value={manual.date} onChange={(e) => setManual({ ...manual, date: e.target.value })} /></Field>
              <Field label="Time"><Inp type="time" value={manual.time} onChange={(e) => setManual({ ...manual, time: e.target.value })} /></Field>
              <Field label="Reason (shown to the parent)"><Inp value={manual.reason} onChange={(e) => setManual({ ...manual, reason: e.target.value })} /></Field>
              <Btn style={{ marginBottom: 14 }} disabled={action.busy || !manual.time || !manual.reason.trim()} onClick={() => action.run('action', () => call.addManualEvent({ studentId: student.id, ...manual }))}>Add</Btn>
            </div>
          </Card>
        </>
      )}
    </>
  );
}
