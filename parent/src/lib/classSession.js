import { hasPmSession, sessionSplit } from '../../../shared/scheduleSessions.js';

// The adviser's Class tab: learners who came through the gate are the only
// ones who can be in school but not in class, so they come first.
export const FLAG_REASONS = ['Not in class', 'Left during class'];
export const RESTORE_REASONS = ['Was in class', 'Flagged by mistake'];
export const UNDO_REASON = 'Undone right after flagging';

export const hasTwoSessions = (schedule) => hasPmSession(schedule);

export function sessionNow(schedule, hhmm) {
  const split = sessionSplit(schedule);
  return split && hhmm >= split ? 'pm' : 'am';
}

// A morning arrival with no lunch tap-out is still on campus in the afternoon.
export function enteredFor(row, session) {
  const gate = row?.gate || {};
  if (session === 'am') return gate.timeIn || null;
  return gate.pmTimeIn || (gate.timeIn && !gate.timeOut ? gate.timeIn : null);
}

export function groupRoster(rows, session) {
  const groups = { inSchool: [], flagged: [], noEntry: [] };
  for (const row of rows) {
    const status = row[session] || {};
    if (status.overrideActive) groups.flagged.push(row);
    else if (enteredFor(row, session) && status.status !== 'A') groups.inSchool.push(row);
    else groups.noEntry.push(row);
  }
  return groups;
}

export const rosterSummary = (groups) => `${groups.inSchool.length + groups.flagged.length} entered · ${groups.flagged.length} flagged`;

export function reasonText(reason, note) {
  const base = String(reason || '').trim();
  const extra = String(note || '').trim();
  return (extra ? `${base}: ${extra}` : base).slice(0, 500);
}

export const correctionInput = ({ sectionId, date, session, row, absent, reason, operationId }) =>
  ({ sectionId, studentId: row.studentId, date, session, absent, reason, expectedRevision: row.revision, operationId });

// Batch flags stay gentle on the attendance document: a few writes at a time.
export async function runLimited(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      try { results[index] = { ok: true, value: await fn(items[index]) }; }
      catch (error) { results[index] = { ok: false, error }; }
    }
  }));
  return results;
}

// What the adviser can do to one session of a learner's day: Flag it, Restore a flag, or nothing.
export const flagAction = (data, key) => (!data?.canCorrect ? null : data[key]?.overrideActive ? 'restore' : 'flag');
