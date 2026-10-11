import { beforeEach, describe, expect, it, vi } from 'vitest';

const fs = vi.hoisted(() => {
  const records = new Map();
  const ref = (path) => ({ path, id: path.split('/').at(-1) });
  const snap = (r) => ({ id: r.id, exists: () => records.has(r.path), data: () => records.get(r.path) });
  const set = (r, value, options) => records.set(r.path, options?.merge ? { ...records.get(r.path), ...value } : value);
  return { records, ref,
    collection: (_db, path) => ref(path),
    doc: (db, path, id) => id === undefined ? ref(`${db.path}/new`) : ref(`${path}/${id}`),
    setDoc: async (...args) => set(...args),
    addDoc: async (r, value) => { const d = ref(`${r.path}/new`); set(d, value); return d; },
    deleteDoc: async r => records.delete(r.path),
    getDoc: async r => snap(r),
    where: (field, op, value) => ({ field, value }),
    query: (r, ...filters) => ({ ...r, filters }),
    getDocs: async r => ({ docs: [...records].filter(([path, data]) => path.startsWith(`${r.path}/`) && (r.filters || []).every(f => data[f.field] === f.value)).map(([path]) => snap(ref(path))) }),
    runTransaction: async (_db, callback) => {
      const writes = [];
      const result = await callback({ get: async r => snap(r), set: (...args) => writes.push(() => set(...args)), delete: r => writes.push(() => records.delete(r.path)) });
      writes.forEach(write => write());
      return result;
    },
  };
});
vi.mock('firebase/firestore', () => ({ ...fs, getDocsFromServer: fs.getDocs }));
vi.mock('../firebase.js', () => ({ db: {} }));

import { saveMarks } from './attendance.js';
import { createSection, updateSection, deleteSection } from './sections.js';
import { createSchedule, updateSchedule } from './schedules.js';

const section = (gradeLevel, scheduleId = 'AM') => ({ name: 'Section', gradeLevel, scheduleId, schoolYear: '2026-2027' });
beforeEach(() => { fs.records.clear(); fs.records.set('schedules/AM', { name: 'Morning', gradeLevels: [7, 11] }); fs.records.set('sections/seven', section(7)); fs.records.set('sections/eleven', section(11)); });

describe('attendance grade metadata', () => {
  it.each([{ sectionId: 'another' }, { date: '2026-10-08' }, { schoolYear: '2025-2026' }])('does not borrow grade from another attendance record (%j)', mismatch => {
    const existingAttendance = { sectionId: 'seven', date: '2026-10-09', schoolYear: '2026-2027', gradeLevel: 7, ...mismatch };
    expect(() => saveMarks({ sectionId: 'seven', date: '2026-10-09', schoolYear: '2026-2027', gradeLevel: 8, marks: {}, existingAttendance })).toThrow(/does not match/i);
    expect(fs.records.has('student_attendance/seven_2026-10-09')).toBe(false);
  });
  it('preserves historical record grade when a section has since moved grades', async () => {
    const existingAttendance = { sectionId: 'seven', gradeLevel: 7, schoolYear: '2026-2027', date: '2026-10-09', marks: { student: 'P' } };
    fs.records.set('student_attendance/seven_2026-10-09', existingAttendance);
    await saveMarks({ sectionId: 'seven', gradeLevel: 8, date: '2026-10-09', schoolYear: '2026-2027', marks: { student: 'E' }, existingAttendance });
    expect(fs.records.get('student_attendance/seven_2026-10-09')).toMatchObject({ gradeLevel: 7, marks: { student: 'E' } });
  });
  it.each([undefined, null, '7', 13])('refuses to silently repair invalid existing attendance grade %s', async oldGrade => {
    const existingAttendance = { sectionId: 'seven', gradeLevel: oldGrade, date: '2026-10-09', schoolYear: '2026-2027' };
    await expect(async () => saveMarks({ sectionId: 'seven', gradeLevel: 8, date: '2026-10-09', schoolYear: '2026-2027', marks: {}, existingAttendance })).rejects.toThrow(/grade/i);
    expect(fs.records.has('student_attendance/seven_2026-10-09')).toBe(false);
  });
  it('stores the selected section grade with manual marks', async () => {
    await saveMarks({ sectionId: 'seven', gradeLevel: 7, date: '2026-10-09', schoolYear: '2026-2027', marks: { student: 'P' } });
    expect(fs.records.get('student_attendance/seven_2026-10-09')).toMatchObject({ gradeLevel: 7, marks: { student: 'P' } });
  });
  it.each([undefined, '7', 6, 13, 7.5])('rejects invalid attendance grade %s before persisting', async gradeLevel => {
    await expect(async () => saveMarks({ sectionId: 'seven', gradeLevel, date: '2026-10-09', marks: {} })).rejects.toThrow(/grade/i);
    expect(fs.records.has('student_attendance/seven_2026-10-09')).toBe(false);
  });
});
describe('schedule audiences', () => {
  it('initializes a new schedule without trusting caller grades', async () => {
    await createSchedule({ name: ' New ', timeIn: '07:00', timeOut: '17:00', gradeLevels: [12] });
    expect(fs.records.get('schedules/new').gradeLevels).toEqual([]);
  });
  it('preserves derived audiences while editing schedule times', async () => {
    await updateSchedule('AM', { name: ' Morning ', timeIn: '08:00', timeOut: '17:00', gradeLevels: [12] });
    expect(fs.records.get('schedules/AM').gradeLevels).toEqual([7, 11]);
  });
  it('adds linked grades to a shared schedule without duplicates', async () => {
    await createSection(section(8));
    expect(fs.records.get('schedules/AM').gradeLevels).toEqual([7, 8, 11]);
  });
  it('recomputes a shared audience when a section grade changes', async () => {
    await updateSection('seven', section(8));
    expect(fs.records.get('schedules/AM').gradeLevels).toEqual([8, 11]);
  });
  it('refreshes both old and new schedules on a move', async () => {
    fs.records.set('schedules/PM', { gradeLevels: [] });
    await updateSection('seven', section(7, 'PM'));
    expect(fs.records.get('schedules/AM').gradeLevels).toEqual([11]);
    expect(fs.records.get('schedules/PM').gradeLevels).toEqual([7]);
  });
  it('removes unlinked grades', async () => {
    await updateSection('seven', section(7, null));
    expect(fs.records.get('schedules/AM').gradeLevels).toEqual([11]);
  });
  it('removes a deleted section and empties an unused audience', async () => {
    await deleteSection('seven'); await deleteSection('eleven');
    expect(fs.records.get('schedules/AM').gradeLevels).toEqual([]);
  });
});
