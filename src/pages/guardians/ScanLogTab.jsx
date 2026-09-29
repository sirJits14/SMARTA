import { ResourceState } from '../../components/ui.jsx';
import { useMemo, useState } from 'react';
import { collection, query, where, limit } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { useCollectionResource, useQueryResource } from '../../hooks/useCollection.js';
import { fullName } from '../../lib/roster.js';
import { localDate } from '../../lib/dates.js';
import { formatScanTime } from '../../lib/attendance.js';
import { learnerMatches } from '../../lib/search.js';
import { currentEnrollmentByStudent } from '../../lib/enrollmentChange.js';
import { GRADES, UNASSIGNED } from '../../lib/constants.js';
import { T, S } from '../../styles.js';
import { Inp, Sel, Field, Card, EmptyState } from '../../components/ui.jsx';
import GradePills from '../../components/GradePills.jsx';
import { Table, when } from './RequestsTab.jsx';

export default function ScanLogTab({ schoolYear }) {
  const [date, setDate] = useState(localDate()); const [deviceId, setDeviceId] = useState('');
  const [filterQuery, setFilterQuery] = useState(''); const [gradeFilter, setGradeFilter] = useState('');
  const kiosksResource = useCollectionResource('kiosks');
  const kiosks = kiosksResource.data; const studentsResource = useCollectionResource('students');
  const students = studentsResource.data;
  const enrollmentsResource = useCollectionResource('enrollments');
  const enrollments = enrollmentsResource.data;
  const byId = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);
  const enrollmentByStudent = useMemo(() => currentEnrollmentByStudent(enrollments, schoolYear), [enrollments, schoolYear]);
  const gradeOptions = useMemo(() => [
    { value: '', label: 'All' },
    ...GRADES.map((grade) => ({ value: grade, label: `Grade ${grade}` })),
    { value: UNASSIGNED, label: 'Unassigned' },
  ], []);
  const rowsResource = useQueryResource(() => {
    const base = [collection(db, 'scan_events'), where('scannedDate', '==', date)];
    return query(...base, ...(deviceId ? [where('deviceId', '==', deviceId)] : []), limit(500));
  }, [date, deviceId]);
  const rows = rowsResource.data;
  const sorted = useMemo(() => [...rows].sort((a, b) => (a.scannedTime < b.scannedTime ? 1 : -1)), [rows]);
  const filtered = useMemo(() => sorted.filter((row) => {
    const learner = byId.get(row.studentId);
    const enrollment = learner ? enrollmentByStudent.get(learner.id) : null;
    const gradeHit = gradeFilter === '' ||
      (gradeFilter === UNASSIGNED ? !learner || !enrollment : Number(enrollment?.gradeLevel) === Number(gradeFilter));
    return gradeHit && learnerMatches(filterQuery, learner);
  }), [byId, enrollmentByStudent, filterQuery, gradeFilter, sorted]);
  const filterActive = !!filterQuery.trim() || gradeFilter !== '';
  const resources = [kiosksResource, studentsResource, enrollmentsResource];
  if (resources.some(r => r.loading || r.error)) return <ResourceState resources={resources}/>;

  return (
    <>
      <Card style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'var(--sims-form-columns, auto auto 1fr)', gap: 12, alignItems: 'end' }}>
          <Field label="Date"><Inp type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Device"><Sel value={deviceId} onChange={(e) => setDeviceId(e.target.value)}><option value="">All</option>{kiosks.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}<option value="staff">School office (manual)</option></Sel></Field>
          <div style={{ fontFamily: T.body, fontSize: 13, color: T.inkMuted, marginBottom: 14 }}>{rowsResource.loading || rowsResource.error ? '—' : <>{rows.length} raw events (append-only; corrections appear as separate rows){filterActive ? ` · ${filtered.length} shown` : ''}</>}</div>
        </div>
        <Field label="Filter by learner"><Inp type="search" value={filterQuery} onChange={(event) => setFilterQuery(event.target.value)} placeholder="Filter by learner first or last name" /></Field>
        <GradePills options={gradeOptions} value={gradeFilter} onChange={setGradeFilter} label="Learner grade" />
        <div style={{ fontFamily: T.body, fontSize: 12, color: T.inkMuted, marginTop: 10 }}>Filters apply to this date's loaded scans.</div>
      </Card>
      <ResourceState resources={[rowsResource]}><Card>
        {sorted.length === 0 ? <EmptyState title="No scans for this date" /> : (
          filtered.length === 0 ? <EmptyState title="No rows match these filters." /> : <Table head={['Time', 'Learner', 'Kind', 'Device', 'Received', 'Note']} rows={filtered.map((e) => (
            <tr key={e.id}>
              <td style={{ ...S.td, ...T.num }}>{formatScanTime(e.scannedTime)}</td>
              <td style={S.td}>{byId.get(e.studentId) ? fullName(byId.get(e.studentId)) : e.studentId}</td>
              <td style={S.td}>{e.kind}{e.voidsEventId ? ` → ${e.voidsEventId}` : ''}</td>
              <td style={S.td}>{kiosks.find((k) => k.id === e.deviceId)?.label || e.deviceId}</td>
              <td style={S.td}>{when(e.receivedAt)}</td>
              <td style={S.td}>{e.note || ''}{e.createdBy ? ` (${e.createdBy})` : ''}</td>
            </tr>
          ))} />
        )}
      </Card></ResourceState>
    </>
  );
}
