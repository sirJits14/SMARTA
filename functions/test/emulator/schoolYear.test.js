import { describe, it, expect, beforeEach } from 'vitest';
import { db, clearAll, seedSchool } from './helpers.js';
import { endSchoolYear } from '../../src/handlers/schoolYear.js';

const staff = () => ({ db: db(), now: () => new Date('2027-04-10T08:00:00+08:00'), uid: 'staff1', email: 'registrar@bnhs.edu' });
const SY = '2026-2027';

beforeEach(async () => {
  await clearAll(); await seedSchool();
  const b = db().batch();
  b.set(db().doc('activation_codes/c1'), { studentId: 'S1', schoolYear: SY, status: 'issued' });
  b.set(db().doc('activation_codes/c2'), { studentId: 'S2', schoolYear: SY, status: 'exhausted' });
  b.set(db().doc('activation_codes/c3'), { studentId: 'S2', schoolYear: SY, status: 'revoked', revokedReason: 'reissued' });
  b.set(db().doc('activation_codes/cNext'), { studentId: 'S1', schoolYear: '2027-2028', status: 'issued' });
  // gA is linked to two learners: still one inbox message.
  b.set(db().doc('guardian_links/gA_S2'), { guardianUid: 'gA', studentId: 'S2', status: 'active', schoolYear: SY, relationship: 'Mother' });
  b.set(db().doc('guardian_links/gA_S9'), { guardianUid: 'gA', studentId: 'S9', status: 'active', schoolYear: '2027-2028', relationship: 'Mother' });
  await b.commit();
});

describe('endSchoolYear', () => {
  it('revokes the year\'s slips, expires its links, notifies each account once, audits', async () => {
    const r = await endSchoolYear(staff(), { schoolYear: SY, confirmText: ` ${SY} ` });
    expect(r).toEqual({ codesRevoked: 2, linksExpired: 3, accountsNotified: 2 });
    for (const id of ['c1', 'c2']) expect((await db().doc(`activation_codes/${id}`).get()).data()).toMatchObject({ status: 'revoked', revokedReason: 'school-year-ended', revokedBy: 'registrar@bnhs.edu' });
    expect((await db().doc('activation_codes/c3').get()).data().revokedReason).toBe('reissued');
    expect((await db().doc('activation_codes/cNext').get()).data().status).toBe('issued');
    for (const id of ['gA_S1', 'gB_S1', 'gA_S2']) expect((await db().doc(`guardian_links/${id}`).get()).data()).toMatchObject({ status: 'expired', expiredReason: 'school-year-ended' });
    expect((await db().doc('guardian_links/gA_S9').get()).data().status).toBe('active');
    expect((await db().doc('guardian_links/gC_S1').get()).data().status).toBe('revoked');
    const inboxA = await db().collection('guardians/gA/inbox').get();
    expect(inboxA.size).toBe(1);
    expect(inboxA.docs[0].id).toBe(`sy-ended-${SY}`);
    expect(inboxA.docs[0].data()).toMatchObject({ type: 'system', title: `SY ${SY} has ended`, pushStatus: 'skipped_suppressed' });
    expect((await db().collection('guardians/gB/inbox').get()).size).toBe(1);
    const audit = await db().collection('audit_log').where('action', '==', 'schoolyear.ended').get();
    expect(audit.docs[0].data()).toMatchObject({ targetId: SY, details: { codesRevoked: 2, linksExpired: 3, accountsNotified: 2 } });
  });
  it('is safe to run twice', async () => {
    await endSchoolYear(staff(), { schoolYear: SY, confirmText: SY });
    const r = await endSchoolYear(staff(), { schoolYear: SY, confirmText: SY });
    expect(r).toEqual({ codesRevoked: 0, linksExpired: 0, accountsNotified: 0 });
    expect((await db().collection('guardians/gA/inbox').get()).size).toBe(1);
  });
  it('rejects a confirmation that does not match and a malformed school year', async () => {
    await expect(endSchoolYear(staff(), { schoolYear: SY, confirmText: '2026-2028' })).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(endSchoolYear(staff(), { schoolYear: '2026/2027', confirmText: '2026/2027' })).rejects.toMatchObject({ code: 'invalid-argument' });
    expect((await db().doc('activation_codes/c1').get()).data().status).toBe('issued');
  });
});
