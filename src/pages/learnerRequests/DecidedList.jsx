import { Badge, Btn, Card, EmptyState } from '../../components/ui.jsx';
import { T } from '../../styles.js';
import { classText, kindLabel, nameText, outcomeText, personText, removalText, whenText } from '../../lib/learnerRequests.js';

const muted = { fontSize: 13, color: T.inkMuted };
const wrap = { overflowWrap: 'anywhere' };

// The server's default reason for an approval says nothing the badge does not.
const showReason = (request) => Boolean(request.decisionReason) && !(request.status === 'approved' && request.decisionReason === 'Approved');

// Newest decision first, 50 at a time.
export default function DecidedList({ decided, loading, onMore }) {
  if (!decided) return loading ? <p role="status">Loading decided requests…</p> : null;
  return <Card style={{ padding: 20 }}>
    {decided.requests.length === 0
      ? <EmptyState title="Nothing decided yet" hint="Approved and rejected requests appear here." />
      : <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>{decided.requests.map(request => (
        <li key={request.id} style={{ padding: '14px 0', borderTop: `1px solid ${T.border}` }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '2px 10px' }}>
            <Badge tone={request.status === 'approved' ? 'success' : 'danger'}>{request.status === 'approved' ? 'Approved' : 'Not approved'}</Badge>
            <strong style={wrap}>{kindLabel(request)} {nameText(request)}</strong>
            {request.lrn ? <span style={muted}>LRN {request.lrn}</span> : null}
          </div>
          <div style={{ marginTop: 4 }}>{classText(request)} · requested by {personText(request.requestedByName)}</div>
          {request.kind === 'remove' && <div style={{ ...muted, ...wrap }}>{removalText(request)}</div>}
          <div style={muted}>{[outcomeText(request), whenText(request.decidedAt)].filter(Boolean).join(' · ')}</div>
          {showReason(request) && <div style={{ ...muted, ...wrap }}>Reason: {request.decisionReason}</div>}
        </li>))}</ul>}
    {decided.nextCursor && <Btn variant="ghost" disabled={loading} onClick={onMore} style={{ marginTop: 12 }}>Load more</Btn>}
  </Card>;
}
