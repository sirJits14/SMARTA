import { beforeEach, describe, expect, it } from 'vitest';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { db, clearAll, seedSchool } from './helpers.js';
import {
  requestLearnerAdd, requestLearnerRemoval, withdrawLearnerRequest, getLearnerRequests, listLearnerRequests,
  resolveLearnerRequest, getLearnerRequestCount,
} from '../../src/handlers/learnerRequests.js';
import { deleteSchoolAccess } from '../../src/handlers/schoolAccess.js';

const year = '2026-2027';
const now = () => new Date('2026-10-22T09:00:00+08:00');
const people = {
  teacher: { email: 'teacher@deped.gov.ph', displayName: 'Tina Teacher' }, // Class Adviser of SEC1 (Grade 7 Rizal)
  other: { email: 'other@deped.gov.ph', displayName: 'Omar Other' }, // Class Adviser of SEC2 (Grade 7 Mabini)
  newadv: { email: 'newadv@deped.gov.ph', displayName: 'Nina New' }, // seeded only in the dedupe tests: the class's next adviser
  eight: { email: 'eight@deped.gov.ph', displayName: 'Eli Eight' }, // Class Adviser of SEC8 (Grade 8)
  admin: { email: 'admin@school.test', displayName: 'Ada Admin' },
  coord7: { email: 'coord7@school.test', displayName: 'Cora Seven' }, // SIMS Grade Level Coordinator, Grade 7
  coord8: { email: 'coord8@school.test', displayName: 'Carl Eight' }, // SIMS Grade Level Coordinator, Grade 8
  ca7: { email: 'ca7@deped.gov.ph', displayName: 'Cleo Curriculum' }, // Curriculum Adviser, Grade 7
};
const deps = (uid) => ({ db: db(), now, uid, email: people[uid].email, displayName: people[uid].displayName, authTime: 1792195200 });
const form = (over = {}) => ({
  lrn: '200000000001', lastName: 'Dela Cruz', firstName: 'Juan', middleName: 'Santos', extName: 'Jr', sex: 'M', birthdate: '2012-05-01',
  address: '123 Rizal St.', guardianName: 'Maria Dela Cruz', guardianRelationship: 'Mother', guardianContact: '09171234567', contactNumber: '09181234567', ...over,
});
const addInput = (over = {}) => ({ sectionId: 'SEC1', student: form(), enrollType: 'new', ...over });
const removal = (over = {}) => ({ sectionId: 'SEC1', studentId: 'S1', reasonCode: 'dropped_out', note: 'Stopped attending in September', ...over });
const file = (uid = 'teacher', over = {}) => requestLearnerAdd(deps(uid), addInput(over));
const get = async (path) => (await db().doc(path).get()).data();
const allRequests = async () => (await db().collection('learner_change_requests').get()).docs.map((d) => ({ id: d.id, ...d.data() }));
const inboxOf = async (uid) => (await db().collection(`guardians/${uid}/inbox`).get()).docs.map((d) => d.data());
// Every audit row as one string, to prove a reviewer's or adviser's free text never reaches the audit log.
const auditText = async () => JSON.stringify((await db().collection('audit_log').get()).docs.map((d) => d.data()));
const waitingIds = async (uid) => (await listLearnerRequests(deps(uid), { view: 'waiting' })).requests.map((r) => r.id);
const decidedBase = Date.UTC(2026, 9, 1);
// A request somebody has already decided (approved by default); `over` can change any field.
const seedDecided = (id, over = {}) => db().doc(`learner_change_requests/${id}`).set({
  kind: 'add', status: 'approved', schoolYear: year, sectionId: 'SEC1', gradeLevel: 7, displayName: id, student: { lrn: '400000000000' },
  requestedByUid: 'teacher', requestedByName: 'Tina Teacher', decidedByName: 'Ada Admin', decisionReason: 'Approved',
  createdAt: Timestamp.fromMillis(Date.UTC(2026, 8, 1)), decidedAt: Timestamp.fromMillis(decidedBase), ...over,
});
const rowOf = (rows, id) => rows.find((r) => r.id === id);
const waitingRowsOf = async (uid) => (await listLearnerRequests(deps(uid), { view: 'waiting' })).requests;
const decidedRowsOf = async (uid) => (await listLearnerRequests(deps(uid), { view: 'decided' })).requests;

beforeEach(async () => {
  await clearAll(); await seedSchool();
  const d = db();
  await d.doc('sections/SEC2').set({ name: 'Mabini', gradeLevel: 7, schoolYear: year });
  await d.doc('sections/SEC8').set({ name: 'Eight', gradeLevel: 8, schoolYear: year });
  // S1 Ana Cruz (SEC1) and S2 Ben Dy (SEC2) are enrolled Grade 7 learners; S3 is Unassigned; S4 is in Grade 8.
  await d.doc('students/S1').update({ status: 'active', gradeLevel: 7, scopeSchoolYear: year });
  await d.doc('students/S2').update({ status: 'active', gradeLevel: 7, scopeSchoolYear: year });
  await d.doc('enrollments/S1_2026-2027').update({ gradeLevel: 7, type: 'new', dateEnrolled: '2026-06-01' });
  await d.doc('enrollments/S2_2026-2027').set({ studentId: 'S2', sectionId: 'SEC2', schoolYear: year, gradeLevel: 7, type: 'returning', dateEnrolled: '2026-06-02', status: 'enrolled' });
  await d.doc('students/S3').set({ lrn: '100000000003', firstName: 'Cara', lastName: 'Lim', sex: 'F', status: 'active', gradeLevel: null, scopeSchoolYear: null });
  await d.doc('students/S4').set({ lrn: '100000000004', firstName: 'Dan', lastName: 'Ong', sex: 'M', status: 'active', gradeLevel: 8, scopeSchoolYear: year });
  await d.doc('enrollments/S4_2026-2027').set({ studentId: 'S4', sectionId: 'SEC8', schoolYear: year, gradeLevel: 8, type: 'new', dateEnrolled: '2026-06-03', status: 'enrolled' });
  await d.doc('school_accounts/teacher').set({ assignments: [{ role: 'adviser', schoolYear: year, sectionId: 'SEC1', gradeLevel: 7 }] });
  await d.doc('school_accounts/other').set({ assignments: [{ role: 'adviser', schoolYear: year, sectionId: 'SEC2', gradeLevel: 7 }] });
  await d.doc('school_accounts/eight').set({ assignments: [{ role: 'adviser', schoolYear: year, sectionId: 'SEC8', gradeLevel: 8 }] });
  await d.doc('school_accounts/ca7').set({ assignments: [{ role: 'curriculum_adviser', schoolYear: year, gradeLevel: 7 }] });
  await d.doc('users/admin@school.test').set({ uid: 'admin', role: 'admin' });
  await d.doc('users/coord7@school.test').set({ uid: 'coord7', role: 'glc', gradeLevel: 7, name: 'Cora Seven' });
  await d.doc('users/coord8@school.test').set({ uid: 'coord8', role: 'glc', gradeLevel: 8, name: 'Carl Eight' });
});

describe('filing an add', () => {
  it('records a pending add with cleaned fields and an audit row, and creates no learner', async () => {
    const result = await requestLearnerAdd(deps('teacher'), addInput({ student: form({ lastName: '  Dela   Cruz ' }) }));
    expect(result.status).toBe('pending');
    const saved = await get(`learner_change_requests/${result.id}`);
    expect(saved).toMatchObject({
      kind: 'add', status: 'pending', schoolYear: year, sectionId: 'SEC1', gradeLevel: 7, sectionName: 'Rizal', requestedByUid: 'teacher',
      requestedByEmail: 'teacher@deped.gov.ph', requestedByName: 'Tina Teacher', dedupeKey: 'add:SEC1:200000000001', enrollType: 'new',
      displayName: 'Juan Santos Dela Cruz Jr', student: expect.objectContaining({ lastName: 'Dela Cruz', address: '123 Rizal St.' }),
    });
    expect(saved.createdAt.toMillis()).toBeGreaterThan(0);
    expect((await db().collection('students').where('lrn', '==', '200000000001').get()).size).toBe(0);
    const audit = (await db().collection('audit_log').get()).docs.map((d) => d.data());
    expect(audit).toEqual([expect.objectContaining({ action: 'learner.addRequested', targetType: 'learner_request', targetId: result.id,
      details: { sectionId: 'SEC1', gradeLevel: 7, lrn: '200000000001', name: 'Juan Santos Dela Cruz Jr' } })]);
  });
  it("refuses anyone who is not this class's adviser", async () => {
    for (const uid of ['other', 'admin', 'coord7', 'ca7']) {
      await expect(requestLearnerAdd(deps(uid), addInput())).rejects.toMatchObject({ code: 'permission-denied' });
    }
    expect(await allRequests()).toEqual([]);
  });
  it('names the first problem with the form', async () => {
    const ask = (over) => requestLearnerAdd(deps('teacher'), over);
    await expect(ask(addInput({ student: form({ lrn: '123' }) }))).rejects.toMatchObject({ code: 'invalid-argument', message: 'LRN must be exactly 12 digits.' });
    await expect(ask(addInput({ student: form({ birthdate: '2099-01-01' }) }))).rejects.toMatchObject({ message: 'Birthdate cannot be in the future.' });
    await expect(ask(addInput({ enrollType: 'visitor' }))).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(ask({ student: form() })).rejects.toMatchObject({ code: 'invalid-argument', message: 'Choose a class.' });
  });
  it('refuses an LRN already in the class but quietly accepts one that lives elsewhere', async () => {
    await expect(requestLearnerAdd(deps('teacher'), addInput({ student: form({ lrn: '100000000001' }) })))
      .rejects.toMatchObject({ code: 'already-exists', message: 'This LRN is already in your class.' });
    // S2 is enrolled in another section: the adviser is not told whose record it is.
    const elsewhere = await requestLearnerAdd(deps('teacher'), addInput({ student: form({ lrn: '100000000002' }) }));
    expect(elsewhere.status).toBe('pending');
  });
  it('returns the waiting request when the same learner is sent twice', async () => {
    const first = await file();
    expect(await file()).toEqual(first);
    expect(await allRequests()).toHaveLength(1);
  });
  it('stops at 20 pending requests', async () => {
    for (let i = 0; i < 20; i++) await file('teacher', { student: form({ lrn: `3000000000${String(i).padStart(2, '0')}` }) });
    await expect(file('teacher', { student: form({ lrn: '300000000099' }) })).rejects.toMatchObject({ code: 'resource-exhausted' });
  }, 30000);
  it('limits how many requests one adviser can send in an hour', async () => {
    for (let i = 0; i < 30; i++) await file(); // repeats return the waiting request but still use the budget
    await expect(file()).rejects.toMatchObject({ code: 'resource-exhausted' });
  }, 30000);
  it('is blocked once the school year has ended', async () => {
    await db().doc(`school_years/${year}`).set({ endedAt: new Date() });
    await expect(file()).rejects.toMatchObject({ code: 'failed-precondition', message: 'This school year has ended.' });
  });
});

describe('filing a removal', () => {
  it('records a pending removal with the reason and an audit row', async () => {
    const { id } = await requestLearnerRemoval(deps('teacher'), removal());
    expect(await get(`learner_change_requests/${id}`)).toMatchObject({
      kind: 'remove', status: 'pending', sectionId: 'SEC1', gradeLevel: 7, studentId: 'S1', lrn: '100000000001', displayName: 'Ana B. Cruz',
      reasonCode: 'dropped_out', note: 'Stopped attending in September', dedupeKey: 'remove:SEC1:S1', requestedByUid: 'teacher',
    });
    const audit = (await db().collection('audit_log').where('action', '==', 'learner.removalRequested').get()).docs.map((d) => d.data());
    // Audit rows never carry free text: the note stays on the request, so it is provably absent here.
    expect(audit).toHaveLength(1);
    expect(audit[0].details).toEqual({ sectionId: 'SEC1', gradeLevel: 7, lrn: '100000000001', name: 'Ana B. Cruz', reasonCode: 'dropped_out' });
  });
  it('needs a learner in this class, a known reason and a note', async () => {
    await expect(requestLearnerRemoval(deps('teacher'), removal({ studentId: 'S2' }))).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(requestLearnerRemoval(deps('teacher'), removal({ reasonCode: 'left' }))).rejects.toMatchObject({ code: 'invalid-argument', message: 'Choose a reason.' });
    await expect(requestLearnerRemoval(deps('teacher'), removal({ note: '  ' }))).rejects.toMatchObject({ code: 'invalid-argument', message: 'Add a short note.' });
    await expect(requestLearnerRemoval(deps('other'), removal())).rejects.toMatchObject({ code: 'permission-denied' });
    expect(await allRequests()).toEqual([]);
  });
  it('returns the waiting request when the same learner is sent twice', async () => {
    const first = await requestLearnerRemoval(deps('teacher'), removal());
    expect(await requestLearnerRemoval(deps('teacher'), removal({ note: 'Typed again' }))).toEqual(first);
    expect(await allRequests()).toHaveLength(1);
  });
});

// A waiting request is found by its key (class + learner). When the one found is somebody else's, the
// caller must never be handed an id that is not theirs: the earlier adviser's request is withdrawn if
// they no longer hold the class, and the caller's own is filed; if they still hold it, the caller is told.
describe('the same request from another adviser of the class', () => {
  const holding = (sectionId = 'SEC1') => ({ assignments: [{ role: 'adviser', schoolYear: year, sectionId, gradeLevel: 7 }] });
  const loseClass = (uid = 'teacher') => db().doc(`school_accounts/${uid}`).set({ assignments: [] });
  const auditOf = async (action) => (await db().collection('audit_log').where('action', '==', action).get()).docs.map((d) => ({ id: d.id, ...d.data() }));
  const ANOTHER = 'Another adviser of this class already sent this request.';
  beforeEach(async () => {
    await db().doc('school_accounts/newadv').set(holding()); // both people advise SEC1 until a test removes one
  });

  it('withdraws an earlier adviser’s add once the class has a new adviser, and files the new one in the same step', async () => {
    const old = await file('teacher');
    await loseClass();
    const mine = await file('newadv');
    expect(mine.status).toBe('pending');
    expect(mine.id).not.toBe(old.id);
    const stale = await get(`learner_change_requests/${old.id}`);
    expect(stale).toMatchObject({ status: 'withdrawn', decisionReason: 'Adviser changed', requestedByUid: 'teacher', kind: 'add' });
    expect(stale.withdrawnAt.toMillis()).toBeGreaterThan(0);
    for (const field of ['address', 'guardianContact', 'contactNumber']) expect(stale.student).not.toHaveProperty(field);
    expect(stale.student).toMatchObject({ lrn: '200000000001', guardianName: 'Maria Dela Cruz' });
    expect(await get(`learner_change_requests/${mine.id}`)).toMatchObject({ status: 'pending', requestedByUid: 'newadv', requestedByEmail: 'newadv@deped.gov.ph',
      kind: 'add', dedupeKey: 'add:SEC1:200000000001', student: expect.objectContaining({ address: '123 Rizal St.' }) });
    // Exactly one waiting request is left, it is the caller's, and it shows in the caller's list.
    expect(await waitingIds('admin')).toEqual([mine.id]);
    expect((await getLearnerRequests(deps('newadv'), { sectionId: 'SEC1' })).requests.map((r) => r.id)).toEqual([mine.id]);
    // The withdrawal is audited like a withdraw (section, grade, LRN, name; no free text), by whoever caused it.
    const withdrawn = await auditOf('learner.requestWithdrawn');
    expect(withdrawn).toHaveLength(1);
    expect(withdrawn[0]).toMatchObject({ targetType: 'learner_request', targetId: old.id, actorUid: 'newadv@deped.gov.ph' });
    expect(withdrawn[0].details).toEqual({ sectionId: 'SEC1', gradeLevel: 7, lrn: '200000000001', name: 'Juan Santos Dela Cruz Jr' });
    expect((await auditOf('learner.addRequested')).map((r) => r.targetId).sort()).toEqual([old.id, mine.id].sort());
    // A reviewer can approve the new request (the withdrawn one could never have been approved).
    expect(await resolveLearnerRequest(deps('admin'), { requestId: mine.id, approve: true })).toEqual({ ok: true, mode: 'new' });
    expect((await get(`learner_change_requests/${mine.id}`)).status).toBe('approved');
  });
  it('withdraws an earlier adviser’s removal request the same way', async () => {
    const old = await requestLearnerRemoval(deps('teacher'), removal());
    await loseClass();
    const mine = await requestLearnerRemoval(deps('newadv'), removal({ note: 'Seen by the new adviser' }));
    expect(mine.id).not.toBe(old.id);
    expect(await get(`learner_change_requests/${old.id}`)).toMatchObject({ status: 'withdrawn', decisionReason: 'Adviser changed', requestedByUid: 'teacher' });
    expect(await get(`learner_change_requests/${mine.id}`)).toMatchObject({ status: 'pending', requestedByUid: 'newadv', kind: 'remove',
      dedupeKey: 'remove:SEC1:S1', note: 'Seen by the new adviser' });
    expect(await waitingIds('admin')).toEqual([mine.id]);
    const withdrawn = await auditOf('learner.requestWithdrawn');
    expect(withdrawn).toHaveLength(1);
    expect(withdrawn[0]).toMatchObject({ targetId: old.id, actorUid: 'newadv@deped.gov.ph' });
    expect(withdrawn[0].details).toEqual({ sectionId: 'SEC1', gradeLevel: 7, lrn: '100000000001', name: 'Ana B. Cruz' });
    expect(await auditText()).not.toContain('Stopped attending in September');
    expect(await auditText()).not.toContain('Seen by the new adviser');
    expect(await resolveLearnerRequest(deps('admin'), { requestId: mine.id, approve: true })).toEqual({ ok: true, mode: 'removed' });
  });
  it.each([
    ['a disabled account', () => db().doc('school_accounts/teacher').set({ disabled: true, ...holding() })],
    ['a deleted account', () => db().doc('school_accounts/teacher').delete()],
    ['an assignment for another class', () => db().doc('school_accounts/teacher').set(holding('SEC2'))],
    ['an assignment from another school year', () => db().doc('school_accounts/teacher').set({ assignments: [{ role: 'adviser', schoolYear: '2025-2026', sectionId: 'SEC1', gradeLevel: 7 }] })],
  ])('treats %s as no longer advising the class', async (_label, change) => {
    const old = await file('teacher');
    await change();
    const mine = await file('newadv');
    expect(mine.id).not.toBe(old.id);
    expect(await get(`learner_change_requests/${old.id}`)).toMatchObject({ status: 'withdrawn', decisionReason: 'Adviser changed' });
    expect(await waitingIds('admin')).toEqual([mine.id]);
  });
  it('refuses the caller, and changes nothing, while the earlier adviser still holds the class', async () => {
    const first = await file('teacher');
    await expect(file('newadv')).rejects.toMatchObject({ code: 'already-exists', message: ANOTHER });
    const removalFirst = await requestLearnerRemoval(deps('teacher'), removal());
    await expect(requestLearnerRemoval(deps('newadv'), removal())).rejects.toMatchObject({ code: 'already-exists', message: ANOTHER });
    const all = await allRequests();
    expect(all.map((r) => r.id).sort()).toEqual([first.id, removalFirst.id].sort());
    for (const request of all) expect(request).toMatchObject({ status: 'pending', requestedByUid: 'teacher' });
    expect(all.find((r) => r.id === first.id).student).toMatchObject({ address: '123 Rizal St.', contactNumber: '09181234567' });
    expect(await auditOf('learner.requestWithdrawn')).toEqual([]);
    expect(await auditOf('learner.addRequested')).toHaveLength(1);
    expect(await auditOf('learner.removalRequested')).toHaveLength(1);
    expect(await getLearnerRequests(deps('newadv'), { sectionId: 'SEC1' })).toEqual({ requests: [] });
  });
  it('still returns the same person’s own waiting request when another adviser also holds the class', async () => {
    const first = await file('teacher');
    expect(await file('teacher')).toEqual(first);
    const removalFirst = await requestLearnerRemoval(deps('teacher'), removal());
    expect(await requestLearnerRemoval(deps('teacher'), removal({ note: 'Typed again' }))).toEqual(removalFirst);
    expect(await allRequests()).toHaveLength(2);
    expect(await auditOf('learner.requestWithdrawn')).toEqual([]);
  });
  it('leaves the earlier request waiting when the new one cannot be filed', async () => {
    const old = await file('teacher');
    await loseClass();
    for (let i = 0; i < 20; i++) await file('newadv', { student: form({ lrn: `3000000000${String(i).padStart(2, '0')}` }) });
    await expect(file('newadv')).rejects.toMatchObject({ code: 'resource-exhausted' });
    // The withdrawal is part of the same transaction, so a refused filing withdraws nothing.
    expect(await get(`learner_change_requests/${old.id}`)).toMatchObject({ status: 'pending', requestedByUid: 'teacher' });
    expect((await get(`learner_change_requests/${old.id}`)).student).toMatchObject({ address: '123 Rizal St.' });
    expect(await auditOf('learner.requestWithdrawn')).toEqual([]);
  }, 60000);
  it('lets the earlier adviser file again once they hold the class again', async () => {
    const old = await file('teacher');
    await loseClass();
    const mine = await file('newadv');
    await db().doc('school_accounts/teacher').set(holding()); // the class is theirs again, and newadv still holds it too
    await expect(file('teacher')).rejects.toMatchObject({ code: 'already-exists', message: ANOTHER });
    expect((await get(`learner_change_requests/${old.id}`)).status).toBe('withdrawn');
    expect((await get(`learner_change_requests/${mine.id}`)).status).toBe('pending');
  });
});

describe('withdrawing and listing as the adviser', () => {
  it('lets the adviser withdraw while waiting and clears the address and phone numbers', async () => {
    const { id } = await file();
    await withdrawLearnerRequest(deps('teacher'), { requestId: id });
    const saved = await get(`learner_change_requests/${id}`);
    expect(saved).toMatchObject({ status: 'withdrawn', decisionReason: 'Withdrawn by the adviser' });
    for (const field of ['address', 'guardianContact', 'contactNumber']) expect(saved.student).not.toHaveProperty(field);
    expect(saved.student).toMatchObject({ lrn: '200000000001', birthdate: '2012-05-01', guardianName: 'Maria Dela Cruz' });
    await expect(withdrawLearnerRequest(deps('teacher'), { requestId: id })).rejects.toMatchObject({ code: 'failed-precondition' });
  });
  it('records the withdrawal in the audit log with the section, grade, LRN and name only', async () => {
    const { id } = await file();
    await withdrawLearnerRequest(deps('teacher'), { requestId: id });
    const audit = (await db().collection('audit_log').where('action', '==', 'learner.requestWithdrawn').get()).docs.map((d) => d.data());
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ targetType: 'learner_request', targetId: id, actorUid: 'teacher@deped.gov.ph' });
    expect(audit[0].details).toEqual({ sectionId: 'SEC1', gradeLevel: 7, lrn: '200000000001', name: 'Juan Santos Dela Cruz Jr' });
  });
  it("hides other people's requests", async () => {
    const { id } = await file();
    await expect(withdrawLearnerRequest(deps('other'), { requestId: id })).rejects.toMatchObject({ code: 'not-found' });
  });
});

describe('text fields must be text', () => {
  it('refuses non-text input for both filings before the rate limit or any request is touched', async () => {
    const refused = { code: 'invalid-argument', message: 'Check the form and try again.' };
    const bad = [
      () => requestLearnerAdd(deps('teacher'), addInput({ student: { ...form(), lastName: { a: 1 } } })),
      () => requestLearnerAdd(deps('teacher'), addInput({ student: { ...form(), lrn: 200000000001 } })), // a number, not text
      () => requestLearnerAdd(deps('teacher'), addInput({ student: 'x' })),
      () => requestLearnerAdd(deps('teacher'), addInput({ enrollType: 5 })),
      () => requestLearnerRemoval(deps('teacher'), removal({ note: { x: 1 } })),
      () => requestLearnerRemoval(deps('teacher'), removal({ reasonCode: ['dropped_out'] })),
    ];
    for (const attempt of bad) await expect(attempt()).rejects.toMatchObject(refused);
    expect(await allRequests()).toEqual([]);
    expect((await db().doc('rate_limits/teacher').get()).exists).toBe(false);
    expect((await db().collection('audit_log').get()).size).toBe(0);
  });
});

describe('account deletion', () => {
  it('withdraws pending requests and clears the address when an adviser deletes their account', async () => {
    const { id } = await file();
    await deleteSchoolAccess(db(), 'teacher');
    const saved = await get(`learner_change_requests/${id}`);
    expect(saved).toMatchObject({ status: 'withdrawn', decisionReason: 'Account deleted' });
    expect(saved.student).not.toHaveProperty('address');
  });
});

describe('what reviewers see', () => {
  it('scopes the waiting list and the count to the grades a reviewer covers', async () => {
    const grade7 = await file('teacher');
    const grade8 = await requestLearnerAdd(deps('eight'), addInput({ sectionId: 'SEC8', student: form({ lrn: '200000000002' }) }));
    expect(await waitingIds('admin')).toEqual([grade7.id, grade8.id]);
    expect(await waitingIds('coord7')).toEqual([grade7.id]);
    expect(await waitingIds('ca7')).toEqual([grade7.id]);
    expect(await waitingIds('coord8')).toEqual([grade8.id]);
    expect(await waitingIds('teacher')).toEqual([]);
    expect(await getLearnerRequestCount(deps('admin'))).toEqual({ count: 2, truncated: false });
    expect(await getLearnerRequestCount(deps('coord7'))).toEqual({ count: 1, truncated: false });
    expect(await getLearnerRequestCount(deps('teacher'))).toEqual({ count: 0, truncated: false });
  });
  it('flags an LRN already in SIMS and shows whose it is only to reviewers who may see it', async () => {
    const inOtherSection = await file('teacher', { student: form({ lrn: '100000000002' }) }); // S2, Grade 7, Mabini
    const unassigned = await file('teacher', { student: form({ lrn: '100000000003' }) }); // S3, no enrollment
    const find = (rows, id) => rows.find((r) => r.id === id);
    const coordinator = (await listLearnerRequests(deps('coord7'), { view: 'waiting' })).requests;
    expect(find(coordinator, inOtherSection.id)).toMatchObject({ decidable: true,
      existing: { exists: true, needsAdmin: false, displayName: 'Ben Dy', currentGrade: 7, currentSection: 'Mabini', learnerStatus: 'active' } });
    expect(find(coordinator, unassigned.id)).toMatchObject({ decidable: false, existing: { exists: true, needsAdmin: true } });
    expect(find(coordinator, unassigned.id).existing).not.toHaveProperty('displayName');
    const admin = (await listLearnerRequests(deps('admin'), { view: 'waiting' })).requests;
    expect(find(admin, unassigned.id)).toMatchObject({ decidable: true,
      existing: { needsAdmin: false, displayName: 'Cara Lim', currentGrade: null, learnerStatus: 'active' } });
    expect(await getLearnerRequestCount(deps('coord7'))).toEqual({ count: 1, truncated: false });
    expect(await getLearnerRequestCount(deps('admin'))).toEqual({ count: 2, truncated: false });
  });
  it('pages through decided requests for the reviewer’s grades, newest first', async () => {
    const decided = (id, over) => db().doc(`learner_change_requests/${id}`).set({ kind: 'add', status: 'approved', schoolYear: year, sectionId: 'SEC1', gradeLevel: 7,
      displayName: id, student: { lrn: '400000000000' }, requestedByUid: 'teacher', requestedByName: 'Tina Teacher', decidedByName: 'Ada Admin', decisionReason: 'Approved',
      createdAt: Timestamp.fromMillis(Date.UTC(2026, 8, 1)), decidedAt: Timestamp.fromMillis(Date.UTC(2026, 9, 1)), ...over });
    const base = Date.UTC(2026, 9, 1);
    for (let i = 0; i < 52; i++) await decided(`d${String(i).padStart(2, '0')}`, { decidedAt: Timestamp.fromMillis(base + i * 1000) });
    await decided('g8', { gradeLevel: 8, sectionId: 'SEC8', decidedAt: Timestamp.fromMillis(base + 60000) });
    await decided('w1', { status: 'withdrawn', withdrawnAt: Timestamp.fromMillis(base + 61000) });
    await db().doc('learner_change_requests/w1').update({ decidedAt: FieldValue.delete() }); // withdrawn requests have none
    const first = await listLearnerRequests(deps('coord7'), { view: 'decided' });
    expect(first.requests).toHaveLength(50);
    expect(first.requests[0].id).toBe('d51');
    expect(first.requests[49].id).toBe('d02');
    expect(first.nextCursor).toEqual({ ms: base + 2000, id: 'd02' });
    const second = await listLearnerRequests(deps('coord7'), { view: 'decided', cursor: first.nextCursor });
    expect(second.requests.map((r) => r.id)).toEqual(['d01', 'd00']);
    expect(second.nextCursor).toBeNull();
    const admin = (await listLearnerRequests(deps('admin'), { view: 'decided' })).requests.map((r) => r.id);
    expect(admin[0]).toBe('g8');
    expect(admin).not.toContain('w1');
    expect((await listLearnerRequests(deps('coord8'), { view: 'decided' })).requests.map((r) => r.id)).toEqual(['g8']);
    expect((await listLearnerRequests(deps('teacher'), { view: 'decided' })).requests).toEqual([]);
  }, 30000);
  it('shows coordinators nothing once the school year has ended, but keeps Decided readable for administrators', async () => {
    const { id } = await file('teacher');
    await seedDecided('done1');
    // Before the year ends everything is visible, so the empty lists below are not vacuous.
    expect(await waitingIds('coord7')).toEqual([id]);
    expect(await getLearnerRequestCount(deps('coord7'))).toEqual({ count: 1, truncated: false });
    expect((await decidedRowsOf('coord7')).map((r) => r.id)).toEqual(['done1']);
    await db().doc(`school_years/${year}`).set({ endedAt: new Date() });
    for (const uid of ['admin', 'coord7']) {
      expect(await listLearnerRequests(deps(uid), { view: 'waiting' })).toMatchObject({ ended: true, requests: [], truncated: false, nextCursor: null });
      expect(await getLearnerRequestCount(deps(uid))).toEqual({ count: 0, truncated: false });
    }
    for (const uid of ['coord7', 'ca7']) {
      expect(await listLearnerRequests(deps(uid), { view: 'decided' })).toMatchObject({ ended: true, requests: [], truncated: false, nextCursor: null });
    }
    const admin = await listLearnerRequests(deps('admin'), { view: 'decided' });
    expect(admin.ended).toBe(true);
    expect(admin.requests.map((r) => r.id)).toEqual(['done1']);
  });
  it('tells a coordinator only that an enrolled learner in another grade needs an administrator', async () => {
    // S4 is enrolled in Grade 8 (Eight); the request is for Grade 7, so coord7 covers the request but not the learner.
    const { id } = await file('teacher', { student: form({ lrn: '100000000004' }) });
    const coordinator = rowOf(await waitingRowsOf('coord7'), id);
    expect(coordinator.decidable).toBe(false);
    expect(coordinator.existing).toEqual({ exists: true, needsAdmin: true, enrolledHere: false });
    const admin = rowOf(await waitingRowsOf('admin'), id);
    expect(admin.decidable).toBe(true);
    expect(admin.existing).toEqual({ exists: true, needsAdmin: false, enrolledHere: false, displayName: 'Dan Ong', learnerStatus: 'active',
      currentGrade: 8, currentSection: 'Eight' });
    expect(await getLearnerRequestCount(deps('coord7'))).toEqual({ count: 0, truncated: false });
    expect(await getLearnerRequestCount(deps('admin'))).toEqual({ count: 1, truncated: false });
  });
  it('tells a coordinator only that an Unassigned learner needs an administrator', async () => {
    const { id } = await file('teacher', { student: form({ lrn: '100000000003' }) }); // S3, no enrollment
    const coordinator = rowOf(await waitingRowsOf('coord7'), id);
    expect(coordinator.decidable).toBe(false);
    expect(coordinator.existing).toEqual({ exists: true, needsAdmin: true, enrolledHere: false });
    const admin = rowOf(await waitingRowsOf('admin'), id);
    expect(admin.decidable).toBe(true);
    expect(admin.existing).toEqual({ exists: true, needsAdmin: false, enrolledHere: false, displayName: 'Cara Lim', learnerStatus: 'active',
      currentGrade: null, currentSection: '' });
  });
  it('treats an LRN held by two learners as ambiguous, for administrators only to decide, with no name shown', async () => {
    await db().doc('students/S3b').set({ lrn: '100000000003', firstName: 'Clara', lastName: 'Lim', sex: 'F', status: 'active', gradeLevel: null, scopeSchoolYear: null });
    const { id } = await file('teacher', { student: form({ lrn: '100000000003' }) });
    const coordinator = rowOf(await waitingRowsOf('coord7'), id);
    expect(coordinator.decidable).toBe(false);
    expect(coordinator.existing).toEqual({ exists: true, ambiguous: true, needsAdmin: true });
    const admin = rowOf(await waitingRowsOf('admin'), id);
    expect(admin.decidable).toBe(true);
    expect(admin.existing).toEqual({ exists: true, ambiguous: true, needsAdmin: false });
    expect(await getLearnerRequestCount(deps('coord7'))).toEqual({ count: 0, truncated: false });
    expect(await getLearnerRequestCount(deps('admin'))).toEqual({ count: 1, truncated: false });
  });
  it('never lets someone decide their own request, even when they cover its grade', async () => {
    await db().doc('users/teacher@deped.gov.ph').set({ uid: 'teacher', role: 'glc', gradeLevel: 7 });
    const { id } = await file('teacher');
    expect(await waitingIds('teacher')).toEqual([]);
    expect(await getLearnerRequestCount(deps('teacher'))).toEqual({ count: 0, truncated: false });
    // Another coordinator for the same grade still sees and counts it.
    expect(await waitingIds('coord7')).toEqual([id]);
    expect(await getLearnerRequestCount(deps('coord7'))).toEqual({ count: 1, truncated: false });
  });
  it('never returns the address or phone numbers of a decided request, even if a stored one still has them', async () => {
    // (Decided reviewer rows now carry no learner form at all; the adviser's own list is where the contact-free form is checked.)
    const stored = { lrn: '400000000001', lastName: 'Reyes', firstName: 'Rita', middleName: 'Q', extName: '', sex: 'F', birthdate: '2012-01-01',
      address: '9 Mabini St.', guardianName: 'Rosa Reyes', guardianRelationship: 'Mother', guardianContact: '09171111111', contactNumber: '09182222222' };
    const kept = { lrn: '400000000001', lastName: 'Reyes', firstName: 'Rita', middleName: 'Q', extName: '', sex: 'F', birthdate: '2012-01-01',
      guardianName: 'Rosa Reyes', guardianRelationship: 'Mother' };
    // Simulates a bad write: decided requests whose contact fields were never cleared.
    await seedDecided('ok1', { student: stored, decidedAt: Timestamp.fromMillis(decidedBase + 1000) });
    await seedDecided('no1', { status: 'rejected', student: stored, decisionReason: 'Not eligible', decidedAt: Timestamp.fromMillis(decidedBase) });
    for (const uid of ['coord7', 'admin']) {
      const rows = await decidedRowsOf(uid);
      expect(rows.map((r) => r.id)).toEqual(['ok1', 'no1']);
      // A decided row never carries the learner form (birthdate, sex, guardian), contact-free or not.
      for (const row of rows) expect(row).not.toHaveProperty('student');
      expect(JSON.stringify(rows)).not.toContain('Rosa Reyes');
    }
    const mine = (await getLearnerRequests(deps('teacher'), { sectionId: 'SEC1' })).requests;
    expect(rowOf(mine, 'no1').student).toEqual(kept);
    expect(rowOf(mine, 'ok1').student).toBeUndefined();
    // A pending add is the one thing that still returns the whole form: reviewers need it to decide.
    const pending = await file('teacher');
    expect(rowOf(await waitingRowsOf('coord7'), pending.id).student).toEqual(form());
    // The stored documents are untouched: this is a guard on what leaves the server.
    expect(await get('learner_change_requests/no1')).toMatchObject({ student: { address: '9 Mabini St.', contactNumber: '09182222222' } });
  });
  it('gives a request’s form to reviewers only while it is waiting, and to the adviser only for a rejected add', async () => {
    const approved = await file('teacher', { student: form({ lrn: '200000000001' }) });
    const rejected = await file('teacher', { student: form({ lrn: '200000000002', firstName: 'Rejected' }) });
    const waiting = await file('teacher', { student: form({ lrn: '200000000003' }) });
    const removal1 = await requestLearnerRemoval(deps('teacher'), removal());
    await resolveLearnerRequest(deps('admin'), { requestId: approved.id, approve: true });
    await resolveLearnerRequest(deps('admin'), { requestId: rejected.id, approve: false, reason: 'Check the LRN' });
    await resolveLearnerRequest(deps('admin'), { requestId: removal1.id, approve: false, reason: 'Still attending' });
    for (const uid of ['admin', 'coord7', 'ca7']) {
      const decided = await decidedRowsOf(uid);
      expect(decided.map((r) => r.id).sort()).toEqual([approved.id, rejected.id, removal1.id].sort());
      for (const row of decided) expect(row, `${uid} ${row.status}`).not.toHaveProperty('student');
      const stillWaiting = rowOf(await waitingRowsOf(uid), waiting.id);
      expect(stillWaiting.student).toEqual(form({ lrn: '200000000003' })); // reviewers need the whole form to decide
    }
    const mine = (await getLearnerRequests(deps('teacher'), { sectionId: 'SEC1' })).requests;
    expect(rowOf(mine, rejected.id).student).toMatchObject({ lrn: '200000000002', firstName: 'Rejected', birthdate: '2012-05-01' });
    expect(rowOf(mine, rejected.id).student).not.toHaveProperty('address');
    expect(rowOf(mine, approved.id).student).toBeUndefined();
  });
  it('refuses a page cursor that is not a real point in time', async () => {
    const page = (cursor) => listLearnerRequests(deps('coord7'), { view: 'decided', cursor });
    const refused = { code: 'invalid-argument', message: 'Choose a valid page.' };
    await expect(page({ ms: 9007199254740991, id: 'x' })).rejects.toMatchObject(refused);
    await expect(page({ ms: -1, id: 'x' })).rejects.toMatchObject(refused);
    await expect(page({ ms: 253402300800000, id: 'x' })).rejects.toMatchObject(refused);
    // The ends of the range are real timestamps.
    expect((await page({ ms: 0, id: 'x' })).requests).toEqual([]);
    expect((await page({ ms: 253402300799999, id: 'x' })).requests).toEqual([]);
  });
  it('gives no empty extra page when the decided requests fit exactly in one', async () => {
    const make = (count) => Promise.all(Array.from({ length: count }, (_, i) =>
      seedDecided(`p${String(i).padStart(2, '0')}`, { decidedAt: Timestamp.fromMillis(decidedBase + i * 1000) })));
    await make(50);
    const full = await listLearnerRequests(deps('coord7'), { view: 'decided' });
    expect(full.requests).toHaveLength(50);
    expect(full.nextCursor).toBeNull();
    // One more, older than the rest, goes to a second page of one.
    await seedDecided('older', { decidedAt: Timestamp.fromMillis(decidedBase - 1000) });
    const first = await listLearnerRequests(deps('coord7'), { view: 'decided' });
    expect(first.requests).toHaveLength(50);
    expect(first.requests[0].id).toBe('p49');
    expect(first.requests[49].id).toBe('p00');
    expect(first.nextCursor).toEqual({ ms: decidedBase, id: 'p00' });
    const second = await listLearnerRequests(deps('coord7'), { view: 'decided', cursor: first.nextCursor });
    expect(second.requests.map((r) => r.id)).toEqual(['older']);
    expect(second.nextCursor).toBeNull();
  }, 30000);
});

describe('a long waiting list', () => {
  // Pending Grade 8 adds written straight to the collection, all older than anything the handlers file.
  const longAgo = Date.UTC(2020, 0, 1);
  const seedPendingGrade8 = async (count) => {
    const batch = db().batch();
    for (let i = 0; i < count; i++) {
      const id = `old${String(i).padStart(3, '0')}`;
      batch.set(db().doc(`learner_change_requests/${id}`), {
        kind: 'add', status: 'pending', schoolYear: year, sectionId: 'SEC8', gradeLevel: 8, sectionName: 'Eight', displayName: id,
        student: { lrn: `5${String(i).padStart(11, '0')}` }, enrollType: 'new', requestedByUid: 'eight', requestedByName: 'Eli Eight',
        requestedByEmail: 'eight@deped.gov.ph', createdAt: Timestamp.fromMillis(longAgo + i * 1000),
      });
    }
    await batch.commit();
  };
  // Deps whose db records every collection() call, to see which collections a count reads.
  const recording = (uid, reads) => ({ ...deps(uid), db: new Proxy(db(), { get: (target, prop) => {
    const value = Reflect.get(target, prop);
    if (typeof value !== 'function') return value;
    return prop === 'collection' ? (name) => { reads.push(name); return target.collection(name); } : value.bind(target);
  } }) });

  it('does not starve a coordinator when older requests for another grade fill the first 200', async () => {
    await seedPendingGrade8(205);
    const mine = await file('teacher'); // Grade 7, newer than all 205 of Grade 8
    const list = await listLearnerRequests(deps('coord7'), { view: 'waiting' });
    expect(list.requests.map((r) => r.id)).toEqual([mine.id]);
    expect(list.truncated).toBe(false);
    expect(await getLearnerRequestCount(deps('coord7'))).toEqual({ count: 1, truncated: false });
    expect(await waitingIds('ca7')).toEqual([mine.id]);
    // Grade 8's own coordinator does face the long list, and is told it was cut.
    const grade8 = await listLearnerRequests(deps('coord8'), { view: 'waiting' });
    expect(grade8.requests).toHaveLength(200);
    expect(grade8.requests[0].id).toBe('old000');
    expect(grade8.truncated).toBe(true);
    expect(await getLearnerRequestCount(deps('coord8'))).toEqual({ count: 200, truncated: true });
  }, 60000);
  it('cuts an administrator’s waiting list at 200 and says so, and counts the same 200', async () => {
    await seedPendingGrade8(205);
    await file('teacher');
    const list = await listLearnerRequests(deps('admin'), { view: 'waiting' });
    expect(list.requests).toHaveLength(200);
    expect(list.requests[0].id).toBe('old000');
    expect(list.requests[199].id).toBe('old199');
    expect(list.truncated).toBe(true);
    expect(list.nextCursor).toBeNull();
    expect(await getLearnerRequestCount(deps('admin'))).toEqual({ count: 200, truncated: true });
    // Only the Waiting list is ever cut.
    expect((await listLearnerRequests(deps('admin'), { view: 'decided' })).truncated).toBe(false);
  }, 60000);
  it('does not call exactly 200 waiting requests a cut list, but 201 is', async () => {
    await seedPendingGrade8(200);
    expect(await getLearnerRequestCount(deps('admin'))).toEqual({ count: 200, truncated: false });
    expect(await getLearnerRequestCount(deps('coord8'))).toEqual({ count: 200, truncated: false });
    const list = await listLearnerRequests(deps('admin'), { view: 'waiting' });
    expect(list.requests).toHaveLength(200);
    expect(list.truncated).toBe(false);
    await file('teacher');
    expect(await getLearnerRequestCount(deps('admin'))).toEqual({ count: 200, truncated: true });
    expect((await listLearnerRequests(deps('admin'), { view: 'waiting' })).truncated).toBe(true);
  }, 60000);
  it('reads every grade a reviewer covers, once, however many ways they cover it', async () => {
    // coord7 is a Grade 7 coordinator and also a Curriculum Adviser for Grades 7 and 8.
    await db().doc('school_accounts/coord7').set({ assignments: [
      { role: 'curriculum_adviser', schoolYear: year, gradeLevel: 7 }, { role: 'curriculum_adviser', schoolYear: year, gradeLevel: 8 }] });
    const grade7 = await file('teacher');
    const grade8 = await requestLearnerAdd(deps('eight'), addInput({ sectionId: 'SEC8', student: form({ lrn: '200000000002' }) }));
    expect(await waitingIds('coord7')).toEqual([grade7.id, grade8.id]);
    expect(await getLearnerRequestCount(deps('coord7'))).toEqual({ count: 2, truncated: false });
  });
  it('counts for an administrator without looking up any existing learner, and still does for a coordinator', async () => {
    const { id } = await file('teacher', { student: form({ lrn: '100000000003' }) }); // S3, Unassigned: only an administrator can decide it
    const adminReads = [];
    expect(await getLearnerRequestCount(recording('admin', adminReads))).toEqual({ count: 1, truncated: false });
    expect(adminReads).not.toContain('students');
    const coordinatorReads = [];
    expect(await getLearnerRequestCount(recording('coord7', coordinatorReads))).toEqual({ count: 0, truncated: false });
    expect(coordinatorReads).toContain('students');
    // The Waiting list itself still carries the lookup for an administrator.
    const row = rowOf(await waitingRowsOf('admin'), id);
    expect(row.decidable).toBe(true);
    expect(row.existing).toMatchObject({ exists: true, needsAdmin: false, displayName: 'Cara Lim' });
  });
});

describe('approving an add', () => {
  it('creates the learner and enrollment, clears the contact fields and tells the adviser', async () => {
    const { id } = await file();
    await resolveLearnerRequest(deps('admin'), { requestId: id, approve: true });
    const [created] = (await db().collection('students').where('lrn', '==', '200000000001').get()).docs;
    expect(created.data()).toEqual({
      lrn: '200000000001', lastName: 'Dela Cruz', firstName: 'Juan', middleName: 'Santos', extName: 'Jr', sex: 'M', birthdate: '2012-05-01',
      address: '123 Rizal St.', guardianName: 'Maria Dela Cruz', guardianRelationship: 'Mother', guardianContact: '09171234567', contactNumber: '09181234567',
      status: 'active', documents: { form137: false, birthCert: false, goodMoral: false, form138: false }, createdAt: '2026-10-22',
      gradeLevel: 7, scopeSchoolYear: year,
    });
    expect(await get(`enrollments/${created.id}_${year}`)).toEqual({ studentId: created.id, schoolYear: year, gradeLevel: 7, sectionId: 'SEC1',
      track: null, strand: null, type: 'new', dateEnrolled: '2026-10-22', status: 'enrolled' });
    const request = await get(`learner_change_requests/${id}`);
    expect(request).toMatchObject({ status: 'approved', decidedByUid: 'admin', decidedByName: 'Ada Admin', decisionReason: 'Approved' });
    for (const field of ['address', 'guardianContact', 'contactNumber']) expect(request.student).not.toHaveProperty(field);
    expect(await inboxOf('teacher')).toEqual([expect.objectContaining({ type: 'learner_request', requestId: id, title: 'Learner added',
      body: 'Juan Santos Dela Cruz Jr was added to Grade 7 · Rizal.' })]);
    const audit = (await db().collection('audit_log').where('action', '==', 'learner.addApproved').get()).docs.map((d) => d.data());
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ targetType: 'learner_request', targetId: id, actorUid: 'admin@school.test' });
    // Audit rows never carry free text: only the LRN, name, outcome, the learner record, section and grade.
    expect(audit[0].details).toEqual({ lrn: '200000000001', name: 'Juan Santos Dela Cruz Jr', mode: 'new', studentId: created.id,
      sectionId: 'SEC1', gradeLevel: 7, previousSectionId: null, previousStatus: null });
  });
  it('tells the caller what the approval did', async () => {
    const created = await file('teacher');
    expect(await resolveLearnerRequest(deps('admin'), { requestId: created.id, approve: true })).toEqual({ ok: true, mode: 'new' });
    const moved = await file('teacher', { student: form({ lrn: '100000000002' }) });
    expect(await resolveLearnerRequest(deps('coord7'), { requestId: moved.id, approve: true })).toEqual({ ok: true, mode: 'moved' });
    const enrolled = await file('teacher', { student: form({ lrn: '100000000003' }) });
    expect(await resolveLearnerRequest(deps('admin'), { requestId: enrolled.id, approve: true })).toEqual({ ok: true, mode: 'enrolled' });
  });
  it('lets a stale card approve an Add that moves the learner another approval just created', async () => {
    // Two advisers' requests for one LRN in different classes: the second approval moves the learner the first created.
    const first = await file('teacher');
    const second = await requestLearnerAdd(deps('other'), addInput({ sectionId: 'SEC2' }));
    expect(await resolveLearnerRequest(deps('admin'), { requestId: first.id, approve: true })).toEqual({ ok: true, mode: 'new' });
    expect(await resolveLearnerRequest(deps('admin'), { requestId: second.id, approve: true })).toEqual({ ok: true, mode: 'moved' });
    const [created] = (await db().collection('students').where('lrn', '==', '200000000001').get()).docs;
    const audit = (await db().collection('audit_log').where('action', '==', 'learner.addApproved').where('targetId', '==', second.id).get()).docs.map((d) => d.data());
    expect(audit[0].details).toEqual({ lrn: '200000000001', name: 'Juan Santos Dela Cruz Jr', mode: 'moved', studentId: created.id,
      sectionId: 'SEC2', gradeLevel: 7, previousSectionId: 'SEC1', previousStatus: 'enrolled' });
  });
  it('lets a coordinator and a Curriculum Adviser for the grade approve', async () => {
    const a = await file('teacher');
    await resolveLearnerRequest(deps('coord7'), { requestId: a.id, approve: true, reason: 'Checked the papers' });
    expect(await get(`learner_change_requests/${a.id}`)).toMatchObject({ status: 'approved', decidedByUid: 'coord7', decisionReason: 'Checked the papers' });
    const b = await file('teacher', { student: form({ lrn: '200000000002' }) });
    await resolveLearnerRequest(deps('ca7'), { requestId: b.id, approve: true });
    expect((await get(`learner_change_requests/${b.id}`)).status).toBe('approved');
    // The reason stays on the request; no audit row carries it.
    const approvals = (await db().collection('audit_log').where('action', '==', 'learner.addApproved').get()).docs;
    expect(approvals).toHaveLength(2);
    expect(await auditText()).not.toContain('Checked the papers');
  });
  it('refuses a coordinator for another grade, an adviser and the requester', async () => {
    const { id } = await file();
    for (const uid of ['coord8', 'other', 'teacher']) {
      await expect(resolveLearnerRequest(deps(uid), { requestId: id, approve: true })).rejects.toMatchObject({ code: 'permission-denied' });
    }
    expect((await get(`learner_change_requests/${id}`)).status).toBe('pending');
  });
  it('moves a learner enrolled in another section, keeping their details and enrollment date', async () => {
    const { id } = await file('teacher', { student: form({ lrn: '100000000002', lastName: 'Typed Differently' }) });
    expect(await resolveLearnerRequest(deps('coord7'), { requestId: id, approve: true })).toEqual({ ok: true, mode: 'moved' });
    expect(await get('enrollments/S2_2026-2027')).toMatchObject({ sectionId: 'SEC1', gradeLevel: 7, type: 'returning', dateEnrolled: '2026-06-02', status: 'enrolled' });
    expect(await get('students/S2')).toMatchObject({ lastName: 'Dy', status: 'active', gradeLevel: 7, scopeSchoolYear: year });
    expect((await db().collection('students').where('lrn', '==', '100000000002').get()).size).toBe(1);
    const audit = (await db().collection('audit_log').where('action', '==', 'learner.addApproved').get()).docs.map((d) => d.data());
    expect(audit).toHaveLength(1);
    expect(audit[0].details).toEqual({ lrn: '100000000002', name: 'Juan Santos Typed Differently Jr', mode: 'moved', studentId: 'S2',
      sectionId: 'SEC1', gradeLevel: 7, previousSectionId: 'SEC2', previousStatus: 'enrolled' });
  });
  it('enrolls an Unassigned learner only when an Administrator approves', async () => {
    const { id } = await file('teacher', { student: form({ lrn: '100000000003' }), enrollType: 'returning' });
    await expect(resolveLearnerRequest(deps('coord7'), { requestId: id, approve: true }))
      .rejects.toMatchObject({ code: 'permission-denied', message: 'An administrator must approve this request.' });
    expect(await resolveLearnerRequest(deps('admin'), { requestId: id, approve: true })).toEqual({ ok: true, mode: 'enrolled' });
    expect(await get('enrollments/S3_2026-2027')).toMatchObject({ sectionId: 'SEC1', gradeLevel: 7, type: 'returning', dateEnrolled: '2026-10-22', status: 'enrolled' });
    expect(await get('students/S3')).toMatchObject({ status: 'active', gradeLevel: 7, scopeSchoolYear: year, firstName: 'Cara' });
    // S3 had no enrollment this year, so nothing was overwritten.
    const audit = (await db().collection('audit_log').where('action', '==', 'learner.addApproved').get()).docs.map((d) => d.data());
    expect(audit[0].details).toEqual({ lrn: '100000000003', name: 'Juan Santos Dela Cruz Jr', mode: 'enrolled', studentId: 'S3',
      sectionId: 'SEC1', gradeLevel: 7, previousSectionId: null, previousStatus: null });
  });
  it('brings a Dropped learner back for an Administrator', async () => {
    await db().doc('students/S3').update({ status: 'dropped' });
    const { id } = await file('teacher', { student: form({ lrn: '100000000003' }) });
    await resolveLearnerRequest(deps('admin'), { requestId: id, approve: true });
    expect(await get('students/S3')).toMatchObject({ status: 'active', gradeLevel: 7 });
  });
  it('records an approval that re-enrolls a Dropped learner as "enrolled", with the dropped enrollment it overwrote', async () => {
    await db().doc('students/S3').update({ status: 'dropped' });
    await db().doc('enrollments/S3_2026-2027').set({ studentId: 'S3', sectionId: 'SEC2', schoolYear: year, gradeLevel: 7, type: 'returning', dateEnrolled: '2026-06-04', status: 'dropped' });
    const { id } = await file('teacher', { student: form({ lrn: '100000000003' }), enrollType: 'returning' });
    await resolveLearnerRequest(deps('admin'), { requestId: id, approve: true });
    expect(await get('enrollments/S3_2026-2027')).toMatchObject({ sectionId: 'SEC1', status: 'enrolled', type: 'returning', dateEnrolled: '2026-10-22' });
    const audit = (await db().collection('audit_log').where('action', '==', 'learner.addApproved').get()).docs.map((d) => d.data());
    expect(audit).toHaveLength(1);
    // The old dropped enrollment (SEC2) was replaced, so the row says where it was and what it was.
    expect(audit[0].details).toEqual({ lrn: '100000000003', name: 'Juan Santos Dela Cruz Jr', mode: 'enrolled', studentId: 'S3',
      sectionId: 'SEC1', gradeLevel: 7, previousSectionId: 'SEC2', previousStatus: 'dropped' });
  });
  it.each(['dropped', 'transferred'])('records the %s same-year enrollment that a re-enrollment overwrites, from another grade', async (status) => {
    await db().doc('students/S4').update({ status });
    await db().doc('enrollments/S4_2026-2027').update({ status });
    const { id } = await file('teacher', { student: form({ lrn: '100000000004' }) });
    expect(await resolveLearnerRequest(deps('admin'), { requestId: id, approve: true })).toEqual({ ok: true, mode: 'enrolled' });
    expect(await get('enrollments/S4_2026-2027')).toMatchObject({ sectionId: 'SEC1', gradeLevel: 7, status: 'enrolled' });
    expect(await get('students/S4')).toMatchObject({ status: 'active', gradeLevel: 7 });
    const audit = (await db().collection('audit_log').where('action', '==', 'learner.addApproved').get()).docs.map((d) => d.data());
    expect(audit).toHaveLength(1);
    expect(audit[0].details).toEqual({ lrn: '100000000004', name: 'Juan Santos Dela Cruz Jr', mode: 'enrolled', studentId: 'S4',
      sectionId: 'SEC1', gradeLevel: 7, previousSectionId: 'SEC8', previousStatus: status });
  });
  it('leaves a learner from another grade to an Administrator', async () => {
    const { id } = await file('teacher', { student: form({ lrn: '100000000004' }) });
    await expect(resolveLearnerRequest(deps('coord7'), { requestId: id, approve: true })).rejects.toMatchObject({ code: 'permission-denied' });
    await resolveLearnerRequest(deps('admin'), { requestId: id, approve: true });
    expect(await get('enrollments/S4_2026-2027')).toMatchObject({ sectionId: 'SEC1', gradeLevel: 7 });
    expect(await get('students/S4')).toMatchObject({ gradeLevel: 7, scopeSchoolYear: year });
  });
  it('refuses a learner who joined this class meanwhile and leaves the request waiting', async () => {
    const { id } = await file('teacher', { student: form({ lrn: '100000000002' }) });
    await db().doc('enrollments/S2_2026-2027').update({ sectionId: 'SEC1' });
    await expect(resolveLearnerRequest(deps('admin'), { requestId: id, approve: true })).rejects.toMatchObject({ code: 'already-exists' });
    expect((await get(`learner_change_requests/${id}`)).status).toBe('pending');
  });
  it('refuses two learners that share an LRN', async () => {
    await db().doc('students/D1').set({ lrn: '200000000001', firstName: 'A', lastName: 'One', sex: 'M' });
    await db().doc('students/D2').set({ lrn: '200000000001', firstName: 'B', lastName: 'Two', sex: 'M' });
    const { id } = await file();
    await expect(resolveLearnerRequest(deps('admin'), { requestId: id, approve: true }))
      .rejects.toMatchObject({ code: 'failed-precondition', message: 'This LRN matches more than one learner. An administrator must fix the records first.' });
  });
  it('blocks approval when the adviser has lost the class, but a rejection still works', async () => {
    const { id } = await file();
    await db().doc('school_accounts/teacher').set({ assignments: [] });
    await expect(resolveLearnerRequest(deps('admin'), { requestId: id, approve: true }))
      .rejects.toMatchObject({ code: 'failed-precondition', message: 'The adviser no longer holds this class. Reject this request.' });
    expect(await resolveLearnerRequest(deps('admin'), { requestId: id, approve: false, reason: 'No longer your class' })).toEqual({ ok: true, mode: 'rejected' });
    expect((await get(`learner_change_requests/${id}`)).status).toBe('rejected');
  });
  it('treats a disabled adviser account as no longer holding the class, for an add and a removal', async () => {
    const add = await file();
    const removeRequest = await requestLearnerRemoval(deps('teacher'), removal());
    // The assignment is still there, but the account is switched off (loadSchoolActor ignores a disabled account's assignments too).
    await db().doc('school_accounts/teacher').set({ disabled: true, assignments: [{ role: 'adviser', schoolYear: year, sectionId: 'SEC1', gradeLevel: 7 }] });
    for (const { id } of [add, removeRequest]) {
      await expect(resolveLearnerRequest(deps('admin'), { requestId: id, approve: true }))
        .rejects.toMatchObject({ code: 'failed-precondition', message: 'The adviser no longer holds this class. Reject this request.' });
      expect((await get(`learner_change_requests/${id}`)).status).toBe('pending');
    }
    expect((await db().collection('students').where('lrn', '==', '200000000001').get()).size).toBe(0);
    expect(await get('enrollments/S1_2026-2027')).toMatchObject({ status: 'enrolled', sectionId: 'SEC1' });
    // Turning the account back on lets the same request through; a rejection never depended on it.
    await db().doc('school_accounts/teacher').update({ disabled: FieldValue.delete() });
    expect(await resolveLearnerRequest(deps('admin'), { requestId: add.id, approve: true })).toEqual({ ok: true, mode: 'new' });
    await db().doc('school_accounts/teacher').update({ disabled: true });
    expect(await resolveLearnerRequest(deps('admin'), { requestId: removeRequest.id, approve: false, reason: 'Account switched off' })).toEqual({ ok: true, mode: 'rejected' });
  });
  it('blocks approval when the section changed grade', async () => {
    const { id } = await file();
    await db().doc('sections/SEC1').update({ gradeLevel: 8 });
    await expect(resolveLearnerRequest(deps('admin'), { requestId: id, approve: true }))
      .rejects.toMatchObject({ code: 'failed-precondition', message: 'This section changed. Reject this request and ask for a new one.' });
  });
  it('cannot be decided twice or after the school year ended', async () => {
    const { id } = await file();
    await resolveLearnerRequest(deps('admin'), { requestId: id, approve: true });
    await expect(resolveLearnerRequest(deps('admin'), { requestId: id, approve: true })).rejects.toMatchObject({ code: 'failed-precondition', message: 'Already decided.' });
    const next = await file('teacher', { student: form({ lrn: '200000000005' }) });
    await db().doc(`school_years/${year}`).set({ endedAt: new Date() });
    await expect(resolveLearnerRequest(deps('admin'), { requestId: next.id, approve: true })).rejects.toMatchObject({ code: 'failed-precondition', message: 'This school year has ended.' });
  });
});

describe('approving a removal', () => {
  it.each([
    ['transferred_out', 'transferred', 'transferred'],
    ['dropped_out', 'dropped', 'dropped'],
    ['moved_section', 'dropped', 'active'],
  ])('%s ends the enrollment and sets the learner status', async (reasonCode, enrollmentStatus, learnerStatus) => {
    const { id } = await requestLearnerRemoval(deps('teacher'), removal({ reasonCode }));
    expect(await resolveLearnerRequest(deps('coord7'), { requestId: id, approve: true })).toEqual({ ok: true, mode: 'removed' });
    expect(await get('enrollments/S1_2026-2027')).toMatchObject({ status: enrollmentStatus, sectionId: 'SEC1' });
    expect(await get('students/S1')).toMatchObject({ status: learnerStatus, gradeLevel: null, scopeSchoolYear: null, firstName: 'Ana' });
    const [note] = await inboxOf('teacher');
    expect(note).toMatchObject({ type: 'learner_request', title: 'Learner removed' });
    expect(note.body).toContain('Ana B. Cruz was removed from Grade 7 · Rizal');
    const audit = (await db().collection('audit_log').where('action', '==', 'learner.removalApproved').get()).docs.map((d) => d.data());
    expect(audit).toHaveLength(1);
    // The reason code is the only reason in the audit row; the free-text note stays on the request.
    expect(audit[0].details).toEqual({ lrn: '100000000001', name: 'Ana B. Cruz', reasonCode, studentId: 'S1', sectionId: 'SEC1', gradeLevel: 7 });
    expect(await auditText()).not.toContain('Stopped attending in September');
  });
  it('lets a Curriculum Adviser for the grade approve a removal', async () => {
    const { id } = await requestLearnerRemoval(deps('teacher'), removal({ reasonCode: 'transferred_out' }));
    await resolveLearnerRequest(deps('ca7'), { requestId: id, approve: true });
    expect(await get(`learner_change_requests/${id}`)).toMatchObject({ status: 'approved', decidedByUid: 'ca7', decidedByName: 'Cleo Curriculum', decisionReason: 'Approved' });
    expect(await get('enrollments/S1_2026-2027')).toMatchObject({ status: 'transferred', sectionId: 'SEC1' });
    expect(await get('students/S1')).toMatchObject({ status: 'transferred', gradeLevel: null, scopeSchoolYear: null });
    const audit = (await db().collection('audit_log').where('action', '==', 'learner.removalApproved').get()).docs.map((d) => d.data());
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ targetId: id, actorUid: 'ca7@deped.gov.ph' });
  });
  it('refuses when the learner has already left the class', async () => {
    const { id } = await requestLearnerRemoval(deps('teacher'), removal());
    await db().doc('enrollments/S1_2026-2027').update({ status: 'dropped' });
    await expect(resolveLearnerRequest(deps('admin'), { requestId: id, approve: true }))
      .rejects.toMatchObject({ code: 'failed-precondition', message: 'Ana B. Cruz is no longer in this class. Reject this request.' });
  });
});

describe('rejecting', () => {
  it('needs a reason, then tells the adviser and changes nothing', async () => {
    const { id } = await file();
    await expect(resolveLearnerRequest(deps('admin'), { requestId: id, approve: false })).rejects.toMatchObject({ code: 'invalid-argument' });
    expect(await resolveLearnerRequest(deps('coord7'), { requestId: id, approve: false, reason: 'Birthdate does not match the birth certificate' })).toEqual({ ok: true, mode: 'rejected' });
    const request = await get(`learner_change_requests/${id}`);
    expect(request).toMatchObject({ status: 'rejected', decisionReason: 'Birthdate does not match the birth certificate' });
    for (const field of ['address', 'guardianContact', 'contactNumber']) expect(request.student).not.toHaveProperty(field);
    expect(await inboxOf('teacher')).toEqual([expect.objectContaining({ type: 'learner_request', rejected: true, title: 'Request not approved',
      body: 'Adding Juan Santos Dela Cruz Jr was not approved. Reason: Birthdate does not match the birth certificate' })]);
    expect((await db().collection('students').where('lrn', '==', '200000000001').get()).size).toBe(0);
    const audit = (await db().collection('audit_log').where('action', '==', 'learner.requestRejected').get()).docs.map((d) => d.data());
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ targetType: 'learner_request', targetId: id, actorUid: 'coord7@school.test' });
    // The reason stays on the request and in the adviser's Inbox note; the audit row keeps only who and what.
    expect(audit[0].details).toEqual({ kind: 'add', lrn: '200000000001', name: 'Juan Santos Dela Cruz Jr', sectionId: 'SEC1', gradeLevel: 7 });
    expect(await auditText()).not.toContain('Birthdate does not match the birth certificate');
  });
  it('rejects a removal request, tells the adviser and leaves the enrollment as it was', async () => {
    const { id } = await requestLearnerRemoval(deps('teacher'), removal());
    const enrollmentBefore = await get('enrollments/S1_2026-2027');
    const learnerBefore = await get('students/S1');
    expect(await resolveLearnerRequest(deps('coord7'), { requestId: id, approve: false, reason: 'Still attending class' })).toEqual({ ok: true, mode: 'rejected' });
    expect(await get(`learner_change_requests/${id}`)).toMatchObject({ kind: 'remove', status: 'rejected', decidedByUid: 'coord7', decisionReason: 'Still attending class' });
    expect(await inboxOf('teacher')).toEqual([expect.objectContaining({ type: 'learner_request', requestId: id, rejected: true, title: 'Request not approved',
      body: 'Removing Ana B. Cruz was not approved. Reason: Still attending class' })]);
    const audit = (await db().collection('audit_log').where('action', '==', 'learner.requestRejected').get()).docs.map((d) => d.data());
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ targetType: 'learner_request', targetId: id, actorUid: 'coord7@school.test' });
    expect(audit[0].details).toEqual({ kind: 'remove', lrn: '100000000001', name: 'Ana B. Cruz', sectionId: 'SEC1', gradeLevel: 7 });
    expect(await get('enrollments/S1_2026-2027')).toEqual(enrollmentBefore);
    expect(await get('students/S1')).toEqual(learnerBefore);
    expect(await auditText()).not.toContain('Still attending class');
    expect(await auditText()).not.toContain('Stopped attending in September');
  });
  it('can reject a pending add whose student is missing', async () => {
    // A malformed document (it cannot be filed through the handler), so it is written directly.
    await db().doc('learner_change_requests/broken').set({ kind: 'add', status: 'pending', schoolYear: year, sectionId: 'SEC1', gradeLevel: 7,
      sectionName: 'Rizal', displayName: 'Mystery Learner', requestedByUid: 'teacher', requestedByName: 'Tina Teacher', enrollType: 'new',
      createdAt: Timestamp.fromMillis(Date.UTC(2026, 9, 1)) });
    await resolveLearnerRequest(deps('admin'), { requestId: 'broken', approve: false, reason: 'The form is incomplete' });
    expect(await get('learner_change_requests/broken')).toMatchObject({ status: 'rejected', decisionReason: 'The form is incomplete' });
    const audit = (await db().collection('audit_log').where('action', '==', 'learner.requestRejected').get()).docs.map((d) => d.data());
    expect(audit).toHaveLength(1);
    expect(audit[0].details).toEqual({ kind: 'add', lrn: '', name: 'Mystery Learner', sectionId: 'SEC1', gradeLevel: 7 });
  });
});

describe('the adviser’s list after a decision', () => {
  it('lists own requests newest first and hands back the form only for a rejected add', async () => {
    const first = await file('teacher', { student: form({ lrn: '200000000001' }) });
    const second = await requestLearnerRemoval(deps('teacher'), removal());
    await resolveLearnerRequest(deps('admin'), { requestId: first.id, approve: false, reason: 'LRN looks wrong' });
    const { requests } = await getLearnerRequests(deps('teacher'), { sectionId: 'SEC1' });
    expect(requests.map((r) => r.id)).toEqual([second.id, first.id]);
    expect(requests[0]).toMatchObject({ kind: 'remove', status: 'pending', reasonCode: 'dropped_out', studentId: 'S1' });
    expect(requests[0].student).toBeUndefined();
    expect(requests[1]).toMatchObject({ kind: 'add', status: 'rejected', decisionReason: 'LRN looks wrong', student: expect.objectContaining({ lrn: '200000000001', firstName: 'Juan' }) });
    expect(requests[1].student).not.toHaveProperty('address');
    await expect(getLearnerRequests(deps('other'), { sectionId: 'SEC1' })).rejects.toMatchObject({ code: 'permission-denied' });
  });
});
