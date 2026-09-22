import { useMemo, useState } from 'react';
import { collection, query, where, limit } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { useCollection, useQueryRows } from '../../hooks/useCollection.js';
import { fullName } from '../../lib/roster.js';
import { localDate } from '../../lib/dates.js';
import { formatScanTime } from '../../lib/attendance.js';
import { T, S } from '../../styles.js';
import { Inp, Sel, Field, Card, EmptyState } from '../../components/ui.jsx';
import { Table, when } from './RequestsTab.jsx';

export default function ScanLogTab() {
  const [date, setDate] = useState(localDate()); const [deviceId, setDeviceId] = useState('');
  const kiosks = useCollection('kiosks'); const students = useCollection('students');
  const byId = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);
  const rows = useQueryRows(() => {
    const base = [collection(db, 'scan_events'), where('scannedDate', '==', date)];
    return query(...base, ...(deviceId ? [where('deviceId', '==', deviceId)] : []), limit(500));
  }, [date, deviceId]);
  const sorted = useMemo(() => [...rows].sort((a, b) => (a.scannedTime < b.scannedTime ? 1 : -1)), [rows]);
  return (
    <>
      <Card style={{ padding: 20, marginBottom: 16, display: 'grid', gridTemplateColumns: 'auto auto 1fr', gap: 12, alignItems: 'end' }}>
        <Field label="Date"><Inp type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Device"><Sel value={deviceId} onChange={(e) => setDeviceId(e.target.value)}><option value="">All</option>{kiosks.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}<option value="staff">School office (manual)</option></Sel></Field>
        <div style={{ fontFamily: T.body, fontSize: 13, color: T.inkMuted, marginBottom: 14 }}>{rows.length} raw events (append-only; corrections appear as separate rows)</div>
      </Card>
      <Card>
        {sorted.length === 0 ? <EmptyState title="No scans for this date" /> : (
          <Table head={['Time', 'Learner', 'Kind', 'Device', 'Received', 'Note']} rows={sorted.map((e) => (
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
      </Card>
    </>
  );
}
