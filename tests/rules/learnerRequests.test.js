import { beforeAll, afterAll, beforeEach, it } from 'vitest';
import { setup, seedBaseline, seed, as, denied, STAFF, ADMIN_NEW, GLC8, GUARDIAN_A } from './helpers.js';
let env;
beforeAll(async () => { env = await setup(); });
afterAll(async () => { await env.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore(); await seedBaseline(env);
  await seed(env, async db => {
    // seedBaseline only gives ADMIN_NEW and GLC8 a staff_profiles document. The
    // rules' isStaff() also needs users/{email}, so seed it here: without it
    // these two actors are plain signed-in users and the test proves nothing.
    await db.doc(`users/${ADMIN_NEW.token.email}`).set({ role: 'admin' });
    await db.doc(`users/${GLC8.token.email}`).set({ role: 'glc', gradeLevel: 8 });
    // One request in Grade 7 and one in Grade 8, so the Grade 8 coordinator is
    // in scope of a request and a grade-scoped allow would let it through.
    await db.doc('learner_change_requests/r1').set({ kind: 'add', status: 'pending', sectionId: 'SEC1', gradeLevel: 7, requestedByUid: 'gA' });
    await db.doc('learner_change_requests/r8').set({ kind: 'add', status: 'pending', sectionId: 'SEC8', gradeLevel: 8, requestedByUid: 'gA' });
  });
});
it('keeps learner requests closed to every signed-in role, including the requester', async () => {
  for (const who of [STAFF, ADMIN_NEW, GLC8, GUARDIAN_A]) {
    const db = as(env, who);
    const requests = db.collection('learner_change_requests');
    for (const id of ['r1', 'r8']) {
      await denied(db.doc(`learner_change_requests/${id}`).get());
      await denied(db.doc(`learner_change_requests/${id}`).update({ status: 'approved' }));
      await denied(db.doc(`learner_change_requests/${id}`).delete());
    }
    await denied(requests.get());
    // Bounded, filtered lists a query-shaped allow rule would accept: the
    // guardian's own requests, and a coordinator's own grade.
    if (who === GUARDIAN_A) await denied(requests.where('requestedByUid', '==', who.uid).limit(50).get());
    else await denied(requests.where('gradeLevel', '==', 8).limit(50).get());
    await denied(db.doc('learner_change_requests/r2').set({ kind: 'add', status: 'approved' }));
  }
});
