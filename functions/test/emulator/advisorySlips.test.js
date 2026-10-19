import { beforeEach, describe, expect, it } from 'vitest';
import { db, clearAll, seedSchool } from './helpers.js';
import { issueAdvisorySlips, revokeAdvisorySlip, listAdvisoryStatus } from '../../src/handlers/advisorySlips.js';
import { endSchoolYear } from '../../src/handlers/schoolYear.js';
import { hashCode, isValidCode } from '../../src/lib/activationCode.js';

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
