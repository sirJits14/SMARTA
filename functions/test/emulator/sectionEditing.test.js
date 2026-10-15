import { beforeEach, describe, expect, it } from 'vitest';
import { db, auth, clearAll, clearAllAuthUsers } from './helpers.js';
import { getCoordinatorSectionOptions, updateCoordinatorSection } from '../../src/handlers/sections.js';
import { getCoordinatorSectionOptionsFn, updateCoordinatorSectionFn } from '../../index.js';

const email = 'glc8@bnhs.edu';
const profile = { role: 'glc', gradeLevel: 8, uid: 'glc8' };
const ctx = () => ({ db: db(), email, uid: 'glc8', profile });
const section = (over = {}) => ({ name: 'Mabini', adviserName: 'Ana Cruz', gradeLevel: 8,
  schoolYear: '2026-2027', track: null, strand: null, scheduleId: 'AM', ...over });
const edit = (over = {}) => ({ sectionId: 'eight', name: '  Rizal  ', adviserName: '  Ben Dy  ', scheduleId: 'PM', ...over });
const read = async path => (await db().doc(path).get()).data();

beforeEach(async () => {
  await clearAll();
  const batch = db().batch();
  batch.set(db().doc(`users/${email}`), profile);
  batch.set(db().doc('settings/app'), { currentSchoolYear: '2026-2027' });
  batch.set(db().doc('sections/eight'), section());
  batch.set(db().doc('sections/eleven'), section({ gradeLevel: 11 }));
  batch.set(db().doc('schedules/AM'), { name: 'Morning', timeIn: '07:00', timeOut: '12:00', gradeLevels: [8, 11] });
  batch.set(db().doc('schedules/PM'), { name: 'Afternoon', timeIn: '13:00', timeOut: '18:00', gradeLevels: [] });
  await batch.commit();
});

describe('coordinator section callable authentication', () => {
  const request = data => ({ app: { appId: 'local-test' }, auth: { uid: 'glc8', token: {
    email, auth_time: Math.floor(Date.now() / 1000) + 5, firebase: { sign_in_provider: 'password' },
  } }, data });
  beforeEach(async () => {
    await clearAllAuthUsers();
    await auth().createUser({ uid: 'glc8', email, password: 'local-test-password' });
  });
  it('allows an authenticated grade coordinator through the exported endpoints', async () => {
    await expect(getCoordinatorSectionOptionsFn.run(request({ sectionId: 'eight' }))).resolves.toMatchObject({ schedules: expect.any(Array) });
    await expect(updateCoordinatorSectionFn.run(request(edit()))).resolves.toEqual({ ok: true });
    expect((await read('sections/eight')).name).toBe('Rizal');
  });
  it.each([
    { disabled: true }, { mustChangePassword: true }, { uid: 'someone-else' }, { sessionValidAfter: 9999999999 },
  ])('blocks restricted identities before any handler write: %j', async over => {
    await db().doc(`users/${email}`).update(over);
    await expect(updateCoordinatorSectionFn.run(request(edit()))).rejects.toBeDefined();
    await expect(getCoordinatorSectionOptionsFn.run(request({ sectionId: 'eight' }))).rejects.toBeDefined();
    expect(await read('sections/eight')).toEqual(section());
  });
  it('requires App Check and authentication on both endpoints', async () => {
    for (const [fn, data] of [[updateCoordinatorSectionFn, edit()], [getCoordinatorSectionOptionsFn, { sectionId: 'eight' }]]) {
      await expect(fn.run({ ...request(data), app: undefined })).rejects.toMatchObject({ code: 'failed-precondition' });
      await expect(fn.run({ ...request(data), auth: undefined })).rejects.toMatchObject({ code: 'unauthenticated' });
    }
  });
});

describe('coordinator section editor', () => {
  it.each(['2026-2027', '2027-2028'])('edits only the three approved fields in %s', async schoolYear => {
    await db().doc('sections/eight').set(section({ schoolYear, customAdminField: 'preserved' }));
    await updateCoordinatorSection(ctx(), edit());
    expect(await read('sections/eight')).toEqual(section({ schoolYear, name: 'Rizal', adviserName: 'Ben Dy', scheduleId: 'PM', customAdminField: 'preserved' }));
    expect(await read('schedules/AM')).toEqual({ name: 'Morning', timeIn: '07:00', timeOut: '12:00', gradeLevels: [11] });
    expect(await read('schedules/PM')).toEqual({ name: 'Afternoon', timeIn: '13:00', timeOut: '18:00', gradeLevels: [8] });
  });
  it('offers existing shifts, including ones not yet assigned to this grade, without leaking linked sections', async () => {
    const result = await getCoordinatorSectionOptions(ctx(), { sectionId: 'eight' });
    expect(result.schedules).toEqual([
      { id: 'PM', name: 'Afternoon' }, { id: 'AM', name: 'Morning' },
    ]);
  });
  it.each(['2025-2026', '2028-2029'])('rejects edits and editor options for out-of-window year %s', async schoolYear => {
    await db().doc('sections/eight').update({ schoolYear });
    await expect(updateCoordinatorSection(ctx(), edit())).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(getCoordinatorSectionOptions(ctx(), { sectionId: 'eight' })).rejects.toMatchObject({ code: 'permission-denied' });
    expect((await read('sections/eight')).name).toBe('Mabini');
  });
  it('uses the configured current year when the two-year window advances', async () => {
    await db().doc('settings/app').update({ currentSchoolYear: '2027-2028' });
    await expect(updateCoordinatorSection(ctx(), edit())).rejects.toMatchObject({ code: 'permission-denied' });
    await db().doc('sections/eight').update({ schoolYear: '2028-2029' });
    await updateCoordinatorSection(ctx(), edit());
    expect((await read('sections/eight')).name).toBe('Rizal');
  });
  it('rejects cross-grade edits and never creates a missing section', async () => {
    await expect(updateCoordinatorSection(ctx(), edit({ sectionId: 'eleven' }))).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(getCoordinatorSectionOptions(ctx(), { sectionId: 'eleven' })).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(updateCoordinatorSection(ctx(), edit({ sectionId: 'missing' }))).rejects.toMatchObject({ code: 'not-found' });
    expect(await read('sections/missing')).toBeUndefined();
  });
  it.each(['gradeLevel', 'schoolYear', 'track', 'strand', 'timeIn', 'timeOut', 'delete', 'role'])('rejects attempts to supply %s', async field => {
    await expect(updateCoordinatorSection(ctx(), edit({ [field]: 'unauthorized' }))).rejects.toMatchObject({ code: 'invalid-argument' });
    expect(await read('sections/eight')).toEqual(section());
  });
  it.each([
    { name: '  ' }, { name: 123 }, { adviserName: {} }, { scheduleId: 'missing' },
    { scheduleId: 'schedules/PM' }, { sectionId: 'sections/eight' },
  ])('rejects invalid input without writing %j', async over => {
    await expect(updateCoordinatorSection(ctx(), edit(over))).rejects.toMatchObject({ code: 'invalid-argument' });
    expect(await read('sections/eight')).toEqual(section());
  });
  it.each([
    { role: 'jhs_coord' }, { role: 'shs_coord' }, { role: 'admin' },
    { disabled: true }, { mustChangePassword: true }, { uid: 'another-user' }, { gradeLevel: 9 }, { sessionValidAfter: 1005 },
  ])('rechecks the stored profile before editing or offering schedules: %j', async over => {
    await db().doc(`users/${email}`).update(over);
    await expect(updateCoordinatorSection(ctx(), edit())).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(getCoordinatorSectionOptions(ctx(), { sectionId: 'eight' })).rejects.toMatchObject({ code: 'permission-denied' });
  });
  it('rejects an ended school year even if it is still marked current', async () => {
    await db().doc('school_years/2026-2027').set({ endedAt: new Date() });
    await expect(updateCoordinatorSection(ctx(), edit())).rejects.toMatchObject({ code: 'permission-denied' });
  });
  it.each([null, '2026-2028', '2026-2027\n'])('fails closed when the configured current year is invalid: %s', async currentSchoolYear => {
    await db().doc('settings/app').update({ currentSchoolYear });
    await expect(updateCoordinatorSection(ctx(), edit())).rejects.toMatchObject({ code: 'permission-denied' });
  });
  it('keeps a shared schedule visible to a grade with another linked section', async () => {
    await db().doc('sections/another-eight').set(section({ schoolYear: '2027-2028' }));
    await updateCoordinatorSection(ctx(), edit());
    expect((await read('schedules/AM')).gradeLevels).toEqual([8, 11]);
  });
  it('can clear the adviser and unassign a shift without deleting anything', async () => {
    await updateCoordinatorSection(ctx(), edit({ adviserName: '', scheduleId: null }));
    expect(await read('sections/eight')).toMatchObject({ adviserName: '', scheduleId: null });
    expect((await read('schedules/AM')).gradeLevels).toEqual([11]);
  });
  it('maintains correct audiences when two coordinators move sections concurrently', async () => {
    await db().doc('sections/another-eight').set(section());
    await Promise.all([
      updateCoordinatorSection(ctx(), edit()),
      updateCoordinatorSection(ctx(), edit({ sectionId: 'another-eight' })),
    ]);
    expect((await read('schedules/AM')).gradeLevels).toEqual([11]);
    expect((await read('schedules/PM')).gradeLevels).toEqual([8]);
  });
  it('records the actor and changed field names in an atomic audit row', async () => {
    await updateCoordinatorSection(ctx(), edit());
    const rows = (await db().collection('audit_log').get()).docs.map(doc => doc.data());
    expect(rows).toEqual([expect.objectContaining({
      action: 'section.edited', actorUid: email, targetId: 'eight',
      details: { gradeLevel: 8, schoolYear: '2026-2027', fields: ['name', 'adviserName', 'scheduleId'] },
    })]);
    expect(JSON.stringify(rows)).not.toContain('Ben Dy');
  });
});
