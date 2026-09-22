import { useState } from 'react';
import { callable } from '../firebase.js';
import S from '../strings.js';
import { Btn, Card, Field, Sel, Banner } from '../components/ui.jsx';

const REASONS = [['wrong_time', S.reportReasonWrongTime], ['not_this_learner', S.reportReasonNotThisLearner], ['missing_event', S.reportReasonMissing], ['other', S.reportReasonOther]];

export default function Report({ eventId, studentId, navigate }) {
  const [reason, setReason] = useState('wrong_time'); const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false); const [state, setState] = useState(null);
  const send = async () => {
    setBusy(true); setState(null);
    try { await callable('submitReportFn')({ studentId, eventId, reason, message }); setState('sent'); }
    catch { setState('failed'); }
    setBusy(false);
  };
  if (state === 'sent') return <Card><Banner>{S.reportSent}</Banner><Btn onClick={() => navigate(`/learner/${studentId}`)} style={{ width: '100%' }}>{S.back}</Btn></Card>;
  return (
    <Card>
      <h1 style={{ fontSize: 20 }}>{S.reportTitle}</h1>
      {state === 'failed' && <Banner tone="danger">{S.reportFailed}</Banner>}
      <Field label={S.reportReason}><Sel value={reason} onChange={(e) => setReason(e.target.value)}>{REASONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Sel></Field>
      <Field label={S.reportMessage}><textarea value={message} maxLength={500} onChange={(e) => setMessage(e.target.value)} rows={4} style={{ width: '100%', boxSizing: 'border-box', fontSize: 16, padding: 10, borderRadius: 10, border: '1.5px solid #E7E5F5', fontFamily: 'inherit' }} /></Field>
      <div style={{ display: 'grid', gap: 10 }}>
        <Btn onClick={send} disabled={busy}>{S.send}</Btn>
        <Btn variant="ghost" onClick={() => navigate(`/learner/${studentId}`)}>{S.cancel}</Btn>
      </div>
    </Card>
  );
}
