import { beforeEach, describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { db, clearAll, seedSchool } from './helpers.js';
import { saveStudentPhoto, getStudentPhoto, deletePhotoFile } from '../../src/handlers/studentPhotos.js';
import { getSchoolRoster } from '../../src/handlers/sessionAttendance.js';
import { LIMITS } from '../../src/callable.js';

const NOW = new Date('2026-11-27T08:00:00+08:00');
const PATH = 'student_photos/S1.jpg';

function fakeBucket() {
  const files = new Map();
  return {
    files,
    file: (path) => ({
      async save(bytes, options) { files.set(path, { bytes: Buffer.from(bytes), options }); },
      async download() {
        const f = files.get(path);
        if (!f) throw Object.assign(new Error('missing'), { code: 404 });
        return [f.bytes];
      },
      async delete() { files.delete(path); },
    }),
  };
}
const jpeg = (w = 600, h = 600) => Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x0b, 0x08, h >> 8, h & 255, w >> 8, w & 255, 0x01, 0x01, 0x11, 0x00, 0xff, 0xd9]).toString('base64');

let bucket;
// The domain needs a dot: loadSchoolActor rejects addresses without one.
const emailOf = (uid) => `${uid}@x.test`;
const deps = (uid) => ({ db: db(), bucket, uid, email: emailOf(uid), now: () => NOW });
const save = (uid, studentId = 'S1', contentBase64 = jpeg()) => saveStudentPhoto(deps(uid), { studentId, contentBase64 });
const read = (uid, studentId = 'S1') => getStudentPhoto(deps(uid), { studentId });
const student = async (id = 'S1') => (await db().doc(`students/${id}`).get()).data();
const audits = async () => (await db().collection('audit_log').where('action', '==', 'student.photoSaved').get()).docs.map(d => d.data());
const denied = { code: 'permission-denied' };

async function expectNothingWritten() {
  expect(bucket.files.size).toBe(0);
  expect(await audits()).toEqual([]);
  for (const snap of (await db().collection('students').get()).docs) expect(snap.data().photo).toBeUndefined();
}

beforeEach(async () => {
  bucket = fakeBucket();
  await clearAll(); await seedSchool();
  const set = (path, data) => db().doc(path).set(data);
  await Promise.all([
    set('sections/SEC11', { name: 'Mabini', gradeLevel: 11, schoolYear: '2026-2027' }),
    set('sections/SEC8', { name: 'Luna', gradeLevel: 8, schoolYear: '2026-2027' }),
    set('students/S11', { lrn: '100000000011', firstName: 'Carl', lastName: 'Eng', sex: 'M' }),
    set('enrollments/S11_2026-2027', { studentId: 'S11', sectionId: 'SEC11', schoolYear: '2026-2027', status: 'enrolled' }),
    // A learner who left: the record and an enrollment remain, but not 'enrolled'.
    set('students/S3', { lrn: '100000000003', firstName: 'Dan', lastName: 'Go', sex: 'M' }),
    set('enrollments/S3_2026-2027', { studentId: 'S3', sectionId: 'SEC1', schoolYear: '2026-2027', status: 'dropped' }),
    set(`users/${emailOf('admin')}`, { uid: 'admin', role: 'admin' }),
    set(`users/${emailOf('jhs')}`, { uid: 'jhs', role: 'jhs_coord' }),
    set(`users/${emailOf('shs')}`, { uid: 'shs', role: 'shs_coord' }),
    set(`users/${emailOf('glc')}`, { uid: 'glc', role: 'glc', gradeLevel: 7 }),
    set(`users/${emailOf('off')}`, { uid: 'off', role: 'admin', disabled: true }),
    // An administrator profile bound to another Auth account.
    set(`users/${emailOf('impostor')}`, { uid: 'someone-else', role: 'admin' }),
    set('school_accounts/adv', { assignments: [{ role: 'adviser', schoolYear: '2026-2027', sectionId: 'SEC1', gradeLevel: 7 }] }),
    set('school_accounts/adv8', { assignments: [{ role: 'adviser', schoolYear: '2026-2027', sectionId: 'SEC8', gradeLevel: 8 }] }),
    set('school_accounts/old', { assignments: [{ role: 'adviser', schoolYear: '2025-2026', sectionId: 'SEC1', gradeLevel: 7 }] }),
    set('school_accounts/blocked', { disabled: true, assignments: [{ role: 'adviser', schoolYear: '2026-2027', sectionId: 'SEC1', gradeLevel: 7 }] }),
    set('school_accounts/cur', { assignments: [{ role: 'curriculum_adviser', schoolYear: '2026-2027', gradeLevel: 7 }] }),
    set('guardian_links/gR_S1', { guardianUid: 'gR', studentId: 'S1', status: 'active', schoolYear: '2026-2027', relationship: 'Adviser' }),
    set('guardian_links/gS_S1', { guardianUid: 'gS', studentId: 'S1', status: 'active', schoolYear: '2026-2027', relationship: 'Guardian', slot: 'adviser' }),
    set('guardian_links/gX_S1', { guardianUid: 'gA', studentId: 'S1', status: 'active', schoolYear: '2026-2027', relationship: 'Mother' }),
  ]);
});

describe('saveStudentPhoto', () => {
  it.each(['admin', 'jhs', 'adv'])('lets %s save the photo of a learner', async (uid) => {
    expect(await save(uid)).toEqual({ ok: true, updatedAt: NOW.getTime() });
    const file = bucket.files.get(PATH);
    expect(file.bytes.toString('base64')).toBe(jpeg());
    expect(file.options).toMatchObject({ resumable: false, contentType: 'image/jpeg', metadata: { cacheControl: 'private, max-age=0, no-store' } });
    const { photo } = await student();
    expect(photo).toEqual({ path: PATH, updatedAt: Timestamp.fromDate(NOW), updatedBy: emailOf(uid) });
    expect(photo.updatedAt).toBeInstanceOf(Timestamp);
    const rows = await audits();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ action: 'student.photoSaved', actorType: 'staff', actorUid: emailOf(uid), targetType: 'student', targetId: 'S1' });
  });

  it('lets the SHS coordinator and the administrator save a grade 11 photo', async () => {
    await save('shs', 'S11');
    await save('admin', 'S11');
    expect([...bucket.files.keys()]).toEqual(['student_photos/S11.jpg']);
    expect((await student('S11')).photo.updatedBy).toBe(emailOf('admin'));
  });

  it('replaces the previous photo', async () => {
    await save('adv');
    await save('admin', 'S1', jpeg(300, 300));
    expect(bucket.files.size).toBe(1);
    expect(bucket.files.get(PATH).bytes.toString('base64')).toBe(jpeg(300, 300));
    expect((await student()).photo.updatedBy).toBe(emailOf('admin'));
  });

  it('keeps the other learner fields', async () => {
    await save('admin');
    expect(await student()).toMatchObject({ lrn: '100000000001', firstName: 'Ana', lastName: 'Cruz' });
  });

  it('marks the parent projection when it exists, keeping its other fields', async () => {
    await db().doc('learners/S1').set({ displayName: 'Ana B. Cruz' });
    await save('admin');
    expect((await db().doc('learners/S1').get()).data()).toEqual({ displayName: 'Ana B. Cruz', photoUpdatedAt: Timestamp.fromDate(NOW) });
  });

  it('does not create a parent projection', async () => {
    await save('admin');
    expect((await db().doc('learners/S1').get()).exists).toBe(false);
  });

  it.each([
    ['jhs', 'S11', 'a JHS coordinator outside grades 7-10'],
    ['shs', 'S1', 'an SHS coordinator outside grades 11-12'],
    ['glc', 'S1', 'a grade level coordinator'],
    ['cur', 'S1', 'a curriculum adviser'],
    ['adv', 'S11', 'an adviser of another section'],
    ['adv8', 'S1', 'the adviser of a different grade'],
    ['old', 'S1', 'last year’s adviser'],
    ['blocked', 'S1', 'an adviser whose school account is disabled'],
    ['gA', 'S1', 'a linked guardian'],
    ['gR', 'S1', 'a legacy adviser link'],
    ['stranger', 'S1', 'an unrelated account'],
    ['off', 'S1', 'a disabled administrator'],
    ['impostor', 'S1', 'a profile bound to another account'],
  ])('denies %s saving %s (%s)', async (uid, studentId) => {
    await expect(save(uid, studentId)).rejects.toMatchObject(denied);
    await expectNothingWritten();
  });

  it.each(['jhs', 'shs', 'adv', 'cur', 'glc', 'gA'])('denies %s a learner who does not exist or is not enrolled', async (uid) => {
    for (const studentId of ['NOPE', 'S2', 'S3']) await expect(save(uid, studentId)).rejects.toMatchObject(denied);
    await expectNothingWritten();
  });

  it('denies everyone a learner who does not exist, even an administrator', async () => {
    await expect(save('admin', 'NOPE')).rejects.toMatchObject(denied);
    await expectNothingWritten();
    expect((await db().doc('students/NOPE').get()).exists).toBe(false);
  });

  it('lets only the administrator handle a learner who is not enrolled', async () => {
    await save('admin', 'S3');
    expect((await student('S3')).photo.path).toBe('student_photos/S3.jpg');
  });

  it('denies coordinators and advisers when the enrolled section belongs to another school year', async () => {
    await db().doc('sections/SEC1').update({ schoolYear: '2025-2026' });
    for (const uid of ['jhs', 'adv']) await expect(save(uid)).rejects.toMatchObject(denied);
    await expectNothingWritten();
  });

  it('stops the adviser once the school year has ended, but not the administrator', async () => {
    await db().doc('school_years/2026-2027').set({ endedAt: Timestamp.fromDate(NOW) });
    await expect(save('adv')).rejects.toMatchObject(denied);
    await expectNothingWritten();
    expect(await save('admin')).toMatchObject({ ok: true });
  });

  it.each([
    ['a missing learner id', { contentBase64: jpeg() }],
    ['a learner id with a slash', { studentId: 'S1/x', contentBase64: jpeg() }],
    ['a learner id with dots', { studentId: '..', contentBase64: jpeg() }],
    ['a missing photo', { studentId: 'S1' }],
    ['a non-string photo', { studentId: 'S1', contentBase64: [jpeg()] }],
    ['text that is not base64', { studentId: 'S1', contentBase64: 'not base64!' }],
    ['a data URL', { studentId: 'S1', contentBase64: `data:image/jpeg;base64,${jpeg()}` }],
    ['text that is not a JPEG', { studentId: 'S1', contentBase64: Buffer.from('hello there').toString('base64') }],
    ['a non-square JPEG', { studentId: 'S1', contentBase64: jpeg(600, 400) }],
    ['a JPEG wider than 600 pixels', { studentId: 'S1', contentBase64: jpeg(900, 900) }],
    ['a JPEG that is too small', { studentId: 'S1', contentBase64: jpeg(100, 100) }],
    ['a JPEG over 200 KB', { studentId: 'S1', contentBase64: Buffer.concat([Buffer.from(jpeg(), 'base64'), Buffer.alloc(204800)]).toString('base64') }],
    ['a very long string', { studentId: 'S1', contentBase64: 'A'.repeat(400000) }],
  ])('rejects %s and writes nothing', async (_, input) => {
    await expect(saveStudentPhoto(deps('admin'), input)).rejects.toMatchObject({ code: 'invalid-argument' });
    await expectNothingWritten();
  });

  it('accepts a photo of exactly 204800 bytes', async () => {
    const head = Buffer.from(jpeg(), 'base64');
    const full = Buffer.concat([head, Buffer.alloc(204800 - head.length)]).toString('base64');
    expect(await save('admin', 'S1', full)).toMatchObject({ ok: true });
    expect(bucket.files.get(PATH).bytes.length).toBe(204800);
  });

  it('limits each account to 300 saves an hour', async () => {
    expect(LIMITS.studentPhoto).toEqual({ windowMs: 60 * 60 * 1000, max: 300 });
    await db().doc('rate_limits/adv').set({ studentPhoto: { count: 300, windowStartMs: NOW.getTime() - 1000 } });
    await expect(save('adv')).rejects.toMatchObject({ code: 'resource-exhausted' });
    await expectNothingWritten();
    expect(await save('admin')).toMatchObject({ ok: true });
  });
});

describe('getStudentPhoto', () => {
  beforeEach(() => save('admin'));

  it.each(['admin', 'jhs', 'adv', 'gA', 'gB'])('shows the photo to %s', async (uid) => {
    expect(await read(uid)).toEqual({ photo: { contentBase64: jpeg(), updatedAt: NOW.getTime() } });
  });

  it.each([
    ['gC', 'a revoked family link'],
    ['gR', 'a link with relationship Adviser'],
    ['gS', 'a link in the adviser slot'],
    ['gX', 'a link document that names another guardian'],
    ['glc', 'a grade level coordinator'],
    ['cur', 'a curriculum adviser'],
    ['shs', 'a coordinator of other grades'],
    ['adv8', 'the adviser of another section'],
    ['old', 'last year’s adviser'],
    ['blocked', 'an adviser whose school account is disabled'],
    ['stranger', 'an unrelated account'],
    ['off', 'a disabled administrator'],
    ['impostor', 'a profile bound to another account'],
  ])('denies %s (%s)', async (uid) => {
    await expect(read(uid)).rejects.toMatchObject(denied);
  });

  it('does not let a family link reach another learner', async () => {
    await save('admin', 'S11');
    await expect(read('gA', 'S11')).rejects.toMatchObject(denied);
    await expect(read('adv', 'S11')).rejects.toMatchObject(denied);
    await expect(read('jhs', 'S11')).rejects.toMatchObject(denied);
  });

  it('stops the adviser once the school year has ended, but not the administrator', async () => {
    await db().doc('school_years/2026-2027').set({ endedAt: Timestamp.fromDate(NOW) });
    await expect(read('adv')).rejects.toMatchObject(denied);
    expect((await read('admin')).photo.contentBase64).toBe(jpeg());
  });

  it.each(['../S1', '', undefined])('rejects the learner id %j', async (studentId) => {
    await expect(getStudentPhoto(deps('admin'), { studentId })).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('returns null for a learner with no photo', async () => {
    expect(await read('admin', 'S11')).toEqual({ photo: null });
  });

  it('returns null when the file is gone', async () => {
    bucket.files.clear();
    expect(await read('admin')).toEqual({ photo: null });
  });

  it('reads only the learner’s own path, whatever the record says', async () => {
    await save('admin', 'S11', jpeg(300, 300));
    await db().doc('students/S1').update({ 'photo.path': 'student_photos/S11.jpg' });
    expect((await read('gA')).photo.contentBase64).toBe(jpeg());
  });

  it('passes on storage errors other than a missing file', async () => {
    bucket.file = () => ({ async download() { throw Object.assign(new Error('storage down'), { code: 503 }); } });
    await expect(read('admin')).rejects.toThrow('storage down');
  });

  it('deletePhotoFile removes only that learner’s file', async () => {
    await save('admin', 'S11');
    await deletePhotoFile(bucket, 'S1');
    expect([...bucket.files.keys()]).toEqual(['student_photos/S11.jpg']);
  });
});

describe('getSchoolRoster photo fields', () => {
  const roster = (uid) => getSchoolRoster(deps(uid), { sectionId: 'SEC1', date: '2026-11-27' });

  it('tells the adviser they can edit photos and when each one changed', async () => {
    const before = await roster('adv');
    expect(before.canEditPhotos).toBe(true);
    expect(before.rows[0]).not.toHaveProperty('photoUpdatedAt');
    await save('adv');
    const after = await roster('adv');
    expect(after.canEditPhotos).toBe(true);
    expect(after.rows.find(r => r.studentId === 'S1').photoUpdatedAt).toBe(NOW.getTime());
  });

  it('lets administrators edit photos', async () => {
    expect((await roster('admin')).canEditPhotos).toBe(true);
  });

  it('does not offer photo editing to a curriculum adviser', async () => {
    expect((await roster('cur')).canEditPhotos).toBe(false);
  });
});
