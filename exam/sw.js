// Offline copy of Lolo Exam Prep (scope: exam/). Same rules as the hub's sw.js: pages try the network first
// and fall back to the saved copy. The file list (exam pages + the kit, wallet, catalog and icons they use)
// is exam/offline-files.json, written by ../publish.js.
'use strict';
const CACHE = 'lolo-exam';
const LIST = 'offline-files.json';
const VERSION_KEY = new URL('__offline-version', self.registration.scope).href;
const FONT_HOSTS = new Set(['fonts.googleapis.com', 'fonts.gstatic.com']);
const NET_TIMEOUT_MS = 4000;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('message', (e) => {
  if (e.data === 'sync' && e.ports[0]) e.waitUntil(sync().then((r) => e.ports[0].postMessage(r)));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.pathname.startsWith('/_') || url.pathname.startsWith('/atlas/')) return; // the home server's API: never cached
  if (url.origin === self.location.origin) e.respondWith(networkFirst(req));
  else if (FONT_HOSTS.has(url.hostname)) e.respondWith(cacheFirst(req));
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  const net = fetch(req).then((res) => {
    if (res.status === 200 && res.type === 'basic') cache.put(req, res.clone()).catch(() => {});
    return res;
  });
  net.catch(() => {});
  try {
    return await Promise.race([net, new Promise((_, reject) => setTimeout(reject, NET_TIMEOUT_MS))]);
  } catch {
    return (await cache.match(req, { ignoreSearch: true })) || net;
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req, { ignoreVary: true });
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') cache.put(req, res.clone()).catch(() => {});
  return res;
}

let running = null;
function sync() {
  if (!running) running = doSync().finally(() => { running = null; });
  return running;
}

async function doSync() {
  const cache = await caches.open(CACHE);
  let list;
  try {
    list = await (await fetch(LIST, { cache: 'no-store' })).json();
  } catch {
    return { ok: !!(await cache.match(VERSION_KEY)), offline: true };
  }
  const stored = await cache.match(VERSION_KEY);
  if (stored && (await stored.text()) === list.version) return { ok: true };
  const urls = list.files.map((f) => new URL(f, self.registration.scope).href);
  let failed = 0;
  await Promise.all(urls.map((u) =>
    fetch(u, { cache: 'reload' })
      .then((res) => { if (res.status !== 200) throw new Error(u); return cache.put(u, res); })
      .catch(() => { failed++; })));
  await Promise.all((list.fonts || []).map(saveFont));
  const keep = new Set(urls);
  for (const req of await cache.keys()) {
    const u = new URL(req.url);
    if (u.origin === self.location.origin && !keep.has(u.href) && u.href !== VERSION_KEY) await cache.delete(req);
  }
  if (failed) return { ok: false };
  await cache.put(VERSION_KEY, new Response(list.version));
  return { ok: true };
}

async function saveFont(cssUrl) {
  try {
    const cache = await caches.open(CACHE);
    const css = await (await fetch(cssUrl)).text();
    await cache.put(cssUrl, new Response(css, { headers: { 'Content-Type': 'text/css' } }));
    const files = [...css.matchAll(/url\((https:[^)]+)\)/g)].map((m) => m[1]);
    await Promise.all(files.map(async (f) => { const res = await fetch(f); if (res.ok) await cache.put(f, res); }));
  } catch { /* fallback fonts are fine */ }
}
