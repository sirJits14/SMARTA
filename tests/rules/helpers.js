import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';

const password = { sign_in_provider: 'password' };
export const STAFF = { uid: 'staff1', token: { email: 'registrar@bnhs.edu', email_verified: true, firebase: password } };
export const KIOSK = { uid: 'kiosk1', token: { email: 'kiosk-gate1@bnhs.edu', email_verified: true, firebase: password } };
export const KIOSK_INACTIVE = { uid: 'kiosk9', token: { email: 'kiosk-old@bnhs.edu', email_verified: true, firebase: password } };
export const GUARDIAN_A = { uid: 'gA', token: { email: 'a@gmail.com', email_verified: true, firebase: { sign_in_provider: 'google.com' } } };
export const GUARDIAN_B = { uid: 'gB', token: { email: 'b@gmail.com', email_verified: true, firebase: password } };
export const GUARDIAN_UNVERIFIED = { uid: 'gU', token: { email: 'u@gmail.com', email_verified: false, firebase: password } };
export const ANON = { uid: 'anon1', token: { firebase: { sign_in_provider: 'anonymous' } } };

export async function setup() {
  const env = await initializeTestEnvironment({
    projectId: 'bnhs-sims-rules-test',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  });
  await env.clearFirestore();
  return env;
}

export const seed = (env, fn) => env.withSecurityRulesDisabled((ctx) => fn(ctx.firestore()));
export const as = (env, who) => env.authenticatedContext(who.uid, who.token).firestore();
export const anon = (env) => env.unauthenticatedContext().firestore();
export const ok = assertSucceeds;
export const denied = assertFails;

// Baseline documents every rules test can rely on.
export async function seedBaseline(env) {
  await seed(env, async (db) => {
    await db.doc('users/registrar@bnhs.edu').set({ name: 'Registrar', role: 'registrar' });
    await db.doc('kiosks/kiosk1').set({ label: 'Main Gate', active: true });
    await db.doc('kiosks/kiosk9').set({ label: 'Old Gate', active: false });
    await db.doc('settings/app').set({ currentSchoolYear: '2026-2027' });
    await db.doc('settings/parent_portal').set({ notificationsPaused: false, consentVersion: 1 });
    await db.doc('students/S1').set({ lrn: '100000000001', firstName: 'Ana', lastName: 'Cruz' });
    await db.doc('students/S2').set({ lrn: '100000000002', firstName: 'Ben', lastName: 'Dy' });
    await db.doc('sections/SEC1').set({ name: 'Rizal', gradeLevel: 7, schoolYear: '2026-2027' });
    await db.doc('enrollments/S1_2026-2027').set({ studentId: 'S1', sectionId: 'SEC1', schoolYear: '2026-2027', status: 'enrolled' });
    await db.doc('guardian_links/gA_S1').set({ guardianUid: 'gA', studentId: 'S1', status: 'active', schoolYear: '2026-2027' });
    await db.doc('guardian_links/gB_S1').set({ guardianUid: 'gB', studentId: 'S1', status: 'revoked', schoolYear: '2026-2027' });
    await db.doc('learners/S1').set({ displayName: 'Ana Cruz', sectionLabel: 'Grade 7 – Rizal', today: { date: '2026-09-21', status: 'no_scan' }, recent: [] });
    await db.doc('learners/S2').set({ displayName: 'Ben Dy', sectionLabel: 'Grade 7 – Rizal', today: { date: '2026-09-21', status: 'no_scan' }, recent: [] });
    await db.doc('learners/S1/events/e1').set({ kind: 'in', scannedDate: '2026-09-21', scannedTime: '07:12', status: 'recorded', effectiveAt: new Date() });
    await db.doc('guardians/gA').set({ email: 'a@gmail.com', notificationsEnabled: true, consentVersion: 1 });
    await db.doc('guardians/gA/inbox/e1').set({ type: 'attendance', createdAt: new Date(), pushStatus: 'sent' });
    await db.doc('guardians/gB').set({ email: 'b@gmail.com', notificationsEnabled: true, consentVersion: 1 });
  });
}
