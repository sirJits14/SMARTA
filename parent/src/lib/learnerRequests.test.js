import { describe, expect, it } from 'vitest';
import S from '../strings.js';
import {
  ENROLL_OPTIONS, REASON_OPTIONS, STATUS_LABEL, addPayload, checkLearnerForm, checkRemoval, emptyLearnerForm, pendingRemovalIds, pendingRequests,
  prefillFrom, removalFor, removalPayload, requestDetail, requestTitle,
} from './learnerRequests.js';

const filled = () => ({ ...emptyLearnerForm(), lrn: '123456789012', lastName: 'Dela Cruz', firstName: 'Juan', sex: 'M', birthdate: '2012-05-01', address: '123 Rizal St.' });

describe('checkLearnerForm', () => {
  it('starts empty with the enrollment type set to new', () => {
    expect(emptyLearnerForm()).toMatchObject({ lrn: '', enrollType: 'new', address: '' });
    const result = checkLearnerForm(emptyLearnerForm(), '2026-10-22');
    expect(result.ok).toBe(false);
    expect(Object.keys(result.errors).sort()).toEqual(['birthdate', 'firstName', 'lastName', 'lrn', 'sex']);
  });
  it('accepts a complete form and checks the enrollment type', () => {
    expect(checkLearnerForm(filled(), '2026-10-22')).toEqual({ ok: true, errors: {} });
    expect(checkLearnerForm({ ...filled(), enrollType: 'visitor' }, '2026-10-22').errors.enrollType).toBe('Enrollment type must be new, returning, or transferee.');
  });
  it('rejects a birthdate after today', () => {
    expect(checkLearnerForm({ ...filled(), birthdate: '2026-10-23' }, '2026-10-22').errors.birthdate).toBe('Birthdate cannot be in the future.');
  });
});

describe('payloads', () => {
  it('splits the enrollment type from the learner details', () => {
    expect(addPayload('SEC1', { ...filled(), enrollType: 'returning' })).toEqual({
      sectionId: 'SEC1', enrollType: 'returning', student: expect.objectContaining({ lrn: '123456789012', lastName: 'Dela Cruz' }) });
    expect(addPayload('SEC1', filled()).student).not.toHaveProperty('enrollType');
    expect(removalPayload('SEC1', 'S1', { reasonCode: 'dropped_out', note: 'Stopped coming' })).toEqual({ sectionId: 'SEC1', studentId: 'S1', reasonCode: 'dropped_out', note: 'Stopped coming' });
  });
  it('checks a removal the way the server does', () => {
    expect(checkRemoval({ reasonCode: '', note: '' }).errors).toEqual({ reasonCode: 'Choose a reason.', note: 'Add a short note.' });
    expect(checkRemoval({ reasonCode: 'dropped_out', note: 'Moved away' }).ok).toBe(true);
  });
  it('offers the three reasons and the three enrollment types', () => {
    expect(REASON_OPTIONS.map((o) => o.label)).toEqual(['Transferred out', 'Dropped out', 'Moved to another section']);
    expect(ENROLL_OPTIONS.map((o) => o.label)).toEqual(['New', 'Returning', 'Transferee']);
  });
  it('fills "Send again" from a not-approved add without the cleared contact details', () => {
    const request = { kind: 'add', status: 'rejected', enrollType: 'transferee', student: { lrn: '123456789012', lastName: 'Dela Cruz', firstName: 'Juan', sex: 'M', birthdate: '2012-05-01', guardianName: 'Maria' } };
    expect(prefillFrom(request)).toMatchObject({ lrn: '123456789012', guardianName: 'Maria', enrollType: 'transferee', address: '', contactNumber: '', guardianContact: '' });
  });
});

describe('request lists', () => {
  const requests = [
    { id: 'a', kind: 'remove', status: 'pending', studentId: 'S1', displayName: 'ANA CRUZ', reasonCode: 'dropped_out', note: 'Stopped coming' },
    { id: 'b', kind: 'remove', status: 'approved', studentId: 'S2', displayName: 'Ben Dy', reasonCode: 'transferred_out', note: 'Moved' },
    { id: 'c', kind: 'add', status: 'pending', displayName: 'Juan Dela Cruz', lrn: '123456789012' },
  ];
  it('counts what is waiting and finds pending removals by learner', () => {
    expect(pendingRequests(requests).map((r) => r.id)).toEqual(['a', 'c']);
    expect(pendingRequests(null)).toEqual([]);
    expect([...pendingRemovalIds(requests)]).toEqual(['S1']);
    expect(removalFor(requests, 'S1').id).toBe('a');
    expect(removalFor(requests, 'S2')).toBeNull();
  });
  it('titles and describes each kind in plain words', () => {
    expect(requestTitle(requests[0])).toBe('Remove Ana Cruz');
    expect(requestTitle(requests[2])).toBe('Add Juan Dela Cruz');
    expect(requestDetail(requests[0])).toBe('Dropped out · Stopped coming');
    expect(requestDetail(requests[2])).toBe('LRN 123456789012');
  });
  it('labels each status', () => {
    expect(STATUS_LABEL).toEqual({ pending: S.learnerStatusPending, approved: S.learnerStatusApproved, rejected: S.learnerStatusRejected, withdrawn: S.learnerStatusWithdrawn });
    expect(S.learnerStatusPending).toBe('Waiting for approval');
    expect(S.learnerStatusRejected).toBe('Not approved');
  });
});
