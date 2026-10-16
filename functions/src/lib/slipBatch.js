// Slip batch issuing (spec 2026-10-16). One press issues at most this many
// learners: 4 Folio sheets, and well inside the 60 s callable timeout (a
// ~40-learner section takes about 14 s).
export const MAX_BATCH_ISSUE = 64;

// A press stops starting new learners after this long, so it ends well inside
// the 60 s timeout; learners not reached stay in the batch and count as
// `remaining`.
export const ISSUE_TIME_BUDGET_MS = 40_000;

// Oldest first, so learners who have waited longest are issued first.
// `entries` are { id, reason, addedAtMs }.
export function takeBatch(entries, max = MAX_BATCH_ISSUE) {
  const sorted = [...entries].sort((a, b) => a.addedAtMs - b.addedAtMs || a.id.localeCompare(b.id));
  return { take: sorted.slice(0, max), remaining: Math.max(0, sorted.length - max) };
}

const SEX_RANK = { M: 0, F: 1 };
const sexRank = (student) => SEX_RANK[student.sex] ?? 2;
const byName = (a, b) =>
  (a.lastName || '').localeCompare(b.lastName || '', 'en', { sensitivity: 'base' }) ||
  (a.firstName || '').localeCompare(b.firstName || '', 'en', { sensitivity: 'base' });

// Print order for issued slips: grade, section, then DepEd order (males, then
// females, each by last then first name) -- the same order as the ID Cards
// batch (src/lib/idCardQueue.js sortIdCardBatch). Entries are
// { student, section, sectionId }.
export function compareSlipEntries(a, b) {
  return Number(a.section?.gradeLevel ?? 0) - Number(b.section?.gradeLevel ?? 0) ||
    (a.section?.name || '').localeCompare(b.section?.name || '') ||
    (a.sectionId || '').localeCompare(b.sectionId || '') ||
    sexRank(a.student) - sexRank(b.student) ||
    byName(a.student, b.student);
}
