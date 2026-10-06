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

export const ANNOUNCEMENT_PUSH_TITLE = 'BNHS announcement';

// Announcements carry no learner information, so the post title is the
// body. One tag per post: a re-delivered push replaces, not stacks.
export function announcementPayload({ tokens, announcementId, title, portalUrl }) {
  return {
    tokens,
    notification: { title: ANNOUNCEMENT_PUSH_TITLE, body: title },
    data: { announcementId },
    webpush: {
      headers: { TTL: '86400', Urgency: 'normal' },
      notification: { title: ANNOUNCEMENT_PUSH_TITLE, body: title, tag: `announcement-${announcementId}`, icon: '/icons/icon-192.png' },
      fcmOptions: { link: `${portalUrl}/announcements/${announcementId}` },
    },
  };
}
