import { buildBatchView } from './idCardQueue.js';
import { skipReasonText } from './slipIssue.js';

// Must match functions/src/lib/slipBatch.js: one press issues at most this many.
export const MAX_BATCH_ISSUE = 64;

export const OTHER_REASON = 'Other';
export const SLIP_BATCH_REASONS = ['Lost slip', 'Damaged slip', 'New enrollee / transferee', 'Section changed', OTHER_REASON];

// The reason saved on a batch entry (1–200 chars, see firestore.rules), or ''
// while Other has no note yet.
export function batchReason(choice, note = '') {
  if (choice !== OTHER_REASON) return choice;
  const text = note.trim();
  return text ? `Other: ${text}`.slice(0, 200) : '';
}

export const issueButtonLabel = (n) =>
  (n > MAX_BATCH_ISSUE ? `Issue first ${MAX_BATCH_ISSUE} slips` : `Issue ${n} ${n === 1 ? 'slip' : 'slips'}`);

// Splits the saved batch into learners the next press can issue (in print
// order) and learners it can't: no longer enrolled or missing (known here),
// or skipped by the server on the last press (`lastSkipped`: id → reason).
export function splitSlipBatch({ batchDocs, enrolled, students, lastSkipped = new Map() }) {
  const { printable, notPrintable } = buildBatchView({ batchDocs, enrolled, students });
  const reasonById = new Map(batchDocs.map((d) => [d.id, d.reason]));
  const canIssue = [];
  const cantIssue = [];
  for (const entry of printable) {
    const id = entry.student.id;
    const skipped = lastSkipped.get(id);
    if (skipped) cantIssue.push({ id, student: entry.student, reason: reasonById.get(id), why: skipReasonText(skipped) });
    else canIssue.push({ ...entry, reason: reasonById.get(id) });
  }
  for (const { id, student } of notPrintable) {
    cantIssue.push({ id, student, reason: reasonById.get(id), why: student ? 'not enrolled this school year' : 'learner record missing' });
  }
  return { canIssue, cantIssue };
}
