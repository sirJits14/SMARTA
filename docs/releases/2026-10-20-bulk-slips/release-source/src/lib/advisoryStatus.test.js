import { describe, expect, it } from 'vitest';
import { adviserStatusText, slipCandidates, slipConfirmMessage, issuedText, showAdvisoryPanel, withoutRevokedSlip,
  needingSlip, withSelected, selectedSections, selectionText } from './advisoryStatus.js';

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
    expect(slipConfirmMessage('issue', [s7, s8], new Map())).toBe('Issue advisory slips for 2 sections? Print them right away: the codes are shown only once.');
    expect(slipConfirmMessage('revoke', [s8], bySection)).toBe('Revoke the advisory slip for Grade 8 · Mabini? The printed slip stops working.');
  });
  it('names the ticked sections whose unused slips a bulk print replaces', () => {
    expect(slipConfirmMessage('issue', [s7, s8], bySection)).toBe('Issue advisory slips for 2 sections? Print them right away: the codes are shown only once. Grade 8 · Mabini already has an unused slip. That old slip stops working.');
    const many = ['C', 'D', 'E', 'F'].map((id, i) => ({ id, gradeLevel: 9, name: `S${i}` }));
    const open = new Map(many.map((s) => [s.id, { adviser: null, slip: { issuedAt: 0 } }]));
    expect(slipConfirmMessage('issue', many.slice(0, 2), open)).toBe('Issue advisory slips for 2 sections? Print them right away: the codes are shown only once. 2 already have an unused slip (Grade 9 · S0 and Grade 9 · S1). Those old slips stop working.');
    expect(slipConfirmMessage('issue', many, open)).toContain('4 already have an unused slip (Grade 9 · S0, Grade 9 · S1, Grade 9 · S2 and 1 more).');
  });
});

describe('ticking sections for a bulk print', () => {
  const s9 = { id: 'C', gradeLevel: 8, name: 'Luna' };
  const status = new Map([...bySection, ['C', { sectionId: 'C', adviser: null, slip: null }]]);
  it('selects only sections without an open slip', () => {
    expect(needingSlip([s8, s9], status).map((s) => s.id)).toEqual(['C']);
    expect([...withSelected(new Set(['B']), [s9])]).toEqual(['B', 'C']);
  });
  it('keeps only ticks that can still be printed, in table order', () => {
    expect(selectedSections(new Set(['C', 'A', 'B']), [s8, s9]).map((s) => s.id)).toEqual(['B', 'C']);
  });
  it('says how many ticked sections replace an unused slip', () => {
    expect(selectionText([s9], status)).toBe('1 section selected');
    expect(selectionText([s8, s9], status)).toBe('2 sections selected · 1 will replace an unused slip');
  });
  it('summarises an issue run', () => {
    expect(issuedText({ issued: [{}, {}], skipped: [{ sectionId: 'A', reason: 'has-adviser' }] })).toBe('2 slips ready. 1 section skipped because it already has an adviser.');
    expect(issuedText({ issued: [{}], skipped: [] })).toBe('1 slip ready.');
  });
});

describe('advisory panel and ID cards stay out of each other\'s printouts', () => {
  it('shows the slip panel only while no section detail is open', () => {
    const result = { issued: [{ sectionId: 'A', code: 'ABCD2345' }], skipped: [] };
    expect(showAdvisoryPanel(result, null)).toBe(true);
    expect(showAdvisoryPanel(result, s7)).toBe(false);
    expect(showAdvisoryPanel(null, null)).toBe(false);
  });
  it('drops a revoked section from the open panel and closes it when empty', () => {
    const result = { issued: [{ sectionId: 'A', code: 'AAAA2222' }, { sectionId: 'B', code: 'BBBB3333' }], skipped: [{ sectionId: 'C', reason: 'has-adviser' }] };
    expect(withoutRevokedSlip(result, 'A')).toEqual({ issued: [{ sectionId: 'B', code: 'BBBB3333' }], skipped: [{ sectionId: 'C', reason: 'has-adviser' }] });
    expect(withoutRevokedSlip(result, 'Z')).toEqual(result);
    expect(withoutRevokedSlip({ issued: [{ sectionId: 'A' }], skipped: [] }, 'A')).toBeNull();
    expect(withoutRevokedSlip(null, 'A')).toBeNull();
  });
});
