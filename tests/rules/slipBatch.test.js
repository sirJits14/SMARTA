import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { setup, seed, seedBaseline, as, anon, ok, denied, STAFF, JHS, KIOSK, GUARDIAN_A, ANON } from './helpers.js';

let env;
beforeAll(async () => { env = await setup(); });
afterAll(async () => { await env.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore(); await seedBaseline(env);
  await seed(env, async (db) => {
    await db.doc('users/jhs@bnhs.edu').set({ name: 'JHS', role: 'jhs_coord', gradeLevel: null, disabled: false });
    await db.doc('slip_batch/S1').set({ addedAt: new Date(), addedBy: 'registrar@bnhs.edu', reason: 'Lost slip' });
  });
});

const entry = (over = {}) => ({ addedAt: new Date(), addedBy: 'someone@bnhs.edu', reason: 'Lost slip', ...over });

describe('slip_batch', () => {
  it('admins read, add, update and remove batch learners', async () => {
    const db = as(env, STAFF);
    await ok(db.collection('slip_batch').get());
    await ok(db.doc('slip_batch/S2').set(entry()));
    await ok(db.doc('slip_batch/S2').set(entry({ reason: 'Other: torn in half' })));
    await ok(db.doc('slip_batch/S1').delete());
  });

  it('admins cannot store anything but addedAt, addedBy and reason', async () => {
    const db = as(env, STAFF);
    await denied(db.doc('slip_batch/S2').set(entry({ code: 'ABCD2345' })));
    await denied(db.doc('slip_batch/S2').set({ addedAt: new Date(), addedBy: 'someone@bnhs.edu' }));
  });

  it('the reason must be 1 to 200 characters of text', async () => {
    const db = as(env, STAFF);
    await denied(db.doc('slip_batch/S2').set(entry({ reason: '' })));
    await denied(db.doc('slip_batch/S2').set(entry({ reason: 'x'.repeat(201) })));
    await denied(db.doc('slip_batch/S2').set(entry({ reason: 42 })));
    await ok(db.doc('slip_batch/S2').set(entry({ reason: 'x'.repeat(200) })));
  });

  for (const [label, who] of [['coordinator', JHS], ['kiosk', KIOSK], ['guardian', GUARDIAN_A], ['anonymous sign-in', ANON]]) {
    it(`${label} can neither read nor write`, async () => {
      const db = as(env, who);
      await denied(db.doc('slip_batch/S1').get());
      await denied(db.collection('slip_batch').get());
      await denied(db.doc('slip_batch/S2').set(entry()));
      await denied(db.doc('slip_batch/S1').delete());
    });
  }

  it('signed-out users can neither read nor write', async () => {
    await denied(anon(env).doc('slip_batch/S1').get());
    await denied(anon(env).doc('slip_batch/S2').set(entry()));
  });
});
