import { useAsyncAction } from '../../hooks/useAsyncAction.js';
import { ActionFeedback } from '../../components/ui.jsx';
import { ResourceState } from '../../components/ui.jsx';
import { useMemo, useState } from 'react';
import { collection, query, where, orderBy, limit } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { useCollectionResource, useQueryResource } from '../../hooks/useCollection.js';
import { call } from '../../data/guardians.js';
import { fullName } from '../../lib/roster.js';
import { T, S } from '../../styles.js';
import { Btn, Inp, Sel, Card, EmptyState } from '../../components/ui.jsx';
import { Table, when } from './RequestsTab.jsx';

const REASON = { wrong_time: 'Wrong time', not_this_learner: 'Not this learner', missing_event: 'Missing scan', other: 'Other' };

export default function ReportsTab() {
  const actionState = useAsyncAction();
  const openResource = useQueryResource(() => query(collection(db, 'reports'), where('status', '==', 'open'), orderBy('createdAt', 'desc'), limit(50)), []);
  const open = openResource.data;
  const studentsResource = useCollectionResource('students');
  const students = studentsResource.data;
  const byId = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);
  const [draft, setDraft] = useState({});
  const d = (id) => draft[id] || { note: '', action: 'none' };
  const set = (id, k, v) => setDraft((p) => ({ ...p, [id]: { ...d(id), [k]: v } }));

  const resolve = async (r) => {
    const { note, action } = d(r.id);
    await actionState.run(r.id, async () => {
    if (action === 'voided') await call.correctEvent({ studentId: r.studentId, eventId: r.eventId, reason: note });
    await call.resolveReport({ id: r.id, note, action });
    });
  };

  if ([openResource,studentsResource].some(r => r.loading || r.error)) return <ResourceState resources={[openResource,studentsResource]}/>;

  if (open.length === 0) return <EmptyState title="No open reports" hint="Records parents flagged as possibly wrong appear here." />;
  return (
    <Card>
      <ActionFeedback action={actionState}/>
      <Table head={['Filed', 'Learner', 'Event', 'Reason', 'Message', 'Resolution']} rows={open.map((r) => (
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
      ))} />
    </Card>
  );
}
