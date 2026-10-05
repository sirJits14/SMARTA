import { beforeEach, describe, expect, it, vi } from 'vitest';

const firestore = vi.hoisted(() => {
  const sets = [];
  const commit = vi.fn().mockResolvedValue(undefined);
  return {
    sets,
    commit,
    doc: vi.fn((_db, collectionName, id) => ({ path: `${collectionName}/${id}` })),
    writeBatch: vi.fn(() => ({ set: (...args) => sets.push(args), commit })),
    serverTimestamp: vi.fn(() => 'SERVER_TIME'),
  };
});

vi.mock('firebase/firestore', () => ({
  doc: firestore.doc,
  writeBatch: firestore.writeBatch,
  serverTimestamp: firestore.serverTimestamp,
}));
vi.mock('../firebase.js', () => ({ db: { kind: 'db' } }));

import { markIdCardsPrinted } from './idCards.js';

const me = { email: 'admin@bnhs.edu.ph' };

beforeEach(() => {
  firestore.sets.length = 0;
  firestore.commit.mockClear();
  firestore.writeBatch.mockClear();
});

describe('markIdCardsPrinted', () => {
  it('merges the printed mark, with the LRN that was printed, into each learner', async () => {
    await markIdCardsPrinted([{ id: 's1', lrn: '111' }, { id: 's2', lrn: '222' }], me);

    expect(firestore.sets).toEqual([
      [{ path: 'students/s1' }, { idCard: { printedAt: 'SERVER_TIME', printedBy: 'admin@bnhs.edu.ph', lrn: '111' } }, { merge: true }],
      [{ path: 'students/s2' }, { idCard: { printedAt: 'SERVER_TIME', printedBy: 'admin@bnhs.edu.ph', lrn: '222' } }, { merge: true }],
    ]);
    expect(firestore.commit).toHaveBeenCalledTimes(1);
  });

  it('splits more than 500 learners across batches', async () => {
    const students = Array.from({ length: 501 }, (_, i) => ({ id: `s${i}`, lrn: String(i) }));
    await markIdCardsPrinted(students, me);

    expect(firestore.writeBatch).toHaveBeenCalledTimes(2);
    expect(firestore.commit).toHaveBeenCalledTimes(2);
    expect(firestore.sets).toHaveLength(501);
  });

  it('writes nothing for an empty batch', async () => {
    await markIdCardsPrinted([], me);
    expect(firestore.commit).not.toHaveBeenCalled();
  });
});
