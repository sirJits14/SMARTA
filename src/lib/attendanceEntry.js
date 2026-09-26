import { localDate } from './dates.js';
export function resolveAttendanceEntry({ sectionId, date, schoolYear, sections, ready }) {
  const empty = { sectionId: '', date: '', message: '' };
  if (!sectionId && !date) return { ...empty, status: 'none' };
  if (!ready) return { ...empty, status: 'pending' };
  if (!sections.some(s => s.id === sectionId && s.schoolYear === schoolYear))
    return { ...empty, status: 'invalid', message: 'This section is unavailable for the current school year. Choose another section.' };
  const match = typeof date === 'string' && /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match || localDate(new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))) !== date)
    return { ...empty, status: 'invalid', message: 'This attendance date is invalid. Choose a date.' };
  return { status: 'valid', sectionId, date, message: '' };
}
