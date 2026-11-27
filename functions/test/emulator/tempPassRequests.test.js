import { beforeEach, describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { db, auth, clearAll, clearAllAuthUsers, seedSchool } from './helpers.js';
import {
  requestTempPasses, withdrawTempPassRequest, getTempPassRequests, listTempPassRequests, fulfilTempPassRequests,
  markTempPassRequestsPrinted, declineTempPassRequest,
} from '../../src/handlers/tempPassRequests.js';
import { issueTempPasses, revokeTempPass } from '../../src/handlers/tempPasses.js';
import {
  requestTempPassesFn, withdrawTempPassRequestFn, getTempPassRequestsFn, listTempPassRequestsFn, fulfilTempPassRequestsFn,
  markTempPassRequestsPrintedFn, declineTempPassRequestFn,
} from '../../index.js';
import { LIMITS } from '../../src/callable.js';
import { inboxRef } from '../../src/handlers/schoolAccess.js';
import { isTempPassCode } from '../../shared/tempPass.js';

const year = '2026-2027';
const NOW = new Date('2026-11-27T08:00:00+08:00');
const FULL = 'You already have 40 requests waiting. Wait for some to be printed.';
const DENIED = 'Temporary passes are for administrators, grade level coordinators and logistic operators.';
const advisers = {
  adv: { email: 'adv@deped.gov.ph', displayName: 'Ava Adviser' }, // Class Adviser of SEC1 (Grade 7)
  adv2: { email: 'adv2@deped.gov.ph', displayName: 'Ben Adviser' }, // Class Adviser of SEC2 (Grade 7)
  adv8: { email: 'adv8@deped.gov.ph', displayName: 'Cy Adviser' }, // Class Adviser of SEC8 (Grade 8)
};
const staff = {
  admin: { uid: 'admin', email: 'admin@x.test', profile: { uid: 'admin', role: 'admin' } },
  glc7: { uid: 'glc7', email: 'glc7@x.test', profile: { uid: 'glc7', role: 'glc', gradeLevel: 7 } },
  glc8: { uid: 'glc8', email: 'glc8@x.test', profile: { uid: 'glc8', role: 'glc', gradeLevel: 8 } },
  logistic: { uid: 'log', email: 'log@x.test', profile: { uid: 'log', role: 'logistic' } },
  jhs: { uid: 'jhs', email: 'jhs@x.test', profile: { uid: 'jhs', role: 'jhs_coord' } },
};
const school = (uid = 'adv') => ({ db: db(), now: () => NOW, uid, ...advisers[uid], authTime: Math.floor(NOW.getTime() / 1000) });
const printer = (who = 'logistic') => ({ db: db(), now: () => NOW, ...staff[who] });
const ask = (items, uid = 'adv', over = {}) => requestTempPasses(school(uid), { sectionId: uid === 'adv8' ? 'SEC8' : uid === 'adv2' ? 'SEC2' : 'SEC1', items, ...over });
const item = (studentId = 'S1', reason = 'new') => ({ studentId, reason });
const read = async (path) => (await db().doc(path).get()).data();
const request = (id) => read(`temp_pass_requests/${id}`);
const all = async () => (await db().collection('temp_pass_requests').get()).docs.map((d) => ({ id: d.id, ...d.data() }));
const pending = async (uid = 'adv') => (await all()).filter((r) => r.status === 'pending' && r.requestedByUid === uid);
const audits = async () => (await db().collection('audit_log').where('targetType', '==', 'temp_pass_request').get()).docs.map((d) => d.data());
const inbox = async (uid, requestId) => (await inboxRef(db(), uid, `tempPass:${requestId}`).get()).data();
// An enrolled, active learner with an LRN; a photo unless `photo: null`.
async function learner(id, sectionId = 'SEC1', over = {}) {
  await db().doc(`students/${id}`).set({ lrn: `lrn-${id}`, firstName: id, lastName: 'Test', status: 'active', photo: { path: `student_photos/${id}.jpg` }, ...over });
  await db().doc(`enrollments/${id}_${year}`).set({ studentId: id, sectionId, schoolYear: year, status: 'enrolled' });
}
async function manyLearners(prefix, count, sectionId = 'SEC1') {
  const batch = db().batch();
  const ids = Array.from({ length: count }, (_, i) => `${prefix}${String(i).padStart(2, '0')}`);
  for (const id of ids) {
    batch.set(db().doc(`students/${id}`), { lrn: `lrn-${id}`, firstName: id, lastName: 'Test', status: 'active' });
    batch.set(db().doc(`enrollments/${id}_${year}`), { studentId: id, sectionId, schoolYear: year, status: 'enrolled' });
  }
  await batch.commit();
  return ids;
}
// One pending request filed by the adviser of `uid`; returns its id.
const filed = async (studentId = 'S1', reason = 'new', uid = 'adv') => (await ask([item(studentId, reason)], uid)).created[0].requestId;
const fulfil = (requestIds, who = 'logistic') => fulfilTempPassRequests(printer(who), { requestIds });
const markPrinted = (requestIds, who = 'logistic') => markTempPassRequestsPrinted(printer(who), { requestIds });
const decline = (requestId, reason = 'Photo is missing', who = 'logistic') => declineTempPassRequest(printer(who), { requestId, reason });
const list = (who = 'logistic', status) => listTempPassRequests(printer(who), status === undefined ? {} : { status });
const issueDirect = (studentIds) => issueTempPasses(printer('admin'), { studentIds });

beforeEach(async () => {
  await clearAll(); await seedSchool();
  const d = db();
  await Promise.all([
    d.doc('settings/app').set({ currentSchoolYear: year, passPickupPlace: 'the Guidance Office' }),
    d.doc('students/S1').update({ status: 'active', photo: { path: 'student_photos/S1.jpg' } }),
    d.doc('sections/SEC2').set({ name: 'Mabini', gradeLevel: 7, schoolYear: year }),
    d.doc('sections/SEC8').set({ name: 'Luna', gradeLevel: 8, schoolYear: year }),
    d.doc('school_accounts/adv').set({ displayName: 'Ava Adviser', assignments: [{ role: 'adviser', schoolYear: year, sectionId: 'SEC1', gradeLevel: 7 }] }),
    d.doc('school_accounts/adv2').set({ assignments: [{ role: 'adviser', schoolYear: year, sectionId: 'SEC2', gradeLevel: 7 }] }),
    d.doc('school_accounts/adv8').set({ assignments: [{ role: 'adviser', schoolYear: year, sectionId: 'SEC8', gradeLevel: 8 }] }),
    ...Object.values(staff).map((s) => d.doc(`users/${s.email}`).set(s.profile)),
  ]);
  // S2 (seeded unenrolled) joins SEC2; S3 is a SEC1 learner without a photo; S8 is in Grade 8.
  await d.doc(`enrollments/S2_${year}`).set({ studentId: 'S2', sectionId: 'SEC2', schoolYear: year, status: 'enrolled' });
  await learner('S3', 'SEC1', { photo: null });
  await learner('S8', 'SEC8');
});

describe('requestTempPasses (1)', () => {
  it('files one pending request per learner with an audit row that never holds the note', async () => {
    const result = await ask([item('S1'), item('S3')], 'adv', { note: '  Needs it\u0007 for   the​ exam ' });
    expect(result.skipped).toEqual([]);
    expect(result.created.map((c) => c.studentId)).toEqual(['S1', 'S3']);
    const saved = await request(result.created[0].requestId);
    expect(saved).toEqual({
      studentId: 'S1', sectionId: 'SEC1', sectionName: 'Rizal', gradeLevel: 7, schoolYear: year, reason: 'new', note: 'Needs it for the exam',
      status: 'pending', displayName: 'Ana B. Cruz', requestedByUid: 'adv', requestedByName: 'Ava Adviser', requestedByEmail: 'adv@deped.gov.ph',
      createdAt: expect.any(Timestamp),
    });
    const rows = await audits();
    expect(rows).toHaveLength(2);
    expect(rows).toContainEqual({ action: 'tempPassRequest.created', actorType: 'staff', actorUid: 'adv@deped.gov.ph', targetType: 'temp_pass_request',
      targetId: result.created[0].requestId, details: { studentId: 'S1', sectionId: 'SEC1', gradeLevel: 7, reason: 'new' }, at: expect.any(Timestamp) });
    expect(JSON.stringify(rows)).not.toContain('exam');
  });
  it('keeps the note within 500 characters', async () => {
    const { created } = await ask([item('S1')], 'adv', { note: 'x'.repeat(900) });
    expect((await request(created[0].requestId)).note).toHaveLength(500);
  });
  it('skips learners who cannot be requested, and reasons that do not fit the pass', async () => {
    await learner('S4', 'SEC1', { idCard: { printedAt: 1, lrn: 'lrn-S4' } });
    await learner('S5', 'SEC1', { status: 'dropped' });
    await learner('S6', 'SEC1', { lrn: ' ' });
    await learner('S7');
    await issueDirect(['S7']);
    await filed('S3');
    const result = await ask([item('S2'), item('S4'), item('S5'), item('S6'), item('S3'), item('S1', 'lost'), item('S7', 'new')]);
    expect(result).toEqual({ created: [], skipped: [
      { studentId: 'S2', reason: 'not-in-class' }, { studentId: 'S4', reason: 'official-printed' }, { studentId: 'S5', reason: 'inactive' },
      { studentId: 'S6', reason: 'no-lrn' }, { studentId: 'S3', reason: 'already-requested' }, { studentId: 'S1', reason: 'reason' },
      { studentId: 'S7', reason: 'reason' },
    ] });
    expect((await ask([item('S7', 'damaged')])).created).toHaveLength(1);
  });
  it("refuses anyone who is not this class's adviser, and an ended year", async () => {
    await expect(requestTempPasses(school('adv2'), { sectionId: 'SEC1', items: [item('S1')] })).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(requestTempPasses(printer('admin'), { sectionId: 'SEC1', items: [item('S1')] })).rejects.toMatchObject({ code: 'permission-denied' });
    await db().doc(`school_years/${year}`).set({ endedAt: new Date() });
    await expect(ask([item('S1')])).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(await all()).toEqual([]);
  });
  it('accepts 1–40 distinct, valid items only', async () => {
    const bad = [[], Array.from({ length: 41 }, (_, i) => item(`X${i}`)), [item('S1'), item('S1', 'lost')], [item('S1', 'stolen')],
      [item('a/b')], [{ studentId: 'S1' }], ['S1'], 'S1', undefined];
    for (const items of bad) await expect(ask(items)).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(ask([item('S1')], 'adv', { note: { text: 'x' } })).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(requestTempPasses(school('adv'), { sectionId: '../x', items: [item('S1')] })).rejects.toMatchObject({ code: 'invalid-argument' });
    expect(await all()).toEqual([]);
  });
  it('fails the 41st pending request, and a call that would pass 40 creates nothing', async () => {
    const ids = await manyLearners('L', 41);
    await ask(ids.slice(0, 39).map((id) => item(id)));
    await expect(ask(ids.slice(39, 41).map((id) => item(id)))).rejects.toMatchObject({ code: 'resource-exhausted', message: FULL });
    expect(await pending()).toHaveLength(39);
    await ask([item(ids[39])]);
    await expect(ask([item(ids[40])])).rejects.toMatchObject({ code: 'resource-exhausted', message: FULL });
    expect(await pending()).toHaveLength(40);
  }, 60000);
  it('cannot pass 40 pending requests through two calls at once', async () => {
    const ids = await manyLearners('C', 50);
    const results = await Promise.allSettled([ask(ids.slice(0, 25).map((id) => item(id))), ask(ids.slice(25).map((id) => item(id)))]);
    const refused = results.filter((r) => r.status === 'rejected').map((r) => r.reason.message);
    expect(refused.length).toBeGreaterThan(0);
    expect(new Set(refused)).toEqual(new Set([FULL]));
    expect(await pending()).toHaveLength(40);
  }, 60000);
  it('files one request when the same learner is sent twice at once', async () => {
    const results = await Promise.all([ask([item('S1')]), ask([item('S1')])]);
    expect(results.flatMap((r) => r.created)).toHaveLength(1);
    expect(results.flatMap((r) => r.skipped)).toEqual([{ studentId: 'S1', reason: 'already-requested' }]);
    expect(await all()).toHaveLength(1);
  }, 30000); // Firestore transaction contention can back off beyond Vitest's 5s default.
  it('limits how many request calls one adviser can make in an hour', async () => {
    expect(LIMITS.tempPassRequest).toEqual({ windowMs: 3600000, max: 60 });
    for (let i = 0; i < 60; i++) await ask([item('S2')]); // skipped every time, but each call uses the budget
    await expect(ask([item('S2')])).rejects.toMatchObject({ code: 'resource-exhausted' });
  }, 60000);
});

describe('withdrawTempPassRequest (2)', () => {
  it("withdraws the caller's own pending request only", async () => {
    const id = await filed('S1');
    await expect(withdrawTempPassRequest(school('adv2'), { requestId: id })).rejects.toMatchObject({ code: 'not-found' });
    await expect(withdrawTempPassRequest(school('adv'), { requestId: 'nope' })).rejects.toMatchObject({ code: 'not-found' });
    await expect(withdrawTempPassRequest(school('adv'), { requestId: id })).resolves.toEqual({ ok: true });
    expect(await request(id)).toMatchObject({ status: 'withdrawn', decidedAt: expect.any(Timestamp) });
    expect((await audits()).map((a) => a.action).sort()).toEqual(['tempPassRequest.created', 'tempPassRequest.withdrawn']);
    await expect(withdrawTempPassRequest(school('adv'), { requestId: id })).rejects.toMatchObject({ code: 'failed-precondition' });
    // A withdrawn request no longer blocks a new one.
    expect((await ask([item('S1')])).created).toHaveLength(1);
  });
});

describe('getTempPassRequests (3)', () => {
  it("lists the class's learners and the caller's requests, newest first", async () => {
    await learner('S4', 'SEC1', { idCard: { printedAt: 1, lrn: 'lrn-S4' } });
    await issueDirect(['S3']);
    const first = await filed('S1');
    const second = await filed('S3', 'damaged');
    await declineTempPassRequest(printer('admin'), { requestId: first, reason: 'Wrong learner' });
    // Another adviser's request for this section is not the caller's.
    await db().collection('temp_pass_requests').add({ studentId: 'S4', sectionId: 'SEC1', status: 'pending', requestedByUid: 'adv2', schoolYear: year, createdAt: Timestamp.now() });
    const result = await getTempPassRequests(school('adv'), { sectionId: 'SEC1' });
    expect(result.learners).toEqual(expect.arrayContaining([
      { studentId: 'S1', displayName: 'Ana B. Cruz', hasPhoto: true, hasActivePass: false, blocker: null },
      { studentId: 'S3', displayName: 'S3 Test', hasPhoto: false, hasActivePass: true, blocker: 'already-requested' },
      { studentId: 'S4', displayName: 'S4 Test', hasPhoto: true, hasActivePass: false, blocker: 'official-printed' },
    ]));
    expect(result.learners).toHaveLength(3);
    expect(result.requests.map((r) => r.id)).toEqual([second, first]);
    expect(result.requests[1]).toEqual({ id: first, studentId: 'S1', displayName: 'Ana B. Cruz', reason: 'new', note: '', status: 'declined',
      declineReason: 'Wrong learner', createdAt: expect.any(Number), decidedAt: expect.any(Number), prepared: false });
    expect(result.requests[0]).toMatchObject({ status: 'pending', decidedAt: null, declineReason: '' });
  });
  it('is for the class adviser only', async () => {
    await expect(getTempPassRequests(school('adv2'), { sectionId: 'SEC1' })).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(getTempPassRequests(school('adv'), {})).rejects.toMatchObject({ code: 'invalid-argument' });
  });
  it('returns at most 50 requests', async () => {
    const batch = db().batch();
    for (let i = 0; i < 55; i++) batch.set(db().doc(`temp_pass_requests/R${i}`), { studentId: 'S1', sectionId: 'SEC1', status: 'withdrawn', requestedByUid: 'adv',
      schoolYear: year, reason: 'new', createdAt: Timestamp.fromMillis(Date.UTC(2026, 9, 1) + i * 1000) });
    await batch.commit();
    const { requests } = await getTempPassRequests(school('adv'), { sectionId: 'SEC1' });
    expect(requests).toHaveLength(50);
    expect(requests[0].id).toBe('R54');
  });
});

describe('printer callables (4)', () => {
  it('refuse anyone who cannot manage passes', async () => {
    const id = await filed('S1');
    await expect(list('jhs')).rejects.toMatchObject({ code: 'permission-denied', message: DENIED });
    await expect(fulfil([id], 'jhs')).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(markPrinted([id], 'jhs')).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(decline(id, 'No', 'jhs')).rejects.toMatchObject({ code: 'permission-denied' });
  });
  it("treat another grade's request as not found", async () => {
    const id = await filed('S1');
    expect((await list('glc8')).requests).toEqual([]);
    expect(await fulfil([id], 'glc8')).toEqual({ issued: [], skipped: [{ requestId: id, studentId: '', reason: 'out-of-scope' }] });
    await fulfil([id], 'glc7');
    expect(await markPrinted([id], 'glc8')).toEqual({ printed: 0 });
    await expect(decline(id, 'No', 'glc8')).rejects.toMatchObject({ code: 'not-found' });
    expect(await request(id)).toMatchObject({ status: 'pending' });
  });
});

describe('a prepared request (fulfilled, sheet not yet marked printed)', () => {
  const WITHDRAW = 'This pass is already being printed. Ask the ID office.';
  const DECLINE = 'This pass is already prepared. Mark it printed instead.';
  const prepared = async (reason) => {
    if (reason !== 'new') await issueDirect(['S1']);
    const id = await filed('S1', reason);
    await fulfil([id]);
    return id;
  };
  const row = async (id) => (await getTempPassRequests(school('adv'), { sectionId: 'SEC1' })).requests.find((r) => r.id === id);
  it.each(['new', 'lost'])('cannot be withdrawn or declined (%s)', async (reason) => {
    const id = await prepared(reason);
    expect(await row(id)).toMatchObject({ status: 'pending', prepared: true });
    await expect(withdrawTempPassRequest(school('adv'), { requestId: id })).rejects.toMatchObject({ code: 'failed-precondition', message: WITHDRAW });
    await expect(decline(id)).rejects.toMatchObject({ code: 'failed-precondition', message: DECLINE });
    expect(await request(id)).toMatchObject({ status: 'pending' });
    expect(await inbox('adv', id)).toBeUndefined();
  });
  it('can be withdrawn or declined again once its pass is revoked', async () => {
    const a = await prepared('new');
    await revokeTempPass(printer('admin'), { studentId: 'S1' });
    expect(await row(a)).toMatchObject({ prepared: false });
    await expect(withdrawTempPassRequest(school('adv'), { requestId: a })).resolves.toEqual({ ok: true });
    const b = await filed('S1');
    await fulfil([b]);
    await revokeTempPass(printer('admin'), { studentId: 'S1' });
    await expect(decline(b)).resolves.toEqual({ ok: true });
  });
  it('can be declined once it can no longer be met (learner moved to another section after it was prepared)', async () => {
    const id = await prepared('new');
    await db().doc(`enrollments/S1_${year}`).update({ sectionId: 'SEC2' });
    expect((await list()).requests.find((r) => r.id === id)).toMatchObject({ prepared: true, blocker: 'not-in-class' });
    await expect(decline(id, 'Moved to Mabini')).resolves.toEqual({ ok: true });
    expect(await request(id)).toMatchObject({ status: 'declined', declineReason: 'Moved to Mabini' });
    expect(await inbox('adv', id)).toMatchObject({ status: 'declined' });
  });
  it('is not marked prepared before it is fulfilled', async () => {
    const id = await filed('S1');
    expect(await row(id)).toMatchObject({ prepared: false });
  });
  it('shows as prepared in the printers list until its pass stops being live, and stays markable after preparing again', async () => {
    const listed = async (id) => (await list()).requests.find((r) => r.id === id);
    const id = await filed('S1');
    expect(await listed(id)).toMatchObject({ prepared: false });
    const { issued: [first] } = await fulfil([id]);
    expect(await listed(id)).toMatchObject({ status: 'pending', prepared: true });
    // A reload re-prepares it: the same code comes back and it can still be marked printed.
    const { issued: [again] } = await fulfil([id]);
    expect(again.code).toBe(first.code);
    expect(await markPrinted([id])).toEqual({ printed: 1 });
    expect((await list('logistic', 'printed')).requests.find((r) => r.id === id)).toMatchObject({ prepared: false });
    const other = await filed('S3');
    await fulfil([other]);
    await revokeTempPass(printer('admin'), { studentId: 'S3' });
    expect(await listed(other)).toMatchObject({ prepared: false });
  });
});

describe('section printing of a learner with a waiting request', () => {
  it('is refused, so a Lost request is never bypassed with the lost code', async () => {
    const { issued: [first] } = await issueDirect(['S1']);
    const id = await filed('S1', 'lost');
    expect(await issueDirect(['S1', 'S3'])).toEqual({
      issued: [{ studentId: 'S3', code: expect.any(String) }], skipped: [{ studentId: 'S1', reason: 'requested' }],
    });
    expect((await read('temp_passes/S1')).code).toBe(first.code);
    // Through the request the old code is replaced.
    const { issued: [viaRequest] } = await fulfil([id]);
    expect(viaRequest.code).not.toBe(first.code);
  });
  it('reports another grade as out of scope, not as requested', async () => {
    await filed('S1');
    expect(await issueTempPasses(printer('glc8'), { studentIds: ['S1'] })).toEqual({ issued: [], skipped: [{ studentId: 'S1', reason: 'out-of-scope' }] });
  });
  it('is allowed again once the request is closed', async () => {
    const id = await filed('S1');
    await decline(id);
    expect((await issueDirect(['S1'])).issued).toHaveLength(1);
  });
});

describe('listTempPassRequests (5)', () => {
  it('says when the list was cut at 200', async () => {
    expect((await list()).truncated).toBe(false);
    const batch = db().batch();
    for (let i = 0; i < 201; i++) batch.set(db().doc(`temp_pass_requests/T${String(i).padStart(3, '0')}`), { studentId: 'S1', sectionId: 'SEC1', gradeLevel: 7,
      status: 'pending', schoolYear: year, reason: 'new', createdAt: Timestamp.fromMillis(Date.UTC(2026, 9, 1) + i * 1000) });
    await batch.commit();
    const result = await list();
    expect(result.requests).toHaveLength(200);
    expect(result.truncated).toBe(true);
  }, 30000);
  it('lists pending requests of this year, oldest first, scoped by grade', async () => {
    const first = await filed('S1');
    const eight = await filed('S8', 'new', 'adv8');
    const third = await filed('S3');
    await db().collection('temp_pass_requests').add({ studentId: 'S1', sectionId: 'SEC1', gradeLevel: 7, status: 'pending', schoolYear: '2025-2026', createdAt: Timestamp.now() });
    const rows = (await list()).requests;
    expect(rows.map((r) => r.id)).toEqual([first, eight, third]);
    expect(rows[0]).toEqual({ id: first, studentId: 'S1', displayName: 'Ana B. Cruz', lrn: '100000000001', sectionId: 'SEC1', sectionName: 'Rizal',
      gradeLevel: 7, reason: 'new', note: '', requestedByName: 'Ava Adviser', createdAt: expect.any(Number), status: 'pending', hasPhoto: true, blocker: null, prepared: false });
    expect(rows[2]).toMatchObject({ hasPhoto: false });
    expect((await list('admin')).requests.map((r) => r.id)).toEqual([first, eight, third]);
    expect((await list('glc7')).requests.map((r) => r.id)).toEqual([first, third]);
    expect((await list('glc8')).requests.map((r) => r.id)).toEqual([eight]);
  });
  it('lists printed or declined requests on request', async () => {
    const a = await filed('S1');
    const b = await filed('S3');
    await decline(b);
    await fulfil([a]);
    await markPrinted([a]);
    expect((await list('logistic', 'printed')).requests.map((r) => [r.id, r.status])).toEqual([[a, 'printed']]);
    expect((await list('logistic', 'declined')).requests.map((r) => [r.id, r.status])).toEqual([[b, 'declined']]);
    expect((await list('logistic', 'pending')).requests).toEqual([]);
    await expect(list('logistic', 'withdrawn')).rejects.toMatchObject({ code: 'invalid-argument' });
  });
});

describe('fulfilTempPassRequests (6)', () => {
  it('issues a pass, stores its code on the request, and leaves the request pending', async () => {
    const id = await filed('S1');
    const result = await fulfil([id]);
    const pass = await read('temp_passes/S1');
    expect(result).toEqual({ issued: [{ requestId: id, studentId: 'S1', code: pass.code }], skipped: [] });
    expect(isTempPassCode(pass.code)).toBe(true);
    expect(await request(id)).toMatchObject({ status: 'pending', passCode: pass.code });
  });
  it('gives a Lost request a new code once, so preparing again keeps the replacement', async () => {
    await issueDirect(['S1']);
    const old = (await read('temp_passes/S1')).code;
    const id = await filed('S1', 'lost');
    const first = await fulfil([id]);
    const code = first.issued[0].code;
    expect(code).not.toBe(old);
    expect((await read('temp_passes/S1')).code).toBe(code);
    const again = await fulfil([id]);
    expect(again.issued[0].code).toBe(code);
    expect((await read('temp_passes/S1')).code).toBe(code);
  });
  it('keeps the code for a Damaged request', async () => {
    await issueDirect(['S1']);
    const old = (await read('temp_passes/S1')).code;
    const id = await filed('S1', 'damaged');
    expect((await fulfil([id])).issued[0].code).toBe(old);
    expect((await read('temp_passes/S1')).code).toBe(old);
  });
  it('skips requests that are not pending or cannot be met, and leaves them pending', async () => {
    const a = await filed('S1');
    const b = await filed('S3');
    await decline(b);
    await db().doc('students/S1').update({ idCard: { printedAt: 1, lrn: '100000000001' } });
    expect(await fulfil([a, b, 'missing'])).toEqual({ issued: [], skipped: [
      { requestId: a, studentId: 'S1', reason: 'official-printed' }, { requestId: b, studentId: 'S3', reason: 'not-pending' },
      { requestId: 'missing', studentId: '', reason: 'not-found' },
    ] });
    expect(await request(a)).toMatchObject({ status: 'pending' });
    expect((await request(a)).passCode).toBeUndefined();
  });
  it('accepts 1–200 request ids, and not after the year ended', async () => {
    await expect(fulfil([])).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(fulfil(Array.from({ length: 201 }, (_, i) => `R${i}`))).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(fulfil(['a/b'])).rejects.toMatchObject({ code: 'invalid-argument' });
    const id = await filed('S1');
    await db().doc(`school_years/${year}`).set({ endedAt: new Date() });
    await expect(fulfil([id])).rejects.toMatchObject({ code: 'failed-precondition' });
  });
});

describe('markTempPassRequestsPrinted (7)', () => {
  it('marks a prepared request printed and tells the adviser where to pick it up', async () => {
    const id = await filed('S1');
    await fulfil([id]);
    expect(await markPrinted([id])).toEqual({ printed: 1 });
    expect(await request(id)).toMatchObject({ status: 'printed', decidedBy: 'log@x.test', decidedAt: expect.any(Timestamp) });
    expect(await inbox('adv', id)).toEqual({ type: 'temp_pass_request', requestId: id, status: 'printed', title: 'Temporary pass ready',
      body: 'Temporary pass for Ana B. Cruz is ready for pick-up at the Guidance Office.', createdAt: expect.any(Timestamp) });
    expect((await audits()).map((a) => a.action)).toContain('tempPassRequest.printed');
    expect(await markPrinted([id])).toEqual({ printed: 0 });
  });
  it('leaves out the place when none is set', async () => {
    await db().doc('settings/app').set({ currentSchoolYear: year });
    const id = await filed('S1');
    await fulfil([id]);
    await markPrinted([id]);
    expect((await inbox('adv', id)).body).toBe('Temporary pass for Ana B. Cruz is ready for pick-up.');
  });
  it('refuses a request that was never prepared or whose pass changed after it was prepared', async () => {
    const a = await filed('S1');
    const b = await filed('S3');
    await fulfil([a, b]);
    await db().doc('temp_passes/S1').update({ code: 'BNHS-TP-2222222222' });
    await db().doc('temp_passes/S3').update({ status: 'revoked' });
    const c = await filed('S8', 'new', 'adv8');
    expect(await markPrinted([a, b, c])).toEqual({ printed: 0 });
    for (const id of [a, b, c]) expect(await request(id)).toMatchObject({ status: 'pending' });
    expect(await inbox('adv', a)).toBeUndefined();
  });
});

describe('declineTempPassRequest (8)', () => {
  it('declines with a reason and tells the adviser, keeping the reason out of the audit', async () => {
    const id = await filed('S1');
    await expect(decline(id, ' Photo\u0000 is   blurry ')).resolves.toEqual({ ok: true });
    expect(await request(id)).toMatchObject({ status: 'declined', declineReason: 'Photo is blurry', decidedBy: 'log@x.test', decidedAt: expect.any(Timestamp) });
    expect(await inbox('adv', id)).toEqual({ type: 'temp_pass_request', requestId: id, status: 'declined', title: 'Temporary pass request declined',
      body: 'Ana B. Cruz: Photo is blurry', createdAt: expect.any(Timestamp) });
    const rows = await audits();
    expect(rows.map((a) => a.action)).toContain('tempPassRequest.declined');
    expect(JSON.stringify(rows)).not.toContain('blurry');
    await expect(decline(id)).rejects.toMatchObject({ code: 'failed-precondition' });
  });
  it('needs a reason of 1–300 characters and an existing request', async () => {
    const id = await filed('S1');
    await expect(decline(id, '  ')).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(decline(id, 42)).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(decline('missing')).rejects.toMatchObject({ code: 'not-found' });
    await decline(id, 'y'.repeat(400));
    expect((await request(id)).declineReason).toHaveLength(300);
  });
});

describe('requests that can no longer be met (9)', () => {
  it('stay pending and are listed with a blocker', async () => {
    const id = await filed('S1');
    await db().doc('students/S1').update({ idCard: { printedAt: 1, lrn: '100000000001' } });
    const id3 = await filed('S3');
    await db().doc(`enrollments/S3_${year}`).update({ sectionId: 'SEC2' });
    const rows = (await list()).requests;
    expect(rows.find((r) => r.id === id)).toMatchObject({ status: 'pending', blocker: 'official-printed' });
    expect(rows.find((r) => r.id === id3)).toMatchObject({ status: 'pending', blocker: 'not-in-class' });
  });
});

describe('callable wrappers', () => {
  const call = (uid, email, data, verified = true) => ({ app: { appId: 'local-test' }, auth: { uid, token: {
    email, email_verified: verified, auth_time: Math.floor(Date.now() / 1000) + 5, firebase: { sign_in_provider: 'password' },
  } }, data });
  const staffCall = (who, data) => call(staff[who].uid, staff[who].email, data);
  beforeEach(async () => {
    await clearAllAuthUsers();
    await auth().createUser({ uid: 'adv', email: advisers.adv.email, emailVerified: true, password: 'local-test-password' });
    for (const who of Object.keys(staff)) await auth().createUser({ uid: staff[who].uid, email: staff[who].email, password: 'local-test-password' });
  });
  it('let the class adviser request, read and withdraw', async () => {
    const { created } = await requestTempPassesFn.run(call('adv', advisers.adv.email, { sectionId: 'SEC1', items: [item('S1')] }));
    expect(created).toHaveLength(1);
    expect((await getTempPassRequestsFn.run(call('adv', advisers.adv.email, { sectionId: 'SEC1' }))).requests).toHaveLength(1);
    await expect(withdrawTempPassRequestFn.run(call('adv', advisers.adv.email, { requestId: created[0].requestId }))).resolves.toEqual({ ok: true });
  });
  it('let a logistic operator list, prepare, print and decline', async () => {
    const a = await filed('S1');
    const b = await filed('S3');
    expect((await listTempPassRequestsFn.run(staffCall('logistic', {}))).requests).toHaveLength(2);
    expect((await fulfilTempPassRequestsFn.run(staffCall('logistic', { requestIds: [a] }))).issued).toHaveLength(1);
    await expect(markTempPassRequestsPrintedFn.run(staffCall('logistic', { requestIds: [a] }))).resolves.toEqual({ printed: 1 });
    await expect(declineTempPassRequestFn.run(staffCall('logistic', { requestId: b, reason: 'No' }))).resolves.toEqual({ ok: true });
  });
  it.each([
    ['disabled', { disabled: true }, 'permission-denied'],
    ['temporary-password', { mustChangePassword: true }, 'failed-precondition'],
    ['wrong-account', { uid: 'someone-else' }, 'permission-denied'],
  ])('refuse a %s staff profile on every printer callable', async (_, change, code) => {
    const id = await filed('S1');
    await db().doc(`users/${staff.logistic.email}`).update(change);
    const calls = [
      [listTempPassRequestsFn, {}], [fulfilTempPassRequestsFn, { requestIds: [id] }],
      [markTempPassRequestsPrintedFn, { requestIds: [id] }], [declineTempPassRequestFn, { requestId: id, reason: 'No' }],
    ];
    for (const [fn, data] of calls) await expect(fn.run(staffCall('logistic', data))).rejects.toMatchObject({ code });
    expect(await request(id)).toMatchObject({ status: 'pending' });
    expect((await request(id)).passCode).toBeUndefined();
  });
});
