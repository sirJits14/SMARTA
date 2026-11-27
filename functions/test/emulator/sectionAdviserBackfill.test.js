import { beforeEach, describe, expect, it } from 'vitest';
import { db, clearAll, seedSchool } from './helpers.js';
import { backfillSectionAdvisers } from '../../src/lib/sectionAdviserBackfill.js';

const year = '2026-2027';
beforeEach(async () => {
  await clearAll(); await seedSchool();
  await db().doc('sections/SEC1').update({ adviserName: 'Manual name' });
  await db().doc('school_accounts/teacher').set({ displayName: 'Approved Teacher', email: 'teacher@school.test',
    assignments: [{ role: 'adviser', schoolYear: year, sectionId: 'SEC1', gradeLevel: 7 }] });
  await db().doc(`school_adviser_locks/${year}_SEC1`).set({ uid: 'teacher', role: 'adviser', schoolYear: year, sectionId: 'SEC1', gradeLevel: 7 });
});

describe('existing adviser backfill', () => {
  it('previews without writes, applies only current assignments and is repeatable', async () => {
    await db().doc('sections/old').set({ schoolYear: '2025-2026', gradeLevel: 7, adviserName: 'Historical name' });
    await db().doc('sections/unassigned').set({ schoolYear: year, gradeLevel: 8, adviserName: 'Manual only' });
    const preview = await backfillSectionAdvisers(db());
    expect(preview.changed).toEqual(['SEC1']);
    expect((await db().doc('sections/SEC1').get()).data().adviserName).toBe('Manual name');
    expect((await backfillSectionAdvisers(db(), { apply: true })).changed).toEqual(['SEC1']);
    expect((await db().doc('sections/SEC1').get()).data()).toMatchObject({ adviserName: 'Approved Teacher', schoolAdviserUid: 'teacher' });
    expect((await db().doc('sections/old').get()).data().adviserName).toBe('Historical name');
    expect((await db().doc('sections/unassigned').get()).data().adviserName).toBe('Manual only');
    expect((await backfillSectionAdvisers(db(), { apply: true })).changed).toEqual([]);
    expect((await db().collection('audit_log').get()).size).toBe(1);
  });
  it('refuses an inconsistent lock instead of assigning an unapproved account', async () => {
    await db().doc('school_accounts/teacher').update({ assignments: [] });
    const result = await backfillSectionAdvisers(db(), { apply: true });
    expect(result.changed).toEqual([]);
    expect(result.warnings).toEqual([expect.objectContaining({ sectionId: 'SEC1' })]);
    expect((await db().doc('sections/SEC1').get()).data().adviserName).toBe('Manual name');
  });
  it('does not change an ended school year', async () => {
    await db().doc(`school_years/${year}`).set({ endedAt: new Date() });
    await expect(backfillSectionAdvisers(db(), { apply: true })).rejects.toThrow(/ended/i);
    expect((await db().doc('sections/SEC1').get()).data().adviserName).toBe('Manual name');
  });
});
