// Offline app shell. VERSION and SHELL are stamped by the deploy workflow
// (.github/workflows/pages.yml) on every deploy, so each deploy gets a fresh, complete cache.
// Don't edit either by hand; PRs never bump versions or list files.
const VERSION = 'noodlit-__BUILD__';
// SHELL is the list of files to cache up front so the app works offline. The deploy workflow
// rewrites the line below with every file in www/, so nobody keeps the list by hand. Run
// locally, the app caches each file the first time it's fetched instead (see 'fetch' below).
const SHELL = ['./', './index.html'];

self.addEventListener('install', (e) => {
  // cache: 'reload' skips the browser's HTTP cache, so a new version never ships stale files.
  e.waitUntil(
    caches.open(VERSION)
      .then((c) => c.addAll(SHELL.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

// The About panel's "Check for updates" can ask a waiting worker to take over.
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      if (res.ok && new URL(e.request.url).origin === location.origin) {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(e.request, copy));
      }
      return res;
    }))
  );
});
