import { beforeAll, afterAll, beforeEach, it } from 'vitest';
import { setup, seedBaseline, seed, as, denied, STAFF, ADMIN_NEW, GLC8, GUARDIAN_A } from './helpers.js';
let env;
beforeAll(async () => { env = await setup(); });
afterAll(async () => { await env.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore(); await seedBaseline(env);
  await seed(env, db => db.doc('learner_change_requests/r1').set({ kind: 'add', status: 'pending', sectionId: 'SEC1', gradeLevel: 7, requestedByUid: 'gA' }));
});
it('keeps learner requests closed to every signed-in role, including the requester', async () => {
  for (const who of [STAFF, ADMIN_NEW, GLC8, GUARDIAN_A]) {
    const db = as(env, who);
    await denied(db.doc('learner_change_requests/r1').get());
    await denied(db.collection('learner_change_requests').get());
    await denied(db.doc('learner_change_requests/r2').set({ kind: 'add', status: 'approved' }));
    await denied(db.doc('learner_change_requests/r1').update({ status: 'approved' }));
    await denied(db.doc('learner_change_requests/r1').delete());
  }
});
