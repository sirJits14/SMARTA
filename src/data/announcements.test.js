import { beforeEach, describe, expect, it, vi } from 'vitest';

const fs = vi.hoisted(() => ({
  addDoc: vi.fn().mockResolvedValue({ id: 'new' }),
  updateDoc: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('firebase/firestore', () => ({
  addDoc: fs.addDoc,
  updateDoc: fs.updateDoc,
  deleteDoc: vi.fn(),
  collection: vi.fn((_db, name) => ({ path: name })),
  doc: vi.fn((_db, name, id) => ({ path: `${name}/${id}` })),
  serverTimestamp: () => 'now',
  Timestamp: { fromDate: (d) => ({ ms: d.getTime() }) },
}));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));
vi.mock('../firebase.js', () => ({ auth: { currentUser: { uid: 'u1' } }, db: {}, functions: {} }));

import { announcements } from './announcements.js';

const form = { title: ' Hi ', body: ' There ', all: true, grades: [], when: 'now', date: '', time: '', expires: '', pinned: false, push: false };

beforeEach(() => { fs.addDoc.mockClear(); fs.updateDoc.mockClear(); });

// Guardians can read createdBy/updatedBy, so a staff email must never land there.
describe('announcement author', () => {
  it('uses the staff name, or "BNHS staff" — never the email', async () => {
    await announcements.create(form, { name: 'R. Santos', email: 'r@deped.gov.ph' });
    expect(fs.addDoc.mock.calls[0][1]).toMatchObject({ createdBy: { uid: 'u1', name: 'R. Santos' }, updatedBy: { uid: 'u1', name: 'R. Santos' } });

    await announcements.create(form, { email: 'r@deped.gov.ph' });
    const doc = fs.addDoc.mock.calls[1][1];
    expect(doc.createdBy).toEqual({ uid: 'u1', name: 'BNHS staff' });
    expect(JSON.stringify(doc)).not.toContain('deped.gov.ph');

    await announcements.unpublish({ id: 'a1' }, { email: 'r@deped.gov.ph' });
    expect(fs.updateDoc.mock.calls[0][1].updatedBy).toEqual({ uid: 'u1', name: 'BNHS staff' });
  });
});
