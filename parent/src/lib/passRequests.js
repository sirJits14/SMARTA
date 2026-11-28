import S from '../strings.js';
import { MAX_PENDING_PASS_REQUESTS, REPLACE_REASONS } from '../../../shared/tempPassRequests.js';

const BLOCKERS = new Map([
  ['official-printed', S.passBlockedOfficial], ['already-requested', S.passBlockedRequested], ['no-lrn', S.passBlockedNoLrn],
  ['inactive', S.passBlockedInactive], ['not-in-class', S.passBlockedNotInClass],
]);

export const blockerText = (blocker) => (blocker ? BLOCKERS.get(blocker) || S.passBlockedOther : '');
// Why the server skipped a learner: a blocker, or 'reason' when the Lost or Damaged choice no longer fits.
export const skipText = (reason) => (reason === 'reason' ? S.passRequestChoiceChanged : blockerText(reason));

export const STATUS_LABEL = {
  pending: S.passRequestWaiting, printed: S.passRequestPrinted, declined: S.passRequestDeclined, withdrawn: S.passRequestWithdrawn,
};
export const REPLACE_LABEL = { lost: S.passRequestLost, damaged: S.passRequestDamaged };

// `picks` holds the ticked learners: studentId -> 'lost' | 'damaged', or '' when no choice is made.
// Only the current list decides what is sent: a blocked or missing learner is left out, and a learner
// with an active pass counts only once Lost or Damaged is chosen.
export function passItems(learners, picks) {
  const items = [];
  for (const { studentId, blocker, hasActivePass } of learners || []) {
    if (blocker || !Object.hasOwn(picks, studentId)) continue;
    if (!hasActivePass) items.push({ studentId, reason: 'new' });
    else if (REPLACE_REASONS.includes(picks[studentId])) items.push({ studentId, reason: picks[studentId] });
  }
  return items.slice(0, MAX_PENDING_PASS_REQUESTS);
}

// Ticked learners with an active pass who still need Lost or Damaged. Nothing is sent while there are any,
// so a ticked learner is never left out without the adviser knowing.
export function unchosenCount(learners, picks) {
  return (learners || []).filter(({ studentId, blocker, hasActivePass }) => !blocker && hasActivePass
    && Object.hasOwn(picks, studentId) && !REPLACE_REASONS.includes(picks[studentId])).length;
}

// After the list reloads: unticks learners who became blocked or left, and forgets a Lost or Damaged
// choice once there is no pass to replace. Returns the same object when nothing changes.
export function prunePicks(picks, learners) {
  const byId = new Map(learners.map((l) => [l.studentId, l]));
  let changed = false;
  const next = {};
  for (const [studentId, choice] of Object.entries(picks)) {
    const learner = byId.get(studentId);
    if (!learner || learner.blocker) { changed = true; continue; }
    next[studentId] = learner.hasActivePass ? choice : '';
    if (next[studentId] !== choice) changed = true;
  }
  return changed ? next : picks;
}

// requestTempPassesFn answers { created, skipped }; `learners` is the list the request was made from.
export function sendOutcome({ created, skipped }, learners) {
  const names = new Map(learners.map((l) => [l.studentId, l.displayName]));
  return {
    sent: created.length > 0,
    skipped: skipped.map(({ studentId, reason }) => ({ studentId, name: names.get(studentId) || studentId, text: skipText(reason) })),
  };
}

// A loaded list belongs to one class: another class (or a disabled one) gets nothing from it.
export function passListFor(state, sectionId, active) {
  if (!active || state.sectionId !== sectionId) return { learners: null, requests: null, loading: active, error: '' };
  const { learners, requests, loading, error } = state;
  return { learners, requests, loading, error };
}

// One send or withdraw at a time. The list is refreshed after every attempt, because a send can fail
// partway and leave some requests created. Resolves to null when another attempt is still running.
export function createOneAtATime() {
  let running = false;
  return async (work, after) => {
    if (running) return null;
    running = true;
    try { return { value: await work() }; }
    catch (error) { return { error }; }
    finally {
      try { await after(); } catch { /* the list reports its own error */ }
      running = false;
    }
  };
}
