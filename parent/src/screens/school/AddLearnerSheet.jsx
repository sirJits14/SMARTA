import { useRef, useState } from 'react';
import S from '../../strings.js';
import { manilaDate } from '../../../../shared/dates.js';
import { Banner, Btn, Inp, Sel } from '../../components/ui.jsx';
import Sheet from '../../components/Sheet.jsx';
import { ENROLL_OPTIONS, checkLearnerForm, emptyLearnerForm } from '../../lib/learnerRequests.js';

function FormField({ label, error, wide = false, children }) {
  return (
    <label className={`p-field learner-field${wide ? ' learner-field--wide' : ''}`}>
      <span className="p-field-label">{label}</span>
      {children}
      {error && <span className="learner-field-error" role="alert">{error}</span>}
    </label>
  );
}

// A new learner's details: the Excel import's columns, minus grade and section (they are this class).
// Kept apart from the portal so it can be rendered on its own in tests.
export function AddLearnerForm({ initial, busy, error, today = manilaDate(), onSubmit, onClose }) {
  const [form, setForm] = useState(() => initial || emptyLearnerForm());
  const [errors, setErrors] = useState({});
  const element = useRef(null);
  const set = (key) => (event) => { const value = event.target.value; setForm((current) => ({ ...current, [key]: value })); };
  const bad = (key) => (errors[key] ? true : undefined); // omit the attribute unless the field is wrong
  const submit = (event) => {
    event.preventDefault();
    const result = checkLearnerForm(form, today);
    setErrors(result.errors);
    if (result.ok) onSubmit(form);
    else setTimeout(() => element.current?.querySelector('[aria-invalid="true"]')?.focus(), 0);
  };
  const text = (key, label, extra = {}, wide = false) => (
    <FormField label={label} error={errors[key]} wide={wide}>
      <Inp value={form[key]} onChange={set(key)} disabled={busy} aria-invalid={bad(key)} autoComplete="off" {...extra} />
    </FormField>
  );
  return (
    <form ref={element} className="learner-form" onSubmit={submit} noValidate>
      {error && <div className="learner-form-wide"><Banner tone="danger">{error}</Banner></div>}
      <h3 className="learner-form-title">{S.learnerSectionLearner}</h3>
      {text('lrn', S.learnerLrn, { inputMode: 'numeric', maxLength: 12 }, true)}
      {text('lastName', S.learnerLastName)}
      {text('firstName', S.learnerFirstName)}
      {text('middleName', S.learnerMiddleName)}
      {text('extName', S.learnerExt)}
      <FormField label={S.learnerSex} error={errors.sex}>
        <Sel value={form.sex} onChange={set('sex')} disabled={busy} aria-invalid={bad('sex')}>
          <option value="">{S.learnerChoose}</option>
          <option value="M">{S.learnerMale}</option>
          <option value="F">{S.learnerFemale}</option>
        </Sel>
      </FormField>
      {text('birthdate', S.learnerBirthdate, { type: 'date', max: today })}
      <FormField label={S.learnerEnrollType} error={errors.enrollType} wide>
        <Sel value={form.enrollType} onChange={set('enrollType')} disabled={busy} aria-invalid={bad('enrollType')}>
          {ENROLL_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </Sel>
      </FormField>
      <h3 className="learner-form-title">{S.learnerSectionContact}</h3>
      {text('address', S.learnerAddress, {}, true)}
      {text('guardianName', S.learnerGuardianName)}
      {text('guardianRelationship', S.learnerGuardianRelationship)}
      {text('guardianContact', S.learnerGuardianContact, { inputMode: 'tel' })}
      {text('contactNumber', S.learnerContactNumber, { inputMode: 'tel' })}
      <div className="learner-form-wide">
        <Btn type="submit" disabled={busy} style={{ width: '100%' }}>{busy ? S.learnerSending : S.learnerSend}</Btn>
        <Btn type="button" variant="ghost" disabled={busy} onClick={onClose} style={{ width: '100%', marginTop: 10 }}>{S.learnerCancel}</Btn>
      </div>
    </form>
  );
}

export default function AddLearnerSheet({ classLabel, initial, busy, error, onSubmit, onClose }) {
  return (
    <Sheet title={S.addLearnerTitle} hint={`${classLabel} · ${S.addLearnerHint}`} busy={busy} onClose={onClose}>
      <AddLearnerForm initial={initial} busy={busy} error={error} onSubmit={onSubmit} onClose={onClose} />
    </Sheet>
  );
}
