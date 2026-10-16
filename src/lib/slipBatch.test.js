import { describe, it, expect } from 'vitest';
import { MAX_BATCH_ISSUE, OTHER_REASON, SLIP_BATCH_REASONS, batchReason, issueButtonLabel, issueConfirmText, splitSlipBatch } from './slipBatch.js';

describe('reasons', () => {
  it('offers the fixed list with Other last', () => {
    expect(SLIP_BATCH_REASONS).toEqual(['Lost slip', 'Damaged slip', 'New enrollee / transferee', 'Section changed', 'Other']);
    expect(OTHER_REASON).toBe('Other');
  });
  it('stores a listed reason as is and Other with its note', () => {
    expect(batchReason('Lost slip')).toBe('Lost slip');
    expect(batchReason('Other', '  torn in half ')).toBe('Other: torn in half');
    expect(batchReason('Other', '   ')).toBe('');
    expect(batchReason('Other', 'x'.repeat(300))).toHaveLength(200);
  });
});

describe('issueButtonLabel', () => {
  it('names the count, and the cap above 64', () => {
    expect(MAX_BATCH_ISSUE).toBe(64);
    expect(issueButtonLabel(1)).toBe('Issue 1 slip');
    expect(issueButtonLabel(64)).toBe('Issue 64 slips');
    expect(issueButtonLabel(65)).toBe('Issue first 64 slips');
  });
});

describe('splitSlipBatch', () => {
  const section = { id: 'SEC1', gradeLevel: 7, name: 'Rizal' };
  const ana = { id: 'S1', lrn: '1', firstName: 'Ana', lastName: 'Cruz', sex: 'F' };
  const ben = { id: 'S2', lrn: '2', firstName: 'Ben', lastName: 'Dy', sex: 'M' };
  const gone = { id: 'S3', lrn: '3', firstName: 'Cy', lastName: 'Ely', sex: 'M' };
  const enrolled = [{ student: ben, section }, { student: ana, section }];
  const students = [ana, ben, gone];
  const batchDocs = [{ id: 'S1', reason: 'Lost slip' }, { id: 'S2', reason: 'Damaged slip' }, { id: 'S3', reason: 'Section changed' }, { id: 'S9', reason: 'Lost slip' }];

  it('keeps enrolled learners issuable in print order with their reasons', () => {
    const { canIssue } = splitSlipBatch({ batchDocs, enrolled, students });
    expect(canIssue.map((e) => [e.student.id, e.reason])).toEqual([['S2', 'Damaged slip'], ['S1', 'Lost slip']]);
  });
  it('lists learners who cannot be issued, with why', () => {
    const { cantIssue } = splitSlipBatch({ batchDocs, enrolled, students });
    expect(cantIssue.map((e) => [e.id, e.why])).toEqual([['S3', 'not enrolled this school year'], ['S9', 'learner record missing']]);
  });
  it('moves learners the server skipped last press to cannot issue', () => {
    const { canIssue, cantIssue } = splitSlipBatch({ batchDocs, enrolled, students, lastSkipped: new Map([['S2', 'fully-linked']]) });
    expect(canIssue.map((e) => e.student.id)).toEqual(['S1']);
    expect(cantIssue[0]).toMatchObject({ id: 'S2', reason: 'Damaged slip', why: 'all slots already linked' });
  });
});

describe('issueConfirmText', () => {
  const base = 'Their current slips stop working. Guardians already linked keep access.';
  it('asks about the learners to issue', () => {
    expect(issueConfirmText(1, 0)).toBe(`Issue new slips for 1 learner? ${base}`);
    expect(issueConfirmText(12, 0)).toBe(`Issue new slips for 12 learners? ${base}`);
  });
  it('warns that slips still on screen will be replaced', () => {
    expect(issueConfirmText(3, 1)).toBe(`Issue new slips for 3 learners? ${base} The slip on screen will be replaced — print it first.`);
    expect(issueConfirmText(3, 40)).toBe(`Issue new slips for 3 learners? ${base} The 40 slips on screen will be replaced — print them first.`);
  });
});
