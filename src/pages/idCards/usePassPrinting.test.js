import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls = vi.hoisted(() => ({ fulfil: [], issue: [], photo: [], fulfilResult: null, issueResult: null, photos: {} }));
vi.mock('../../firebase.js', () => ({ db: {}, functions: {} }));
vi.mock('../../data/tempPasses.js', () => ({
  fulfilTempPassRequests: vi.fn(async (ids) => { calls.fulfil.push(ids); return calls.fulfilResult(ids); }),
  issueTempPasses: vi.fn(async (ids) => { calls.issue.push(ids); return calls.issueResult(ids); }),
  markTempPassRequestsPrinted: vi.fn(),
}));
vi.mock('../../data/photos.js', () => ({
  getStudentPhoto: vi.fn(async (id) => { calls.photo.push(id); return calls.photos[id]; }),
  photoDataUrl: (photo) => (photo?.contentBase64 ? `data:image/jpeg;base64,${photo.contentBase64}` : ''),
}));
vi.mock('../../components/TempPassPrintable.jsx', () => ({ TEMP_PASS_LOGO_URL: 'logo.png' }));

import { splitTargets, preparePasses, markableRequestIds, notifiedText, stillCurrent, PREPARE_ABORTED } from './usePassPrinting.js';

const section = { id: 'g8', gradeLevel: 8, name: 'Rizal', schoolYear: '2026-2027' };
const student = (id, over = {}) => ({ id, firstName: 'Ana', lastName: id.toUpperCase(), lrn: `L${id}`, photo: { path: `student_photos/${id}.jpg` }, ...over });
const target = (id, requestId, over) => ({ studentId: id, ...(requestId ? { requestId } : {}), student: student(id, over), section });
const loaded = [];
const load = async (src) => { loaded.push(src); if (String(src).includes('BROKEN')) throw new Error('bad'); };
const prepare = (targets) => preparePasses({ targets, principalName: 'P', principalTitle: 'T' }, { load });

beforeEach(() => {
  Object.assign(calls, { fulfil: [], issue: [], photo: [], photos: {} });
  loaded.length = 0;
  calls.fulfilResult = (ids) => ({ issued: ids.map((requestId) => ({ requestId, studentId: requestId.replace('r', 's'), code: `C-${requestId}` })), skipped: [] });
  calls.issueResult = (ids) => ({ issued: ids.map((studentId) => ({ studentId, code: `C-${studentId}` })), skipped: [] });
});

describe('splitTargets', () => {
  it('sends requested learners through their request and the rest as plain passes, each learner once', () => {
    expect(splitTargets([target('s1', 'r1'), target('s2'), target('s3', 'r3'), target('s2'), target('s1', 'r9')]))
      .toEqual({ requestIds: ['r1', 'r3'], studentIds: ['s2'] });
  });
  it('is empty for nothing', () => {
    expect(splitTargets([])).toEqual({ requestIds: [], studentIds: [] });
  });
});

describe('preparePasses', () => {
  it('only asks the server for learners whose photo loaded, keeping the others printable', async () => {
    calls.photos = { s2: { photo: { contentBase64: 'P2' } } };
    const { items, notPrepared } = await prepare([target('s1', 'r1', { photo: null }), target('s2', 'r2'), target('s3', 'r3')]);
    expect(calls.fulfil).toEqual([['r1', 'r2']]);
    expect(items.map((i) => [i.studentId, i.photoSrc])).toEqual([['s1', null], ['s2', 'data:image/jpeg;base64,P2']]);
    expect(notPrepared).toEqual([{ studentId: 's3', requestId: 'r3', reason: 'photo-unavailable' }]);
  });
  it('fulfils requests and issues the rest, then builds each card from its own learner', async () => {
    calls.photos = { s1: { photo: { contentBase64: 'P1' } }, s2: { photo: { contentBase64: 'P2' } } };
    const { items, notPrepared } = await prepare([target('s1', 'r1'), target('s2')]);
    expect(calls.fulfil).toEqual([['r1']]);
    expect(calls.issue).toEqual([['s2']]);
    expect(notPrepared).toEqual([]);
    expect(items.map(({ studentId, requestId, code, name, lrn, photoSrc, sectionLine }) => ({ studentId, requestId, code, name, lrn, photoSrc, sectionLine }))).toEqual([
      { studentId: 's1', requestId: 'r1', code: 'C-r1', name: 'S1, ANA', lrn: 'Ls1', photoSrc: 'data:image/jpeg;base64,P1', sectionLine: 'GRADE 8 – RIZAL' },
      { studentId: 's2', requestId: null, code: 'C-s2', name: 'S2, ANA', lrn: 'Ls2', photoSrc: 'data:image/jpeg;base64,P2', sectionLine: 'GRADE 8 – RIZAL' },
    ]);
    expect(items[0].qrSrc).toMatch(/^data:image\/png;base64,/);
    expect(loaded[0]).toBe('logo.png');
  });
  it('never asks for the photo of a learner without one, and prints the frame instead', async () => {
    const { items } = await prepare([target('s1', 'r1', { photo: null }), target('s2', undefined, { photo: { path: '' } })]);
    expect(calls.photo).toEqual([]);
    expect(items.map((i) => i.photoSrc)).toEqual([null, null]);
  });
  it('skips a learner whose photo is on record but cannot be loaded, never printing an empty frame', async () => {
    // s1: the server has no picture after all; s2: the picture fails to decode; s3: the call fails.
    calls.photos = { s1: { photo: null }, s2: { photo: { contentBase64: 'BROKEN' } } };
    const { getStudentPhoto } = await import('../../data/photos.js');
    getStudentPhoto.mockImplementationOnce(async (id) => { calls.photo.push(id); return calls.photos[id]; })
      .mockImplementationOnce(async (id) => { calls.photo.push(id); return calls.photos[id]; })
      .mockImplementationOnce(async () => { throw new Error('unavailable'); });
    const { items, notPrepared } = await prepare([target('s1'), target('s2'), target('s3', 'r3')]);
    expect(items).toEqual([]);
    // Checked before the server is asked, so a request that cannot print is never prepared
    // (a prepared request can no longer be declined).
    expect(calls.issue).toEqual([]);
    expect(calls.fulfil).toEqual([]);
    expect(notPrepared).toEqual([
      { studentId: 's1', requestId: null, reason: 'photo-unavailable' },
      { studentId: 's2', requestId: null, reason: 'photo-unavailable' },
      { studentId: 's3', requestId: 'r3', reason: 'photo-unavailable' },
    ]);
  });
  it('lists requests the server skipped, naming the learner from the request even when the server hides it', async () => {
    calls.fulfilResult = () => ({ issued: [], skipped: [{ requestId: 'r1', studentId: '', reason: 'out-of-scope' }, { requestId: 'r2', studentId: 's2', reason: 'not-pending' }] });
    const { items, notPrepared } = await prepare([target('s1', 'r1', { photo: null }), target('s2', 'r2', { photo: null })]);
    expect(items).toEqual([]);
    expect(notPrepared).toEqual([
      { studentId: 's1', requestId: 'r1', reason: 'out-of-scope' },
      { studentId: 's2', requestId: 'r2', reason: 'not-pending' },
    ]);
  });
  it('refuses to print a code the server returned for a different learner than the one asked about', async () => {
    calls.fulfilResult = () => ({ issued: [{ requestId: 'r1', studentId: 's9', code: 'C-x' }], skipped: [] });
    calls.issueResult = () => ({ issued: [{ studentId: 's7', code: 'C-y' }], skipped: [] });
    calls.photos = { s1: { photo: { contentBase64: 'P1' } }, s2: { photo: { contentBase64: 'P2' } } };
    const { items, notPrepared } = await prepare([target('s1', 'r1'), target('s2')]);
    expect(items).toEqual([]);
    expect(notPrepared).toEqual([{ studentId: 's1', requestId: 'r1', reason: 'not-found' }, { studentId: 's7', requestId: null, reason: 'not-found' }]);
  });
  it('asks at most 200 at a time', async () => {
    const targets = Array.from({ length: 201 }, (_, i) => target(`s${i}`, `r${i}`, { photo: null }));
    const { items } = await prepare(targets);
    expect(calls.fulfil.map((c) => c.length)).toEqual([200, 1]);
    expect(items).toHaveLength(201);
  }, 60000); // 201 real QR codes
});

describe('a selection that stops being current while preparing', () => {
  it('asks the server for nothing when it is already stale', async () => {
    const result = await preparePasses({ targets: [target('s1', 'r1', { photo: null }), target('s2', undefined, { photo: null })], principalName: 'P', principalTitle: 'T' },
      { load, isCurrent: () => false });
    expect(result).toBe(PREPARE_ABORTED);
    expect(calls.fulfil).toEqual([]);
    expect(calls.issue).toEqual([]);
  });
  it('asks the server for nothing when it changes while the photos load', async () => {
    let current = true;
    calls.photos = { s1: { photo: { contentBase64: 'P1' } } };
    const { getStudentPhoto } = await import('../../data/photos.js');
    getStudentPhoto.mockImplementationOnce(async (id) => { calls.photo.push(id); current = false; return calls.photos[id]; });
    const result = await preparePasses({ targets: [target('s1', 'r1'), target('s2')], principalName: 'P', principalTitle: 'T' }, { load, isCurrent: () => current });
    expect(result).toBe(PREPARE_ABORTED);
    expect(calls.fulfil).toEqual([]);
    expect(calls.issue).toEqual([]);
  });
  it('stops before the next batch once it changes', async () => {
    let current = true;
    calls.fulfilResult = (ids) => { current = false; return { issued: [], skipped: ids.map((requestId) => ({ requestId, studentId: '', reason: 'not-found' })) }; };
    const targets = Array.from({ length: 201 }, (_, i) => target(`s${i}`, `r${i}`, { photo: null }));
    expect(await preparePasses({ targets, principalName: 'P', principalTitle: 'T' }, { load, isCurrent: () => current })).toBe(PREPARE_ABORTED);
    expect(calls.fulfil).toHaveLength(1);
  });
});

describe('stillCurrent', () => {
  const at = { ticket: 3, key: 'k' };
  it('is current only while mounted, with the same run and the same selection', () => {
    expect(stillCurrent(at, { mounted: true, ticket: 3, key: 'k' })).toBe(true);
    expect(stillCurrent(at, { mounted: false, ticket: 3, key: 'k' })).toBe(false);
    expect(stillCurrent(at, { mounted: true, ticket: 4, key: 'k' })).toBe(false);
    expect(stillCurrent(at, { mounted: true, ticket: 3, key: 'other' })).toBe(false);
  });
});

describe('markableRequestIds', () => {
  const preview = (over) => ({ items: [{ studentId: 's1', requestId: 'r1' }, { studentId: 's2', requestId: null }], notPrepared: [], printed: true, ...over });
  it('marks only the requests whose cards were in the printed, confirmed preview', () => {
    expect(markableRequestIds(preview(), true)).toEqual(['r1']);
  });
  it('marks nothing before Print or while the passes are unconfirmed', () => {
    expect(markableRequestIds(preview({ printed: false }), true)).toEqual([]);
    expect(markableRequestIds(preview(), false)).toEqual([]);
    expect(markableRequestIds(null, true)).toEqual([]);
  });
});

describe('notifiedText', () => {
  it('says how many advisers were told, and how many could not be marked', () => {
    expect(notifiedText(3, 3)).toBe('3 advisers notified.');
    expect(notifiedText(1, 1)).toBe('1 adviser notified.');
    expect(notifiedText(1, 3)).toBe('1 adviser notified. 2 could not be marked printed because their pass changed. Prepare them again.');
  });
});
