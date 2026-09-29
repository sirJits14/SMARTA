export function normalize(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

export function words(text) {
  return normalize(text).split(/[\s,.\-]+/).filter(Boolean);
}

export function matchesWords(query, ...fields) {
  const queryWords = words(query);
  if (queryWords.length === 0) return true;
  const fieldWords = fields
    .filter((field) => typeof field === 'string')
    .flatMap(words);
  return queryWords.every((queryWord) => fieldWords.some((fieldWord) => fieldWord.startsWith(queryWord)));
}

export function learnerMatches(query, student, { includeLrn = false } = {}) {
  const learner = student || {};
  if (matchesWords(query, learner.firstName, learner.lastName)) return true;
  if (!includeLrn) return false;
  const compactQuery = normalize(query).replace(/\s+/g, '');
  return normalize(learner.lrn).startsWith(compactQuery);
}

export function sectionMatches(query, section) {
  return matchesWords(query, section?.name);
}
