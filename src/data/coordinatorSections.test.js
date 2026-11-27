import { describe, expect, it, vi } from 'vitest';

const transport = vi.hoisted(() => ({ call: vi.fn().mockResolvedValue({ data: { ok: true } }) }));
vi.mock('firebase/functions', () => ({ httpsCallable: (_functions, name) => data => transport.call(name, data) }));
vi.mock('../firebase.js', () => ({ functions: {} }));
import { updateCoordinatorSection } from './coordinatorSections.js';

describe('coordinator section save request', () => {
  it('sends only permitted fields even when the editor holds the full section', async () => {
    await updateCoordinatorSection('s8', { name: 'Mabini', adviserName: 'Ana', scheduleId: 'PM', gradeLevel: 11,
      schoolYear: '2020-2021', track: 'Academic', strand: 'STEM', role: 'admin' });
    expect(transport.call).toHaveBeenLastCalledWith('updateCoordinatorSectionFn', {
      sectionId: 's8', name: 'Mabini', adviserName: 'Ana', scheduleId: 'PM',
    });
  });
  it('normalizes clearing the shift and adviser to the server contract', async () => {
    await updateCoordinatorSection('s8', { name: 'Mabini', scheduleId: '' });
    expect(transport.call).toHaveBeenLastCalledWith('updateCoordinatorSectionFn', {
      sectionId: 's8', name: 'Mabini', adviserName: '', scheduleId: null,
    });
  });
});
