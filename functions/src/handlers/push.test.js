import { describe, it, expect } from 'vitest';
import { sendToGuardian, MAX_FAILURES } from './push.js';

// sendToGuardian takes its device docs as a parameter now (scanEvent.js's
// caller already has them from its own device-count gate -- see scanEvent.js
// and Finding 6), so this needs no live/emulated Firestore: a fake db.batch()
// and a fake messaging client are enough to exercise its FCM-response
// handling directly.
function fakeMessaging(script = {}) {
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

function fakeDb() {
  const ops = [];
  return {
    ops,
    batch: () => ({
      delete: (ref) => ops.push({ type: 'delete', ref }),
      update: (ref, data) => ops.push({ type: 'update', ref, data }),
      commit: async () => {},
    }),
  };
}

const devDoc = (id, data) => ({ ref: { id }, data: () => data });
const deps = (messaging = fakeMessaging(), db = fakeDb()) => ({ db, messaging, portalUrl: 'https://p.test' });

describe('sendToGuardian', () => {
  it('returns skipped_no_device without touching Firestore when there are no enabled devices', async () => {
    const db = fakeDb();
    const r = await sendToGuardian(deps(fakeMessaging(), db), { inboxId: 'e1', studentId: 'S1', devDocs: [] });
    expect(r).toEqual({ status: 'skipped_no_device', pruned: 0 });
    expect(db.ops).toEqual([]);
  });

  it('sends to every device token and reports sent on any success', async () => {
    const messaging = fakeMessaging();
    const devDocs = [devDoc('d1', { token: 't1', failureCount: 0 }), devDoc('d2', { token: 't2', failureCount: 0 })];
    const r = await sendToGuardian(deps(messaging), { inboxId: 'e1', studentId: 'S1', devDocs });
    expect(r).toEqual({ status: 'sent', pruned: 0 });
    expect(messaging.sent[0].tokens).toEqual(['t1', 't2']);
  });

  it('deletes dead tokens and prunes', async () => {
    const db = fakeDb();
    const messaging = fakeMessaging({ t1: 'messaging/registration-token-not-registered' });
    const devDocs = [devDoc('d1', { token: 't1', failureCount: 0 })];
    const r = await sendToGuardian(deps(messaging, db), { inboxId: 'e1', studentId: 'S1', devDocs });
    expect(r).toEqual({ status: 'failed', pruned: 1 });
    expect(db.ops).toEqual([{ type: 'delete', ref: { id: 'd1' } }]);
  });

  it('counts up other failures and disables at MAX_FAILURES', async () => {
    const db = fakeDb();
    const messaging = fakeMessaging({ t1: 'messaging/internal-error' });
    const devDocs = [devDoc('d1', { token: 't1', failureCount: MAX_FAILURES - 1 })];
    const r = await sendToGuardian(deps(messaging, db), { inboxId: 'e1', studentId: 'S1', devDocs });
    expect(r.status).toBe('failed');
    expect(db.ops).toHaveLength(1);
    expect(db.ops[0]).toMatchObject({ type: 'update', ref: { id: 'd1' }, data: { failureCount: MAX_FAILURES, enabled: false } });
  });

  it('mixed responses across multiple devices: sent overall, only the dead one pruned', async () => {
    const db = fakeDb();
    const messaging = fakeMessaging({ t1: 'messaging/registration-token-not-registered' });
    const devDocs = [devDoc('d1', { token: 't1', failureCount: 0 }), devDoc('d2', { token: 't2', failureCount: 0 })];
    const r = await sendToGuardian(deps(messaging, db), { inboxId: 'e1', studentId: 'S1', devDocs });
    expect(r).toEqual({ status: 'sent', pruned: 1 });
    expect(db.ops).toEqual([{ type: 'delete', ref: { id: 'd1' } }]);
  });
});
