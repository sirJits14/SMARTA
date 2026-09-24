export const PUSH_TITLE = 'BNHS Learner Records';
export const PUSH_BODY = 'BNHS recorded a new attendance event. Tap to view securely.';

// Names only which gate/scanner recorded the event when known -- nothing
// about the learner, time, or kind is in it (never leaks who scanned or
// when; the guardian sees those details only inside the authenticated
// portal). Falls back to the fixed, content-free sentence if no device
// label is given.
export function pushPayload({ tokens, inboxId, studentId, portalUrl, deviceLabel }) {
  const body = deviceLabel ? `BNHS recorded a new attendance event at ${deviceLabel}. Tap to view securely.` : PUSH_BODY;
  return {
    tokens,
    notification: { title: PUSH_TITLE, body },
    data: { inboxId, studentId },
    webpush: {
      headers: { TTL: '14400', Urgency: 'high' },
      notification: { title: PUSH_TITLE, body, tag: inboxId, icon: '/icons/icon-192.png' },
      fcmOptions: { link: `${portalUrl}/inbox?item=${inboxId}` },
    },
  };
}
