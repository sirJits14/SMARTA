import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import RequestCard from './RequestCard.jsx';
import WaitingList from './WaitingList.jsx';
import DecidedList from './DecidedList.jsx';

const h = React.createElement;
const noop = async () => true;
const base = { gradeLevel: 7, sectionId: 'SEC1', sectionName: 'Rizal', requestedByName: 'Tina Teacher', createdAt: Date.now(), decidable: true };
const add = { ...base, id: 'a1', kind: 'add', status: 'pending', displayName: 'Juan Dela Cruz', lrn: '123456789012', enrollType: 'new', existing: null,
  student: { lrn: '123456789012', lastName: 'Dela Cruz', firstName: 'Juan', sex: 'M', birthdate: '2012-05-01', address: '123 Rizal St.' } };
const remove = { ...base, id: 'r1', kind: 'remove', status: 'pending', displayName: 'Ana Cruz', lrn: '100000000001', studentId: 'S1', reasonCode: 'dropped_out', note: 'Stopped attending in September' };
const card = (request, extra = {}) => renderToStaticMarkup(h('ul', null, h(RequestCard, { request, disabled: false, failure: '', onApprove: noop, onReject: noop, ...extra })));

describe('RequestCard', () => {
  it('shows a new learner with what approving does, the details, and both actions', () => {
    const html = card(add);
    expect(html).toContain('JUAN DELA CRUZ');
    expect(html).toContain('LRN 123456789012');
    expect(html).toContain('Grade 7 · Rizal · requested by Tina Teacher');
    expect(html).toContain('Adds JUAN DELA CRUZ to Grade 7 · Rizal as New.');
    expect(html).toContain('<summary');
    expect(html).toContain('123 Rizal St.');
    expect(html).toContain('>Approve<');
    expect(html).toContain('>Reject<');
  });
  it('flags an LRN already in SIMS instead of repeating the effect', () => {
    const html = card({ ...add, existing: { exists: true, needsAdmin: false, displayName: 'Ben Dy', learnerStatus: 'active', currentGrade: 7, currentSection: 'Mabini' } });
    expect(html).toContain('Already in SIMS: BEN DY, currently Grade 7 · Mabini. Approving moves them here.');
    expect(html).not.toContain('Adds JUAN');
  });
  it('shows a request that needs an administrator without actions', () => {
    const html = card({ ...add, decidable: false, existing: { exists: true, needsAdmin: true } });
    expect(html).toContain('Needs an administrator');
    expect(html).not.toContain('>Approve<');
    expect(html).not.toContain('>Reject<');
  });
  it('shows a removal with the reason, the note and what approving does', () => {
    const html = card(remove);
    expect(html).toContain('Dropped out · Stopped attending in September');
    expect(html).toContain('Marks ANA CRUZ as dropped and ends the enrollment.');
    expect(html).not.toContain('<summary');
  });
  it('shows a failed decision on the card and locks the actions while one is running', () => {
    const html = card(add, { failure: 'Already decided.', disabled: true });
    expect(html).toContain('Already decided.');
    expect(html.match(/disabled=""/g)).toHaveLength(2);
  });
});

describe('WaitingList', () => {
  it('explains where requests come from when none wait', () => {
    const html = renderToStaticMarkup(h(WaitingList, { requests: [], ended: false, pending: false, failures: {}, onApprove: noop, onReject: noop }));
    expect(html).toContain('No requests waiting');
    expect(html).toContain('Class tab of the parent app');
  });
  it('lists what the person can decide before what needs an administrator', () => {
    const needs = { ...add, id: 'a2', decidable: false, displayName: 'Cara Lim', existing: { exists: true, needsAdmin: true } };
    const html = renderToStaticMarkup(h(WaitingList, { requests: [needs, remove], ended: false, pending: false, failures: {}, onApprove: noop, onReject: noop }));
    expect(html.indexOf('ANA CRUZ')).toBeGreaterThan(-1);
    expect(html.indexOf('ANA CRUZ')).toBeLessThan(html.indexOf('CARA LIM'));
  });
  it('disables every action once the school year has ended', () => {
    const html = renderToStaticMarkup(h(WaitingList, { requests: [add], ended: true, pending: false, failures: {}, onApprove: noop, onReject: noop }));
    expect(html.match(/disabled=""/g)).toHaveLength(2);
  });
});

describe('DecidedList', () => {
  const decided = (over) => ({ ...base, id: 'd1', kind: 'add', status: 'approved', displayName: 'Maria Santos', lrn: '123456789013', decidedAt: Date.UTC(2026, 9, 22, 1, 5), decidedByName: 'Ada Admin', decisionReason: 'Approved', ...over });
  it('shows the outcome, who decided, when, and the reason', () => {
    const html = renderToStaticMarkup(h(DecidedList, { decided: { requests: [decided({}), decided({ id: 'd2', status: 'rejected', kind: 'remove', displayName: 'Ben Dy', reasonCode: 'transferred_out', note: 'Moved', decisionReason: 'Wrong learner' })], nextCursor: null }, loading: false, onMore() {} }));
    expect(html).toContain('Approved by Ada Admin · Oct 22, 2026');
    expect(html).toContain('Not approved');
    expect(html).toContain('Remove BEN DY');
    expect(html).toContain('Reason: Wrong learner');
    expect(html).not.toContain('Load more');
  });
  it('offers more when the server has another page, and says so when nothing is decided', () => {
    expect(renderToStaticMarkup(h(DecidedList, { decided: { requests: [decided({})], nextCursor: { ms: 1, id: 'x' } }, loading: false, onMore() {} }))).toContain('Load more');
    expect(renderToStaticMarkup(h(DecidedList, { decided: { requests: [], nextCursor: null }, loading: false, onMore() {} }))).toContain('Nothing decided yet');
    expect(renderToStaticMarkup(h(DecidedList, { decided: null, loading: true, onMore() {} }))).toContain('Loading decided requests');
  });
});
