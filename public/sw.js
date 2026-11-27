// Makes SIMS installable and lets it open without a connection. Only the app's own
// files are cached here; learner data never is. It comes from Firestore (another origin,
// with its own IndexedDB persistence in src/firebase.js), and those requests pass through.
const SHELL = 'sims-shell-v1';   // index.html, refreshed on every online visit
const ASSETS = 'sims-assets-v1'; // hashed /assets/* builds and /icons/*
const MAX_ASSETS = 80;           // old builds' chunks pile up across deploys; keep the newest

self.addEventListener('install', event => {
  event.waitUntil(fetch('/index.html').then(keepShell).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(key => key !== SHELL && key !== ASSETS).map(key => caches.delete(key))))
    .then(() => self.clients.claim()));
});

const isHtml = response => (response.headers.get('content-type') || '').includes('text/html');

async function trim(cache) {
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - MAX_ASSETS)).map(key => cache.delete(key)));
}

// Stores index.html plus the scripts and styles it loads. On the first visit those load
// before this worker is in control, so without this the app couldn't open offline until a second visit.
async function keepShell(response) {
  if (!response.ok || !isHtml(response)) return;
  const html = await response.clone().text();
  await (await caches.open(SHELL)).put('/index.html', response);
  const urls = [...new Set(html.match(/\/assets\/[^"'\s)]+/g) || [])];
  await Promise.all(urls.map(url => asset(url).catch(() => {})));
}

// Network first, so a deploy shows up on the next visit; the cached copy is only for offline.
async function page(event) {
  try {
    const response = await fetch(event.request);
    event.waitUntil(keepShell(response.clone()));
    return response;
  } catch (err) {
    const cached = await caches.match('/index.html', { ignoreVary: true });
    if (cached) return cached;
    throw err;
  }
}

// Cache first: hashed filenames never change content. A missing chunk comes back as
// index.html (firebase.json's SPA rewrite), which must not be cached as JavaScript.
async function asset(request) {
  // ignoreVary: a module script asks with an Origin header and the copy cached at install
  // didn't, so a server's "Vary: Origin" would otherwise turn every offline load into a miss.
  const cached = await caches.match(request, { ignoreVary: true });
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok && !isHtml(response)) {
    const cache = await caches.open(ASSETS);
    await cache.put(request, response.clone());
    await trim(cache);
  }
  return response;
}

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/__/')) return; // Firebase reserved paths (auth handler)
  if (request.mode === 'navigate') event.respondWith(page(event));
  else if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')) event.respondWith(asset(request));
});
