import { describe, it, expect, beforeEach } from 'vitest';
import { db, clearAll, seedSchool, fakeMessaging } from './helpers.js';
import { refreshGuardianAudience, handleGuardianLinkWrite } from '../../src/handlers/guardianAudience.js';
import { expireLinks } from '../../src/handlers/scheduled.js';
import { clearCache } from '../../src/cache.js';

const NOW = new Date('2026-10-05T02:00:00+08:00');
const keysOf = async (uid) => (await db().doc(`guardians/${uid}`).get()).data()?.audienceKeys;

// seedSchool: gA and gB actively linked to S1 (enrollment has no gradeLevel;
// its section SEC1 is grade 7); gC's link is revoked and gC has no profile.
beforeEach(async () => { await clearAll(); clearCache(); await seedSchool(); });

describe('refreshGuardianAudience', () => {
  it('uses the section grade when the enrollment has none', async () => {
    expect(await refreshGuardianAudience(db(), 'gA')).toEqual(['all', 'g7']);
    expect(await keysOf('gA')).toEqual(['all', 'g7']);
  });
  it('prefers the enrollment grade and merges several learners', async () => {
    await db().doc('enrollments/S1_2026-2027').set({ gradeLevel: 8 }, { merge: true });
    await db().doc('enrollments/S2_2026-2027').set({ studentId: 'S2', sectionId: 'SEC1', schoolYear: '2026-2027', status: 'enrolled', gradeLevel: 11 });
    await db().doc('guardian_links/gA_S2').set({ guardianUid: 'gA', studentId: 'S2', status: 'active', schoolYear: '2026-2027' });
    expect(await refreshGuardianAudience(db(), 'gA')).toEqual(['all', 'g8', 'g11']);
  });
  it('empties the keys when no link is active', async () => {
    await db().doc('guardian_links/gA_S1').update({ status: 'revoked' });
    expect(await refreshGuardianAudience(db(), 'gA')).toEqual([]);
    expect(await keysOf('gA')).toEqual([]);
  });
  it('never creates a guardian profile', async () => {
    expect(await refreshGuardianAudience(db(), 'gC')).toBeNull();
    expect((await db().doc('guardians/gC').get()).exists).toBe(false);
  });
});

describe('handleGuardianLinkWrite', () => {
  it('refreshes on activation, revocation and deletion', async () => {
    const link = { guardianUid: 'gA', studentId: 'S1', status: 'active', schoolYear: '2026-2027' };
    expect(await handleGuardianLinkWrite(db(), { before: null, after: link })).toEqual(['all', 'g7']);
    await db().doc('guardian_links/gA_S1').update({ status: 'revoked' });
    expect(await handleGuardianLinkWrite(db(), { before: link, after: { ...link, status: 'revoked' } })).toEqual([]);
    expect(await handleGuardianLinkWrite(db(), { before: { ...link, status: 'revoked' }, after: null })).toEqual([]);
  });
  it('skips writes that change nothing about the audience', () => {
    const link = { guardianUid: 'gA', studentId: 'S1', status: 'active', schoolYear: '2026-2027' };
    expect(handleGuardianLinkWrite(db(), { before: link, after: { ...link, learnerName: 'Ana' } })).toBeNull();
  });
});

describe('expireLinks', () => {
  it('rebuilds the keys of every guardian it visits', async () => {
    await db().doc('guardians/gA').set({ audienceKeys: ['all', 'g12'] }, { merge: true });
    const deps = { db: db(), auth: { async deleteUser() {} }, messaging: fakeMessaging(), portalUrl: 'https://p.test', now: () => NOW };
    const r = await expireLinks(deps);
    expect(await keysOf('gA')).toEqual(['all', 'g7']);
    expect(r.audience).toBe(2);   // gA and gB
  });
});
