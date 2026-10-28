export const capsName = (name) => String(name ?? '').toUpperCase();

export function fullName(s) {
  const mi = s.middleName?.trim() ? ` ${s.middleName.trim()[0]}.` : '';
  const ext = s.extName?.trim() ? ` ${s.extName.trim()}` : '';
  return capsName(`${s.lastName}, ${s.firstName}${mi}${ext}`);
}
