export function sortIssuedSlips(entries) {
  const rank = (sex) => sex === 'M' ? 0 : sex === 'F' ? 1 : 2;
  const compareName = (a, b) => String(a || '').localeCompare(String(b || ''), 'en', { sensitivity: 'base' });
  return [...entries].sort((a, b) =>
    rank(a.student.sex) - rank(b.student.sex) ||
    compareName(a.student.lastName, b.student.lastName) ||
    compareName(a.student.firstName, b.student.firstName)
  ).map(({ slip }) => slip);
}
