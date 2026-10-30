import { beforeEach, describe, expect, it } from 'vitest';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { db, clearAll } from './helpers.js';
import { backfillApprovedCards } from '../../src/lib/approvedCardBackfill.js';

const year = '2026-2027';
const decidedAt = Timestamp.fromMillis(Date.UTC(2026, 9, 29, 1));
const get = async (path) => (await db().doc(path).get()).data();

// One approved add: the audit row, its request, the learner and their enrollment.
async function approved(studentId, { mode = 'new', status = 'enrolled', idCard, student = true } = {}) {
  const d = db();
  await d.doc(`audit_log/A-${studentId}`).set({
    action: 'learner.addApproved', actorType: 'staff', actorUid: 'admin@school.test', targetType: 'learner_request', targetId: `R-${studentId}`,
    details: { lrn: `LRN-${studentId}`, name: studentId, mode, studentId, sectionId: 'SEC1', gradeLevel: 7, previousSectionId: null, previousStatus: null },
    at: decidedAt,
  });
  await d.doc(`learner_change_requests/R-${studentId}`).set({ kind: 'add', status: 'approved', schoolYear: year, decidedByName: 'Ada Admin', decidedAt });
  if (student) await d.doc(`students/${studentId}`).set({ lrn: `LRN-${studentId}`, lastName: studentId, firstName: 'A', ...(idCard ? { idCard } : {}) });
  await d.doc(`enrollments/${studentId}_${year}`).set({ studentId, schoolYear: year, sectionId: 'SEC1', gradeLevel: 7, status });
}

beforeEach(async () => { await clearAll(); });

describe('backfillApprovedCards', () => {
  it('reports in a dry run and writes nothing', async () => {
    await approved('S1');
    expect(await backfillApprovedCards(db())).toEqual({ added: ['S1'], skipped: [] });
    expect(await get('id_card_approved/S1')).toBeUndefined();
  });

  it('logs an unprinted, still-enrolled new learner with the approver and time', async () => {
    await approved('S1');
    await backfillApprovedCards(db(), { apply: true });
    expect(await get('id_card_approved/S1')).toEqual({ approvedAt: decidedAt, approvedByName: 'Ada Admin', requestId: 'R-S1', schoolYear: year });
  });

  it('skips moves, printed cards, dropped or missing learners, and anyone already logged or batched', async () => {
    await approved('MOVED', { mode: 'moved' });
    await approved('PRINTED', { idCard: { printedAt: decidedAt, printedBy: 'a@b', lrn: 'LRN-PRINTED' } });
    await approved('DROPPED', { status: 'dropped' });
    await approved('GONE', { student: false });
    await approved('LOGGED');
    await db().doc('id_card_approved/LOGGED').set({ approvedAt: decidedAt, approvedByName: 'X', requestId: 'R-LOGGED', schoolYear: year });
    await approved('BATCHED');
    await db().doc('id_card_batch/BATCHED').set({ addedAt: decidedAt, addedBy: 'a@b' });
    await approved('REPRINT', { idCard: { printedAt: decidedAt, printedBy: 'a@b', lrn: 'OLD-LRN' } });

    const result = await backfillApprovedCards(db(), { apply: true });
    expect(result.added).toEqual(['REPRINT']);
    expect(Object.fromEntries(result.skipped.map((s) => [s.studentId, s.reason]))).toEqual({
      PRINTED: 'Card already printed.', DROPPED: 'No longer enrolled.', GONE: 'Learner record not found.',
      LOGGED: 'Already logged.', BATCHED: 'Already in the saved batch.',
    });
    expect((await db().collection('id_card_approved').get()).docs.map((d) => d.id).sort()).toEqual(['LOGGED', 'REPRINT']);
  });

  it('skips an audit row whose request no longer exists', async () => {
    await approved('S1');
    await db().doc('learner_change_requests/R-S1').delete();
    expect(await backfillApprovedCards(db(), { apply: true })).toEqual({ added: [], skipped: [{ studentId: 'S1', reason: 'Request not found.' }] });
    expect(await get('id_card_approved/S1')).toBeUndefined();
  });

  it('still logs a learner when neither the audit row nor the request has a time', async () => {
    await approved('S1');
    await db().doc('audit_log/A-S1').update({ at: FieldValue.delete() });
    await db().doc('learner_change_requests/R-S1').update({ decidedAt: FieldValue.delete() });
    expect(await backfillApprovedCards(db(), { apply: true })).toEqual({ added: ['S1'], skipped: [] });
    const entry = await get('id_card_approved/S1');
    expect(entry.approvedAt).toBeInstanceOf(Timestamp);
    expect(entry.requestId).toBe('R-S1');
  });

  it('adds nothing the second time', async () => {
    await approved('S1');
    await backfillApprovedCards(db(), { apply: true });
    expect(await backfillApprovedCards(db(), { apply: true })).toEqual({ added: [], skipped: [{ studentId: 'S1', reason: 'Already logged.' }] });
  });
});
