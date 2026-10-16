import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db, clearAll, seedSchool, ts } from './helpers.js';
import { issueSlipBatch } from '../../src/handlers/codes.js';
import { endSchoolYear } from '../../src/handlers/schoolYear.js';
import { hashCode } from '../../src/lib/activationCode.js';
import { LIMITS } from '../../src/callable.js';

vi.mock('../../src/log.js', () => ({ logEvent: vi.fn(), logWarn: vi.fn() }));
const auditControl = vi.hoisted(() => ({ fail: false }));
vi.mock('../../src/audit.js', async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, audit: (...args) => (auditControl.fail ? Promise.reject(new Error('audit unavailable')) : real.audit(...args)) };
});

const NOW = new Date('2026-09-21T08:00:00+08:00');
const SY = '2026-2027';
const staff = () => ({ db: db(), now: () => NOW, uid: 'staff1', email: 'registrar@bnhs.edu' });
const issue = () => issueSlipBatch(staff(), { schoolYear: SY });
let order = 0;
const batch = (studentId, reason = 'Lost slip') => db().doc(`slip_batch/${studentId}`)
  .set({ addedAt: ts(NOW.getTime() + (order++) * 1000), addedBy: 'registrar@bnhs.edu', reason });
const enroll = (studentId, sectionId, status = 'enrolled') => db().doc(`enrollments/${studentId}_${SY}`)
  .set({ studentId, sectionId, schoolYear: SY, status });
const batchIds = async () => (await db().collection('slip_batch').get()).docs.map((d) => d.id).sort();
const codeFor = async (code) => (await db().doc(`activation_codes/${hashCode(code)}`).get()).data();
const seedLink = (uid, studentId, slot) => db().doc(`guardian_links/${uid}_${studentId}`).set({
  guardianUid: uid, studentId, status: 'active', schoolYear: SY, relationship: slot === 'adviser' ? 'Adviser' : 'Mother', slot,
});

beforeEach(async () => {
  order = 0;
  auditControl.fail = false;
  await clearAll(); await seedSchool();
  await db().doc('users/registrar@bnhs.edu').set({ role: 'registrar' });
  // seedSchool() links two guardians to S1; these tests link guardians themselves.
  await db().doc('guardian_links/gA_S1').delete();
  await db().doc('guardian_links/gB_S1').delete();
  await enroll('S2', 'SEC1');
  await db().doc('sections/SEC2').set({ name: 'Bonifacio', gradeLevel: 8, schoolYear: SY });
  await db().doc('students/S3').set({ lrn: '100000000003', firstName: 'Carla', lastName: 'Abad', sex: 'F' });
  await enroll('S3', 'SEC2');
});

describe('issueSlipBatch', () => {
  it('issues a slip per batched learner across sections, in print order, and empties the batch', async () => {
    await batch('S3'); await batch('S1'); await batch('S2');
    const r = await issue();
    // Grade 7 Rizal: Dy (M) before Cruz (F); then Grade 8.
    expect(r.slips.map((s) => s.studentId)).toEqual(['S2', 'S1', 'S3']);
    expect(r.slips[2]).toMatchObject({ name: 'Abad, Carla', lrn: '100000000003', sectionLabel: 'Grade 8 – Bonifacio', schoolYear: SY });
    expect(r).toMatchObject({ skipped: [], remaining: 0 });
    expect(await batchIds()).toEqual([]);
    for (const s of r.slips) expect(await codeFor(s.code)).toMatchObject({ studentId: s.studentId, schoolYear: SY, status: 'issued', issuedBy: 'registrar@bnhs.edu' });
  });

  it('revokes a batched learner\'s previous open code with the batch reason', async () => {
    await db().doc('activation_codes/old').set({ studentId: 'S1', schoolYear: SY, status: 'issued', guardianRedemptions: 0, maxGuardians: 2, adviserRedemptions: 0, maxAdvisers: 1 });
    await batch('S1', 'Damaged slip');
    await issue();
    expect((await db().doc('activation_codes/old').get()).data()).toMatchObject({ status: 'revoked', revokedReason: 'Damaged slip', revokedBy: 'registrar@bnhs.edu' });
  });

  it('pre-fills slots from active links, and skips a fully linked learner who stays in the batch', async () => {
    await seedLink('gA', 'S1', 'guardian');
    await seedLink('gA', 'S2', 'guardian'); await seedLink('gB', 'S2', 'guardian'); await seedLink('tAdv', 'S2', 'adviser');
    await db().doc('activation_codes/s2old').set({ studentId: 'S2', schoolYear: SY, status: 'exhausted', guardianRedemptions: 2, maxGuardians: 2, adviserRedemptions: 1, maxAdvisers: 1 });
    await batch('S1'); await batch('S2');
    const r = await issue();
    expect(r.skipped).toEqual([{ studentId: 'S2', reason: 'fully-linked' }]);
    expect(await codeFor(r.slips[0].code)).toMatchObject({ guardianRedemptions: 1, adviserRedemptions: 0 });
    expect((await db().doc('activation_codes/s2old').get()).data().status).toBe('exhausted');
    expect(await batchIds()).toEqual(['S2']);
  });

  it('skips restricted, not-enrolled and missing learners, who stay in the batch', async () => {
    await db().doc('students/S2').set({ activationRestricted: true }, { merge: true });
    await enroll('S3', 'SEC2', 'transferred_out');
    await batch('S2'); await batch('S3'); await batch('S9');
    const r = await issue();
    expect(r.slips).toEqual([]);
    expect(r.skipped).toEqual([
      { studentId: 'S2', reason: 'restricted' },
      { studentId: 'S3', reason: 'not-enrolled' },
      { studentId: 'S9', reason: 'missing' },
    ]);
    expect(await batchIds()).toEqual(['S2', 'S3', 'S9']);
  });

  it('issues at most 64 per press, oldest first, and leaves the rest', async () => {
    const ids = Array.from({ length: 70 }, (_, i) => `L${String(i).padStart(3, '0')}`);
    const w = db().batch();
    ids.forEach((id, i) => {
      w.set(db().doc(`students/${id}`), { lrn: `2000000${String(i).padStart(5, '0')}`, firstName: 'F', lastName: id, sex: 'M' });
      w.set(db().doc(`enrollments/${id}_${SY}`), { studentId: id, sectionId: 'SEC1', schoolYear: SY, status: 'enrolled' });
      w.set(db().doc(`slip_batch/${id}`), { addedAt: ts(NOW.getTime() + i * 1000), addedBy: 'registrar@bnhs.edu', reason: 'Lost slip' });
    });
    await w.commit();
    const r = await issue();
    expect(r.slips).toHaveLength(64);
    expect(r.remaining).toBe(6);
    expect(await batchIds()).toEqual(ids.slice(64));
  }, 120_000);

  it('refuses a school year that has ended and keeps the batch', async () => {
    await endSchoolYear(staff(), { schoolYear: SY, confirmText: SY });
    await batch('S1');
    await expect(issue()).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(await batchIds()).toEqual(['S1']);
  });

  it('has its own daily limit, separate from section-wide issuing and single reissues', async () => {
    await db().doc('rate_limits/staff1').set({
      issueCodes: { count: LIMITS.issueCodes.max, windowStartMs: NOW.getTime() - 3600_000 },
      reissueCode: { count: LIMITS.reissueCode.max, windowStartMs: NOW.getTime() - 3600_000 },
    });
    await batch('S1');
    await expect(issue()).resolves.toMatchObject({ remaining: 0 });
    await db().doc('rate_limits/staff1').set({ issueSlipBatch: { count: LIMITS.issueSlipBatch.max, windowStartMs: NOW.getTime() - 3600_000 } }, { merge: true });
    await expect(issue()).rejects.toMatchObject({
      code: 'resource-exhausted',
      message: 'Slip batches were issued 100 times in the last 24 hours, the daily limit. You can issue more after Sep 22, 7:00 AM.',
    });
  });

  it('writes one code.reissued audit entry per issued learner, without the code', async () => {
    await batch('S1', 'New enrollee / transferee'); await batch('S2', 'Lost slip');
    const r = await issue();
    const rows = (await db().collection('audit_log').where('action', '==', 'code.reissued').get()).docs.map((d) => d.data());
    expect(rows).toHaveLength(2);
    expect(rows.find((x) => x.targetId === 'S1')).toMatchObject({
      actorType: 'staff', actorUid: 'registrar@bnhs.edu', targetType: 'student',
      details: { schoolYear: SY, reason: 'New enrollee / transferee', via: 'batch', guardianSlotsFree: 2, adviserSlotsFree: 1 },
    });
    for (const s of r.slips) expect(JSON.stringify(rows)).not.toContain(s.code);
  });

  it('keeps every learner in the batch when the audit write fails', async () => {
    await batch('S1'); await batch('S2');
    auditControl.fail = true;
    await expect(issue()).rejects.toThrow('audit unavailable');
    expect(await batchIds()).toEqual(['S1', 'S2']);
  });
});
