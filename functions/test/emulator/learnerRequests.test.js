import { beforeEach, describe, expect, it } from 'vitest';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { db, clearAll, seedSchool } from './helpers.js';
import {
  requestLearnerAdd, requestLearnerRemoval, withdrawLearnerRequest, getLearnerRequests, listLearnerRequests, getLearnerRequestCount,
} from '../../src/handlers/learnerRequests.js';
import { deleteSchoolAccess } from '../../src/handlers/schoolAccess.js';

const year = '2026-2027';
const now = () => new Date('2026-10-22T09:00:00+08:00');
const people = {
  teacher: { email: 'teacher@deped.gov.ph', displayName: 'Tina Teacher' }, // Class Adviser of SEC1 (Grade 7 Rizal)
  other: { email: 'other@deped.gov.ph', displayName: 'Omar Other' }, // Class Adviser of SEC2 (Grade 7 Mabini)
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
    expect(await getLearnerRequestCount(deps('admin'))).toEqual({ count: 2 });
    expect(await getLearnerRequestCount(deps('coord7'))).toEqual({ count: 1 });
    expect(await getLearnerRequestCount(deps('teacher'))).toEqual({ count: 0 });
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
    expect(await getLearnerRequestCount(deps('coord7'))).toEqual({ count: 1 });
    expect(await getLearnerRequestCount(deps('admin'))).toEqual({ count: 2 });
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
    expect(await getLearnerRequestCount(deps('coord7'))).toEqual({ count: 1 });
    expect((await decidedRowsOf('coord7')).map((r) => r.id)).toEqual(['done1']);
    await db().doc(`school_years/${year}`).set({ endedAt: new Date() });
    for (const uid of ['admin', 'coord7']) {
      expect(await listLearnerRequests(deps(uid), { view: 'waiting' })).toMatchObject({ ended: true, requests: [], nextCursor: null });
      expect(await getLearnerRequestCount(deps(uid))).toEqual({ count: 0 });
    }
    for (const uid of ['coord7', 'ca7']) {
      expect(await listLearnerRequests(deps(uid), { view: 'decided' })).toMatchObject({ ended: true, requests: [], nextCursor: null });
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
    expect(await getLearnerRequestCount(deps('coord7'))).toEqual({ count: 0 });
    expect(await getLearnerRequestCount(deps('admin'))).toEqual({ count: 1 });
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
    expect(await getLearnerRequestCount(deps('coord7'))).toEqual({ count: 0 });
    expect(await getLearnerRequestCount(deps('admin'))).toEqual({ count: 1 });
  });
  it('never lets someone decide their own request, even when they cover its grade', async () => {
    await db().doc('users/teacher@deped.gov.ph').set({ uid: 'teacher', role: 'glc', gradeLevel: 7 });
    const { id } = await file('teacher');
    expect(await waitingIds('teacher')).toEqual([]);
    expect(await getLearnerRequestCount(deps('teacher'))).toEqual({ count: 0 });
    // Another coordinator for the same grade still sees and counts it.
    expect(await waitingIds('coord7')).toEqual([id]);
    expect(await getLearnerRequestCount(deps('coord7'))).toEqual({ count: 1 });
  });
  it('never returns the address or phone numbers of a decided request, even if a stored one still has them', async () => {
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
      for (const row of rows) expect(row.student).toEqual(kept);
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
