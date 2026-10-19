import { useState } from 'react';
import { collection, query, where, orderBy, limit } from 'firebase/firestore';
import { db } from '../../../firebase.js';
import { useQueryResource } from '../../../hooks/useCollection.js';
import { Btn, Card, EmptyState, ResourceState } from '../../../components/ui.jsx';
import { T } from '../../../styles.js';
import { historyLine } from '../../../lib/schoolAssignments.js';

const PAGE = 50;

// Reads audit_log directly, like the Audit log tab; rules already limit it to administrators.
export default function HistoryView({ sections }) {
  const [count, setCount] = useState(PAGE);
  const resource = useQueryResource(() => query(collection(db, 'audit_log'), where('targetType', '==', 'school_assignment'),
    orderBy('at', 'desc'), limit(count)), [count]);
  const rows = resource.data;
  return <ResourceState resources={[resource]} label="history"><Card style={{ padding: 20 }}>
    {rows.length === 0
      ? <EmptyState title="No school access changes yet" hint="Requests, approvals and revocations appear here." />
      : <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>{rows.map(row => {
        const line = historyLine(row, sections);
        return <li key={row.id} style={{ padding: '12px 0', borderTop: `1px solid ${T.border}` }}>
          <div style={{ fontSize: 12, color: T.inkMuted }}>{line.when}</div>
          <div>{line.text}</div>
          {line.reason && <div style={{ fontSize: 13, color: T.inkMuted }}>Reason: {line.reason}</div>}
        </li>;
      })}</ol>}
    {rows.length === count && <Btn variant="ghost" style={{ marginTop: 12 }} onClick={() => setCount(c => c + PAGE)}>Load more</Btn>}
  </Card></ResourceState>;
}
