import { describe, it, expect } from 'vitest';
import { pushPayload, PUSH_TITLE, PUSH_BODY } from './pushPayload.js';
describe('pushPayload', () => {
  const p = pushPayload({ tokens: ['t1', 't2'], inboxId: 'k1_S1_202609210712', studentId: 'S1', portalUrl: 'https://bnhs-parent.web.app' });
  it('uses the fixed, content-free sentence', () => {
    expect(PUSH_BODY).toBe('BNHS recorded a new attendance event. Tap to view securely.');
    expect(p.notification).toEqual({ title: PUSH_TITLE, body: PUSH_BODY });
    expect(p.webpush.notification.tag).toBe('k1_S1_202609210712');
    expect(p.webpush.headers).toEqual({ TTL: '14400', Urgency: 'high' });
    expect(p.webpush.fcmOptions.link).toBe('https://bnhs-parent.web.app/inbox?item=k1_S1_202609210712');
  });
  it('never leaks learner details', () => {
    const json = JSON.stringify(p);
    for (const forbidden of ['Ana', 'Cruz', '07:12', 'Entered', 'Left', 'scannedTime', 'displayName']) expect(json).not.toContain(forbidden);
    expect(Object.keys(p.data).sort()).toEqual(['inboxId', 'studentId']);
  });
  it('names the gate/scanner when a device label is given', () => {
    const withLabel = pushPayload({ tokens: ['t1'], inboxId: 'k1_S1_202609210712', studentId: 'S1', portalUrl: 'https://bnhs-parent.web.app', deviceLabel: 'Main Gate' });
    expect(withLabel.notification.body).toBe('BNHS recorded a new attendance event at Main Gate. Tap to view securely.');
    expect(withLabel.webpush.notification.body).toBe(withLabel.notification.body);
  });
  it('never leaks learner details even with a device label', () => {
    const withLabel = pushPayload({ tokens: ['t1', 't2'], inboxId: 'k1_S1_202609210712', studentId: 'S1', portalUrl: 'https://bnhs-parent.web.app', deviceLabel: 'Main Gate' });
    const json = JSON.stringify(withLabel);
    for (const forbidden of ['Ana', 'Cruz', '07:12', 'Entered', 'Left', 'scannedTime', 'displayName']) expect(json).not.toContain(forbidden);
    expect(Object.keys(withLabel.data).sort()).toEqual(['inboxId', 'studentId']);
  });
});
