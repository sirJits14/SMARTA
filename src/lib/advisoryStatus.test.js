import { describe, expect, it } from 'vitest';
import { adviserStatusText, slipCandidates, slipConfirmMessage, issuedText } from './advisoryStatus.js';

const s7 = { id: 'A', gradeLevel: 7, name: 'Rizal' };
const s8 = { id: 'B', gradeLevel: 8, name: 'Mabini' };
const bySection = new Map([
  ['A', { sectionId: 'A', adviser: { name: 'Ana Cruz', email: 'ana@deped.gov.ph' }, slip: null }],
  ['B', { sectionId: 'B', adviser: null, slip: { issuedAt: Date.parse('2026-10-19T02:00:00Z'), issuedBy: 'admin@x' } }],
]);
describe('advisory status', () => {
  it('describes each section', () => {
    expect(adviserStatusText(bySection.get('A'))).toBe('In app: Ana Cruz');
    expect(adviserStatusText(bySection.get('B'))).toBe('Slip issued · Oct 19, 2026');
    expect(adviserStatusText({ adviser: null, slip: null })).toBe('No adviser in app');
    expect(adviserStatusText(undefined)).toBe('');
  });
  it('offers slips only for sections in scope without an adviser', () => {
    expect(slipCandidates([s7, s8], bySection, { role: 'admin' }).map(s => s.id)).toEqual(['B']);
    expect(slipCandidates([s7, s8], bySection, { role: 'glc', gradeLevel: 7 })).toEqual([]);
  });
  it('warns before replacing an outstanding slip', () => {
    expect(slipConfirmMessage('issue', [s8], bySection)).toBe('Print a new advisory slip for Grade 8 · Mabini? A new code will be printed. The old slip stops working.');
    expect(slipConfirmMessage('issue', [s7], new Map())).toBe('Issue an advisory slip for Grade 7 · Rizal? Print it right away: the code is shown only once.');
    expect(slipConfirmMessage('issue', [s7, s8], new Map())).toBe('Issue advisory slips for 2 sections without an adviser? Print them right away: the codes are shown only once. Any older unused slips for these sections stop working.');
    expect(slipConfirmMessage('revoke', [s8], bySection)).toBe('Revoke the advisory slip for Grade 8 · Mabini? The printed slip stops working.');
  });
  it('summarises an issue run', () => {
    expect(issuedText({ issued: [{}, {}], skipped: [{ sectionId: 'A', reason: 'has-adviser' }] })).toBe('2 slips ready. 1 section skipped because it already has an adviser.');
    expect(issuedText({ issued: [{}], skipped: [] })).toBe('1 slip ready.');
  });
});
