import { useMemo, useState } from 'react';
import { collection, query, where, limit } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { useCollection, useQueryRows } from '../../hooks/useCollection.js';
import { call } from '../../data/guardians.js';
import { fullName } from '../../lib/roster.js';
import { localDate } from '../../lib/dates.js';
import { T, S } from '../../styles.js';
import { Btn, Inp, Sel, Field, Card, EmptyState } from '../../components/ui.jsx';
import { Table, when } from './RequestsTab.jsx';

export default function LinksTab({ schoolYear }) {
  const students = useCollection('students');
  const [q, setQ] = useState(''); const [studentId, setStudentId] = useState('');
  const matches = useMemo(() => q.length < 2 ? [] : students.filter((s) => `${s.lastName} ${s.firstName} ${s.lrn}`.toLowerCase().includes(q.toLowerCase())).slice(0, 8), [students, q]);
  const student = students.find((s) => s.id === studentId);
  const links = useQueryRows(() => studentId && query(collection(db, 'guardian_links'), where('studentId', '==', studentId), limit(20)), [studentId]);
  const [reason, setReason] = useState('');
  const [manual, setManual] = useState({ kind: 'in', date: localDate(), time: '', reason: '' });

  return (
    <>
      <Card style={{ padding: 20, marginBottom: 16 }}>
        <Field label="Find a learner (name or LRN)"><Inp value={q} onChange={(e) => setQ(e.target.value)} /></Field>
        {matches.map((s) => <Btn key={s.id} variant="ghost" onClick={() => { setStudentId(s.id); setQ(''); }} style={{ marginRight: 6, marginBottom: 6 }}>{fullName(s)} · {s.lrn}</Btn>)}
      </Card>
      {!student && <EmptyState title="Choose a learner" hint="See who can view their gate scans, revoke access, restrict self-service activation, or add a manual scan." />}
      {student && (
        <>
          <Card style={{ padding: 20, marginBottom: 16 }}>
            <h2 style={S.h2}>{fullName(student)} · {student.lrn} {student.activationRestricted && <span style={{ color: T.absent }}>· RESTRICTED</span>}</h2>
            <Field label="Reason (recorded in the audit log)"><Inp value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn variant="ghost" disabled={!reason.trim()} onClick={() => call.revokeCode({ studentId: student.id, schoolYear, reason })}>Revoke unused slip</Btn>
              <Btn variant="ghost" disabled={!reason.trim()} style={{ color: T.absent, borderColor: T.absent }} onClick={() => call.setActivationRestricted({ studentId: student.id, restricted: !student.activationRestricted, reason })}>{student.activationRestricted ? 'Lift restriction' : 'Restrict (custody) — revokes all access'}</Btn>
            </div>
          </Card>
          <Card style={{ marginBottom: 16 }}>
            {links.length === 0 ? <EmptyState title="No guardians linked" /> : (
              <Table head={['Guardian', 'Relationship', 'Status', 'Activated', 'Via', 'Revoked', '']} rows={links.map((l) => (
                <tr key={l.id}>
                  <td style={{ ...S.td, ...T.num, fontSize: 11 }}>{l.guardianUid}</td><td style={S.td}>{l.relationship}</td><td style={S.td}>{l.status}</td>
                  <td style={S.td}>{when(l.activatedAt)}</td><td style={S.td}>{l.activatedVia}</td>
                  <td style={S.td}>{l.status === 'revoked' ? `${when(l.revokedAt)} — ${l.revokedReason || ''}` : '—'}</td>
                  <td style={S.td}>{l.status === 'active' && <Btn variant="ghost" disabled={!reason.trim()} onClick={() => call.revokeLink({ linkId: l.id, reason })}>Revoke</Btn>}</td>
                </tr>
              ))} />
            )}
          </Card>
          <Card style={{ padding: 20 }}>
            <h2 style={S.h2}>Add a manual gate scan (e.g. kiosk was down)</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'auto auto auto 1fr auto', gap: 12, alignItems: 'end' }}>
              <Field label="Kind"><Sel value={manual.kind} onChange={(e) => setManual({ ...manual, kind: e.target.value })}><option value="in">Entered</option><option value="out">Left</option></Sel></Field>
              <Field label="Date"><Inp type="date" value={manual.date} onChange={(e) => setManual({ ...manual, date: e.target.value })} /></Field>
              <Field label="Time"><Inp type="time" value={manual.time} onChange={(e) => setManual({ ...manual, time: e.target.value })} /></Field>
              <Field label="Reason (shown to the parent)"><Inp value={manual.reason} onChange={(e) => setManual({ ...manual, reason: e.target.value })} /></Field>
              <Btn style={{ marginBottom: 14 }} disabled={!manual.time || !manual.reason.trim()} onClick={() => call.addManualEvent({ studentId: student.id, ...manual })}>Add</Btn>
            </div>
          </Card>
        </>
      )}
    </>
  );
}
