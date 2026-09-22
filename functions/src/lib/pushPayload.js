export const PUSH_TITLE = 'BNHS Learner Records';
export const PUSH_BODY = 'BNHS recorded a new attendance event. Tap to view securely.';

// The one and only push shape. Nothing about the learner, time, or kind is
// in it — the guardian sees details only inside the authenticated portal.
export function pushPayload({ tokens, inboxId, studentId, portalUrl }) {
  return {
    tokens,
    notification: { title: PUSH_TITLE, body: PUSH_BODY },
    data: { inboxId, studentId },
    webpush: {
      headers: { TTL: '14400', Urgency: 'high' },
      notification: { title: PUSH_TITLE, body: PUSH_BODY, tag: inboxId, icon: '/icons/icon-192.png' },
      fcmOptions: { link: `${portalUrl}/inbox?item=${inboxId}` },
    },
  };
}
