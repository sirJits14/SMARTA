import { beforeEach, describe, expect, it } from 'vitest';
import { db, clearAll, seedSchool } from './helpers.js';
import { issueAdvisorySlips, revokeAdvisorySlip, listAdvisoryStatus, previewAdvisorySlip, redeemAdvisorySlip } from '../../src/handlers/advisorySlips.js';
import { endSchoolYear } from '../../src/handlers/schoolYear.js';
import { hashCode, isValidCode } from '../../src/lib/activationCode.js';
import { requestSchoolRole, assignSchoolRole, loadSchoolActor } from '../../src/handlers/schoolAccess.js';

const year = '2026-2027';
const now = () => new Date('2026-10-19T08:00:00+08:00');
const staff = {
  admin: { uid: 'admin', email: 'admin@school.test', profile: { uid: 'admin', role: 'admin' } },
  glc8: { uid: 'glc8', email: 'glc8@school.test', profile: { uid: 'glc8', role: 'glc', gradeLevel: 8 } },
};
const deps = who => ({ db: db(), now, ...staff[who] });
const slips = async () => (await db().collection('advisory_slips').get()).docs.map(d => ({ id: d.id, ...d.data() }));

beforeEach(async () => {
  await clearAll(); await seedSchool();
  await db().doc('settings/app').set({ advisoryRequestsEnabled: true }, { merge: true });
  await db().doc('sections/SEC8').set({ name: 'Eight', gradeLevel: 8, schoolYear: year });
});

describe('issuing advisory slips', () => {
  it('issues one hashed slip per section and returns each raw code once', async () => {
    const { issued, skipped } = await issueAdvisorySlips(deps('admin'), { sectionIds: ['SEC1', 'SEC8'] });
    expect(skipped).toEqual([]);
    expect(issued.map(s => s.sectionId)).toEqual(['SEC1', 'SEC8']);
    expect(issued[0]).toMatchObject({ sectionLabel: 'Grade 7 – Rizal', gradeLevel: 7, schoolYear: year });
    expect(issued.every(s => isValidCode(s.code))).toBe(true);
    const stored = await slips();
    expect(stored.map(s => s.id).sort()).toEqual(issued.map(s => hashCode(s.code)).sort());
    expect(stored[0]).toMatchObject({ status: 'issued', schoolYear: year, issuedBy: 'admin@school.test' });
    expect(JSON.stringify(stored)).not.toContain(issued[0].code);
  });
  it('limits coordinators to their grades', async () => {
    const { issued, skipped } = await issueAdvisorySlips(deps('glc8'), { sectionIds: ['SEC1', 'SEC8'] });
    expect(issued.map(s => s.sectionId)).toEqual(['SEC8']);
    expect(skipped).toEqual([{ sectionId: 'SEC1', reason: 'out-of-scope' }]);
  });
  it('skips sections that already have an adviser and unknown sections', async () => {
    await db().doc(`school_adviser_locks/${year}_SEC1`).set({ uid: 'teacher', role: 'adviser', schoolYear: year, sectionId: 'SEC1', gradeLevel: 7 });
    const { issued, skipped } = await issueAdvisorySlips(deps('admin'), { sectionIds: ['SEC1', 'NOPE'] });
    expect(issued).toEqual([]);
    expect(skipped).toEqual([{ sectionId: 'SEC1', reason: 'has-adviser' }, { sectionId: 'NOPE', reason: 'not-found' }]);
  });
  it('reissuing revokes the earlier unused slip', async () => {
    const first = (await issueAdvisorySlips(deps('admin'), { sectionIds: ['SEC1'] })).issued[0];
    const second = (await issueAdvisorySlips(deps('admin'), { sectionIds: ['SEC1'] })).issued[0];
    expect((await db().doc(`advisory_slips/${hashCode(first.code)}`).get()).data()).toMatchObject({ status: 'revoked', revokedReason: 'reissued' });
    expect((await db().doc(`advisory_slips/${hashCode(second.code)}`).get()).data().status).toBe('issued');
  });
  it('refuses bad input and an ended year', async () => {
    await expect(issueAdvisorySlips(deps('admin'), { sectionIds: [] })).rejects.toMatchObject({ code: 'invalid-argument' });
    await db().doc(`school_years/${year}`).set({ endedAt: new Date() });
    await expect(issueAdvisorySlips(deps('admin'), { sectionIds: ['SEC1'] })).rejects.toMatchObject({ code: 'failed-precondition' });
  });
});

describe('revoking and listing', () => {
  it('revokes the outstanding slip within scope only', async () => {
    await issueAdvisorySlips(deps('admin'), { sectionIds: ['SEC1', 'SEC8'] });
    await expect(revokeAdvisorySlip(deps('glc8'), { sectionId: 'SEC1' })).rejects.toMatchObject({ code: 'permission-denied' });
    expect(await revokeAdvisorySlip(deps('glc8'), { sectionId: 'SEC8' })).toEqual({ revoked: 1 });
    expect((await slips()).filter(s => s.status === 'issued').map(s => s.sectionId)).toEqual(['SEC1']);
  });
  it('lists adviser and slip status per section in scope', async () => {
    await issueAdvisorySlips(deps('admin'), { sectionIds: ['SEC8'] });
    await db().doc(`school_adviser_locks/${year}_SEC1`).set({ uid: 'teacher', role: 'adviser', schoolYear: year, sectionId: 'SEC1', gradeLevel: 7 });
    await db().doc('school_accounts/teacher').set({ displayName: 'Ana Cruz', email: 'ana@deped.gov.ph' });
    const admin = await listAdvisoryStatus(deps('admin'));
    expect(admin.schoolYear).toBe(year);
    const byId = Object.fromEntries(admin.sections.map(s => [s.sectionId, s]));
    expect(byId.SEC1).toEqual({ sectionId: 'SEC1', adviser: { name: 'Ana Cruz', email: 'ana@deped.gov.ph' }, slip: null });
    expect(byId.SEC8.adviser).toBeNull();
    expect(byId.SEC8.slip).toMatchObject({ issuedBy: 'admin@school.test' });
    expect(typeof byId.SEC8.slip.issuedAt).toBe('number');
    expect((await listAdvisoryStatus(deps('glc8'))).sections.map(s => s.sectionId)).toEqual(['SEC8']);
  });
  it('ending the school year revokes outstanding advisory slips', async () => {
    await issueAdvisorySlips(deps('admin'), { sectionIds: ['SEC1'] });
    const result = await endSchoolYear({ db: db(), email: 'admin@school.test' }, { schoolYear: year, confirmText: year });
    expect(result.advisorySlipsRevoked).toBe(1);
    expect((await slips())[0]).toMatchObject({ status: 'revoked', revokedReason: 'school-year-ended' });
  });
});

const teachers = {
  t1: { uid: 't1', email: 't1@deped.gov.ph', emailVerified: true, displayName: 'Ana Cruz' },
  t2: { uid: 't2', email: 't2@deped.gov.ph', emailVerified: true, displayName: 'Ben Dy' },
  personal: { uid: 'personal', email: 'teacher@gmail.com', emailVerified: true },
  admin: { uid: 'admin', email: 'admin@school.test', emailVerified: true },
};
const teacherAuth = { getUser: async uid => teachers[uid], getUserByEmail: async email => Object.values(teachers).find(u => u.email === email) };
const tdeps = uid => ({ db: db(), auth: teacherAuth, now, uid, email: teachers[uid].email, displayName: teachers[uid].displayName || uid });
const issue = async (sectionId = 'SEC1') => (await issueAdvisorySlips(deps('admin'), { sectionIds: [sectionId] })).issued[0].code;
// A request left over from before non-DepEd accounts were refused.
const seedRequest = async (uid, sectionId) => {
  const id = `${uid}_adviser_${sectionId}`;
  await db().doc(`school_role_requests/${id}`).set({ uid, email: teachers[uid].email, emailVerified: true, displayName: uid,
    role: 'adviser', schoolYear: year, sectionId, gradeLevel: 7, status: 'pending', createdAt: new Date() });
  return { id };
};

describe('redeeming advisory slips', () => {
  beforeEach(async () => { await db().doc('users/admin@school.test').set({ uid: 'admin', role: 'admin' }); });
  it('previews without consuming, then makes a DepEd teacher the adviser', async () => {
    const code = await issue();
    expect(await previewAdvisorySlip(tdeps('t1'), { code: code.toLowerCase() })).toEqual({ sectionLabel: 'Grade 7 – Rizal', gradeLevel: 7 });
    expect(await redeemAdvisorySlip(tdeps('t1'), { code })).toEqual({ sectionId: 'SEC1', sectionLabel: 'Grade 7 – Rizal', gradeLevel: 7 });
    expect((await loadSchoolActor(tdeps('t1'))).assignments).toMatchObject([{ role: 'adviser', sectionId: 'SEC1', source: 'slip', assignedBy: 'admin@school.test' }]);
    expect((await db().doc(`school_adviser_locks/${year}_SEC1`).get()).data().uid).toBe('t1');
    // The SIMS section shows the slip's adviser, the same as any other grant.
    expect((await db().doc('sections/SEC1').get()).data()).toMatchObject({ adviserName: 'Ana Cruz', schoolAdviserUid: 't1' });
    expect((await db().doc(`advisory_slips/${hashCode(code)}`).get()).data()).toMatchObject({ status: 'redeemed', redeemedBy: 't1' });
    const audit = (await db().collection('audit_log').where('action', '==', 'school.slipRedeemed').get()).docs.map(d => d.data().details);
    expect(audit).toEqual([expect.objectContaining({ sectionId: 'SEC1', issuedBy: 'admin@school.test', teacherEmail: 't1@deped.gov.ph' })]);
  });
  it('refuses personal emails', async () => {
    const code = await issue();
    for (const fn of [previewAdvisorySlip, redeemAdvisorySlip]) {
      await expect(fn(tdeps('personal'), { code })).rejects.toMatchObject({ code: 'permission-denied', message: 'Advisory slips need a DepEd email.' });
    }
  });
  it('works once, and never for revoked, other-year or ended-year slips', async () => {
    const generic = { code: 'not-found', message: 'That advisory slip could not be used. Ask the school to issue a new one.' };
    const used = await issue();
    await redeemAdvisorySlip(tdeps('t1'), { code: used });
    await expect(redeemAdvisorySlip(tdeps('t2'), { code: used })).rejects.toMatchObject(generic);
    const revoked = await issue('SEC8');
    await revokeAdvisorySlip(deps('admin'), { sectionId: 'SEC8' });
    await expect(previewAdvisorySlip(tdeps('t2'), { code: revoked })).rejects.toMatchObject(generic);
    const old = await issue('SEC8');
    await db().doc(`advisory_slips/${hashCode(old)}`).update({ schoolYear: '2025-2026' });
    await expect(redeemAdvisorySlip(tdeps('t2'), { code: old })).rejects.toMatchObject(generic);
    await expect(redeemAdvisorySlip(tdeps('t2'), { code: 'BAD' })).rejects.toMatchObject({ code: 'invalid-argument' });
  });
  it('lets only one of two simultaneous redeemers win', async () => {
    const code = await issue();
    const results = await Promise.allSettled(['t1', 't2'].map(uid => redeemAdvisorySlip(tdeps(uid), { code })));
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.find(r => r.status === 'rejected').reason).toMatchObject({ code: 'not-found' });
    expect((await db().collection('school_adviser_locks').get()).size).toBe(1);
  }, 30000);
  it('refuses a teacher who already advises the section and leaves the slip usable', async () => {
    const code = await issue();
    await assignSchoolRole({ db: db(), auth: teacherAuth, now, uid: 'admin', email: 'admin@school.test' }, { email: 't1@deped.gov.ph', role: 'adviser', sectionId: 'SEC1' });
    await expect(redeemAdvisorySlip(tdeps('t1'), { code })).rejects.toMatchObject({ code: 'already-exists', message: 'You are already the adviser of this section.' });
    expect((await slips()).map(s => s.status)).toEqual(['issued']);
  });
  it('refuses a section that gained an adviser after the slip was printed', async () => {
    const code = await issue();
    await assignSchoolRole({ db: db(), auth: teacherAuth, now, uid: 'admin', email: 'admin@school.test' }, { email: 't2@deped.gov.ph', role: 'adviser', sectionId: 'SEC1' });
    await expect(redeemAdvisorySlip(tdeps('t1'), { code })).rejects.toMatchObject({ code: 'already-exists' });
  });
  it('lets a teacher with a leftover Subject Teacher row redeem a slip', async () => {
    await db().doc('school_accounts/t1').set({ email: 't1@deped.gov.ph', assignments: [{ role: 'subject_teacher', schoolYear: year, gradeLevel: 8 }] });
    const code = await issue();
    await expect(redeemAdvisorySlip(tdeps('t1'), { code })).resolves.toMatchObject({ sectionId: 'SEC1' });
  });
  it('closes pending adviser requests for the section', async () => {
    const mine = await requestSchoolRole(tdeps('t1'), { role: 'adviser', sectionId: 'SEC1' });
    const theirs = await seedRequest('personal', 'SEC1');
    await redeemAdvisorySlip(tdeps('t1'), { code: await issue() });
    expect((await db().doc(`school_role_requests/${mine.id}`).get()).data().status).toBe('fulfilled');
    expect((await db().doc(`school_role_requests/${theirs.id}`).get()).data()).toMatchObject({ status: 'superseded', reason: 'Section adviser assigned by slip' });
    const inbox = (await db().collection('guardians/personal/inbox').get()).docs.map(d => d.data());
    expect(inbox).toEqual([expect.objectContaining({ type: 'school_access', rejected: true, title: 'School access request closed' })]);
  });
});
