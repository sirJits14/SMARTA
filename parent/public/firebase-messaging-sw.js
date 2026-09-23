/* eslint-env serviceworker */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = {}; }
  const n = payload.notification || {};
  const link = (payload.fcmOptions && payload.fcmOptions.link) || (payload.data && payload.data.inboxId ? `/inbox?item=${payload.data.inboxId}` : '/inbox');
  event.waitUntil(self.registration.showNotification(n.title || "BNHS Learner's Attendance", {
    body: n.body || 'BNHS recorded a new attendance event. Tap to view securely.',
    tag: n.tag || (payload.data && payload.data.inboxId) || 'bnhs',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { link },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || '/inbox';
  const url = new URL(link, self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) { if (new URL(c.url).origin === self.location.origin && 'focus' in c) { c.navigate(url); return c.focus(); } }
    return self.clients.openWindow(url);
  }));
});
