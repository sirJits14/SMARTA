export const countByKind = (results) => {
  const counts = { all: results.length, new: 0, update: 0, error: 0 };
  for (const r of results) counts[r.kind] += 1;
  return counts;
};

export const filterResults = (results, filter) =>
  filter === 'all' ? results : results.filter((r) => r.kind === filter);

// Next/previous index with wrap-around; -1 means "nothing current yet".
export const stepIndex = (current, total, dir) => {
  if (total === 0) return -1;
  if (current < 0) return dir > 0 ? 0 : total - 1;
  return (current + dir + total) % total;
};
