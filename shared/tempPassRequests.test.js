import { describe, expect, it } from 'vitest';
import { passRequestBlocker, reasonError, isActivePassFor, cleanPassText, readyNotice, declinedNotice, canPrintGrade,
  MAX_PENDING_PASS_REQUESTS, PASS_NOTE_MAX } from './tempPassRequests.js';

const year = '2026-2027';
const student = { lrn: '100000000001', status: 'active' };
const enrollment = { status: 'enrolled', sectionId: 'SEC1', schoolYear: year };
const blocker = (over = {}) => passRequestBlocker({ student, enrollment, sectionId: 'SEC1', schoolYear: year, pendingRequest: false, ...over });

describe('who can be requested', () => {
  it('allows an enrolled learner of the class with or without a photo', () => {
    expect(blocker()).toBeNull();
    expect(blocker({ student: { ...student, photo: { path: 'p' } } })).toBeNull();
  });
  it('names what blocks a request', () => {
    expect(blocker({ student: undefined })).toBe('not-in-class');
    expect(blocker({ enrollment: { ...enrollment, sectionId: 'OTHER' } })).toBe('not-in-class');
    expect(blocker({ enrollment: { ...enrollment, status: 'dropped' } })).toBe('not-in-class');
    expect(blocker({ enrollment: { ...enrollment, schoolYear: '2025-2026' } })).toBe('not-in-class');
    expect(blocker({ student: { ...student, status: 'transferred' } })).toBe('inactive');
    expect(blocker({ student: { ...student, lrn: ' ' } })).toBe('no-lrn');
    expect(blocker({ student: { ...student, idCard: { printedAt: 1, lrn: student.lrn } } })).toBe('official-printed');
    expect(blocker({ pendingRequest: true })).toBe('already-requested');
  });
});

describe('reasons', () => {
  it('needs Lost or Damaged only when a pass is active', () => {
    expect(reasonError('new', false)).toBe('');
    expect(reasonError('lost', true)).toBe('');
    expect(reasonError('damaged', true)).toBe('');
    expect(reasonError('new', true)).toMatch(/Lost or Damaged/);
    expect(reasonError('lost', false)).toMatch(/no temporary pass/);
    expect(reasonError('stolen', false)).toMatch(/reason/);
  });
  it('treats only this year’s active pass for the current LRN as active', () => {
    const pass = { status: 'active', lrn: student.lrn, schoolYear: year };
    expect(isActivePassFor(pass, student, year)).toBe(true);
    expect(isActivePassFor({ ...pass, status: 'revoked' }, student, year)).toBe(false);
    expect(isActivePassFor({ ...pass, lrn: '2' }, student, year)).toBe(false);
    expect(isActivePassFor({ ...pass, schoolYear: '2025-2026' }, student, year)).toBe(false);
    expect(isActivePassFor(undefined, student, year)).toBe(false);
  });
});

describe('text and notices', () => {
  it('cleans and limits free text', () => {
    expect(cleanPassText('  a\u0000b  ', 10)).toBe('a b');
    expect(cleanPassText('x'.repeat(PASS_NOTE_MAX + 5), PASS_NOTE_MAX)).toHaveLength(PASS_NOTE_MAX);
    expect(cleanPassText(null, 10)).toBe('');
  });
  it('words the notices', () => {
    expect(readyNotice({ name: 'Ana Cruz', place: 'Logistics Office' }))
      .toEqual({ title: 'Temporary pass ready', body: 'Temporary pass for Ana Cruz is ready for pick-up at Logistics Office.' });
    expect(readyNotice({ name: 'Ana Cruz', place: ' ' }).body).toBe('Temporary pass for Ana Cruz is ready for pick-up.');
    expect(declinedNotice({ name: 'Ana Cruz', reason: 'Has an official ID' }))
      .toEqual({ title: 'Temporary pass request declined', body: 'Ana Cruz: Has an official ID' });
  });
  it('decides grade scope for printers', () => {
    expect(canPrintGrade({ role: 'logistic' }, 12)).toBe(true);
    expect(canPrintGrade({ role: 'glc', gradeLevel: 8 }, 8)).toBe(true);
    expect(canPrintGrade({ role: 'glc', gradeLevel: 8 }, 9)).toBe(false);
    expect(canPrintGrade({ role: 'jhs_coord' }, 8)).toBe(false);
    expect(MAX_PENDING_PASS_REQUESTS).toBe(40);
  });
});
