import { describe, expect, it } from 'vitest';
import { reviewSections, sessionCell } from './sessionReview.js';

const sections = [
  { id: 'b', name: 'Luna', gradeLevel: 8, schoolYear: '2026-2027' },
  { id: 'a', name: 'Rizal', gradeLevel: 7, schoolYear: '2026-2027' },
  { id: 'c', name: 'Old', gradeLevel: 7, schoolYear: '2025-2026' },
];

describe('session review', () => {
  it('shows administrators every current section and coordinators their grades', () => {
    expect(reviewSections(sections, { role: 'admin' }, '2026-2027').map(s => s.id)).toEqual(['a', 'b']);
    expect(reviewSections(sections, { role: 'glc', gradeLevel: 8 }, '2026-2027').map(s => s.id)).toEqual(['b']);
    expect(reviewSections(sections, { role: 'nobody' }, '2026-2027')).toEqual([]);
  });
  it('labels a flagged session neutrally with its reason and author', () => {
    const row = { gate: { timeIn: '07:12' }, am: { status: 'A', overrideActive: true, reason: 'Not in class', actorName: 'Ms. Reyes' }, pm: { status: 'L' } };
    expect(sessionCell(row, 'am')).toEqual({ gate: '07:12', flagged: true, label: 'Not in class', reason: 'Not in class', by: 'Ms. Reyes' });
    expect(sessionCell(row, 'pm')).toEqual({ gate: '07:12', flagged: false, label: 'Late', reason: '', by: '' });
    expect(sessionCell({ gate: {}, am: {} }, 'am')).toEqual({ gate: null, flagged: false, label: 'No mark', reason: '', by: '' });
  });
});
