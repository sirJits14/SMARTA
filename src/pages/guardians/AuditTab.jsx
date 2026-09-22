import { useState } from 'react';
import { collection, query, where, orderBy, limit } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { useQueryRows } from '../../hooks/useCollection.js';
import { S } from '../../styles.js';
import { Inp, Field, Card, EmptyState } from '../../components/ui.jsx';
import { Table, when } from './RequestsTab.jsx';

export default function AuditTab() {
  const [target, setTarget] = useState('');
  const rows = useQueryRows(() => {
    const base = [collection(db, 'audit_log')];
    return target.trim() ? query(...base, where('targetId', '==', target.trim()), limit(100)) : query(...base, orderBy('at', 'desc'), limit(100));
  }, [target]);
  return (
    <>
      <Card style={{ padding: 20, marginBottom: 16 }}>
        <Field label="Filter by target ID (learner ID, guardian UID, link ID, kiosk UID, request/report ID)"><Inp value={target} onChange={(e) => setTarget(e.target.value)} /></Field>
      </Card>
      <Card>
        {rows.length === 0 ? <EmptyState title="No audit entries" /> : (
          <Table head={['When', 'Action', 'Actor', 'Target', 'Details']} rows={rows.map((a) => (
            <tr key={a.id}><td style={S.td}>{when(a.at)}</td><td style={S.td}>{a.action}</td><td style={S.td}>{a.actorType}: {a.actorUid || '—'}</td><td style={S.td}>{a.targetType}/{a.targetId}</td><td style={{ ...S.td, fontSize: 11 }}>{JSON.stringify(a.details)}</td></tr>
          ))} />
        )}
      </Card>
    </>
  );
}
