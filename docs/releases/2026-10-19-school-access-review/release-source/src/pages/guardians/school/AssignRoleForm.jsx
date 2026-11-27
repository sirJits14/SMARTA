import { useEffect, useRef, useState } from 'react';
import { Btn, Card, Field, Inp, Sel } from '../../../components/ui.jsx';
import { T, S } from '../../../styles.js';
import { ROLE_LABELS, sectionLabel } from '../../../../parent/src/lib/school.js';

const EMPTY = { email: '', role: 'adviser', sectionId: '', gradeLevel: '', source: 'direct', name: '' };

// Direct assignment. Coverage ("Assign") and old adviser slips ("Use in form") open it prefilled.
export default function AssignRoleForm({ school, prefill, onClose }) {
  const { context, run, pending } = school;
  const [assignment, setAssignment] = useState({ ...EMPTY, ...prefill });
  const rootRef = useRef(null);
  const emailRef = useRef(null);
  const sectionRef = useRef(null);
  useEffect(() => {
    setAssignment({ ...EMPTY, ...prefill });
    const calm = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    rootRef.current?.scrollIntoView?.({ block: 'start', ...(calm ? {} : { behavior: 'smooth' }) });
    (prefill.email ? sectionRef : emailRef).current?.focus({ preventScroll: true });
  }, [prefill]);
  const set = (key, value) => setAssignment(a => ({ ...a, [key]: value }));
  const grades = [...new Set((context.sections || []).map(s => Number(s.gradeLevel)))].sort((a, b) => a - b);
  const submit = event => {
    event.preventDefault();
    const payload = { email: assignment.email.trim(), role: assignment.role, source: assignment.source,
      ...(assignment.role === 'curriculum_adviser' ? { gradeLevel: Number(assignment.gradeLevel) } : { sectionId: assignment.sectionId }) };
    run('assignSchoolRoleFn', payload, 'School role assigned. The teacher gets an inbox note in the app.', onClose);
  };
  return <Card style={{ padding: 20, marginBottom: 18 }}>
    <div ref={rootRef} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
      <h3 style={S.h2}>Assign a school role</h3>
      <Btn variant="ghost" type="button" onClick={onClose}>Close</Btn>
    </div>
    <p style={{ fontSize: 13, color: T.inkMuted, marginTop: 0 }}>
      {assignment.name ? `Confirm ${assignment.name}'s class, then assign. ` : ''}Use the teacher's verified app account email. They switch to School in the app's Settings.</p>
    <form onSubmit={submit}><fieldset disabled={pending || context.ended} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 230px), 1fr))', gap: '0 18px' }}>
        <Field label="Account email"><Inp ref={emailRef} type="email" autoComplete="email" required value={assignment.email} onChange={e => set('email', e.target.value)} /></Field>
        <Field label="Responsibility"><Sel value={assignment.role} onChange={e => set('role', e.target.value)}>
          {Object.entries(ROLE_LABELS).map(([role, label]) => <option key={role} value={role}>{label}</option>)}</Sel></Field>
        {assignment.role === 'curriculum_adviser'
          ? <Field label="Grade"><Sel required value={assignment.gradeLevel} onChange={e => set('gradeLevel', e.target.value)}>
            <option value="">Choose grade</option>{grades.map(g => <option key={g} value={g}>Grade {g}</option>)}</Sel></Field>
          : <Field label="Section"><Sel ref={sectionRef} required value={assignment.sectionId} onChange={e => set('sectionId', e.target.value)}>
            <option value="">Choose section</option>{(context.sections || []).map(s => <option key={s.id} value={s.id}>{sectionLabel(s)}</option>)}</Sel></Field>}
      </div>
      <Btn type="submit">{pending ? 'Working…' : 'Assign role'}</Btn>
    </fieldset></form>
  </Card>;
}
