import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';
import { setup, seedBaseline, as, ok, denied, STAFF, KIOSK, KIOSK_INACTIVE, KIOSK_UNDERSCORE, GUARDIAN_A, seed } from './helpers.js';

// rules-unit-testing hands out compat Firestore instances, so the server
// timestamp sentinel must come from the compat namespace too.
const serverTimestamp = () => firebase.firestore.FieldValue.serverTimestamp();

let env;
beforeAll(async () => { env = await setup(); });
afterAll(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); await seedBaseline(env); });

const valid = (over = {}) => ({
  studentId: 'S1', sectionId: 'SEC1', schoolYear: '2026-2027', kind: 'in', deviceId: 'kiosk1',
  scannedAt: new Date(), scannedDate: '2026-09-21', scannedTime: '07:12', receivedAt: serverTimestamp(), source: 'kiosk', ...over,
});
const ID = 'kiosk1_S1_202609210712';

describe('scan_events', () => {
  it('active kiosk creates a well-formed event', async () => {
    await ok(as(env, KIOSK).doc(`scan_events/${ID}`).set(valid()));
  });
  it('a kiosk whose UID itself contains an underscore can still create', async () => {
    await seed(env, (db) => db.doc('kiosks/ki_osk1').set({ label: 'Gate 2', active: true }));
    const id = 'ki_osk1_S1_in_202609210712';
    await ok(as(env, KIOSK_UNDERSCORE).doc(`scan_events/${id}`).set(valid({ deviceId: 'ki_osk1' })));
  });
  it('rejects bad shape, wrong device, non-server receivedAt, wrong id prefix, bad kind', async () => {
    const db = as(env, KIOSK);
    await denied(db.doc(`scan_events/${ID}`).set(valid({ extra: 1 })));
    await denied(db.doc(`scan_events/${ID}`).set(valid({ deviceId: 'kiosk2' })));
    await denied(db.doc(`scan_events/${ID}`).set(valid({ receivedAt: new Date() })));
    await denied(db.doc(`scan_events/kiosk2_S1_202609210712`).set(valid()));
    await denied(db.doc(`scan_events/${ID}`).set(valid({ kind: 'void' })));
    await denied(db.doc(`scan_events/${ID}`).set(valid({ source: 'staff' })));
  });
  it('inactive kiosk, staff, guardian cannot create', async () => {
    await denied(as(env, KIOSK_INACTIVE).doc('scan_events/kiosk9_S1_202609210712').set(valid({ deviceId: 'kiosk9' })));
    await denied(as(env, STAFF).doc('scan_events/staff1_S1_202609210712').set(valid({ deviceId: 'staff1' })));
    await denied(as(env, GUARDIAN_A).doc('scan_events/gA_S1_202609210712').set(valid({ deviceId: 'gA' })));
  });
  it('is immutable for everyone, readable by staff only', async () => {
    await seed(env, (db) => db.doc(`scan_events/${ID}`).set(valid({ receivedAt: new Date() })));
    await denied(as(env, KIOSK).doc(`scan_events/${ID}`).update({ kind: 'out' }));
    await denied(as(env, STAFF).doc(`scan_events/${ID}`).update({ kind: 'out' }));
    await denied(as(env, STAFF).doc(`scan_events/${ID}`).delete());
    await ok(as(env, STAFF).doc(`scan_events/${ID}`).get());
    await denied(as(env, KIOSK).doc(`scan_events/${ID}`).get());
    await denied(as(env, GUARDIAN_A).doc(`scan_events/${ID}`).get());
  });
});
