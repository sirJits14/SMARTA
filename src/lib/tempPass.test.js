import { describe, expect, it, vi } from 'vitest';
import { PASSES_PER_SHEET, passRowStatus, fitText, chunkSheets, passSectionLine, skipReasonText, mapWithLimit, loadImage, livePreviewCheck, previewKey, ignoreWhenStale } from './tempPass.js';

const schoolYear = '2026-2027';
const section = { id: 'sec11', gradeLevel: 11, name: 'Rizal', strand: 'STEM', schoolYear };
const enrollment = { studentId: 's1', sectionId: 'sec11', status: 'enrolled', schoolYear };
const student = { id: 's1', lrn: '123456789012', status: 'active', photo: { path: 'student_photos/s1.jpg' } };
const pass = (over = {}) => ({ code: 'BNHS-TP-ABCDEFGHJK', status: 'active', lrn: '123456789012', schoolYear, ...over });
const status = (over = {}) => passRowStatus({ student, enrollment, section, schoolYear, pass: undefined, ...over });

describe('passRowStatus', () => {
  it('shows an official card printed for the present LRN first, even with an active pass', () => {
    const printed = { ...student, idCard: { printedAt: 1, lrn: student.lrn } };
    expect(status({ student: printed, pass: pass() })).toEqual({ key: 'official', label: 'Official ID issued', tone: 'neutral', printable: false });
  });
  it('refuses learners who are not active', () => {
    expect(status({ student: { ...student, status: 'dropped' }, pass: pass() })).toMatchObject({ key: 'inactive', label: 'Not active', printable: false });
  });
  it('refuses learners without an LRN', () => {
    expect(status({ student: { ...student, lrn: ' ' } })).toMatchObject({ key: 'no-lrn', label: 'No LRN', printable: false });
  });
  it('treats an active pass for this LRN and year as active and printable', () => {
    expect(status({ pass: pass() })).toEqual({ key: 'active', label: 'Active', tone: 'success', printable: true });
  });
  it('does not call a pass for an old LRN or year active', () => {
    expect(status({ pass: pass({ lrn: '999' }) }).key).toBe('ready');
    expect(status({ pass: pass({ schoolYear: '2025-2026' }) }).key).toBe('ready');
  });
  it('prints a learner without a photo, saying the card has no photo', () => {
    const noPhoto = { ...student, photo: null };
    expect(status({ student: noPhoto })).toEqual({ key: 'ready', label: 'Ready · no photo', tone: 'info', printable: true });
    expect(status({ student: noPhoto, pass: pass() })).toMatchObject({ key: 'active', printable: true });
  });
  it('shows a pass revoked this year', () => {
    expect(status({ pass: pass({ status: 'revoked' }) })).toEqual({ key: 'revoked', label: 'Revoked', tone: 'danger', printable: true });
    expect(status({ pass: pass({ status: 'revoked', schoolYear: '2025-2026' }) }).key).toBe('ready');
  });
  it('shows a pass superseded this year', () => {
    expect(status({ pass: pass({ status: 'superseded' }) })).toEqual({ key: 'superseded', label: 'Superseded', tone: 'neutral', printable: true });
  });
  it('is ready otherwise', () => {
    expect(status()).toEqual({ key: 'ready', label: 'Ready', tone: 'info', printable: true });
  });
  it('refuses a learner who is not enrolled in a section this year', () => {
    expect(status({ enrollment: { ...enrollment, status: 'dropped' } })).toMatchObject({ key: 'not-enrolled', printable: false });
  });
});

describe('fitText', () => {
  it('keeps the size when the text fits', () => {
    expect(fitText('JUAN', 551, 40)).toEqual({ fontSize: 40 });
  });
  it('shrinks long text and pins its length', () => {
    const text = 'X'.repeat(30);
    expect(fitText(text, 551, 40)).toEqual({ fontSize: 551 / (30 * 0.66), textLength: 551 });
  });
  it('never shrinks below 60% of the size', () => {
    const text = 'X'.repeat(60);
    expect(fitText(text, 551, 40)).toEqual({ fontSize: 24, textLength: 551 });
  });
});

describe('chunkSheets', () => {
  it('fits four passes on an A4 sheet', () => { expect(PASSES_PER_SHEET).toBe(4); });
  it('puts four passes on each sheet', () => {
    const sheets = chunkSheets(Array.from({ length: 10 }, (_, i) => i));
    expect(sheets.map(s => s.length)).toEqual([4, 4, 2]);
    expect(sheets[1][0]).toBe(4);
  });
  it('makes no sheet for nothing', () => {
    expect(chunkSheets([])).toEqual([]);
  });
});

describe('passSectionLine', () => {
  it('names grade, section and strand in capitals', () => {
    expect(passSectionLine(section)).toBe('GRADE 11 – RIZAL · STEM');
  });
  it('leaves out a missing strand', () => {
    expect(passSectionLine({ gradeLevel: 7, name: 'Sampaguita' })).toBe('GRADE 7 – SAMPAGUITA');
  });
});

describe('skipReasonText', () => {
  it('explains every server and client reason', () => {
    for (const reason of ['not-found', 'not-enrolled', 'inactive', 'no-lrn', 'official-printed', 'out-of-scope', 'photo-unavailable', 'qr-failed', 'not-pending']) {
      expect(skipReasonText(reason)).toMatch(/^[a-z]/i);
    }
    expect(skipReasonText('something-new')).toBe('could not be prepared');
    expect(skipReasonText('not-pending')).toBe('the request was already handled');
  });
});

describe('mapWithLimit', () => {
  it('keeps order and never runs more than the limit at once', async () => {
    let running = 0; let peak = 0;
    const out = await mapWithLimit([1, 2, 3, 4, 5, 6, 7], 4, async (n) => {
      running += 1; peak = Math.max(peak, running);
      await new Promise(r => setTimeout(r, 1));
      running -= 1;
      return n * 2;
    });
    expect(out).toEqual([2, 4, 6, 8, 10, 12, 14]);
    expect(peak).toBe(4);
  });
});

describe('loadImage', () => {
  const fakeImage = (behaviour) => class {
    constructor() { this.complete = false; this.naturalWidth = 0; }
    set src(value) { this._src = value; behaviour(this); }
    get src() { return this._src; }
  };
  it('resolves on decode', async () => {
    const ImageCtor = fakeImage((img) => { img.decode = () => Promise.resolve(); });
    await expect(loadImage('a', { ImageCtor })).resolves.toBeUndefined();
  });
  it('falls back to the load event when decode never settles (hidden tab)', async () => {
    const ImageCtor = class {
      decode() { return new Promise(() => {}); }
      set src(v) { setTimeout(() => { this.complete = true; this.naturalWidth = 10; this.onload(); }, 1); }
    };
    await expect(loadImage('a', { ImageCtor, timeoutMs: 1000 })).resolves.toBeUndefined();
  });
  it('falls back to the load event when decode rejects', async () => {
    const ImageCtor = class {
      decode() { return Promise.reject(new Error('EncodingError')); }
      set src(v) { setTimeout(() => this.onload(), 5); }
    };
    await expect(loadImage('a', { ImageCtor, timeoutMs: 1000 })).resolves.toBeUndefined();
  });
  it('rejects on an error event', async () => {
    const ImageCtor = class { set src(v) { setTimeout(() => this.onerror(), 1); } };
    await expect(loadImage('a', { ImageCtor, timeoutMs: 1000 })).rejects.toThrow();
  });
  it('gives up after the timeout instead of hanging', async () => {
    vi.useFakeTimers();
    try {
      const ImageCtor = class { decode() { return new Promise(() => {}); } set src(v) {} };
      const pending = expect(loadImage('a', { ImageCtor, timeoutMs: 500 })).rejects.toThrow(/timed out/);
      await vi.advanceTimersByTimeAsync(600);
      await pending;
    } finally { vi.useRealTimers(); }
  });
});

describe('livePreviewCheck', () => {
  const items = [{ studentId: 's1', code: 'C1', lrn: 'L1' }, { studentId: 's2', code: 'C2', lrn: 'L2' }];
  const live = (entries) => new Map(entries.map(([id, p]) => [id, { lrn: `L${id.slice(1)}`, ...p }]));
  it('waits until every prepared pass is seen active with its code', () => {
    const r = livePreviewCheck(items, live([['s1', { status: 'active', code: 'C1' }], ['s2', { status: 'revoked', code: 'OLD' }]]), new Set());
    expect(r).toEqual({ confirmed: new Set(['s1']), stale: false, allLive: false });
  });
  it('is live when all are confirmed', () => {
    const r = livePreviewCheck(items, live([['s1', { status: 'active', code: 'C1' }], ['s2', { status: 'active', code: 'C2' }]]), new Set());
    expect(r.allLive).toBe(true);
    expect(r.stale).toBe(false);
  });
  it('is stale once a confirmed pass stops being active with that code', () => {
    const revoked = live([['s1', { status: 'revoked', code: 'C1' }], ['s2', { status: 'active', code: 'C2' }]]);
    expect(livePreviewCheck(items, revoked, new Set(['s1', 's2'])).stale).toBe(true);
    const replaced = live([['s1', { status: 'active', code: 'C9' }], ['s2', { status: 'active', code: 'C2' }]]);
    expect(livePreviewCheck(items, replaced, new Set(['s1'])).stale).toBe(true);
    expect(livePreviewCheck(items, live([['s2', { status: 'active', code: 'C2' }]]), new Set(['s1'])).stale).toBe(true);
  });
  it('needs the live pass to carry the printed LRN', () => {
    const otherLrn = live([['s1', { status: 'active', code: 'C1', lrn: 'L9' }], ['s2', { status: 'active', code: 'C2' }]]);
    expect(livePreviewCheck(items, otherLrn, new Set())).toEqual({ confirmed: new Set(['s2']), stale: false, allLive: false });
    expect(livePreviewCheck(items, otherLrn, new Set(['s1', 's2'])).stale).toBe(true);
  });
  it('waits rather than discarding while a lagging snapshot still shows the old pass', () => {
    const other = live([['s1', { status: 'active', code: 'C7' }], ['s2', { status: 'active', code: 'C2' }]]);
    expect(livePreviewCheck(items, other, new Set())).toMatchObject({ stale: false, allLive: false });
  });
});

describe('previewKey', () => {
  const base = { sectionId: 'g8', learners: [{ id: 's1', name: 'CRUZ, ANA', lrn: '1' }], principalName: 'P', principalTitle: 'T' };
  it('changes when a selected learner’s printed name or LRN changes', () => {
    expect(previewKey(base)).toBe(previewKey({ ...base }));
    expect(previewKey({ ...base, learners: [{ id: 's1', name: 'CRUZ, ANNA', lrn: '1' }] })).not.toBe(previewKey(base));
    expect(previewKey({ ...base, learners: [{ id: 's1', name: 'CRUZ, ANA', lrn: '2' }] })).not.toBe(previewKey(base));
  });
  it('changes with the request, the photo and the printed section line', () => {
    const one = (over) => previewKey({ ...base, learners: [{ id: 's1', name: 'CRUZ, ANA', lrn: '1', ...over }] });
    expect(one({ requestId: 'r1' })).not.toBe(previewKey(base));
    expect(one({ photo: 'student_photos/s1.jpg' })).not.toBe(previewKey(base));
    expect(one({ sectionLine: 'GRADE 8 – RIZAL' })).not.toBe(previewKey(base));
  });
  it('changes with the section, the selection and the principal', () => {
    expect(previewKey({ ...base, sectionId: 'g9' })).not.toBe(previewKey(base));
    expect(previewKey({ ...base, learners: [] })).not.toBe(previewKey(base));
    expect(previewKey({ ...base, principalTitle: 'U' })).not.toBe(previewKey(base));
  });
});

describe('ignoreWhenStale', () => {
  it('passes errors through while the run is current', async () => {
    await expect(ignoreWhenStale(async () => { throw new Error('boom'); }, () => true)()).rejects.toThrow('boom');
  });
  it('swallows the error of a superseded run', async () => {
    await expect(ignoreWhenStale(async () => { throw new Error('boom'); }, () => false)()).resolves.toBeUndefined();
  });
  it('returns the result otherwise', async () => {
    await expect(ignoreWhenStale(async () => 3, () => false)()).resolves.toBe(3);
  });
});
