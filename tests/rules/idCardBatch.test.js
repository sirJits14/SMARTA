import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { setup, seed, seedBaseline, as, anon, ok, denied, STAFF, JHS, KIOSK, GUARDIAN_A, ANON } from './helpers.js';

let env;
beforeAll(async () => { env = await setup(); });
afterAll(async () => { await env.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore(); await seedBaseline(env);
  await seed(env, async (db) => {
    await db.doc('users/jhs@bnhs.edu').set({ name: 'JHS', role: 'jhs_coord', gradeLevel: null, disabled: false });
    await db.doc('id_card_batch/S1').set({ addedAt: new Date(), addedBy: 'registrar@bnhs.edu' });
  });
});

const entry = { addedAt: new Date(), addedBy: 'someone@bnhs.edu' };

describe('id_card_batch', () => {
  it('admins read, add and remove batch learners', async () => {
    const db = as(env, STAFF);
    await ok(db.collection('id_card_batch').get());
    await ok(db.doc('id_card_batch/S2').set(entry));
    await ok(db.doc('id_card_batch/S1').delete());
  });

  for (const [label, who] of [['coordinator', JHS], ['kiosk', KIOSK], ['guardian', GUARDIAN_A], ['anonymous sign-in', ANON]]) {
    it(`${label} can neither read nor write`, async () => {
      const db = as(env, who);
      await denied(db.doc('id_card_batch/S1').get());
      await denied(db.collection('id_card_batch').get());
      await denied(db.doc('id_card_batch/S2').set(entry));
      await denied(db.doc('id_card_batch/S1').delete());
    });
  }

  it('signed-out users can neither read nor write', async () => {
    await denied(anon(env).doc('id_card_batch/S1').get());
    await denied(anon(env).doc('id_card_batch/S2').set(entry));
  });
});
