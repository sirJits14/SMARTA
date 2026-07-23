export const isValidLRN = (s) => /^\d{12}$/.test(String(s ?? ''));

export const lrnTaken = (lrn, students, exceptId = null) =>
  students.some((s) => s.lrn === lrn && s.id !== exceptId);

export function validateStudent(form) {
  const errors = {};
  if (!isValidLRN(form.lrn)) errors.lrn = 'LRN must be exactly 12 digits.';
  if (!form.lastName?.trim()) errors.lastName = 'Last name is required.';
  if (!form.firstName?.trim()) errors.firstName = 'First name is required.';
  if (form.sex !== 'M' && form.sex !== 'F') errors.sex = 'Choose a sex.';
  if (!form.birthdate) errors.birthdate = 'Birthdate is required.';
  return { ok: Object.keys(errors).length === 0, errors };
}
