import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import S from '../../strings.js';
import { RequestsList } from './RequestsSheet.jsx';

const requests = [
  { id: 'a', kind: 'remove', status: 'pending', studentId: 'S1', displayName: 'ANA CRUZ', reasonCode: 'dropped_out', note: 'Stopped coming' },
  { id: 'b', kind: 'add', status: 'rejected', displayName: 'Juan Dela Cruz', lrn: '123456789012', decisionReason: 'LRN looks wrong', student: { lrn: '123456789012' } },
  { id: 'c', kind: 'add', status: 'approved', displayName: 'Maria Santos', lrn: '123456789013' },
  { id: 'd', kind: 'add', status: 'withdrawn', displayName: 'Pedro Reyes', lrn: '123456789014' },
];
const render = (props) => renderToStaticMarkup(createElement(RequestsList, { requests, busy: false, error: '', onWithdraw() {}, onSendAgain() {}, onClose() {}, ...props }));

describe('RequestsList', () => {
  it('names each request, its status and its detail', () => {
    const html = render();
    expect(html).toContain('Remove Ana Cruz');
    expect(html).toContain('Dropped out · Stopped coming');
    expect(html).toContain('Add Juan Dela Cruz');
    expect(html).toContain('LRN 123456789012');
    for (const status of [S.learnerStatusPending, S.learnerStatusRejected, S.learnerStatusApproved, S.learnerStatusWithdrawn]) expect(html).toContain(status);
    expect(html).toContain(`${S.requestReasonLabel}: LRN looks wrong`);
  });
  it('offers Withdraw only while waiting and Send again only for a not-approved add', () => {
    const html = render();
    expect(html.match(new RegExp(S.withdrawRequest, 'g'))).toHaveLength(1);
    expect(html.match(new RegExp(S.requestSendAgain, 'g'))).toHaveLength(1);
  });
  it('says so when there are no requests, and locks the actions while busy', () => {
    expect(render({ requests: [] })).toContain(S.requestsEmpty);
    expect(render({ busy: true })).toContain('disabled=""');
    expect(render({ error: 'Request not found.' })).toContain('Request not found.');
  });
});
