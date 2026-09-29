import { useAsyncAction } from '../../hooks/useAsyncAction.js';
import { ActionFeedback } from '../../components/ui.jsx';
import { ResourceState } from '../../components/ui.jsx';
import { useMemo, useState } from 'react';
import { collection, query, where, orderBy, limit } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { useCollectionResource, useQueryResource } from '../../hooks/useCollection.js';
import { call } from '../../data/guardians.js';
import { fullName } from '../../lib/roster.js';
import { learnerMatches, matchesWords } from '../../lib/search.js';
import { currentEnrollmentByStudent } from '../../lib/enrollmentChange.js';
import { GRADES, UNASSIGNED } from '../../lib/constants.js';
import { T, S } from '../../styles.js';
import { Btn, Inp, Field, Card, EmptyState } from '../../components/ui.jsx';
import GradePills from '../../components/GradePills.jsx';

// Shared table helper and timestamp formatter — reused by ReportsTab,
// LinksTab, ScanLogTab and AuditTab.
export function Table({ head, rows }) {
  return (
    <div className="sims-table-scroll" role="region" aria-label="Records" tabIndex={0}><table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: T.body, fontSize: 13 }}>
      <thead style={S.thead}><tr>{head.map((h) => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
      <tbody>{rows}</tbody>
    </table></div>
  );
}
export const when = (ts) => (ts?.toDate ? ts.toDate().toLocaleString() : '—');

export default function RequestsTab({ schoolYear }) {
  const action = useAsyncAction();
  const openResource = useQueryResource(() => query(collection(db, 'access_requests'), where('status', '==', 'open'), orderBy('createdAt', 'desc'), limit(50)), []);
  const open = openResource.data;
  const studentsResource = useCollectionResource('students');
  const students = studentsResource.data;
  const enrollmentsResource = useCollectionResource('enrollments');
  const enrollments = enrollmentsResource.data;
  const byLrn = useMemo(() => new Map(students.map((s) => [s.lrn, s])), [students]);
  const enrollmentByStudent = useMemo(() => currentEnrollmentByStudent(enrollments, schoolYear), [enrollments, schoolYear]);
  const [filterQuery, setFilterQuery] = useState('');
  const [gradeFilter, setGradeFilter] = useState('');
  const [notes, setNotes] = useState({});
  const note = (id) => notes[id] || '';
  const gradeOptions = useMemo(() => [
    { value: '', label: 'All' },
    ...GRADES.map((grade) => ({ value: grade, label: `Grade ${grade}` })),
    { value: UNASSIGNED, label: 'Unassigned' },
  ], []);
  const filtered = useMemo(() => open.filter((request) => {
    const learner = byLrn.get(request.studentLrn);
    const enrollment = learner ? enrollmentByStudent.get(learner.id) : null;
    const nameHit = learnerMatches(filterQuery, learner) || matchesWords(filterQuery, request.learnerNameTyped);
    const gradeHit = gradeFilter === '' ||
      (gradeFilter === UNASSIGNED ? !learner || !enrollment : Number(enrollment?.gradeLevel) === Number(gradeFilter));
    return nameHit && gradeHit;
  }), [byLrn, enrollmentByStudent, filterQuery, gradeFilter, open]);

  const resolve = async (r, approve) => {
    const student = byLrn.get(r.studentLrn);
    if (approve && !student) return;
    await action.run(r.id, () => call.resolveAccessRequest({ id: r.id, approve, studentId: student?.id, note: note(r.id) }));
  };

  if ([openResource,studentsResource,enrollmentsResource].some(r => r.loading || r.error)) return <ResourceState resources={[openResource,studentsResource,enrollmentsResource]}/>;

  if (open.length === 0) return <EmptyState title="No open access requests" hint="Parents who lost their slip or have a custody change appear here." />;
  return (
    <>
      <Card style={{ padding: 20, marginBottom: 16 }}>
        <Field label="Filter by learner"><Inp type="search" value={filterQuery} onChange={(event) => setFilterQuery(event.target.value)} placeholder="Filter by learner first or last name" /></Field>
        <GradePills options={gradeOptions} value={gradeFilter} onChange={setGradeFilter} label="Learner grade" />
        <div style={{ fontFamily: T.body, fontSize: 12, color: T.inkMuted, marginTop: 10 }}>Filters apply to the 50 most recent open items.</div>
      </Card>
      <Card>
        <ActionFeedback action={action}/>
        {filtered.length === 0 ? <EmptyState title="No rows match these filters." /> : <Table head={['Requested', 'Guardian', 'Learner (typed)', 'On record', 'Contact', 'Message', 'Note / action']} rows={filtered.map((r) => {
        const s = byLrn.get(r.studentLrn);
        const enrolled = s && enrollmentByStudent.has(s.id);
        return (
          <tr key={r.id}>
            <td style={S.td}>{when(r.createdAt)}</td>
            <td style={S.td}>{r.guardianName && <strong>{r.guardianName}<br /></strong>}{r.guardianEmail}<br /><span style={{ color: T.inkMuted }}>{r.relationship}</span></td>
            <td style={S.td}>{r.learnerNameTyped}<br /><span style={{ ...T.num, color: T.inkMuted }}>{r.studentLrn}</span></td>
            <td style={S.td}>{s ? <>{fullName(s)}<br /><span style={{ color: T.inkMuted }}>Guardian on file: {s.guardianName || '—'} ({s.guardianRelationship || '—'}) {s.guardianContact || ''}</span>{!enrolled && <div style={{ color: T.absent }}>Not enrolled this SY</div>}{s.activationRestricted && <div style={{ color: T.absent }}>RESTRICTED</div>}</> : <span style={{ color: T.absent }}>No learner with this LRN</span>}</td>
            <td style={{ ...S.td, ...T.num }}>{r.contactNumber}</td>
            <td style={S.td}>{r.message}</td>
            <td style={S.td}>
              <Inp aria-label="Note to the parent" value={note(r.id)} onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))} placeholder="Note to the parent" style={{ marginBottom: 6 }} />
              <div style={{ display: 'flex', gap: 6 }}>
                <Btn onClick={() => resolve(r, true)} disabled={action.pending.includes(r.id) || !s || !enrolled || s.activationRestricted}>Approve</Btn>
                <Btn disabled={action.pending.includes(r.id)} variant="ghost" onClick={() => resolve(r, false)}>Deny</Btn>
              </div>
            </td>
          </tr>
        );
        })} />}
      </Card>
    </>
  );
}
