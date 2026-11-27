import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import RequestCard, { closesRejectForm, rejectRequest } from './RequestCard.jsx';
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
    expect(html).toContain('Grade 7 · Rizal · requested by TINA TEACHER');
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
  it('shows an adviser with no name by their email address as written', () => {
    const html = card({ ...add, requestedByName: 'teacher@deped.gov.ph' });
    expect(html).toContain('requested by teacher@deped.gov.ph');
    expect(html).not.toContain('TEACHER@DEPED.GOV.PH');
  });
  it('says SIMS keeps what it has when approving an LRN already in SIMS can go ahead', () => {
    const html = card({ ...add, existing: { exists: true, needsAdmin: false, displayName: 'Ben Dy', learnerStatus: 'active', currentGrade: 7, currentSection: 'Mabini' } });
    expect(html).toContain('SIMS keeps the details it already has for this learner.');
    expect(html).not.toContain('sims-flag--conflict');
    expect(card(add)).not.toContain('SIMS keeps the details');
  });
  it('promises nothing it will not do for a learner already in this class', () => {
    const html = card({ ...add, existing: { exists: true, needsAdmin: false, enrolledHere: true, displayName: 'Ben Dy', learnerStatus: 'active', currentGrade: 7, currentSection: 'Rizal' } });
    expect(html).toContain('Already in SIMS: BEN DY, already in this class. Approving will not work; reject this request.');
    expect(html).not.toContain('Approving moves them here');
    expect(html).not.toContain('SIMS keeps the details');
    expect(html).toContain('sims-flag--conflict');
    expect(html).toContain('>Reject<');
  });
  it('shows a duplicate LRN as a conflict even when the person can decide', () => {
    const html = card({ ...add, existing: { exists: true, needsAdmin: false, ambiguous: true } });
    expect(html).toContain('This LRN matches more than one learner. Fix the records first.');
    expect(html).toContain('sims-flag--conflict');
    expect(html).not.toContain('SIMS keeps the details');
  });
  it('names the learner on the Details summary and wraps long text', () => {
    const html = card(add);
    expect(html).toContain('aria-label="Details for JUAN DELA CRUZ"');
    expect(card(remove).match(/overflow-wrap:anywhere/g)).toHaveLength(3); // name, removal note, effect
    const flagged = card({ ...add, existing: { exists: true, needsAdmin: false, displayName: 'Ben Dy', learnerStatus: 'active', currentGrade: 7, currentSection: 'Mabini' } });
    expect(flagged).toMatch(/<li class="sims-flag" style="overflow-wrap:anywhere">/);
  });
  it('leaves out the LRN when there is none', () => {
    expect(card(add)).toContain('>LRN 123456789012<');
    expect(card({ ...add, lrn: '' })).not.toContain('>LRN ');
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

describe('RequestCard progress', () => {
  it('says Working and marks the Approve button busy on the card being decided only', () => {
    const html = card(add, { disabled: true, busy: true });
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('Working…');
    expect(html).not.toContain('>Approve<');
    expect(html).toContain('>Reject<'); // the other button keeps its label, just disabled
    expect(html.match(/disabled=""/g)).toHaveLength(2);
  });
  it('keeps a plain disabled Approve on a card that is not the one being decided', () => {
    const html = card(add, { disabled: true, busy: false });
    expect(html).toContain('>Approve<');
    expect(html).not.toContain('aria-busy');
    expect(html).not.toContain('Working…');
  });
  it('shows no progress on an idle card', () => {
    const html = card(add);
    expect(html).toContain('>Approve<');
    expect(html).not.toContain('aria-busy');
  });
});

describe('closesRejectForm', () => {
  it('closes the form on Escape, like Cancel', () => {
    expect(closesRejectForm('Escape', false)).toBe(true);
    expect(closesRejectForm('Escape', undefined)).toBe(true);
  });
  it('ignores other keys and ignores Escape while a decision is running', () => {
    expect(closesRejectForm('Enter', false)).toBe(false);
    expect(closesRejectForm('a', false)).toBe(false);
    expect(closesRejectForm('Escape', true)).toBe(false);
  });
});

// Focus and keys need a browser to run; this suite has none, so the wiring is read from the card's source.
describe('RequestCard Reject form keyboard wiring', () => {
  const source = readFileSync(new URL('./RequestCard.jsx', import.meta.url), 'utf8').replaceAll('\r\n', '\n');
  it('closes the form on Escape through the same function as Cancel', () => {
    expect(source).toContain('onKeyDown={event => { if (closesRejectForm(event.key, disabled)) { event.preventDefault(); cancelReject(); } }}');
    expect(source).toContain('onClick={cancelReject}>Cancel</Btn>');
  });
  it('hands focus back to the Reject button after the form has closed, only for Cancel and Escape', () => {
    expect(source).toContain('const cancelReject = () => { backToButtons.current = true; setRejecting(false); };');
    expect(source).toContain('if (!rejecting && backToButtons.current) { backToButtons.current = false; rejectButton.current?.focus(); }');
    expect(source).toContain('<Btn ref={rejectButton} variant="ghost"');
    expect(source.match(/backToButtons\.current = true/g)).toHaveLength(1);
  });
});

describe('rejectRequest', () => {
  it('passes the request and the reason on and gives back the answer', async () => {
    const seen = [];
    expect(await rejectRequest(async (...args) => { seen.push(args); return true; }, add, 'Wrong learner')).toBe(true);
    expect(seen).toEqual([[add, 'Wrong learner']]);
    expect(await rejectRequest(async () => false, add, 'x')).toBe(false);
  });
  it('keeps the form open instead of raising when the handler throws, rejects or returns nothing', async () => {
    expect(await rejectRequest(() => { throw new Error('boom'); }, add, 'x')).toBe(false);
    expect(await rejectRequest(async () => { throw new Error('boom'); }, add, 'x')).toBe(false);
    expect(await rejectRequest(() => undefined, add, 'x')).toBe(false);
    expect(await rejectRequest(undefined, add, 'x')).toBe(false);
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
  it('marks only the request being decided as busy', () => {
    const other = { ...remove, id: 'r2' };
    const html = renderToStaticMarkup(h(WaitingList, { requests: [add, remove, other], ended: false, pending: true, pendingId: 'r1', failures: {}, onApprove: noop, onReject: noop }));
    expect(html.match(/aria-busy="true"/g)).toHaveLength(1);
    expect(html.match(/Working…/g)).toHaveLength(1);
    expect(html.match(/>Approve</g)).toHaveLength(2);
    expect(html.match(/disabled=""/g)).toHaveLength(6); // every card is locked meanwhile
    expect(html.indexOf('Working…')).toBeGreaterThan(html.indexOf('ANA CRUZ'));
  });
  it('shows nobody as busy when no decision is running', () => {
    const html = renderToStaticMarkup(h(WaitingList, { requests: [add, remove], ended: false, pending: false, pendingId: '', failures: {}, onApprove: noop, onReject: noop }));
    expect(html).not.toContain('aria-busy');
  });
  it('disables every action once the school year has ended', () => {
    const html = renderToStaticMarkup(h(WaitingList, { requests: [add], ended: true, pending: false, failures: {}, onApprove: noop, onReject: noop }));
    expect(html.match(/disabled=""/g)).toHaveLength(2);
  });
});

describe('DecidedList', () => {
  const decided = (over) => ({ ...base, id: 'd1', kind: 'add', status: 'approved', displayName: 'Maria Santos', lrn: '123456789013', decidedAt: Date.UTC(2026, 9, 21, 20, 0), decidedByName: 'Ada Admin', decisionReason: 'Approved', ...over });
  it('shows the outcome, who decided, when, and the reason', () => {
    const html = renderToStaticMarkup(h(DecidedList, { decided: { requests: [decided({}), decided({ id: 'd2', status: 'rejected', kind: 'remove', displayName: 'Ben Dy', reasonCode: 'transferred_out', note: 'Moved', decisionReason: 'Wrong learner' })], nextCursor: null }, loading: false, onMore() {} }));
    expect(html).toContain('Approved by ADA ADMIN · Oct 22, 2026');
    expect(html).toContain('Not approved');
    expect(html).toContain('Remove BEN DY');
    expect(html).toContain('Reason: Wrong learner');
    expect(html).not.toContain('Load more');
  });
  it('shows the requester in capitals, or their email address as written', () => {
    const list = (over) => renderToStaticMarkup(h(DecidedList, { decided: { requests: [decided(over)], nextCursor: null }, loading: false, onMore() {} }));
    expect(list({})).toContain('requested by TINA TEACHER');
    expect(list({ requestedByName: 'teacher@deped.gov.ph', decidedByName: 'ada@deped.gov.ph' })).toContain('requested by teacher@deped.gov.ph');
    expect(list({ decidedByName: 'ada@deped.gov.ph' })).toContain('Approved by ada@deped.gov.ph · Oct 22, 2026');
  });
  it('hides the default reason of an approval but keeps one a person wrote', () => {
    const list = (over) => renderToStaticMarkup(h(DecidedList, { decided: { requests: [decided(over)], nextCursor: null }, loading: false, onMore() {} }));
    expect(list({})).not.toContain('Reason:');
    expect(list({ decisionReason: 'Checked with the adviser' })).toContain('Reason: Checked with the adviser');
    expect(list({ status: 'rejected', decisionReason: 'Approved' })).toContain('Reason: Approved');
    expect(list({ decisionReason: '' })).not.toContain('Reason:');
  });
  it('leaves out the LRN when there is none and does not dangle a separator without a time', () => {
    const list = (over) => renderToStaticMarkup(h(DecidedList, { decided: { requests: [decided(over)], nextCursor: null }, loading: false, onMore() {} }));
    expect(list({ lrn: '' })).not.toContain('LRN');
    const html = list({ decidedAt: null });
    expect(html).toContain('Approved by ADA ADMIN<');
    expect(html).not.toContain('Approved by ADA ADMIN ·');
  });
  it('wraps long names, reasons and notes', () => {
    const html = renderToStaticMarkup(h(DecidedList, { decided: { requests: [decided({ status: 'rejected', kind: 'remove', reasonCode: 'dropped_out', note: 'n', decisionReason: 'Wrong learner' })], nextCursor: null }, loading: false, onMore() {} }));
    expect(html.match(/overflow-wrap:anywhere/g).length).toBeGreaterThanOrEqual(3);
  });
  it('offers more when the server has another page, and says so when nothing is decided', () => {
    expect(renderToStaticMarkup(h(DecidedList, { decided: { requests: [decided({})], nextCursor: { ms: 1, id: 'x' } }, loading: false, onMore() {} }))).toContain('Load more');
    expect(renderToStaticMarkup(h(DecidedList, { decided: { requests: [], nextCursor: null }, loading: false, onMore() {} }))).toContain('Nothing decided yet');
    expect(renderToStaticMarkup(h(DecidedList, { decided: null, loading: true, onMore() {} }))).toContain('Loading decided requests');
  });
  it('shows nothing while there is no list and nothing is loading, since the page shows its own error', () => {
    expect(renderToStaticMarkup(h(DecidedList, { decided: null, loading: false, onMore() {} }))).toBe('');
  });
});
