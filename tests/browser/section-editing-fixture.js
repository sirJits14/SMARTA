import { useSyncExternalStore } from 'react';

const original = [
  { id: 'eight', name: 'Mabini', adviserName: 'Ana Cruz', gradeLevel: 8, schoolYear: '2026-2027', scheduleId: 'AM' },
  { id: 'next-eight', name: 'Rizal', adviserName: 'Ben Dy', gradeLevel: 8, schoolYear: '2027-2028', scheduleId: 'AM' },
  { id: 'eleven', name: 'Luna', adviserName: 'Cora Tan', gradeLevel: 11, schoolYear: '2026-2027', scheduleId: 'AM', track: 'Academic', strand: 'STEM' },
  { id: 'old-eight', name: 'Historic section', gradeLevel: 8, schoolYear: '2025-2026' },
];
const schedules = [{ id: 'AM', name: 'Morning Shift' }, { id: 'PM', name: 'Afternoon Shift' }];
let sections, revision = 0;
let scenario = 'normal';
const listeners = new Set();
export const writes = [];
export const requestedYears = new Map();
const notify = () => { revision++; listeners.forEach(fn => fn()); };
export function resetFixture() { sections = structuredClone(original); scenario = 'normal'; writes.length = 0; requestedYears.clear(); notify(); }
export function setScenario(value) { scenario = value; notify(); }
export function setAdviser(uid, name) {
  sections = sections.map(section => section.id === 'eight' ? { ...section, schoolAdviserUid: uid, adviserName: name } : section);
  notify();
}
resetFixture();

export function useStaffCollectionResource(path, { schoolYear } = {}) {
  useSyncExternalStore(fn => { listeners.add(fn); return () => listeners.delete(fn); }, () => revision);
  requestedYears.set(path, schoolYear);
  const data = path === 'sections' ? sections : path === 'schedules' ? schedules.slice(0, 1) : [];
  return { data, loading: false, error: scenario === 'resource-error' ? new Error('Synthetic failure') : null,
    retry: () => setScenario('normal') };
}

export async function transport(name, data) {
  if (name === 'getCoordinatorSectionOptionsFn') {
    if (scenario === 'options-error') throw new Error('Synthetic options failure');
    return { data: { schedules } };
  }
  if (name === 'updateCoordinatorSectionFn') {
    if (scenario === 'save-error') throw new Error('Synthetic save failure');
    writes.push(structuredClone(data));
    sections = sections.map(section => section.id === data.sectionId ? { ...section,
      name: data.name.trim(), adviserName: data.adviserName.trim(), scheduleId: data.scheduleId } : section);
    notify();
    return { data: { ok: true } };
  }
  throw new Error(`Unexpected callable ${name}`);
}
