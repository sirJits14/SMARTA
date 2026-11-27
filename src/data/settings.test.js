import { beforeEach, describe, expect, it, vi } from 'vitest';

const writes = vi.hoisted(() => []);
vi.mock('../firebase.js', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: (_db, ...path) => path.join('/'),
  setDoc: async (ref, data, options) => { writes.push([ref, data, options]); },
}));

import { updateSettings } from './settings.js';

beforeEach(() => { writes.length = 0; });

describe('school settings', () => {
  it('saves the trimmed school and principal details', async () => {
    await updateSettings({ schoolId: ' 304 ', schoolName: ' BNHS ', principalName: ' Paul O. Orong ', principalTitle: ' Secondary Principal IV ', passPickupPlace: ' Logistics Office, Admin Building ', other: 'x' });
    expect(writes).toEqual([['settings/app', {
      schoolId: '304', schoolName: 'BNHS', principalName: 'Paul O. Orong', principalTitle: 'Secondary Principal IV',
      passPickupPlace: 'Logistics Office, Admin Building',
    }, { merge: true }]]);
  });
  it('keeps at most 120 characters of the pick-up place, counted after trimming', async () => {
    await updateSettings({ passPickupPlace: `   ${'a'.repeat(130)}   ` });
    expect(writes[0][1].passPickupPlace).toBe('a'.repeat(120));
    await updateSettings({ passPickupPlace: `${'a'.repeat(119)} bcd` });
    expect(writes[1][1].passPickupPlace).toBe('a'.repeat(119));
  });
  it('saves blanks for missing fields', async () => {
    await updateSettings({});
    expect(writes[0][1]).toEqual({ schoolId: '', schoolName: '', principalName: '', principalTitle: '', passPickupPlace: '' });
  });
});
