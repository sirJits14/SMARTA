import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import S from '../../strings.js';
import { PassRequestList, PassRequestHistory } from './PassRequestSheet.jsx';

vi.mock('../../firebase.js', () => ({ app: {}, db: {}, auth: { currentUser: null }, callable: () => async () => ({ data: {} }) }));

const learners = [
  { studentId: 'S1', displayName: 'ABAD, BEN', hasPhoto: false, hasActivePass: false, blocker: null },
  { studentId: 'S2', displayName: 'CRUZ, CARLA', hasPhoto: true, hasActivePass: true, blocker: null },
  { studentId: 'S3', displayName: 'DIZON, DAN', hasPhoto: true, hasActivePass: true, blocker: 'already-requested' },
];
const list = (props) => renderToStaticMarkup(createElement(PassRequestList, {
  learners, picks: {}, note: '', busy: false, loading: false, error: '', onToggle() {}, onChoose() {}, onNote() {}, onSend() {}, onClose() {}, ...props,
}));
const row = (html, name) => html.split('<li').find((part) => part.includes(name)) || '';
const sendButton = (html) => html.match(/<button[^>]*class="p-btn p-btn--solid[^>]*>[^<]*<\/button>/)?.[0] || '';
const inputs = (html, type) => html.match(new RegExp(`<input[^>]*type="${type}"[^>]*>`, 'g')) || [];

describe('PassRequestList', () => {
  it('marks the learners without a photo, and still lets them be chosen', () => {
    const html = list();
    expect(row(html, 'ABAD, BEN')).toContain(S.passRequestNoPhoto);
    expect(row(html, 'CRUZ, CARLA')).not.toContain(S.passRequestNoPhoto);
    expect(inputs(row(html, 'ABAD, BEN'), 'checkbox')[0]).not.toContain('disabled=""');
  });
  it('disables a blocked learner and says why', () => {
    const blocked = row(list({ picks: { S3: 'lost' } }), 'DIZON, DAN');
    const [box] = inputs(blocked, 'checkbox');
    expect(box).toContain('disabled=""');
    expect(box).not.toContain('checked=""');
    expect(blocked).toContain(S.passBlockedRequested);
    expect(inputs(blocked, 'radio')).toEqual([]);
  });
  it('asks Lost or Damaged only for a learner who already has a pass', () => {
    const html = list();
    const replace = row(html, 'CRUZ, CARLA');
    expect(replace).toContain(S.passRequestReplaceHint);
    expect(inputs(replace, 'radio')).toHaveLength(2);
    expect(replace).toContain(`>${S.passRequestLost}<`);
    expect(replace).toContain(`>${S.passRequestDamaged}<`);
    expect(inputs(row(html, 'ABAD, BEN'), 'radio')).toEqual([]);
  });
  it('counts only the learners ready to send', () => {
    expect(sendButton(list())).toContain(`${S.passRequestSend} (0)`);
    expect(sendButton(list())).toContain('disabled=""');
    expect(sendButton(list({ picks: { S1: '', S2: '' } }))).toContain(`${S.passRequestSend} (1)`);
    const ready = sendButton(list({ picks: { S1: '', S2: 'damaged', S3: '' } }));
    expect(ready).toContain(`${S.passRequestSend} (2)`);
    expect(ready).not.toContain('disabled=""');
  });
  it('locks every control while sending', () => {
    const html = list({ picks: { S1: '' }, busy: true });
    expect(sendButton(html)).toContain('disabled=""');
    expect(sendButton(html)).toContain(S.learnerSending);
    for (const box of inputs(html, 'checkbox')) expect(box).toContain('disabled=""');
    expect(html.match(/<textarea[^>]*>/)[0]).toContain('disabled=""');
  });
  it('holds the send while the list is being refreshed', () => {
    expect(sendButton(list({ picks: { S1: '' }, loading: true }))).toContain('disabled=""');
  });
  it('limits the note to 500 characters and counts them', () => {
    const html = list({ note: 'Field trip' });
    expect(html).toContain(S.passRequestNote);
    expect(html.match(/<textarea[^>]*>/)[0]).toContain('maxLength="500"');
    expect(html).toContain('10/500');
  });
  it('stops at 40 chosen learners and says so', () => {
    const many = Array.from({ length: 42 }, (_, i) => ({ studentId: `M${i}`, displayName: `LEARNER ${i}`, hasPhoto: true, hasActivePass: false, blocker: null }));
    const picks = Object.fromEntries(many.slice(0, 40).map((l) => [l.studentId, '']));
    const html = list({ learners: many, picks });
    const boxes = inputs(html, 'checkbox');
    expect(boxes[0]).not.toContain('disabled=""');
    expect(boxes[41]).toContain('disabled=""');
    expect(html).toContain('You can send up to 40 learners at a time.');
    expect(list()).not.toContain('You can send up to 40 learners at a time.');
  });
  it('shows an error beside the send button, and says when the class is empty', () => {
    expect(list({ error: 'You already have 40 requests waiting.' })).toContain('You already have 40 requests waiting.');
    expect(list({ learners: [] })).toContain(S.sf2NoLearners);
  });
});

describe('PassRequestHistory', () => {
  const base = { studentId: 'S1', note: '', declineReason: '', prepared: false };
  const requests = [
    { ...base, id: 'r1', displayName: 'ABAD, BEN', reason: 'new', status: 'pending' },
    { ...base, id: 'r2', displayName: 'CRUZ, CARLA', reason: 'lost', status: 'pending', prepared: true },
    { ...base, id: 'r3', displayName: 'DIZON, DAN', reason: 'damaged', note: 'Torn', status: 'printed' },
    { ...base, id: 'r4', displayName: 'EVA, ELLA', reason: 'new', status: 'declined', declineReason: 'Official ID is ready' },
    { ...base, id: 'r5', displayName: 'FAJARDO, FE', reason: 'new', status: 'withdrawn' },
  ];
  const history = (props) => renderToStaticMarkup(createElement(PassRequestHistory, { requests, busy: false, onWithdraw() {}, ...props }));

  it('shows a status chip on every request', () => {
    const html = history();
    expect(row(html, 'ABAD, BEN')).toContain(`>${S.passRequestWaiting}<`);
    expect(row(html, 'DIZON, DAN')).toContain(`>${S.passRequestPrinted}<`);
    expect(row(html, 'EVA, ELLA')).toContain(`>${S.passRequestDeclined}<`);
    expect(row(html, 'FAJARDO, FE')).toContain(`>${S.passRequestWithdrawn}<`);
  });
  it('shows the replacement reason, the note and the decline reason', () => {
    const html = history();
    expect(row(html, 'DIZON, DAN')).toContain('Damaged · Torn');
    expect(row(html, 'EVA, ELLA')).toContain('Official ID is ready');
  });
  it('offers Withdraw only for a waiting request that is not being printed', () => {
    const html = history();
    expect(html.split(`>${S.passRequestWithdraw}</button>`)).toHaveLength(2);
    expect(row(html, 'ABAD, BEN')).toContain(`>${S.passRequestWithdraw}</button>`);
    expect(row(html, 'CRUZ, CARLA')).not.toContain('<button');
    expect(row(html, 'CRUZ, CARLA')).toContain(S.passRequestPreparing);
    expect(row(html, 'ABAD, BEN')).not.toContain(S.passRequestPreparing);
  });
  it('locks Withdraw while busy', () => {
    expect(history({ busy: true }).match(/<button[^>]*>/)[0]).toContain('disabled=""');
  });
  it('says when there is nothing yet', () => {
    expect(history({ requests: [] })).toContain(S.passRequestEmpty);
  });
});
