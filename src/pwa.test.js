import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';

// PNG IHDR: width at byte 16, height at 20 (big-endian), colour type at 25 (2 = RGB).
const png = path => { const b = readFileSync(path); return { width: b.readUInt32BE(16), height: b.readUInt32BE(20), colorType: b[25] }; };
const manifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8'));

describe('SIMS web app manifest', () => {
  it('is installable as a standalone app with any and maskable icons', () => {
    expect(manifest).toMatchObject({ start_url: '/', scope: '/', display: 'standalone' });
    expect(manifest.name && manifest.short_name).toBeTruthy();
    expect(manifest.icons.map(i => `${i.sizes} ${i.purpose}`)).toEqual(expect.arrayContaining(['192x192 any', '512x512 any', '512x512 maskable']));
  });

  // Opaque so iOS never fills transparent corners with black.
  it.each(manifest.icons.map(i => [i.src, Number(i.sizes.split('x')[0])]))('%s exists as an opaque %ipx square', (src, size) => {
    expect(png(`public${src}`)).toEqual({ width: size, height: size, colorType: 2 });
  });

  it('index.html links the manifest, the iOS icon and registers the service worker in production', () => {
    const html = readFileSync('index.html', 'utf8');
    expect(html).toContain('<link rel="manifest" href="/manifest.webmanifest" />');
    expect(html).toContain('<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />');
    expect(png('public/icons/apple-touch-icon.png')).toEqual({ width: 180, height: 180, colorType: 2 });
    expect(existsSync('public/sw.js')).toBe(true);
    expect(readFileSync('src/main.jsx', 'utf8')).toMatch(/import\.meta\.env\.PROD && 'serviceWorker' in navigator[\s\S]*register\('\/sw\.js'\)/);
  });
});

// Runs public/sw.js against an in-memory Cache API and a scripted network.
function loadWorker(network) {
  const stores = new Map();
  const open = name => {
    if (!stores.has(name)) stores.set(name, new Map());
    const m = stores.get(name);
    const key = r => (typeof r === 'string' ? new URL(r, ORIGIN).href : r.url);
    return {
      put: async (r, res) => { m.set(key(r), res); },
      // Treats any Vary header as a mismatch unless ignoreVary is set (the fake keeps no request headers).
      match: async (r, opts) => { const hit = m.get(key(r)); return hit && (opts?.ignoreVary || !hit.headers.has('vary')) ? hit.clone() : undefined; },
      keys: async () => [...m.keys()].map(u => new Request(u)),
      delete: async r => m.delete(key(r)),
    };
  };
  const caches = {
    open: async name => open(name),
    keys: async () => [...stores.keys()],
    delete: async name => stores.delete(name),
    match: async (r, opts) => { for (const name of stores.keys()) { const hit = await open(name).match(r, opts); if (hit) return hit; } },
  };
  const handlers = {};
  const self = { location: new URL(ORIGIN), addEventListener: (t, fn) => { handlers[t] = fn; }, skipWaiting: async () => {}, clients: { claim: async () => {} } };
  new Function('self', 'caches', 'fetch', readFileSync('public/sw.js', 'utf8'))(self, caches, network);
  const run = async (type, extra = {}) => {
    const waits = [];
    let responded;
    handlers[type]({ ...extra, waitUntil: p => { waits.push(p); }, respondWith: p => { responded = p; } });
    const response = await responded;
    for (let i = 0; i < waits.length; i++) await waits[i]; // waitUntil can be called while earlier waits run
    return response;
  };
  return { stores, run, fetch: (url, mode = 'no-cors', method = 'GET') => run('fetch', { request: { url: new URL(url, ORIGIN).href, method, mode } }) };
}

const ORIGIN = 'https://sims.example.test';
const html = body => new Response(body, { headers: { 'content-type': 'text/html', vary: 'Accept-Encoding' } });
const js = body => new Response(body, { headers: { 'content-type': 'text/javascript', vary: 'Origin' } });

describe('SIMS service worker', () => {
  let online, served, sw;
  beforeEach(async () => {
    online = true; served = [];
    sw = loadWorker(async req => {
      const path = new URL(typeof req === 'string' ? req : req.url, ORIGIN).pathname;
      served.push(path);
      if (!online) throw new TypeError('offline');
      if (path.startsWith('/assets/missing')) return html('<html>spa fallback</html>');
      if (path.startsWith('/assets/')) return js(`chunk ${path}`);
      return html(`<html>shell ${served.length}<script type="module" src="/assets/index-abc.js"></script><link rel="stylesheet" href="/assets/index-def.css"></html>`);
    });
    await sw.run('install');
    await sw.run('activate');
  });

  it('serves pages from the network while online and the cached shell while offline', async () => {
    const shell = await (await sw.fetch('/learners', 'navigate')).text();
    expect(shell).toMatch(/^<html>shell \d+<script/);
    online = false;
    expect(await (await sw.fetch('/attendance', 'navigate')).text()).toBe(shell);
  });

  // The first visit loads these before the worker is in control, so install must fetch them itself.
  it('caches the scripts and styles index.html loads as soon as it installs', async () => {
    online = false;
    expect(await (await sw.fetch('/assets/index-abc.js')).text()).toBe('chunk /assets/index-abc.js');
    expect(await (await sw.fetch('/assets/index-def.css')).text()).toBe('chunk /assets/index-def.css');
    expect(served).toEqual(['/index.html', '/assets/index-abc.js', '/assets/index-def.css']);
  });

  it('caches hashed assets once and serves them offline', async () => {
    await sw.fetch('/assets/index-abc.js');
    online = false;
    expect(await (await sw.fetch('/assets/index-abc.js')).text()).toBe('chunk /assets/index-abc.js');
    expect(served.filter(p => p === '/assets/index-abc.js')).toHaveLength(1);
  });

  it('never caches the SPA fallback html as a missing chunk', async () => {
    await sw.fetch('/assets/missing-old.js');
    expect([...sw.stores.get('sims-assets-v1').keys()]).not.toContain(`${ORIGIN}/assets/missing-old.js`);
  });

  it('keeps only the newest assets so old deploys do not pile up', async () => {
    for (let i = 0; i < 83; i++) await sw.fetch(`/assets/chunk-${i}.js`);
    const kept = [...sw.stores.get('sims-assets-v1').keys()];
    expect(kept).toHaveLength(80);
    expect(kept[0]).toBe(`${ORIGIN}/assets/chunk-3.js`); // the 2 precached entry files went first, then chunks 0-2
    expect(kept.at(-1)).toBe(`${ORIGIN}/assets/chunk-82.js`);
  });

  it('leaves Firestore, other origins, writes and Firebase reserved paths alone', async () => {
    expect(await sw.fetch('https://firestore.googleapis.com/v1/projects/x')).toBeUndefined();
    expect(await sw.fetch('/assets/index-abc.js', 'no-cors', 'POST')).toBeUndefined();
    expect(await sw.fetch('/__/auth/handler', 'navigate')).toBeUndefined();
  });
});
