import { initializeApp, getApps, deleteApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

// Requires FIRESTORE_EMULATOR_HOST (set by `firebase emulators:exec`).
if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Run via: npm run test:functions (emulator required)');
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || 'bnhs-sims-fn-test';

export function app() {
  return getApps()[0] || initializeApp({ projectId: process.env.GCLOUD_PROJECT });
}
export const db = () => getFirestore(app());

export async function clearAll() {
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  await fetch(`http://${host}/emulator/v1/projects/${process.env.GCLOUD_PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
}

// A messaging stub that records what would have been sent and lets tests
// script per-token failures. This is the "fake notifications" stage.
export function fakeMessaging(script = {}) {
  const sent = [];
  return {
    sent,
    async sendEachForMulticast(msg) {
      sent.push(msg);
      const responses = msg.tokens.map((t) => script[t]
        ? { success: false, error: { code: script[t] } }
        : { success: true, messageId: `m-${t}` });
      return { successCount: responses.filter((r) => r.success).length, failureCount: responses.filter((r) => !r.success).length, responses };
    },
  };
}

export const ts = (isoOrMs) => Timestamp.fromMillis(typeof isoOrMs === 'number' ? isoOrMs : Date.parse(isoOrMs));

export async function seedSchool(d = db()) {
  const b = d.batch();
  b.set(d.doc('settings/app'), { currentSchoolYear: '2026-2027' });
  b.set(d.doc('settings/parent_portal'), { notificationsPaused: false, consentVersion: 1 });
  b.set(d.doc('kiosks/k1'), { label: 'Main Gate', active: true });
  b.set(d.doc('kiosks/k9'), { label: 'Old Gate', active: false });
  b.set(d.doc('students/S1'), { lrn: '100000000001', firstName: 'Ana', lastName: 'Cruz', middleName: 'B' });
  b.set(d.doc('students/S2'), { lrn: '100000000002', firstName: 'Ben', lastName: 'Dy' });
  b.set(d.doc('sections/SEC1'), { name: 'Rizal', gradeLevel: 7, schoolYear: '2026-2027' });
  b.set(d.doc('enrollments/S1_2026-2027'), { studentId: 'S1', sectionId: 'SEC1', schoolYear: '2026-2027', status: 'enrolled' });
  b.set(d.doc('guardian_links/gA_S1'), { guardianUid: 'gA', studentId: 'S1', status: 'active', schoolYear: '2026-2027', relationship: 'Mother' });
  b.set(d.doc('guardian_links/gB_S1'), { guardianUid: 'gB', studentId: 'S1', status: 'active', schoolYear: '2026-2027', relationship: 'Father' });
  b.set(d.doc('guardian_links/gC_S1'), { guardianUid: 'gC', studentId: 'S1', status: 'revoked', schoolYear: '2026-2027' });
  b.set(d.doc('guardians/gA'), { email: 'a@x', notificationsEnabled: true });
  b.set(d.doc('guardians/gA/devices/tA1'), { token: 'tokA1', enabled: true, failureCount: 0, refreshedAt: ts(Date.now()) });
  b.set(d.doc('guardians/gA/devices/tA2'), { token: 'tokA2', enabled: true, failureCount: 0, refreshedAt: ts(Date.now()) });
  b.set(d.doc('guardians/gB'), { email: 'b@x', notificationsEnabled: false });
  b.set(d.doc('guardians/gB/devices/tB1'), { token: 'tokB1', enabled: true, failureCount: 0, refreshedAt: ts(Date.now()) });
  await b.commit();
}

export const scanDoc = (over = {}) => ({
  studentId: 'S1', sectionId: 'SEC1', schoolYear: '2026-2027', kind: 'in', deviceId: 'k1',
  scannedAt: ts('2026-09-21T07:12:00+08:00'), scannedDate: '2026-09-21', scannedTime: '07:12',
  receivedAt: ts('2026-09-21T07:12:20+08:00'), source: 'kiosk', ...over,
});
