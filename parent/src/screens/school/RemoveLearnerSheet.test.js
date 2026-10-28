import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import S from '../../strings.js';
import { RemoveLearnerForm } from './RemoveLearnerSheet.jsx';

const render = (props) => renderToStaticMarkup(createElement(RemoveLearnerForm, { busy: false, error: '', onSubmit() {}, onClose() {}, ...props }));

describe('RemoveLearnerForm', () => {
  it('offers the three reasons and a note', () => {
    const html = render();
    for (const reason of ['Transferred out', 'Dropped out', 'Moved to another section']) expect(html).toContain(reason);
    expect(html.match(/type="radio"/g)).toHaveLength(3);
    expect(html).toContain(S.removeNote);
    expect(html).toContain('<textarea');
    expect(html).toContain(S.learnerSend);
  });
  it('shows an error and locks the form while sending', () => {
    const html = render({ error: 'Learner is not enrolled in this section.', busy: true });
    expect(html).toContain('Learner is not enrolled in this section.');
    expect(html).toContain(S.learnerSending);
    expect(html).toContain('<fieldset class="remove-reasons" disabled=""');
  });
});
