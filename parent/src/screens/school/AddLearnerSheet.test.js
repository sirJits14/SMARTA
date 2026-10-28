import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import S from '../../strings.js';
import { emptyLearnerForm } from '../../lib/learnerRequests.js';
import { AddLearnerForm } from './AddLearnerSheet.jsx';

const render = (props) => renderToStaticMarkup(createElement(AddLearnerForm, { busy: false, error: '', today: '2026-10-22', onSubmit() {}, onClose() {}, ...props }));

describe('AddLearnerForm', () => {
  it('asks for the import template’s learner and contact fields, without grade and section', () => {
    const html = render();
    for (const label of [S.learnerLrn, S.learnerLastName, S.learnerFirstName, S.learnerMiddleName, S.learnerExt, S.learnerSex, S.learnerBirthdate,
      S.learnerEnrollType, S.learnerAddress, S.learnerGuardianName, S.learnerGuardianRelationship, S.learnerGuardianContact, S.learnerContactNumber]) {
      expect(html, label).toContain(label);
    }
    expect(html).toContain(S.learnerSend);
    expect(html).toContain('max="2026-10-22"'); // no birthdate in the future
    expect(html).toContain('maxLength="12"'); // an LRN is 12 digits
    expect(html).not.toContain('aria-invalid'); // nothing is wrong until the form is sent
    expect(html).not.toContain('Grade');
  });
  it('starts with the enrollment type set to New', () => {
    expect(render()).toContain('<option value="new" selected="">New</option>');
  });
  it('fills from a previous request', () => {
    const html = render({ initial: { ...emptyLearnerForm(), lrn: '123456789012', lastName: 'Dela Cruz' } });
    expect(html).toContain('value="123456789012"');
    expect(html).toContain('value="Dela Cruz"');
  });
  it('shows the server’s answer and locks the form while sending', () => {
    const html = render({ error: 'This LRN is already in your class.', busy: true });
    expect(html).toContain('This LRN is already in your class.');
    expect(html).toContain(S.learnerSending);
    expect(html.match(/disabled=""/g).length).toBeGreaterThan(10);
  });
  it('puts the server’s answer beside the send button, not at the top of the long form', () => {
    const answer = 'This LRN is already in your class.';
    const html = render({ error: answer });
    const afterLastField = html.indexOf(S.learnerContactNumber);
    const answerAt = html.indexOf(answer);
    const sendAt = html.indexOf(S.learnerSend);
    expect(afterLastField, 'contact number field').toBeGreaterThan(-1);
    expect(sendAt, 'send button').toBeGreaterThan(-1);
    expect(answerAt, 'after the last field').toBeGreaterThan(afterLastField);
    expect(answerAt, 'before the send button').toBeLessThan(sendAt);
    expect(html.split(answer).length - 1, 'shown once').toBe(1);
  });
});
