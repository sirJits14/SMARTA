import { NAME_SUFFIXES, nameCase } from './format.js';

// Home lists learners the way DepEd forms do: males first, then females, each
// by last name and then first name. learners/{id} docs written before
// lastName/sex were projected are refreshed by the nightly job; until then
// their last name is the display name's last word (skipping Jr./III) and
// they sort after both groups.
const SEX_RANK = { M: 0, F: 1 };
const isSuffix = (w) => NAME_SUFFIXES.has(w.replace(/\.$/, '').toLowerCase());
const compare = (a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' });

function nameParts(learner, fallbackName) {
  if (learner?.lastName) return { last: learner.lastName, first: learner.firstName || '' };
  const words = (learner?.displayName || fallbackName || '').trim().split(/\s+/).filter(Boolean);
  while (words.length > 1 && isSuffix(words[words.length - 1])) words.pop();
  return { last: words.pop() || '', first: words.join(' ') };
}

// entries: [{ link, data }] where data is the learners/{id} doc (or null).
export function orderLearners(entries) {
  return entries
    .map((entry) => ({ entry, rank: SEX_RANK[entry.data?.sex] ?? 2, ...nameParts(entry.data, entry.link.learnerName) }))
    .sort((a, b) => a.rank - b.rank || compare(a.last, b.last) || compare(a.first, b.first)
      || compare(a.entry.link.studentId, b.entry.link.studentId))
    .map((k) => k.entry);
}

// "Dela Cruz, Juan S." when projected; the plain display name otherwise.
export const listName = (learner, fallbackName) => nameCase(learner?.formalName || learner?.displayName || fallbackName) || '—';
