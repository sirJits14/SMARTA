import { useAsyncAction } from '../../hooks/useAsyncAction.js';
import { ActionFeedback } from '../../components/ui.jsx';
import { ResourceState } from '../../components/ui.jsx';
import { useMemo, useState } from 'react';
import { collection, query, where, orderBy, limit } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { useCollectionResource, useQueryResource } from '../../hooks/useCollection.js';
import { call } from '../../data/guardians.js';
import { fullName } from '../../lib/roster.js';
import { learnerMatches } from '../../lib/search.js';
import { currentEnrollmentByStudent } from '../../lib/enrollmentChange.js';
import { GRADES, UNASSIGNED } from '../../lib/constants.js';
import { T, S } from '../../styles.js';
import { Btn, Inp, Sel, Field, Card, EmptyState } from '../../components/ui.jsx';
import GradePills from '../../components/GradePills.jsx';
import { Table, when } from './RequestsTab.jsx';

const REASON = { wrong_time: 'Wrong time', not_this_learner: 'Not this learner', missing_event: 'Missing scan', other: 'Other' };

export default function ReportsTab({ schoolYear }) {
  const actionState = useAsyncAction();
  const openResource = useQueryResource(() => query(collection(db, 'reports'), where('status', '==', 'open'), orderBy('createdAt', 'desc'), limit(50)), []);
  const open = openResource.data;
  const studentsResource = useCollectionResource('students');
  const students = studentsResource.data;
  const enrollmentsResource = useCollectionResource('enrollments');
  const enrollments = enrollmentsResource.data;
  const byId = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);
  const enrollmentByStudent = useMemo(() => currentEnrollmentByStudent(enrollments, schoolYear), [enrollments, schoolYear]);
  const [filterQuery, setFilterQuery] = useState('');
  const [gradeFilter, setGradeFilter] = useState('');
  const [draft, setDraft] = useState({});
  const d = (id) => draft[id] || { note: '', action: 'none' };
  const set = (id, k, v) => setDraft((p) => ({ ...p, [id]: { ...d(id), [k]: v } }));
  const gradeOptions = useMemo(() => [
    { value: '', label: 'All' },
    ...GRADES.map((grade) => ({ value: grade, label: `Grade ${grade}` })),
    { value: UNASSIGNED, label: 'Unassigned' },
  ], []);
  const filtered = useMemo(() => open.filter((report) => {
    const learner = byId.get(report.studentId);
    const enrollment = learner ? enrollmentByStudent.get(learner.id) : null;
    const gradeHit = gradeFilter === '' ||
      (gradeFilter === UNASSIGNED ? !learner || !enrollment : Number(enrollment?.gradeLevel) === Number(gradeFilter));
    return gradeHit && learnerMatches(filterQuery, learner);
  }), [byId, enrollmentByStudent, filterQuery, gradeFilter, open]);

  const resolve = async (r) => {
    const { note, action } = d(r.id);
    await actionState.run(r.id, async () => {
    if (action === 'voided') await call.correctEvent({ studentId: r.studentId, eventId: r.eventId, reason: note });
    await call.resolveReport({ id: r.id, note, action });
    });
  };

  const resources = [openResource, studentsResource, enrollmentsResource];
  if (resources.some(r => r.loading || r.error)) return <ResourceState resources={resources}/>;

  if (open.length === 0) return <EmptyState title="No open reports" hint="Records parents flagged as possibly wrong appear here." />;
  return (
    <>
      <Card style={{ padding: 20, marginBottom: 16 }}>
        <Field label="Filter by learner"><Inp type="search" value={filterQuery} onChange={(event) => setFilterQuery(event.target.value)} placeholder="Filter by learner first or last name" /></Field>
        <GradePills options={gradeOptions} value={gradeFilter} onChange={setGradeFilter} label="Learner grade" />
        <div style={{ fontFamily: T.body, fontSize: 12, color: T.inkMuted, marginTop: 10 }}>Filters apply to the 50 most recent open items.</div>
      </Card>
      <Card>
        <ActionFeedback action={actionState}/>
        {filtered.length === 0 ? <EmptyState title="No rows match these filters." /> : <Table head={['Filed', 'Learner', 'Event', 'Reason', 'Message', 'Resolution']} rows={filtered.map((r) => (
        <tr key={r.id}>
          <td style={S.td}>{when(r.createdAt)}</td>
          <td style={S.td}>{byId.get(r.studentId) ? fullName(byId.get(r.studentId)) : r.studentId}</td>
          <td style={{ ...S.td, ...T.num, fontSize: 11 }}>{r.eventId}</td>
          <td style={S.td}>{REASON[r.reason] || r.reason}</td>
          <td style={S.td}>{r.message}</td>
          <td style={S.td}>
            <Sel aria-label="Resolution" value={d(r.id).action} onChange={(e) => set(r.id, 'action', e.target.value)} style={{ marginBottom: 6 }}>
              <option value="none">Record is correct — no change</option>
              <option value="voided">Void this scan (shown as corrected)</option>
              <option value="corrected">Corrected another way (see Learner access → add manual scan)</option>
            </Sel>
            <Inp aria-label="Note to the parent" value={d(r.id).note} onChange={(e) => set(r.id, 'note', e.target.value)} placeholder="Note to the parent (required)" style={{ marginBottom: 6 }} />
            <Btn onClick={() => resolve(r)} disabled={actionState.pending.includes(r.id) || !d(r.id).note.trim()}>Resolve</Btn>
          </td>
        </tr>
        ))} />}
      </Card>
    </>
  );
}
