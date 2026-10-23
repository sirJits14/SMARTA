import { useState } from 'react';
import { Badge, Btn, Field, Inp } from '../../components/ui.jsx';
import { T } from '../../styles.js';
import { relativeAge } from '../../lib/schoolAssignments.js';
import { approveEffect, classText, detailRows, existingFlag, keepsDetailsText, kindLabel, nameText, personText, removalText } from '../../lib/learnerRequests.js';

const muted = { fontSize: 13, color: T.inkMuted };
const wrap = { overflowWrap: 'anywhere' };

// Reject through a promise so a handler that throws, rejects or returns nothing leaves the form open
// instead of raising an unhandled error.
export const rejectRequest = (onReject, request, text) =>
  Promise.resolve().then(() => onReject(request, text)).then((ok) => Boolean(ok), () => false);

// One waiting request. Approve is one tap; Reject asks for a reason first. A request that needs an
// administrator is shown without actions to everyone else.
export default function RequestCard({ request, disabled, failure, onApprove, onReject }) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const flag = existingFlag(request);
  const effect = approveEffect(request);
  const keeps = keepsDetailsText(request);
  // A flag the person cannot act on, or one approving would refuse, reads as a conflict even when they may decide.
  const conflict = !request.decidable || Boolean(request.existing?.enrolledHere || request.existing?.ambiguous);
  const submitReject = (event) => {
    event.preventDefault();
    const text = reason.trim();
    if (text) rejectRequest(onReject, request, text).then((ok) => { if (ok) { setRejecting(false); setReason(''); } }).catch(() => false);
  };
  return <li id={`learner-request-${request.id}`} style={{ padding: '16px 0', borderTop: `1px solid ${T.border}` }}>
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '2px 10px' }}>
      <Badge tone={request.kind === 'add' ? 'info' : 'warning'}>{kindLabel(request)}</Badge>
      <strong style={wrap}>{nameText(request)}</strong>
      {request.lrn ? <span style={muted}>LRN {request.lrn}</span> : null}
      <span style={muted}>{relativeAge(request.createdAt)}</span>
    </div>
    <div style={{ marginTop: 4 }}>{classText(request)} · requested by {personText(request.requestedByName)}</div>
    {flag && <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0 }}>
      <li className={`sims-flag${conflict ? ' sims-flag--conflict' : ''}`} style={wrap}>{flag}</li></ul>}
    {keeps && <p style={{ ...muted, ...wrap, margin: '6px 0 0' }}>{keeps}</p>}
    {request.kind === 'remove' && <p style={{ ...wrap, margin: '8px 0 0' }}>{removalText(request)}</p>}
    {effect && <p style={{ ...muted, ...wrap, margin: '8px 0 0' }}>{effect}</p>}
    {request.kind === 'add' && <details style={{ marginTop: 8 }}>
      <summary aria-label={`Details for ${nameText(request)}`} style={{ cursor: 'pointer', fontSize: 13 }}>Details</summary>
      <dl style={{ display: 'grid', gridTemplateColumns: 'max-content minmax(0,1fr)', gap: '4px 16px', margin: '8px 0 0', fontSize: 13 }}>
        {detailRows(request).map(([label, value]) => <div key={label} style={{ display: 'contents' }}><dt style={muted}>{label}</dt><dd style={{ margin: 0, overflowWrap: 'anywhere' }}>{value}</dd></div>)}
      </dl>
    </details>}
    {failure && <p role="alert" className="sims-feedback" style={{ marginTop: 10 }}>{failure}</p>}
    {request.decidable && (rejecting
      ? <form onSubmit={submitReject} style={{ marginTop: 12 }}>
        <p style={{ fontSize: 13, margin: '0 0 8px' }}>Tell the adviser why. They see this in the parent app.</p>
        <Field label="Reason"><Inp autoFocus required maxLength={500} value={reason} disabled={disabled} onChange={e => setReason(e.target.value)} /></Field>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <Btn type="submit" disabled={disabled || !reason.trim()}>{disabled ? 'Working…' : 'Reject request'}</Btn>
          <Btn variant="ghost" type="button" disabled={disabled} onClick={() => setRejecting(false)}>Cancel</Btn>
        </div>
      </form>
      : <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
        <Btn disabled={disabled} onClick={() => onApprove(request)}>Approve</Btn>
        <Btn variant="ghost" disabled={disabled} onClick={() => setRejecting(true)}>Reject</Btn>
      </div>)}
  </li>;
}
