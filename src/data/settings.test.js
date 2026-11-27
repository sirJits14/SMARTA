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
    await updateSettings({ schoolId: ' 304 ', schoolName: ' BNHS ', principalName: ' Paul O. Orong ', principalTitle: ' Secondary Principal IV ', other: 'x' });
    expect(writes).toEqual([['settings/app', {
      schoolId: '304', schoolName: 'BNHS', principalName: 'Paul O. Orong', principalTitle: 'Secondary Principal IV',
    }, { merge: true }]]);
  });
  it('saves blanks for missing fields', async () => {
    await updateSettings({});
    expect(writes[0][1]).toEqual({ schoolId: '', schoolName: '', principalName: '', principalTitle: '' });
  });
});
