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

// Normalizes each learner once so typing only compares prepared words.
// Keeps the caller's order (e.g. depedSort output or the ID card print order).
export function buildLearnerIndex(items, toLearner = (item) => item) {
  return items.map((item) => {
    const learner = toLearner(item) || {};
    return {
      item,
      words: [learner.firstName, learner.lastName].filter((field) => typeof field === 'string').flatMap(words),
      lrn: normalize(learner.lrn),
    };
  });
}

// Same matching rules as learnerMatches, against a prebuilt index. Results
// stay in index order, so callers never sort per keystroke.
export function searchLearners(index, query, { includeLrn = false, accept, limit = Infinity } = {}) {
  const queryWords = words(query);
  const compactQuery = normalize(query).replace(/\s+/g, '');
  const results = [];
  for (const entry of index) {
    if (results.length >= limit) break;
    const nameHit = queryWords.every((queryWord) => entry.words.some((word) => word.startsWith(queryWord)));
    const hit = nameHit || (includeLrn && entry.lrn.startsWith(compactQuery));
    if (hit && (!accept || accept(entry.item))) results.push(entry.item);
  }
  return results;
}
