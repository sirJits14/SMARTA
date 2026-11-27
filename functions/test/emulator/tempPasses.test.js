import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { db, auth, clearAll, clearAllAuthUsers, seedSchool } from './helpers.js';
import { issueTempPasses, revokeTempPass, reconcileTempPass } from '../../src/handlers/tempPasses.js';
import { issueTempPassFn, revokeTempPassFn, onStudentWritten, onEnrollmentWritten } from '../../index.js';
import { LIMITS } from '../../src/callable.js';
import { isTempPassCode } from '../../shared/tempPass.js';

// The triggers reach Storage through admin.js; no test may touch a real bucket.
const storage = vi.hoisted(() => ({ bucket: null }));
vi.mock('../../src/admin.js', async (original) => ({ ...(await original()), bucket: () => storage.bucket() }));

const year = '2026-2027';
const NOW = new Date('2026-11-27T08:00:00+08:00');
const PATH = 'student_photos/S1.jpg';
const staff = {
  admin: { uid: 'admin', email: 'admin@x.test', profile: { uid: 'admin', role: 'admin' } },
  jhs: { uid: 'jhs', email: 'jhs@x.test', profile: { uid: 'jhs', role: 'jhs_coord' } },
  shs: { uid: 'shs', email: 'shs@x.test', profile: { uid: 'shs', role: 'shs_coord' } },
  glc: { uid: 'glc', email: 'glc@x.test', profile: { uid: 'glc', role: 'glc', gradeLevel: 7 } },
};
const deps = who => ({ db: db(), now: () => NOW, ...staff[who] });
const issue = (studentIds = ['S1'], who = 'admin') => issueTempPasses(deps(who), { studentIds });
const revoke = (studentId = 'S1') => revokeTempPass(deps('admin'), { studentId });
const read = async path => (await db().doc(path).get()).data();
const pass = (id = 'S1') => read(`temp_passes/${id}`);
const audits = async () => (await db().collection('audit_log').where('targetType', '==', 'temp_pass').get()).docs.map(d => d.data());
const actions = async () => (await audits()).map(a => a.action).sort();
// A learner who may receive a pass: enrolled, active, with an LRN and a photo.
async function learner(id, sectionId = 'SEC1', over = {}) {
  await db().doc(`students/${id}`).set({ lrn: `lrn-${id}`, firstName: id, lastName: 'Test', photo: { path: `student_photos/${id}.jpg` }, ...over });
  await db().doc(`enrollments/${id}_${year}`).set({ studentId: id, sectionId, schoolYear: year, status: 'enrolled' });
}

beforeEach(async () => {
  storage.bucket = () => { throw new Error('unexpected Storage use'); };
  await clearAll(); await seedSchool();
  await Promise.all([
    db().doc('students/S1').update({ photo: { path: PATH } }),
    db().doc('sections/SEC8').set({ name: 'Luna', gradeLevel: 8, schoolYear: year }),
    db().doc('sections/SEC11').set({ name: 'Mabini', gradeLevel: 11, schoolYear: year }),
  ]);
});

describe('issuing temporary passes', () => {
  it('writes an active pass and one audit row', async () => {
    const result = await issue();
    const stored = await pass();
    expect(result).toEqual({ issued: [{ studentId: 'S1', code: stored.code }], skipped: [] });
    expect(isTempPassCode(stored.code)).toBe(true);
    expect(stored).toEqual({ code: stored.code, status: 'active', lrn: '100000000001', sectionId: 'SEC1', gradeLevel: 7,
      schoolYear: year, issuedBy: 'admin@x.test', issuedAt: expect.any(Timestamp) });
    expect(await audits()).toEqual([{ action: 'tempPass.issued', actorType: 'staff', actorUid: 'admin@x.test',
      targetType: 'temp_pass', targetId: 'S1', details: { sectionId: 'SEC1', gradeLevel: 7 }, at: expect.any(Timestamp) }]);
  });
  it('returns the same code again without a new audit row', async () => {
    const first = await issue();
    const before = await pass();
    expect(await issue(['S1', 'S1'])).toEqual(first);
    expect(await pass()).toEqual(before);
    expect(await actions()).toEqual(['tempPass.issued']);
  });
  it('keeps the code and moves the placement after a section change', async () => {
    const { issued } = await issue();
    await db().doc(`enrollments/S1_${year}`).update({ sectionId: 'SEC8' });
    expect((await issue()).issued).toEqual(issued);
    expect(await pass()).toMatchObject({ code: issued[0].code, status: 'active', sectionId: 'SEC8', gradeLevel: 8 });
    expect(await actions()).toEqual(['tempPass.issued']);
  });
  it('replaces the code when the stored pass no longer matches the learner', async () => {
    const old = (await issue()).issued[0].code;
    await db().doc('students/S1').update({ lrn: '100000000009' });
    const next = (await issue()).issued[0].code;
    expect(next).not.toBe(old);
    expect(await pass()).toMatchObject({ code: next, status: 'active', lrn: '100000000009' });
  });
  it('skips each ineligible learner with its reason and issues the rest', async () => {
    await Promise.all([
      learner('noPhoto', 'SEC1', { photo: null }),
      learner('printed', 'SEC1', { idCard: { printedAt: Timestamp.fromDate(NOW), lrn: 'lrn-printed' } }),
      learner('dropped', 'SEC1', { status: 'dropped' }),
    ]);
    const result = await issue(['NOPE', 'S2', 'noPhoto', 'printed', 'dropped', 'S1']);
    expect(result.skipped).toEqual([
      { studentId: 'NOPE', reason: 'not-found' }, { studentId: 'S2', reason: 'not-enrolled' },
      { studentId: 'noPhoto', reason: 'no-photo' }, { studentId: 'printed', reason: 'official-printed' },
      { studentId: 'dropped', reason: 'inactive' },
    ]);
    expect(result.issued.map(r => r.studentId)).toEqual(['S1']);
    expect((await db().collection('temp_passes').get()).docs.map(d => d.id)).toEqual(['S1']);
  });
  it('limits coordinators to their grades without describing other learners', async () => {
    // No photo, so a leak of the learner's own blocker would show here.
    await learner('senior', 'SEC11', { photo: null });
    expect(await issue(['senior', 'S1'], 'jhs')).toMatchObject({
      issued: [{ studentId: 'S1' }], skipped: [{ studentId: 'senior', reason: 'out-of-scope' }] });
    expect((await issue(['S1'], 'shs')).skipped).toEqual([{ studentId: 'S1', reason: 'out-of-scope' }]);
    expect(await pass('senior')).toBeUndefined();
  });
  it('refuses grade level coordinators, bad input and an ended year', async () => {
    await expect(issue(['S1'], 'glc')).rejects.toMatchObject({ code: 'permission-denied' });
    for (const studentIds of [undefined, 'S1', [], Array.from({ length: 201 }, (_, i) => `L${i}`), ['S1', 'a/b'], ['S1', 7], ['']]) {
      await expect(issueTempPasses(deps('admin'), { studentIds })).rejects.toMatchObject({ code: 'invalid-argument' });
    }
    await db().doc(`school_years/${year}`).set({ endedAt: Timestamp.fromDate(NOW) });
    await expect(issue()).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(await pass()).toBeUndefined();
  });
  it('rate limits print batches per account', async () => {
    await db().doc('rate_limits/admin').set({ tempPass: { windowStartMs: NOW.getTime(), count: LIMITS.tempPass.max } });
    await expect(issue()).rejects.toMatchObject({ code: 'resource-exhausted' });
    expect(await pass()).toBeUndefined();
  });
});

describe('revoking temporary passes', () => {
  it('revokes once, then a new issue gets a different clean pass', async () => {
    const old = (await issue()).issued[0].code;
    expect(await revoke()).toEqual({ revoked: 1 });
    expect(await pass()).toMatchObject({ code: old, status: 'revoked', endedReason: 'revoked', endedBy: 'admin@x.test', endedAt: expect.any(Timestamp) });
    expect(await revoke()).toEqual({ revoked: 0 });
    expect(await actions()).toEqual(['tempPass.issued', 'tempPass.revoked']);
    const next = (await issue()).issued[0].code;
    expect(next).not.toBe(old);
    const stored = await pass();
    expect(stored).toMatchObject({ code: next, status: 'active' });
    expect(Object.keys(stored).filter(key => key.startsWith('ended'))).toEqual([]);
  });
  it('does nothing for a learner without a pass and rejects a malformed id', async () => {
    expect(await revoke('S2')).toEqual({ revoked: 0 });
    await expect(revoke('a/b')).rejects.toMatchObject({ code: 'invalid-argument' });
    expect(await audits()).toEqual([]);
  });
});

describe('reconciling a pass with current records', () => {
  let code;
  beforeEach(async () => { code = (await issue()).issued[0].code; });
  const student = () => db().doc('students/S1');
  const enrollment = () => db().doc(`enrollments/S1_${year}`);

  it.each([
    ['learner record is deleted', () => student().delete(), 'revoked', 'learner_removed'],
    ['official card is printed', () => student().update({ idCard: { printedAt: Timestamp.fromDate(NOW), lrn: '100000000001' } }), 'superseded', 'official_id_printed'],
    ['LRN changes', () => student().update({ lrn: '100000000009' }), 'superseded', 'lrn_changed'],
    ['student is no longer active', () => student().update({ status: 'transferred' }), 'revoked', 'learner_inactive'],
    ['enrollment is dropped', () => enrollment().update({ status: 'dropped' }), 'revoked', 'enrollment_ended'],
    ['enrollment is deleted', () => enrollment().delete(), 'revoked', 'enrollment_ended'],
  ])('ends the pass once when the %s', async (_, change, status, endedReason) => {
    await change();
    expect(await reconcileTempPass(db(), 'S1')).toBe(status);
    const ended = await pass();
    expect(ended).toMatchObject({ code, status, endedReason, endedBy: 'system', endedAt: expect.any(Timestamp) });
    expect(await reconcileTempPass(db(), 'S1')).toBe('none');
    expect(await pass()).toEqual(ended);
    expect((await audits()).filter(a => a.action !== 'tempPass.issued')).toEqual([{ action: `tempPass.${status}`, actorType: 'system',
      actorUid: 'system', targetType: 'temp_pass', targetId: 'S1', details: { reason: endedReason }, at: expect.any(Timestamp) }]);
  });
  it('keeps the pass active and updates the placement after a section change', async () => {
    await enrollment().update({ sectionId: 'SEC8' });
    expect(await reconcileTempPass(db(), 'S1')).toBe('moved');
    expect(await pass()).toMatchObject({ code, status: 'active', sectionId: 'SEC8', gradeLevel: 8 });
    expect(await reconcileTempPass(db(), 'S1')).toBe('kept');
    expect(await actions()).toEqual(['tempPass.issued']);
  });
  it('keeps the old placement while the new section cannot be read', async () => {
    await enrollment().update({ sectionId: 'GONE' });
    expect(await reconcileTempPass(db(), 'S1')).toBe('kept');
    expect(await pass()).toMatchObject({ status: 'active', sectionId: 'SEC1', gradeLevel: 7 });
  });
  it('keeps the pass after an unrelated edit or a card printed for an earlier LRN', async () => {
    const before = await pass();
    await student().update({ firstName: 'Anna', idCard: { printedAt: Timestamp.fromDate(NOW), lrn: 'old-lrn' } });
    expect(await reconcileTempPass(db(), 'S1')).toBe('kept');
    expect(await pass()).toEqual(before);
  });
  it('leaves a missing or already ended pass alone', async () => {
    expect(await reconcileTempPass(db(), 'S2')).toBe('none');
    expect(await pass('S2')).toBeUndefined();
    await revoke();
    const ended = await pass();
    await student().delete();
    expect(await reconcileTempPass(db(), 'S1')).toBe('none');
    expect(await pass()).toEqual(ended);
  });
});

const snapshot = data => ({ exists: data !== undefined, data: () => data });
const written = (params, before, after) => ({ params, data: { before: snapshot(before), after: snapshot(after) } });

describe('record triggers', () => {
  let deleted;
  const original = { lrn: '100000000001', photo: { path: PATH } };
  const useBucket = () => { storage.bucket = () => ({ file: path => ({ delete: async options => { deleted.push([path, options]); } }) }); };
  beforeEach(async () => { deleted = []; await issue(); });

  it('ends the pass and deletes the photo of a deleted learner, safely repeated', async () => {
    useBucket();
    await db().doc('students/S1').delete();
    const event = written({ studentId: 'S1' }, original, undefined);
    await onStudentWritten.run(event);
    await onStudentWritten.run(event);
    expect(await pass()).toMatchObject({ status: 'revoked', endedReason: 'learner_removed' });
    expect(deleted).toEqual([[PATH, { ignoreNotFound: true }], [PATH, { ignoreNotFound: true }]]);
    expect(await actions()).toEqual(['tempPass.issued', 'tempPass.revoked']);
  });
  it('ends the pass even when Storage fails, and fails so the delete is retried', async () => {
    storage.bucket = () => { throw new Error('storage down'); };
    await db().doc('students/S1').delete();
    await expect(onStudentWritten.run(written({ studentId: 'S1' }, original, undefined))).rejects.toThrow('storage down');
    expect(await pass()).toMatchObject({ status: 'revoked', endedReason: 'learner_removed' });
  });
  it('leaves Storage alone for an edit or a learner without a photo', async () => {
    await onStudentWritten.run(written({ studentId: 'S1' }, original, { ...original, firstName: 'Anna' }));
    await onStudentWritten.run(written({ studentId: 'S2' }, { lrn: '100000000002' }, undefined));
    expect(await pass()).toMatchObject({ status: 'active' });
  });
  it('reconciles after an enrollment is deleted', async () => {
    const ref = db().doc(`enrollments/S1_${year}`);
    const before = (await ref.get()).data();
    await ref.delete();
    await onEnrollmentWritten.run(written({ id: `S1_${year}` }, before, undefined));
    expect(await pass()).toMatchObject({ status: 'revoked', endedReason: 'enrollment_ended' });
  });
  it('ignores an enrollment without a usable student id', async () => {
    for (const studentId of [undefined, 7, 'a/b']) {
      await onEnrollmentWritten.run(written({ id: 'broken' }, undefined, { studentId }));
    }
    expect(await pass()).toMatchObject({ status: 'active' });
  });
});

describe('temporary pass callables', () => {
  const request = (who, data) => ({ app: { appId: 'local-test' }, auth: { uid: who, token: {
    email: staff[who].email, auth_time: Math.floor(Date.now() / 1000) + 5, firebase: { sign_in_provider: 'password' },
  } }, data });
  beforeEach(async () => {
    await clearAllAuthUsers();
    for (const who of ['admin', 'jhs']) {
      await auth().createUser({ uid: who, email: staff[who].email, password: 'local-test-password' });
      await db().doc(`users/${staff[who].email}`).set(staff[who].profile);
    }
  });
  it('lets a coordinator issue but only an administrator revoke', async () => {
    await expect(issueTempPassFn.run(request('jhs', { studentIds: ['S1'] }))).resolves.toMatchObject({ issued: [{ studentId: 'S1' }] });
    await expect(revokeTempPassFn.run(request('jhs', { studentId: 'S1' }))).rejects.toMatchObject({ code: 'permission-denied' });
    expect(await pass()).toMatchObject({ status: 'active', issuedBy: 'jhs@x.test' });
    await expect(revokeTempPassFn.run(request('admin', { studentId: 'S1' }))).resolves.toEqual({ revoked: 1 });
  });
});
