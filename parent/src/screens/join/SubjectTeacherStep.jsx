import { useState } from 'react';
import { callable } from '../../firebase.js';
import S from '../../strings.js';
import { T } from '../../styles.js';
import { Banner, Btn, Card } from '../../components/ui.jsx';
import { isDepedEmail } from '../../../../shared/schoolAccess.js';
import { schoolError } from '../../lib/school.js';
import StepHeader from './StepHeader.jsx';

const GRADES = [7, 8, 9, 10, 11, 12];

export default function SubjectTeacherStep({ user, school, label, onDone, onSkip }) {
  const deped = isDepedEmail(user.email);
  const [grades, setGrades] = useState([]);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const toggle = (g) => setGrades((list) => (list.includes(g) ? list.filter((x) => x !== g) : [...list, g].sort((a, b) => a - b)));
  const submit = async () => {
    if (busy) return;
    setBusy(true); setErr('');
    try {
      const r = (await callable('requestSchoolRoleFn')({ role: 'subject_teacher', gradeLevels: grades })).data;
      onDone({ outcome: r.status === 'granted' ? 'active' : 'pending', detail: grades.join(', ') });
    } catch (e) { setErr(schoolError(e)); }
    finally { setBusy(false); }
  };
  if (school.data?.ended) return <Card><StepHeader label={label} title={S.subjectTitle}>{S.schoolAccessEnded}</StepHeader>
    <Btn variant="ghost" onClick={onSkip} style={{ width: '100%' }}>{S.joinSkipStep}</Btn></Card>;
  return (
    <Card>
      <StepHeader label={label} title={S.subjectTitle}>{deped ? S.subjectBody : `${S.subjectBody} ${S.subjectBodyApproval}`}</StepHeader>
      {err && <Banner tone="danger">{err}</Banner>}
      <div role="group" aria-label={S.subjectTitle} style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
        {GRADES.map((g) => {
          const on = grades.includes(g);
          return <button key={g} type="button" role="checkbox" aria-checked={on} onClick={() => toggle(g)} disabled={busy}
            style={{ minHeight: T.tap, borderRadius: T.pill, font: 'inherit', fontWeight: 600, cursor: 'pointer',
              border: `1.5px solid ${on ? T.primary : T.border}`, background: on ? T.primary : T.surface, color: on ? T.onPrimary : T.ink }}>
            {on ? '✓ ' : ''}{`${S.schoolAccessGrade} ${g}`}</button>;
        })}
      </div>
      <Btn onClick={submit} disabled={busy || !grades.length} style={{ width: '100%' }}>{S.subjectSubmit}</Btn>
      <Btn variant="ghost" onClick={onSkip} disabled={busy} style={{ width: '100%', marginTop: 10 }}>{S.joinSkipStep}</Btn>
    </Card>
  );
}
