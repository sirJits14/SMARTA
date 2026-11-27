import S from '../../strings.js';
import { T } from '../../styles.js';
import PageHeader from '../../components/PageHeader.jsx';
import { Banner, Btn, Card, Spinner } from '../../components/ui.jsx';
import { useSchoolContext } from '../../hooks/useSchoolContext.js';
import { useSchoolAction } from '../../hooks/useSchoolAction.js';
import { ROLE_LABELS, REQUEST_STATUS, scopeLabel } from '../../lib/school.js';

// Any verified account can ask; nothing changes until an approver says yes.
export default function SchoolAccessPage({ ctx, back }) {
  const school = useSchoolContext(ctx.user.uid);
  const { busy, message, act } = useSchoolAction(school.refresh);
  const context = school.data;
  const sections = context?.sections || [];
  const mine = context?.myRequests || [];
  return (
    <>
      <PageHeader title={S.schoolAccessTitle} onBack={back} />
      {school.loading && !context && <Spinner label={S.loading} />}
      {school.error && <Banner tone="danger">{school.error}</Banner>}
      {message && <Banner tone={message.tone}>{message.text}</Banner>}
      {context && <>
        <Card>
          <p style={{ marginTop: 0, fontSize: 14 }}>{S.schoolAccessIntro}</p>
          {context.ended ? <p style={{ fontSize: 14 }}>{S.schoolAccessEnded}</p>
            : <Btn onClick={() => ctx.navigate('/join')}>{S.addRoleRow}</Btn>}
        </Card>
        <Card>
          <h2 style={{ fontSize: 16, margin: '0 0 8px' }}>{S.schoolAccessMine}</h2>
          {mine.length === 0 ? <p style={{ fontSize: 14, margin: 0 }}>{S.schoolAccessNone}</p> : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>{mine.map((r) => (
              <li key={r.id} style={{ padding: '10px 0', borderTop: `1px solid ${T.border}` }}>
                <div style={{ fontWeight: 600 }}>{ROLE_LABELS[r.role]} · {scopeLabel(r, sections)}</div>
                <div style={{ fontSize: 13, color: T.inkMuted }}>{REQUEST_STATUS[r.status] || r.status}{r.reason ? ` · ${r.reason}` : ''}</div>
                {r.status === 'pending' && <Btn variant="ghost" disabled={busy} style={{ marginTop: 8 }}
                  onClick={() => act('withdrawSchoolRequestFn', { requestId: r.id }, S.schoolAccessWithdrawn)}>{S.schoolAccessWithdraw}</Btn>}
              </li>))}</ul>
          )}
        </Card>
      </>}
    </>
  );
}
