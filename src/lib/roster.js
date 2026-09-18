export function fullName(s) {
  const mi = s.middleName?.trim() ? ` ${s.middleName.trim()[0]}.` : '';
  const ext = s.extName?.trim() ? ` ${s.extName.trim()}` : '';
  return `${s.lastName}, ${s.firstName}${mi}${ext}`;
}

function byLastThenFirstName(a, b) {
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
