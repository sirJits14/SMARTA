import { useState } from 'react';
import S from '../../strings.js';
import { T } from '../../styles.js';
import PageHeader from '../../components/PageHeader.jsx';
import { Banner, Btn, Card, Field, Sel, Spinner } from '../../components/ui.jsx';
import { useSchoolContext } from '../../hooks/useSchoolContext.js';
import { useSchoolAction } from '../../hooks/useSchoolAction.js';
import { ROLE_LABELS, REQUESTABLE_ROLES, REQUEST_STATUS, sectionLabel, sectionsByGrade } from '../../lib/school.js';

// Any verified account can ask; nothing changes until an approver says yes.
export default function SchoolAccessPage({ ctx, back }) {
  const school = useSchoolContext(ctx.user.uid);
  const { busy, message, act } = useSchoolAction(school.refresh);
  const [form, setForm] = useState({ role: 'adviser', sectionId: '' });
  const context = school.data;
  const sections = context?.sections || [];
  const mine = context?.myRequests || [];
  const submit = (event) => {
    event.preventDefault();
    if (form.sectionId) act('requestSchoolRoleFn', form, S.schoolAccessSent, () => setForm({ ...form, sectionId: '' }));
  };
  return (
    <>
      <PageHeader title={S.schoolAccessTitle} onBack={back} />
      {school.loading && !context && <Spinner label={S.loading} />}
      {school.error && <Banner tone="danger">{school.error}</Banner>}
      {message && <Banner tone={message.tone}>{message.text}</Banner>}
      {context && <>
        <Card>
          <p style={{ marginTop: 0, fontSize: 14 }}>{S.schoolAccessIntro}</p>
          {context.ended ? <p style={{ fontSize: 14 }}>{S.schoolAccessEnded}</p> : (
            <form onSubmit={submit}>
              <Field label={S.schoolAccessRole}><Sel value={form.role} disabled={busy} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                {REQUESTABLE_ROLES.map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}</Sel></Field>
              <Field label={S.schoolAccessSection}><Sel required value={form.sectionId} disabled={busy} onChange={(e) => setForm({ ...form, sectionId: e.target.value })}>
                <option value="">{S.schoolAccessChooseSection}</option>
                {sectionsByGrade(sections).map((g) => <optgroup key={g.grade} label={`Grade ${g.grade}`}>
                  {g.sections.map((s) => <option key={s.id} value={s.id}>{s.name || s.id}</option>)}</optgroup>)}</Sel></Field>
              <Btn type="submit" disabled={busy || !form.sectionId}>{S.schoolAccessSubmit}</Btn>
            </form>
          )}
        </Card>
        <Card>
          <h2 style={{ fontSize: 16, margin: '0 0 8px' }}>{S.schoolAccessMine}</h2>
          {mine.length === 0 ? <p style={{ fontSize: 14, margin: 0 }}>{S.schoolAccessNone}</p> : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>{mine.map((r) => (
              <li key={r.id} style={{ padding: '10px 0', borderTop: `1px solid ${T.border}` }}>
                <div style={{ fontWeight: 600 }}>{ROLE_LABELS[r.role]} · {sectionLabel(sections.find((s) => s.id === r.sectionId))}</div>
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
