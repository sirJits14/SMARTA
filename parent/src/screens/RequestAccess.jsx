import { useState } from 'react';
import { collection, query, where, limit } from 'firebase/firestore';
import { db, callable } from '../firebase.js';
import S from '../strings.js';
import { T } from '../styles.js';
import { Btn, Card, Field, Inp, Sel, Banner } from '../components/ui.jsx';
import { useQuery } from '../hooks/useDoc.js';

const RELATIONSHIPS = ['Mother', 'Father', 'Guardian', 'Grandparent', 'Sibling', 'Other'];
const STATUS = { open: S.requestOpen, approved: S.requestApproved, denied: S.requestDenied };

export default function RequestAccess({ user, navigate }) {
  const { rows } = useQuery(() => query(collection(db, 'access_requests'), where('guardianUid', '==', user.uid), limit(10)), [user.uid]);
  const [f, setF] = useState({ studentLrn: '', learnerNameTyped: '', relationship: 'Guardian', contactNumber: '', message: '' });
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState(null);
  const send = async () => {
    setBusy(true); setMsg(null);
    try { await callable('requestAccessFn')(f); setMsg({ tone: 'info', text: S.requestSent }); setF((p) => ({ ...p, studentLrn: '', learnerNameTyped: '', message: '' })); }
    catch (e) { setMsg({ tone: 'danger', text: e?.message || S.reportFailed }); }
    setBusy(false);
  };
  return (
    <>
      <Card>
        <h1 style={{ fontSize: 20 }}>{S.requestTitle}</h1>
        <p style={{ color: T.inkMuted, fontSize: 14 }}>{S.requestBody}</p>
        {msg && <Banner tone={msg.tone}>{msg.text}</Banner>}
        <Field label={S.requestLrn}><Inp inputMode="numeric" maxLength={12} value={f.studentLrn} onChange={set('studentLrn')} /></Field>
        <Field label={S.requestName}><Inp value={f.learnerNameTyped} onChange={set('learnerNameTyped')} /></Field>
        <Field label={S.activateRelationship}><Sel value={f.relationship} onChange={set('relationship')}>{RELATIONSHIPS.map((r) => <option key={r}>{r}</option>)}</Sel></Field>
        <Field label={S.requestContact}><Inp inputMode="tel" value={f.contactNumber} onChange={set('contactNumber')} /></Field>
        <Field label={S.requestMessage}><Inp value={f.message} maxLength={500} onChange={set('message')} /></Field>
        <div style={{ display: 'grid', gap: 10 }}>
          <Btn onClick={send} disabled={busy || f.studentLrn.length !== 12 || !f.learnerNameTyped || !f.contactNumber}>{S.send}</Btn>
          <Btn variant="ghost" onClick={() => navigate('/')}>{S.back}</Btn>
        </div>
      </Card>
      {rows?.length > 0 && <Card><h2 style={{ fontSize: 16, marginTop: 0 }}>{S.settingsRequests}</h2>{rows.map((r) => <div key={r.id} style={{ fontSize: 14, padding: '6px 0' }}>{r.learnerNameTyped} — <strong>{STATUS[r.status]}</strong>{r.resolutionNote ? `: ${r.resolutionNote}` : ''}</div>)}</Card>}
    </>
  );
}
