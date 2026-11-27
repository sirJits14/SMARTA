// The SIMS shows and prints every learner and adviser name in capitals. Stored names keep the case they were
// entered in; capitals are applied on the way out, so search, sorting and the Parents App are unaffected.
export const capsName = (name) => String(name ?? '').toUpperCase();

// A person's display name in capitals, or their email address as written when they have no name.
export const personLabel = (person) => (person?.displayName ? capsName(person.displayName) : person?.email || '');

export function fullName(s) {
  const mi = s.middleName?.trim() ? ` ${s.middleName.trim()[0]}.` : '';
  const ext = s.extName?.trim() ? ` ${s.extName.trim()}` : '';
  return capsName(`${s.lastName}, ${s.firstName}${mi}${ext}`);
}

export function byLastThenFirstName(a, b) {
  return a.lastName.localeCompare(b.lastName, 'en', { sensitivity: 'base' }) ||
    a.firstName.localeCompare(b.firstName, 'en', { sensitivity: 'base' });
}

export function depedSort(students) {
  const males = students.filter((s) => s.sex === 'M').sort(byLastThenFirstName);
  const females = students.filter((s) => s.sex === 'F').sort(byLastThenFirstName);
  return [...males, ...females];
}

export function alphabeticalSort(students) {
  return [...students].sort(byLastThenFirstName);
}
