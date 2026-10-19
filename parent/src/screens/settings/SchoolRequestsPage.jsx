import { useState } from 'react';
import S from '../../strings.js';
import { T } from '../../styles.js';
import PageHeader from '../../components/PageHeader.jsx';
import { Banner, Btn, Card, EmptyState, Field, Inp, Spinner } from '../../components/ui.jsx';
import { useSchoolContext } from '../../hooks/useSchoolContext.js';
import { useSchoolAction } from '../../hooks/useSchoolAction.js';
import { ROLE_LABELS, scopeLabel } from '../../lib/school.js';

// Curriculum Advisers review adviser requests from DepEd accounts in their grades.
export default function SchoolRequestsPage({ ctx, back }) {
  const school = useSchoolContext(ctx.user.uid);
  const { busy, message, act } = useSchoolAction(school.refresh);
  const [rejecting, setRejecting] = useState(null);
  const [reason, setReason] = useState('');
  const context = school.data;
  const queue = context?.reviewQueue || [];
  const sections = context?.sections || [];
  const locked = busy || Boolean(context?.ended);
  const reject = (event, request) => {
    event.preventDefault();
    if (reason.trim()) act('resolveSchoolRoleFn', { requestId: request.id, approve: false, reason: reason.trim() }, S.schoolRequestsRejected, () => { setRejecting(null); setReason(''); });
  };
  return (
    <>
      <PageHeader title={S.schoolRequestsTitle} onBack={back} />
      {school.loading && !context && <Spinner label={S.loading} />}
      {school.error && <Banner tone="danger">{school.error}</Banner>}
      {message && <Banner tone={message.tone}>{message.text}</Banner>}
      {context && <Card>
        <p style={{ marginTop: 0, fontSize: 14 }}>{S.schoolRequestsIntro}</p>
        {queue.length === 0 ? <EmptyState title={S.schoolRequestsEmpty} /> : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>{queue.map((r) => (
            <li key={r.id} style={{ padding: '12px 0', borderTop: `1px solid ${T.border}` }}>
              <div style={{ fontWeight: 600 }}>{r.displayName || r.email}</div>
              <div style={{ fontSize: 13, color: T.inkMuted, overflowWrap: 'anywhere' }}>{r.email}</div>
              <div style={{ fontSize: 14, margin: '4px 0 8px' }}>{ROLE_LABELS[r.role]} · {scopeLabel(r, sections)}</div>
              {r.conflict ? <Banner tone="warn">{S.schoolRequestsNeedsAdmin}</Banner>
                : rejecting === r.id ? (
                  <form onSubmit={(e) => reject(e, r)}>
                    <Field label={S.schoolRequestsReason}><Inp autoFocus required maxLength={500} value={reason} disabled={busy} onChange={(e) => setReason(e.target.value)} /></Field>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <Btn type="submit" disabled={busy || !reason.trim()}>{S.schoolRequestsConfirmReject}</Btn>
                      <Btn type="button" variant="ghost" disabled={busy} onClick={() => setRejecting(null)}>{S.schoolRequestsCancel}</Btn>
                    </div>
                  </form>
                ) : (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <Btn disabled={locked} onClick={() => act('resolveSchoolRoleFn', { requestId: r.id, approve: true }, S.schoolRequestsApproved)}>{S.schoolRequestsApprove}</Btn>
                    <Btn variant="ghost" disabled={locked} onClick={() => { setRejecting(r.id); setReason(''); }}>{S.schoolRequestsReject}</Btn>
                  </div>
                )}
            </li>))}</ul>
        )}
      </Card>}
    </>
  );
}
