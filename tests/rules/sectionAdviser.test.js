import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { setup, seed, seedBaseline, as, ok, denied, STAFF } from './helpers.js';

let env;
beforeAll(async () => { env = await setup(); });
afterAll(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); await seedBaseline(env); });

describe('section adviser ownership', () => {
  it('allows manual names but never lets clients claim or remove School Access ownership', async () => {
    const ref = as(env, STAFF).doc('sections/SEC1');
    await ok(ref.update({ adviserName: 'Manual name' }));
    await denied(ref.update({ schoolAdviserUid: 'teacher' }));
    await denied(as(env, STAFF).doc('sections/new').set({ schoolAdviserUid: 'teacher' }));
    await seed(env, db => db.doc('sections/SEC1').update({ adviserName: 'Assigned name', schoolAdviserUid: 'teacher' }));
    await denied(ref.update({ adviserName: 'Manual replacement' }));
    await denied(ref.update({ schoolAdviserUid: null }));
    await denied(ref.set({ name: 'Overwrite without ownership' }));
    await ok(ref.update({ name: 'Renamed section', adviserName: 'Assigned name' }));
  });
  it('keeps the assignment scope intact until revoked', async () => {
    await seed(env, db => db.doc('sections/SEC1').update({ adviserName: 'Assigned name', schoolAdviserUid: 'teacher' }));
    const ref = as(env, STAFF).doc('sections/SEC1');
    await denied(ref.update({ gradeLevel: 8 }));
    await denied(ref.update({ schoolYear: '2027-2028' }));
    await denied(ref.delete());
    await seed(env, db => db.doc('sections/SEC1').set({ name: 'Rizal', gradeLevel: 7, schoolYear: '2026-2027', adviserName: 'Assigned name' }));
    await ok(ref.update({ adviserName: 'New manual name' }));
    await ok(ref.delete());
  });
});
