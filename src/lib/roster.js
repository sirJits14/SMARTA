export function fullName(s) {
  const mi = s.middleName?.trim() ? ` ${s.middleName.trim()[0]}.` : '';
  const ext = s.extName?.trim() ? ` ${s.extName.trim()}` : '';
  return `${s.lastName}, ${s.firstName}${mi}${ext}`;
}

export function depedSort(students) {
  const cmp = (a, b) =>
    a.lastName.localeCompare(b.lastName, 'en', { sensitivity: 'base' }) ||
    a.firstName.localeCompare(b.firstName, 'en', { sensitivity: 'base' });
  const males = students.filter((s) => s.sex === 'M').sort(cmp);
  const females = students.filter((s) => s.sex === 'F').sort(cmp);
  return [...males, ...females];
}
