import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { setup, seedBaseline, as, ok, denied, seed, STAFF, KIOSK, GUARDIAN_A, GUARDIAN_B, GUARDIAN_UNVERIFIED, ANON } from './helpers.js';

let env;
beforeAll(async () => { env = await setup(); });
afterAll(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); await seedBaseline(env); });

describe('learners', () => {
  it('linked guardian reads own learner; others denied', async () => {
    await ok(as(env, GUARDIAN_A).doc('learners/S1').get());
    await denied(as(env, GUARDIAN_A).doc('learners/S2').get());
    await denied(as(env, GUARDIAN_B).doc('learners/S1').get());          // revoked link
    await denied(as(env, GUARDIAN_UNVERIFIED).doc('learners/S1').get());
    await denied(as(env, KIOSK).doc('learners/S1').get());
    await denied(as(env, ANON).doc('learners/S1').get());
    await ok(as(env, STAFF).doc('learners/S1').get());
  });
  it('guardian cannot list learners or write', async () => {
    await denied(as(env, GUARDIAN_A).collection('learners').get());
    await denied(as(env, GUARDIAN_A).doc('learners/S1').set({ displayName: 'x' }, { merge: true }));
    await denied(as(env, STAFF).doc('learners/S1').set({ displayName: 'x' }, { merge: true }));
  });
  it('events: bounded list for linked guardian only; never writable', async () => {
    const col = (who) => as(env, who).collection('learners/S1/events');
    await ok(col(GUARDIAN_A).orderBy('effectiveAt', 'desc').limit(50).get());
    await denied(col(GUARDIAN_A).orderBy('effectiveAt', 'desc').limit(51).get());
    await denied(col(GUARDIAN_A).get());
    await denied(as(env, GUARDIAN_A).collection('learners/S2/events').limit(10).get());
    await denied(as(env, GUARDIAN_A).doc('learners/S1/events/e1').update({ status: 'voided' }));
  });
});

describe('guardians', () => {
  it('own profile: read yes, limited update, no create/delete', async () => {
    await ok(as(env, GUARDIAN_A).doc('guardians/gA').get());
    await ok(as(env, GUARDIAN_A).doc('guardians/gA').update({ notificationsEnabled: false, lastOpenedAt: new Date() }));
    await denied(as(env, GUARDIAN_A).doc('guardians/gA').update({ email: 'evil@x' }));
    await denied(as(env, GUARDIAN_A).doc('guardians/gA').delete());
    await denied(as(env, GUARDIAN_B).doc('guardians/gA').get());
    await denied(as(env, GUARDIAN_UNVERIFIED).doc('guardians/gU').set({ email: 'u@gmail.com' }));
    await ok(as(env, STAFF).doc('guardians/gA').get());
  });
  it('devices: own only, fixed shape', async () => {
    const good = { token: 'tok', platform: 'web', createdAt: new Date(), refreshedAt: new Date(), enabled: true, failureCount: 0 };
    await ok(as(env, GUARDIAN_A).doc('guardians/gA/devices/h1').set(good));
    await denied(as(env, GUARDIAN_A).doc('guardians/gA/devices/h2').set({ ...good, extra: 1 }));
    await denied(as(env, GUARDIAN_B).doc('guardians/gA/devices/h3').set(good));
    await ok(as(env, GUARDIAN_A).doc('guardians/gA/devices/h1').delete());
  });
  it('inbox: own bounded list, readAt only', async () => {
    await ok(as(env, GUARDIAN_A).collection('guardians/gA/inbox').orderBy('createdAt', 'desc').limit(20).get());
    await denied(as(env, GUARDIAN_A).collection('guardians/gA/inbox').get());
    await ok(as(env, GUARDIAN_A).doc('guardians/gA/inbox/e1').update({ readAt: new Date() }));
    await denied(as(env, GUARDIAN_A).doc('guardians/gA/inbox/e1').update({ pushStatus: 'pending' }));
    await denied(as(env, GUARDIAN_A).doc('guardians/gA/inbox/e2').set({ type: 'system' }));
    await denied(as(env, GUARDIAN_B).doc('guardians/gA/inbox/e1').get());
  });
});

describe('links, requests, reports, staff-only records', () => {
  it('guardian lists own links only; never writes', async () => {
    await ok(as(env, GUARDIAN_A).collection('guardian_links').where('guardianUid', '==', 'gA').limit(50).get());
    await denied(as(env, GUARDIAN_A).collection('guardian_links').limit(50).get());
    await denied(as(env, GUARDIAN_A).doc('guardian_links/gA_S2').set({ guardianUid: 'gA', studentId: 'S2', status: 'active' }));
    await ok(as(env, STAFF).collection('guardian_links').get());
  });
  it('requests and reports are readable by owner and staff, never client-written', async () => {
    await seed(env, async (db) => {
      await db.doc('access_requests/r1').set({ guardianUid: 'gA', status: 'open' });
      await db.doc('reports/p1').set({ guardianUid: 'gA', status: 'open' });
    });
    await ok(as(env, GUARDIAN_A).doc('access_requests/r1').get());
    await denied(as(env, GUARDIAN_B).doc('access_requests/r1').get());
    await denied(as(env, GUARDIAN_A).doc('access_requests/r2').set({ guardianUid: 'gA', status: 'open' }));
    await ok(as(env, GUARDIAN_A).collection('reports').where('guardianUid', '==', 'gA').limit(20).get());
    await denied(as(env, GUARDIAN_A).doc('reports/p2').set({ guardianUid: 'gA' }));
    await ok(as(env, STAFF).collection('reports').get());
  });
  it('activation_codes, audit_log staff-read only; rate_limits closed', async () => {
    await seed(env, async (db) => { await db.doc('activation_codes/h').set({ studentId: 'S1' }); await db.doc('audit_log/a').set({ action: 'x' }); await db.doc('rate_limits/gA').set({ activate: { count: 1 } }); });
    await ok(as(env, STAFF).doc('activation_codes/h').get());
    await denied(as(env, GUARDIAN_A).doc('activation_codes/h').get());
    await ok(as(env, STAFF).doc('audit_log/a').get());
    await denied(as(env, STAFF).doc('audit_log/b').set({ action: 'y' }));
    await denied(as(env, STAFF).doc('rate_limits/gA').get());
    await denied(as(env, GUARDIAN_A).doc('rate_limits/gA').get());
  });
});
