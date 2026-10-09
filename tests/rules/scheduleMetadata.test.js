import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { setup, seedBaseline, as, STAFF } from './helpers.js';

const state = vi.hoisted(() => ({ db: null, arrivals: 0, release: null, barrier: null }));
vi.mock('firebase/firestore', async importActual => {
  const actual = await importActual();
  return { ...actual, getDocsFromServer: async query => {
    const result = await actual.getDocsFromServer(query);
    // Force both initial queries to finish before either transaction commits.
    // On retry, reads proceed normally and observe the other committed section.
    if (state.arrivals < 2) {
      state.arrivals++;
      if (state.arrivals === 2) state.release();
      await state.barrier;
    }
    return result;
  } };
});
vi.mock('../../src/firebase.js', () => ({ get db() { return state.db; } }));
import { createSection, updateSection, deleteSection } from '../../src/data/sections.js';

let env;
beforeAll(async () => { env = await setup(); state.db = as(env, STAFF); });
beforeEach(async () => { await env.clearFirestore(); await seedBaseline(env); });
afterAll(async () => { await env?.cleanup(); });
const section = gradeLevel => ({ name: `Grade ${gradeLevel}`, gradeLevel, schoolYear: '2026-2027', scheduleId: 'shared' });
const overlapQueries = () => { state.arrivals = 0; state.barrier = new Promise(resolve => { state.release = resolve; }); };

it('keeps a shared schedule audience consistent through concurrent create, grade change, and delete', async () => {
  await setDoc(doc(state.db, 'schedules', 'shared'), { name: 'Shared', gradeLevels: [] });
  overlapQueries();
  const sections = await Promise.all([createSection(section(7)), createSection(section(11))]);
  expect((await getDoc(doc(state.db, 'schedules', 'shared'))).data().gradeLevels).toEqual([7, 11]);
  overlapQueries();
  await Promise.all([updateSection(sections[0].id, section(8)), deleteSection(sections[1].id)]);
  expect((await getDoc(doc(state.db, 'schedules', 'shared'))).data().gradeLevels).toEqual([8]);
  expect((await getDoc(doc(state.db, 'sections', sections[0].id))).data().gradeLevel).toBe(8);
  expect((await getDoc(doc(state.db, 'sections', sections[1].id))).exists()).toBe(false);
}, 30000);
