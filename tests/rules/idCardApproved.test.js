import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { setup, seed, seedBaseline, as, anon, ok, denied, STAFF, JHS, KIOSK, GUARDIAN_A, ANON } from './helpers.js';

let env;
beforeAll(async () => { env = await setup(); });
afterAll(async () => { await env.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore(); await seedBaseline(env);
  await seed(env, async (db) => {
    await db.doc('users/jhs@bnhs.edu').set({ name: 'JHS', role: 'jhs_coord', gradeLevel: null, disabled: false });
    await db.doc('id_card_approved/S1').set({ approvedAt: new Date(), approvedByName: 'Ada Admin', requestId: 'R1', schoolYear: '2026-2027' });
  });
});

const entry = { approvedAt: new Date(), approvedByName: 'Someone', requestId: 'R2', schoolYear: '2026-2027' };

describe('id_card_approved', () => {
  it('admins read and dismiss logged learners', async () => {
    const db = as(env, STAFF);
    await ok(db.collection('id_card_approved').get());
    await ok(db.doc('id_card_approved/S1').get());
    await ok(db.doc('id_card_approved/S1').delete());
  });

  it('admins may delete a learner who is not logged (a print that marks anyone)', async () => {
    await ok(as(env, STAFF).doc('id_card_approved/NOT-LOGGED').delete());
  });

  it('even admins cannot create or change a logged learner', async () => {
    const db = as(env, STAFF);
    await denied(db.doc('id_card_approved/S2').set(entry));
    await denied(db.doc('id_card_approved/S1').update({ approvedByName: 'Someone else' }));
  });

  for (const [label, who] of [['coordinator', JHS], ['kiosk', KIOSK], ['guardian', GUARDIAN_A], ['anonymous sign-in', ANON]]) {
    it(`${label} can neither read nor write`, async () => {
      const db = as(env, who);
      await denied(db.doc('id_card_approved/S1').get());
      await denied(db.collection('id_card_approved').get());
      await denied(db.doc('id_card_approved/S2').set(entry));
      await denied(db.doc('id_card_approved/S1').delete());
    });
  }

  it('signed-out users can neither read nor write', async () => {
    await denied(anon(env).doc('id_card_approved/S1').get());
    await denied(anon(env).doc('id_card_approved/S1').delete());
  });
});
