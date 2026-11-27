import { beforeAll, afterAll, beforeEach, describe, it } from 'vitest';
import { setup, seedBaseline, as, ok, denied, STAFF } from './helpers.js';

let env;
beforeAll(async () => { env = await setup(); });
afterAll(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); await seedBaseline(env); });

const activeScope = { status: 'active', gradeLevel: 8, scopeSchoolYear: '2026-2027' };

describe('student scope write invariant', () => {
  it.each(['2026/2027', '2026-27', 2026, ' 2026-2027 ', 'abcd-efgh', '2026-2027\n'])('denies noncanonical student scope even when settings matches year %s', async scopeSchoolYear => {
    await env.withSecurityRulesDisabled(context => context.firestore().doc('settings/app').set({ currentSchoolYear: scopeSchoolYear }));
    await denied(as(env, STAFF).doc('students/new-scoped').set({ ...activeScope, scopeSchoolYear }));
  });
  it('uses the active default when a legacy student without status receives valid scope', async () => {
    await ok(as(env, STAFF).doc('students/S1').set({ gradeLevel: 8, scopeSchoolYear: '2026-2027' }, { merge: true }));
  });

  it('rejects a stale scope merge after an inactive update has cleared scope', async () => {
    const student = as(env, STAFF).doc('students/S1');
    await ok(student.set(activeScope, { merge: true }));
    await ok(student.set({ status: 'dropped', gradeLevel: null, scopeSchoolYear: null }, { merge: true }));
    await denied(student.set({ gradeLevel: 8, scopeSchoolYear: '2026-2027' }, { merge: true }));
  });

  it('accepts valid active scope on create and update and accepts clearing both fields', async () => {
    const student = as(env, STAFF).doc('students/new-scoped');
    await ok(student.set(activeScope));
    await ok(student.set({ gradeLevel: 9 }, { merge: true }));
    await ok(student.set({ gradeLevel: null, scopeSchoolYear: null }, { merge: true }));
  });

  for (const invalid of [
    { ...activeScope, status: 'transferred' },
    { ...activeScope, gradeLevel: 6 },
    { ...activeScope, gradeLevel: 13 },
    { ...activeScope, gradeLevel: 8.5 },
    { ...activeScope, gradeLevel: '8' },
    { ...activeScope, scopeSchoolYear: '2025-2026' },
    { ...activeScope, gradeLevel: null },
    { ...activeScope, scopeSchoolYear: null },
  ]) {
    it(`rejects invalid final scope ${JSON.stringify(invalid)}`, async () => {
      await denied(as(env, STAFF).doc('students/invalid-scope').set(invalid));
    });
  }

  it('preserves profile-only writes and deletes for legacy records needing migration', async () => {
    await env.withSecurityRulesDisabled(async context => {
      await context.firestore().doc('students/legacy').set({ status: 'dropped', gradeLevel: 8, scopeSchoolYear: '2025-2026' });
    });
    const student = as(env, STAFF).doc('students/legacy');
    await ok(student.set({ firstName: 'Updated' }, { merge: true }));
    await denied(student.set({ status: 'active' }, { merge: true }));
    await ok(student.delete());
  });
});
