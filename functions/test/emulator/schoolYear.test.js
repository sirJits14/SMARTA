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
    expect(r).toEqual({ codesRevoked: 2, advisorySlipsRevoked: 0, linksExpired: 3, accountsNotified: 2 });
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
  it('marks the year as ended so its slips can no longer be issued or redeemed', async () => {
    await endSchoolYear(staff(), { schoolYear: SY, confirmText: SY });
    const marker = (await db().doc(`school_years/${SY}`).get()).data();
    expect(marker).toMatchObject({ endedBy: 'registrar@bnhs.edu' });
    expect(marker.endedAt).toBeTruthy();
    expect((await db().doc('school_years/2027-2028').get()).exists).toBe(false);
  });
  it('is safe to run twice', async () => {
    await endSchoolYear(staff(), { schoolYear: SY, confirmText: SY });
    const r = await endSchoolYear(staff(), { schoolYear: SY, confirmText: SY });
    expect(r).toEqual({ codesRevoked: 0, advisorySlipsRevoked: 0, linksExpired: 0, accountsNotified: 0 });
    expect((await db().collection('guardians/gA/inbox').get()).size).toBe(1);
  });
  it('rejects a confirmation that does not match and a malformed school year', async () => {
    await expect(endSchoolYear(staff(), { schoolYear: SY, confirmText: '2026-2028' })).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(endSchoolYear(staff(), { schoolYear: '2026/2027', confirmText: '2026/2027' })).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(endSchoolYear(staff(), { schoolYear: '2026-2028', confirmText: '2026-2028' })).rejects.toMatchObject({ code: 'invalid-argument' });
    expect((await db().doc('activation_codes/c1').get()).data().status).toBe('issued');
    expect((await db().collection('school_years').get()).size).toBe(0);
  });
});

describe('endSchoolYear and learner requests', () => {
  const NEXT = '2027-2028';
  const student = (lrn) => ({ lrn, lastName: 'Reyes', firstName: 'Rita', sex: 'F', birthdate: '2012-01-01', guardianName: 'Rosa Reyes',
    guardianRelationship: 'Mother', address: '9 Mabini St.', guardianContact: '09171111111', contactNumber: '09182222222' });
  const request = (over) => ({ kind: 'add', status: 'pending', schoolYear: SY, sectionId: 'SEC1', gradeLevel: 7, sectionName: 'Rizal',
    requestedByUid: 'teacher', requestedByName: 'Tina Teacher', displayName: 'Rita Reyes', enrollType: 'new', student: student('400000000001'), ...over });
  const seeded = {
    pendingAdd: request({}),
    pendingRemoval: request({ kind: 'remove', studentId: 'S1', lrn: '100000000001', displayName: 'Ana B. Cruz', reasonCode: 'dropped_out',
      note: 'Stopped attending in September', student: undefined }),
    approvedAdd: request({ status: 'approved', decidedByName: 'Ada Admin', decisionReason: 'Approved', student: student('400000000002') }),
    otherYear: request({ schoolYear: NEXT, student: student('400000000003') }),
  };
  const CONTACT = ['address', 'guardianContact', 'contactNumber'];
  const requestDoc = async (id) => (await db().doc(`learner_change_requests/${id}`).get()).data();
  const endedAudits = async () => (await db().collection('audit_log').where('action', '==', 'schoolyear.ended').get()).docs;

  beforeEach(async () => {
    const b = db().batch();
    for (const [id, data] of Object.entries(seeded)) {
      b.set(db().doc(`learner_change_requests/${id}`), Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)));
    }
    await b.commit();
  });

  it('withdraws the year\'s pending requests, removes an add\'s address and phone numbers, and leaves the rest alone', async () => {
    const r = await endSchoolYear(staff(), { schoolYear: SY, confirmText: SY });
    expect(r).toEqual({ codesRevoked: 2, advisorySlipsRevoked: 0, linksExpired: 3, accountsNotified: 2 });

    const add = await requestDoc('pendingAdd');
    expect(add).toMatchObject({ status: 'withdrawn', decisionReason: 'School year ended' });
    expect(add.withdrawnAt).toBeTruthy();
    for (const field of CONTACT) expect(add.student).not.toHaveProperty(field);
    expect(add.student).toEqual({ lrn: '400000000001', lastName: 'Reyes', firstName: 'Rita', sex: 'F', birthdate: '2012-01-01',
      guardianName: 'Rosa Reyes', guardianRelationship: 'Mother' });
    expect(add).toMatchObject({ kind: 'add', schoolYear: SY, sectionId: 'SEC1', requestedByUid: 'teacher', displayName: 'Rita Reyes', enrollType: 'new' });

    const removal = await requestDoc('pendingRemoval');
    expect(removal).toMatchObject({ status: 'withdrawn', decisionReason: 'School year ended', kind: 'remove', studentId: 'S1', lrn: '100000000001',
      reasonCode: 'dropped_out', note: 'Stopped attending in September' });
    expect(removal.withdrawnAt).toBeTruthy();
    expect(removal).not.toHaveProperty('student');

    // A request somebody already decided is not this change's business, and neither is another year's.
    expect(await requestDoc('approvedAdd')).toEqual(seeded.approvedAdd);
    expect(await requestDoc('otherYear')).toEqual(seeded.otherYear);

    const [row, ...more] = await endedAudits();
    expect(more).toEqual([]);
    expect(row.data().details).toEqual({ codesRevoked: 2, advisorySlipsRevoked: 0, linksExpired: 3, accountsNotified: 2, learnerRequestsClosed: 2 });
  });
  it('closes nothing further when it is run again', async () => {
    await endSchoolYear(staff(), { schoolYear: SY, confirmText: SY });
    const [first] = await endedAudits();
    const closed = await requestDoc('pendingAdd');
    const r = await endSchoolYear(staff(), { schoolYear: SY, confirmText: SY });
    expect(r).toEqual({ codesRevoked: 0, advisorySlipsRevoked: 0, linksExpired: 0, accountsNotified: 0 });
    const second = (await endedAudits()).find((d) => d.id !== first.id);
    expect(second.data().details).toMatchObject({ learnerRequestsClosed: 0 });
    expect(await requestDoc('pendingAdd')).toEqual(closed);
    expect(await requestDoc('approvedAdd')).toEqual(seeded.approvedAdd);
  });
});
