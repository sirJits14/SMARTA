import { useState } from 'react';
import S from '../../strings.js';
import { nameCase } from '../../lib/format.js';
import { Banner, Btn } from '../../components/ui.jsx';
import Sheet from '../../components/Sheet.jsx';
import { REASON_OPTIONS, checkRemoval } from '../../lib/learnerRequests.js';

// Why a learner leaves the class: one of three reasons and a short note. Kept apart from the portal for tests.
export function RemoveLearnerForm({ busy, error, onSubmit, onClose }) {
  const [reasonCode, setReasonCode] = useState('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState({});
  const submit = (event) => {
    event.preventDefault();
    const result = checkRemoval({ reasonCode, note });
    setErrors(result.errors);
    if (result.ok) onSubmit(result.value);
  };
  return (
    <form onSubmit={submit} noValidate>
      {error && <Banner tone="danger">{error}</Banner>}
      <fieldset className="remove-reasons" disabled={busy}>
        <legend className="p-field-label">{S.removeReason}</legend>
        {REASON_OPTIONS.map((option) => (
          <label key={option.value} className="remove-reason">
            <input type="radio" name="remove-reason" value={option.value} checked={reasonCode === option.value} onChange={() => setReasonCode(option.value)} />
            <span>{option.label}</span>
          </label>
        ))}
        {errors.reasonCode && <span className="learner-field-error" role="alert">{errors.reasonCode}</span>}
      </fieldset>
      <label className="p-field">
        <span className="p-field-label">{S.removeNote}</span>
        <textarea className="p-input" rows={3} maxLength={500} value={note} disabled={busy} aria-invalid={errors.note ? true : undefined} onChange={(e) => setNote(e.target.value)} />
        <span className="p-field-hint">{S.removeNoteHint}</span>
        {errors.note && <span className="learner-field-error" role="alert">{errors.note}</span>}
      </label>
      <Btn type="submit" disabled={busy} style={{ width: '100%' }}>{busy ? S.learnerSending : S.learnerSend}</Btn>
      <Btn type="button" variant="ghost" disabled={busy} onClick={onClose} style={{ width: '100%', marginTop: 10 }}>{S.learnerCancel}</Btn>
    </form>
  );
}

export default function RemoveLearnerSheet({ displayName, busy, error, onSubmit, onClose }) {
  return (
    <Sheet title={S.removeFromClass} hint={`${nameCase(displayName)} ${S.removeHint}`} busy={busy} onClose={onClose}>
      <RemoveLearnerForm busy={busy} error={error} onSubmit={onSubmit} onClose={onClose} />
    </Sheet>
  );
}
