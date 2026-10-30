import { beforeEach, describe, expect, it, vi } from 'vitest';

const firestore = vi.hoisted(() => {
  const batches = [];
  return {
    batches,
    doc: vi.fn((_db, collectionName, id) => ({ path: `${collectionName}/${id}` })),
    writeBatch: vi.fn(() => {
      const batch = {
        ops: [],
        set: (...args) => batch.ops.push(['set', ...args]),
        delete: (...args) => batch.ops.push(['delete', ...args]),
        commit: vi.fn().mockResolvedValue(undefined),
      };
      batches.push(batch);
      return batch;
    }),
    setDoc: vi.fn().mockResolvedValue(undefined),
    deleteDoc: vi.fn().mockResolvedValue(undefined),
    serverTimestamp: vi.fn(() => 'SERVER_TIME'),
  };
});

vi.mock('firebase/firestore', () => ({
  doc: firestore.doc,
  writeBatch: firestore.writeBatch,
  setDoc: firestore.setDoc,
  deleteDoc: firestore.deleteDoc,
  serverTimestamp: firestore.serverTimestamp,
}));
vi.mock('../firebase.js', () => ({ db: { kind: 'db' } }));

import { markIdCardsPrinted, addToIdCardBatch, removeFromIdCardBatch, clearIdCardBatch, markBatchPrinted, addApprovedToBatch, dismissApproved } from './idCards.js';

const me = { email: 'admin@bnhs.edu.ph' };
const mark = (lrn) => ({ idCard: { printedAt: 'SERVER_TIME', printedBy: 'admin@bnhs.edu.ph', lrn } });
const sizes = () => firestore.batches.map((b) => b.ops.length);
const learners = (n) => Array.from({ length: n }, (_, i) => ({ id: `s${i}`, lrn: String(i) }));

beforeEach(() => {
  firestore.batches.length = 0;
  firestore.writeBatch.mockClear();
  firestore.setDoc.mockClear();
  firestore.deleteDoc.mockClear();
});

describe('markIdCardsPrinted', () => {
  it('merges the printed mark into each learner and takes them off Recently approved', async () => {
    await markIdCardsPrinted([{ id: 's1', lrn: '111' }, { id: 's2', lrn: '222' }], me);
    expect(firestore.batches[0].ops).toEqual([
      ['set', { path: 'students/s1' }, mark('111'), { merge: true }],
      ['delete', { path: 'id_card_approved/s1' }],
      ['set', { path: 'students/s2' }, mark('222'), { merge: true }],
      ['delete', { path: 'id_card_approved/s2' }],
    ]);
    expect(firestore.batches[0].commit).toHaveBeenCalledTimes(1);
  });
  it('splits 501 learners into batches of 250, 250 and 1 learners (2 operations each)', async () => {
    await markIdCardsPrinted(learners(501), me);
    expect(sizes()).toEqual([500, 500, 2]);
    firestore.batches.forEach((b) => expect(b.commit).toHaveBeenCalledTimes(1));
  });
  it('writes nothing for an empty list', async () => {
    await markIdCardsPrinted([], me);
    expect(firestore.batches).toHaveLength(0);
  });
});

describe('saved batch', () => {
  it('adds a learner with who added them and when', async () => {
    await addToIdCardBatch('s1', me);
    expect(firestore.setDoc).toHaveBeenCalledWith({ path: 'id_card_batch/s1' }, { addedAt: 'SERVER_TIME', addedBy: 'admin@bnhs.edu.ph' });
  });
  it('removes a learner', async () => {
    await removeFromIdCardBatch('s1');
    expect(firestore.deleteDoc).toHaveBeenCalledWith({ path: 'id_card_batch/s1' });
  });
  it('clears in batches of at most 500 deletes', async () => {
    await clearIdCardBatch(Array.from({ length: 501 }, (_, i) => `s${i}`));
    expect(sizes()).toEqual([500, 1]);
    expect(firestore.batches[1].ops).toEqual([['delete', { path: 'id_card_batch/s500' }]]);
  });
});

describe('markBatchPrinted', () => {
  it('marks each learner and removes them from the batch and Recently approved in the same write', async () => {
    await markBatchPrinted([{ id: 's1', lrn: '111' }, { id: 's2', lrn: '222' }], me);
    expect(firestore.batches).toHaveLength(1);
    expect(firestore.batches[0].ops).toEqual([
      ['set', { path: 'students/s1' }, mark('111'), { merge: true }],
      ['delete', { path: 'id_card_batch/s1' }],
      ['delete', { path: 'id_card_approved/s1' }],
      ['set', { path: 'students/s2' }, mark('222'), { merge: true }],
      ['delete', { path: 'id_card_batch/s2' }],
      ['delete', { path: 'id_card_approved/s2' }],
    ]);
  });
  it('splits 300 learners into 166 and 134 learners (3 operations each)', async () => {
    await markBatchPrinted(learners(300), me);
    expect(sizes()).toEqual([498, 402]);
  });
});

describe('Recently approved', () => {
  it('moves learners to the saved batch and off Recently approved in one write', async () => {
    await addApprovedToBatch(['s1', 's2'], me);
    expect(firestore.batches).toHaveLength(1);
    expect(firestore.batches[0].ops).toEqual([
      ['set', { path: 'id_card_batch/s1' }, { addedAt: 'SERVER_TIME', addedBy: 'admin@bnhs.edu.ph' }],
      ['delete', { path: 'id_card_approved/s1' }],
      ['set', { path: 'id_card_batch/s2' }, { addedAt: 'SERVER_TIME', addedBy: 'admin@bnhs.edu.ph' }],
      ['delete', { path: 'id_card_approved/s2' }],
    ]);
  });
  it('moves 251 learners in batches of 500 and 2 operations', async () => {
    await addApprovedToBatch(Array.from({ length: 251 }, (_, i) => `s${i}`), me);
    expect(sizes()).toEqual([500, 2]);
  });
  it('dismisses learners in batches of at most 500 deletes', async () => {
    await dismissApproved(Array.from({ length: 501 }, (_, i) => `s${i}`));
    expect(sizes()).toEqual([500, 1]);
    expect(firestore.batches[1].ops).toEqual([['delete', { path: 'id_card_approved/s500' }]]);
  });
  it('writes nothing for an empty selection', async () => {
    await addApprovedToBatch([], me);
    await dismissApproved([]);
    expect(firestore.batches).toHaveLength(0);
  });
});
