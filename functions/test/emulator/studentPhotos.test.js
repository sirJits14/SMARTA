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
    set(`users/${emailOf('glc8')}`, { uid: 'glc8', role: 'glc', gradeLevel: 8 }),
    set(`users/${emailOf('glcnone')}`, { uid: 'glcnone', role: 'glc' }),
    set(`users/${emailOf('log')}`, { uid: 'log', role: 'logistic' }),
    set(`users/${emailOf('logoff')}`, { uid: 'logoff', role: 'logistic', disabled: true }),
    set(`users/${emailOf('logtemp')}`, { uid: 'logtemp', role: 'logistic', mustChangePassword: true }),
    set(`users/${emailOf('logimp')}`, { uid: 'someone-else', role: 'logistic' }),
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
  it.each(['admin', 'glc', 'log', 'adv'])('lets %s save the photo of a learner', async (uid) => {
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

  it('lets the logistic operator and the administrator save a grade 11 photo', async () => {
    await save('log', 'S11');
    expect((await student('S11')).photo.updatedBy).toBe(emailOf('log'));
    await save('admin', 'S11');
    expect([...bucket.files.keys()]).toEqual(['student_photos/S11.jpg']);
    expect((await student('S11')).photo.updatedBy).toBe(emailOf('admin'));
  });

  // Academic coordinators lost photo access, but keep what an adviser assignment gives them.
  it('lets a coordinator who is also a class adviser save only for their own class', async () => {
    await db().doc('school_accounts/jhs').set({ assignments: [{ role: 'adviser', schoolYear: '2026-2027', sectionId: 'SEC1', gradeLevel: 7 }] });
    await expect(save('jhs', 'S11')).rejects.toMatchObject(denied);
    await expectNothingWritten();
    expect(await save('jhs')).toMatchObject({ ok: true });
    expect((await read('jhs')).photo.contentBase64).toBe(jpeg());
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
    ['jhs', 'S1', 'a JHS coordinator, inside their grades'],
    ['jhs', 'S11', 'a JHS coordinator, outside their grades'],
    ['shs', 'S11', 'an SHS coordinator, inside their grades'],
    ['shs', 'S1', 'an SHS coordinator, outside their grades'],
    ['glc', 'S11', 'a coordinator of another grade level'],
    ['glc8', 'S1', 'the grade 8 coordinator for a grade 7 learner'],
    ['glcnone', 'S1', 'a grade level coordinator without a grade'],
    ['logoff', 'S1', 'a disabled logistic operator'],
    ['logtemp', 'S1', 'a logistic operator who must change their password'],
    ['logimp', 'S1', 'a logistic profile bound to another account'],
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

  it.each(['admin', 'log'])('denies everyone a learner who does not exist, even %s', async (uid) => {
    await expect(save(uid, 'NOPE')).rejects.toMatchObject(denied);
    await expectNothingWritten();
    expect((await db().doc('students/NOPE').get()).exists).toBe(false);
  });

  it.each(['admin', 'log'])('lets %s, who covers every grade, handle a learner who is not enrolled', async (uid) => {
    await save(uid, 'S3');
    expect((await student('S3')).photo.path).toBe('student_photos/S3.jpg');
    expect((await read(uid, 'S3')).photo.contentBase64).toBe(jpeg());
    await expect(read('glc', 'S3')).rejects.toMatchObject(denied);
  });

  it('denies coordinators and advisers when the enrolled section belongs to another school year', async () => {
    await db().doc('sections/SEC1').update({ schoolYear: '2025-2026' });
    for (const uid of ['glc', 'adv']) await expect(save(uid)).rejects.toMatchObject(denied);
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

// The file is written before the Firestore transaction, so the learner can vanish
// or the transaction can fail while the new file is already in the bucket.
describe('saveStudentPhoto when the transaction fails', () => {
  const gone = { code: 'not-found', message: 'Learner not found.' };
  const deleteLearner = () => db().doc('students/S1').delete();

  // Runs the hook right after the file lands, before the transaction starts.
  function afterFileSaved(hook) {
    const file = bucket.file;
    bucket.file = (path) => {
      const f = file(path);
      return { ...f, async save(...args) { await f.save(...args); await hook(); } };
    };
  }

  // Saves with a database that, once the file is saved, rejects the transaction
  // (and, if asked, cannot read documents either).
  function saveWithOutage({ during = async () => {}, readsFail = false } = {}) {
    let down = false;
    afterFileSaved(async () => { await during(); down = true; });
    const flaky = new Proxy(db(), {
      get(target, key) {
        if (down && key === 'runTransaction') return async () => { throw new Error('firestore down'); };
        if (down && readsFail && key === 'doc') return () => ({ async get() { throw new Error('read down'); } });
        const value = Reflect.get(target, key);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    return saveStudentPhoto({ ...deps('admin'), db: flaky }, { studentId: 'S1', contentBase64: jpeg(300, 300) });
  }

  it('removes the file when the learner is deleted mid-save', async () => {
    await save('admin', 'S11');
    afterFileSaved(deleteLearner);
    await expect(save('admin')).rejects.toMatchObject(gone);
    expect([...bucket.files.keys()]).toEqual(['student_photos/S11.jpg']);
    expect((await db().doc('students/S1').get()).exists).toBe(false);
    expect((await audits()).map(r => r.targetId)).toEqual(['S11']);
  });

  it('removes the replacement of an earlier photo when the learner is deleted mid-save', async () => {
    await save('admin');
    afterFileSaved(deleteLearner);
    await expect(save('admin', 'S1', jpeg(300, 300))).rejects.toMatchObject(gone);
    expect(bucket.files.size).toBe(0);
  });

  it('removes the file when the transaction fails for another reason and the learner is gone', async () => {
    await expect(saveWithOutage({ during: deleteLearner })).rejects.toThrow('firestore down');
    expect(bucket.files.size).toBe(0);
  });

  it('reports the original error when the file cannot be removed', async () => {
    const file = bucket.file;
    let attempts = 0;
    bucket.file = (path) => ({ ...file(path), async delete() { attempts += 1; throw new Error('storage down'); } });
    afterFileSaved(deleteLearner);
    await expect(save('admin')).rejects.toMatchObject(gone);
    expect(attempts).toBe(1);
  });

  it('keeps the file of a learner who already had a photo', async () => {
    await save('admin');
    const before = await student();
    await expect(saveWithOutage()).rejects.toThrow('firestore down');
    expect([...bucket.files.keys()]).toEqual([PATH]);
    expect(await student()).toEqual(before);
  });

  // A concurrent save may be about to record this same path, so it is left alone.
  it('keeps the file while the learner record exists, even with no photo recorded', async () => {
    await expect(saveWithOutage()).rejects.toThrow('firestore down');
    expect([...bucket.files.keys()]).toEqual([PATH]);
  });

  it('keeps the file when it cannot confirm that the learner is gone', async () => {
    await save('admin');
    await expect(saveWithOutage({ readsFail: true })).rejects.toThrow('firestore down');
    expect([...bucket.files.keys()]).toEqual([PATH]);
  });
});

describe('getStudentPhoto', () => {
  beforeEach(() => save('admin'));

  it.each(['admin', 'glc', 'log', 'adv', 'gA', 'gB'])('shows the photo to %s', async (uid) => {
    expect(await read(uid)).toEqual({ photo: { contentBase64: jpeg(), updatedAt: NOW.getTime() } });
  });

  it.each([
    ['gC', 'a revoked family link'],
    ['gR', 'a link with relationship Adviser'],
    ['gS', 'a link in the adviser slot'],
    ['gX', 'a link document that names another guardian'],
    ['jhs', 'a JHS academic coordinator'],
    ['shs', 'an SHS academic coordinator'],
    ['glc8', 'the coordinator of another grade level'],
    ['glcnone', 'a grade level coordinator without a grade'],
    ['logoff', 'a disabled logistic operator'],
    ['logtemp', 'a logistic operator who must change their password'],
    ['logimp', 'a logistic profile bound to another account'],
    ['cur', 'a curriculum adviser'],
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
    await expect(read('glc', 'S11')).rejects.toMatchObject(denied);
  });

  it('shows a logistic operator the photos of every grade', async () => {
    await save('log', 'S11', jpeg(300, 300));
    expect((await read('log')).photo.contentBase64).toBe(jpeg());
    expect((await read('log', 'S11')).photo.contentBase64).toBe(jpeg(300, 300));
    for (const uid of ['jhs', 'shs']) await expect(read(uid, 'S11')).rejects.toMatchObject(denied);
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
