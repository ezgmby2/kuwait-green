// Service worker: caches the app shell and map so the app opens instantly and works offline (read-only).
// Paths are relative so the app works at a domain root or in a subfolder (e.g. GitHub Pages).
const VERSION = 'kg-v2';
const SHELL = ['./', 'index.html', 'css/app.css', 'js/app.js', 'js/api.js', 'js/i18n.js', 'js/map.js', 'js/local-api.js', 'icons/icon.svg', 'manifest.webmanifest'];
const BASE = new URL('./', self.location).pathname;
const rel = (url) => url.pathname.slice(BASE.length);
const CACHE_FIRST = ['api/zones', 'api/species', 'data/zones.json', 'data/species.json'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

function cacheFirst(req) {
  return caches.match(req).then((hit) => hit || fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
    return res;
  }));
}

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || !url.pathname.startsWith(BASE)) return;
  const path = rel(url);

  // Uploaded photos and map data never change: cache-first.
  if (path.startsWith('uploads/') || CACHE_FIRST.includes(path)) { e.respondWith(cacheFirst(e.request)); return; }
  // Other API calls: network only (they're user-specific / live).
  if (path.startsWith('api/')) return;

  // App shell: network-first so updates show up, falling back to cache offline.
  e.respondWith(fetch(e.request).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request).then((hit) => hit || caches.match('index.html'))));
});
