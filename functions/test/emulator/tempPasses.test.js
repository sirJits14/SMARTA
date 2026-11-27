import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { db, auth, clearAll, clearAllAuthUsers, seedSchool } from './helpers.js';
import { issueTempPasses, issueInTransaction, revokeTempPass, reconcileTempPass } from '../../src/handlers/tempPasses.js';
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
  glc7: { uid: 'glc7', email: 'glc7@x.test', profile: { uid: 'glc7', role: 'glc', gradeLevel: 7 } },
  logistic: { uid: 'log', email: 'log@x.test', profile: { uid: 'log', role: 'logistic' } },
};
const DENIED = 'Temporary passes are for administrators, grade level coordinators and logistic operators.';
const deps = who => ({ db: db(), now: () => NOW, ...staff[who] });
const issue = (studentIds = ['S1'], who = 'admin') => issueTempPasses(deps(who), { studentIds });
const revoke = (studentId = 'S1') => revokeTempPass(deps('admin'), { studentId });
const read = async path => (await db().doc(path).get()).data();
const pass = (id = 'S1') => read(`temp_passes/${id}`);
const audits = async () => (await db().collection('audit_log').where('targetType', '==', 'temp_pass').get()).docs.map(d => d.data());
const actions = async () => (await audits()).map(a => a.action).sort();
// A learner who may receive a pass: enrolled, active, with an LRN. A photo is optional.
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
      learner('noLrn', 'SEC1', { lrn: ' ' }),
      learner('printed', 'SEC1', { idCard: { printedAt: Timestamp.fromDate(NOW), lrn: 'lrn-printed' } }),
      learner('dropped', 'SEC1', { status: 'dropped' }),
    ]);
    const result = await issue(['NOPE', 'S2', 'noLrn', 'printed', 'dropped', 'S1']);
    expect(result.skipped).toEqual([
      { studentId: 'NOPE', reason: 'not-found' }, { studentId: 'S2', reason: 'not-enrolled' },
      { studentId: 'noLrn', reason: 'no-lrn' }, { studentId: 'printed', reason: 'official-printed' },
      { studentId: 'dropped', reason: 'inactive' },
    ]);
    expect(result.issued.map(r => r.studentId)).toEqual(['S1']);
    expect((await db().collection('temp_passes').get()).docs.map(d => d.id)).toEqual(['S1']);
  });
  it('issues passes to learners without a photo', async () => {
    await learner('nullPhoto', 'SEC1', { photo: null });
    await db().doc('students/noPhotoField').set({ lrn: 'lrn-noPhotoField', firstName: 'No', lastName: 'Photo' });
    await db().doc(`enrollments/noPhotoField_${year}`).set({ studentId: 'noPhotoField', sectionId: 'SEC1', schoolYear: year, status: 'enrolled' });
    const result = await issue(['nullPhoto', 'noPhotoField']);
    expect(result.skipped).toEqual([]);
    expect(result.issued.map(r => r.studentId)).toEqual(['nullPhoto', 'noPhotoField']);
    expect(await pass('nullPhoto')).toMatchObject({ status: 'active', code: result.issued[0].code });
    expect(await pass('noPhotoField')).toMatchObject({ status: 'active', code: result.issued[1].code });
  });
  it.each([undefined, null, '7', 7.5, 6, 13])('skips a learner whose section grade is %s and issues the rest', async gradeLevel => {
    await db().doc('sections/BROKEN').set({ name: 'Broken', schoolYear: year, ...(gradeLevel === undefined ? {} : { gradeLevel }) });
    await learner('broken', 'BROKEN');
    await learner('after', 'SEC8');
    const result = await issue(['S1', 'broken', 'after']);
    expect(result.skipped).toEqual([{ studentId: 'broken', reason: 'not-enrolled' }]);
    expect(result.issued.map(r => r.studentId)).toEqual(['S1', 'after']);
    expect(await pass('broken')).toBeUndefined();
    expect(await actions()).toEqual(['tempPass.issued', 'tempPass.issued']);
  });
  it.each(['jhs', 'shs'])('refuses the %s academic coordinator for every grade', async who => {
    await learner('senior', 'SEC11');
    await expect(issue(['S1', 'senior'], who)).rejects.toMatchObject({ code: 'permission-denied', message: DENIED });
    expect((await db().collection('temp_passes').get()).size).toBe(0);
    expect(await audits()).toEqual([]);
  });
  it('limits a grade level coordinator to their grade without describing other learners', async () => {
    // Each has a blocker of their own, so a leak of it would show here.
    await Promise.all([
      learner('senior', 'SEC11', { status: 'dropped' }),
      learner('eight', 'SEC8', { idCard: { printedAt: Timestamp.fromDate(NOW), lrn: 'lrn-eight' } }),
    ]);
    const result = await issue(['senior', 'eight', 'S1'], 'glc7');
    expect(result.issued.map(r => r.studentId)).toEqual(['S1']);
    expect(result.skipped).toEqual([{ studentId: 'senior', reason: 'out-of-scope' }, { studentId: 'eight', reason: 'out-of-scope' }]);
    expect((await db().collection('temp_passes').get()).docs.map(d => d.id)).toEqual(['S1']);
    expect(await pass()).toMatchObject({ gradeLevel: 7, issuedBy: 'glc7@x.test' });
  });
  it('does not hand a grade level coordinator the code of a pass outside their grade', async () => {
    await learner('senior', 'SEC11');
    await issue(['senior']);
    const before = await pass('senior');
    expect(await issue(['senior'], 'glc7')).toEqual({ issued: [], skipped: [{ studentId: 'senior', reason: 'out-of-scope' }] });
    expect(await pass('senior')).toEqual(before);
  });
  it('lets a logistic operator issue for every grade', async () => {
    await Promise.all([learner('eight', 'SEC8'), learner('senior', 'SEC11')]);
    const result = await issue(['S1', 'eight', 'senior'], 'logistic');
    expect(result.skipped).toEqual([]);
    expect(result.issued.map(r => r.studentId)).toEqual(['S1', 'eight', 'senior']);
    expect(await pass('senior')).toMatchObject({ gradeLevel: 11, issuedBy: 'log@x.test' });
  });
  it.each([
    ['a grade level coordinator without a grade', { role: 'glc' }],
    ['a grade level coordinator with an impossible grade', { role: 'glc', gradeLevel: 13 }],
    ['an unknown role', { role: 'teacher' }],
    ['no staff profile', undefined],
  ])('refuses %s', async (_, profile) => {
    await expect(issueTempPasses({ ...deps('admin'), profile }, { studentIds: ['S1'] }))
      .rejects.toMatchObject({ code: 'permission-denied', message: DENIED });
    expect(await pass()).toBeUndefined();
  });
  it('refuses bad input and an ended year', async () => {
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

describe('issuing inside a caller’s transaction', () => {
  const options = over => ({ studentId: 'S1', schoolYear: year, grades: null, email: 'log@x.test', ...over });
  const inTransaction = over => db().runTransaction(tx => issueInTransaction(db(), tx, options(over)));
  const KEYS = ['code', 'gradeLevel', 'issuedAt', 'issuedBy', 'lrn', 'schoolYear', 'sectionId', 'status'];

  it('replaces the code of an active pass and never records the old one', async () => {
    const old = (await issue()).issued[0].code;
    const result = await inTransaction({ newCode: true });
    expect(result).toEqual({ code: expect.any(String), replaced: true });
    expect(isTempPassCode(result.code)).toBe(true);
    expect(result.code).not.toBe(old);
    const stored = await pass();
    expect(stored.code).toBe(result.code);
    expect(stored.code).not.toBe(old);
    expect(Object.keys(stored).sort()).toEqual(KEYS);
    expect(stored).toMatchObject({ status: 'active', issuedBy: 'log@x.test' });
    expect(await actions()).toEqual(['tempPass.issued', 'tempPass.replaced']);
    const rows = await audits();
    expect(rows.find(a => a.action === 'tempPass.replaced')).toEqual({ action: 'tempPass.replaced', actorType: 'staff', actorUid: 'log@x.test',
      targetType: 'temp_pass', targetId: 'S1', details: { sectionId: 'SEC1', gradeLevel: 7 }, at: expect.any(Timestamp) });
    expect(JSON.stringify(rows)).not.toContain(old);
    expect(JSON.stringify(rows)).not.toContain(result.code);
  });
  it.each([{ newCode: false }, {}])('keeps the code of an active pass with %j', async over => {
    const old = (await issue()).issued[0].code;
    const before = await pass();
    expect(await inTransaction(over)).toEqual({ code: old, replaced: false });
    expect(await pass()).toEqual(before);
    expect(await actions()).toEqual(['tempPass.issued']);
  });
  it('keeps the code and moves the placement without calling it a replacement', async () => {
    const old = (await issue()).issued[0].code;
    await db().doc(`enrollments/S1_${year}`).update({ sectionId: 'SEC8' });
    expect(await inTransaction()).toEqual({ code: old, replaced: false });
    expect(await pass()).toMatchObject({ code: old, sectionId: 'SEC8', gradeLevel: 8 });
    expect(await actions()).toEqual(['tempPass.issued']);
  });
  it.each([
    ['there is no pass', async () => {}],
    ['the pass was revoked', async () => { await issue(); await revoke(); }],
    ['the pass is for an earlier LRN', async () => { await issue(); await db().doc('students/S1').update({ lrn: '100000000009' }); }],
    ['the pass is for an earlier school year', async () => { await issue(); await db().doc('temp_passes/S1').update({ schoolYear: '2025-2026' }); }],
  ])('issues rather than replaces a new code when %s', async (_, arrange) => {
    await arrange();
    const old = (await pass())?.code;
    const issuedBefore = (await actions()).filter(a => a === 'tempPass.issued').length;
    const result = await inTransaction({ newCode: true });
    expect(result).toEqual({ code: expect.any(String), replaced: false });
    expect(result.code).not.toBe(old);
    expect(await pass()).toMatchObject({ code: result.code, status: 'active' });
    expect((await actions()).filter(a => a === 'tempPass.issued')).toHaveLength(issuedBefore + 1);
    expect(await actions()).not.toContain('tempPass.replaced');
  });
  it.each([
    ['out-of-scope', { grades: [8] }, async () => {}],
    ['official-printed', {}, () => db().doc('students/S1').update({ idCard: { printedAt: Timestamp.fromDate(NOW), lrn: '100000000001' } })],
    ['not-enrolled', {}, () => db().doc(`enrollments/S1_${year}`).update({ status: 'dropped' })],
    ['not-found', {}, () => db().doc('students/S1').delete()],
  ])('returns the skip %s and leaves the active pass alone', async (skip, over, arrange) => {
    await issue();
    const before = await pass();
    await arrange();
    expect(await inTransaction({ newCode: true, ...over })).toEqual({ skip });
    expect(await pass()).toEqual(before);
    expect(await actions()).toEqual(['tempPass.issued']);
  });
  it('lets the caller read before it and write after it, in one commit', async () => {
    const request = db().doc('temp_pass_requests/R1');
    await request.set({ status: 'pending' });
    const result = await db().runTransaction(async tx => {
      await Promise.all([tx.get(request), tx.get(db().doc('temp_passes/S1'))]);
      const issued = await issueInTransaction(db(), tx, options());
      tx.update(request, { passCode: issued.code });
      return issued;
    });
    expect(await read('temp_pass_requests/R1')).toEqual({ status: 'pending', passCode: result.code });
    expect((await pass()).code).toBe(result.code);
  });
  it('writes nothing when the caller’s transaction fails', async () => {
    const old = (await issue()).issued[0].code;
    await expect(db().runTransaction(async tx => {
      await issueInTransaction(db(), tx, options({ newCode: true }));
      throw new Error('caller failed');
    })).rejects.toThrow('caller failed');
    expect((await pass()).code).toBe(old);
    expect(await actions()).toEqual(['tempPass.issued']);
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
  it.each(['', 'a/b'])('leaves the pass unchanged when the enrollment section id is "%s"', async sectionId => {
    const before = await pass();
    await enrollment().update({ sectionId });
    expect(await reconcileTempPass(db(), 'S1')).toBe('kept');
    expect(await pass()).toEqual(before);
  });
  it.each([undefined, '8', 13])('leaves the pass unchanged when the new section grade is %s', async gradeLevel => {
    await db().doc('sections/BROKEN').set({ name: 'Broken', schoolYear: year, ...(gradeLevel === undefined ? {} : { gradeLevel }) });
    const before = await pass();
    await enrollment().update({ sectionId: 'BROKEN' });
    expect(await reconcileTempPass(db(), 'S1')).toBe('kept');
    expect(await pass()).toEqual(before);
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
  const request = (who, data) => ({ app: { appId: 'local-test' }, auth: { uid: staff[who].uid, token: {
    email: staff[who].email, auth_time: Math.floor(Date.now() / 1000) + 5, firebase: { sign_in_provider: 'password' },
  } }, data });
  beforeEach(async () => {
    await clearAllAuthUsers();
    for (const who of ['admin', 'jhs', 'shs', 'glc7', 'logistic']) {
      await auth().createUser({ uid: staff[who].uid, email: staff[who].email, password: 'local-test-password' });
      await db().doc(`users/${staff[who].email}`).set(staff[who].profile);
    }
  });
  it.each(['glc7', 'logistic'])('lets %s issue but only an administrator revoke', async who => {
    await expect(issueTempPassFn.run(request(who, { studentIds: ['S1'] }))).resolves.toMatchObject({ issued: [{ studentId: 'S1' }] });
    await expect(revokeTempPassFn.run(request(who, { studentId: 'S1' }))).rejects.toMatchObject({ code: 'permission-denied' });
    expect(await pass()).toMatchObject({ status: 'active', issuedBy: staff[who].email });
    await expect(revokeTempPassFn.run(request('admin', { studentId: 'S1' }))).resolves.toEqual({ revoked: 1 });
  });
  it.each(['jhs', 'shs'])('refuses %s through the callable', async who => {
    await expect(issueTempPassFn.run(request(who, { studentIds: ['S1'] }))).rejects.toMatchObject({ code: 'permission-denied', message: DENIED });
    expect(await pass()).toBeUndefined();
  });
});
